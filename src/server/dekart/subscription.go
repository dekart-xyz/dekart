package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/user"
	"fmt"
	"os"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/stripe/stripe-go/v76"
	bs "github.com/stripe/stripe-go/v76/billingportal/session"
	"github.com/stripe/stripe-go/v76/checkout/session"
	"github.com/stripe/stripe-go/v76/customer"
	"github.com/stripe/stripe-go/v76/subscription"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// getPriceID returns the stripe price ID for the given plan type
func getPriceID(planType proto.PlanType) string {
	if planType == proto.PlanType_TYPE_GROW {
		return os.Getenv("STRIPE_PRICE_ID_GROW")
	}
	if planType == proto.PlanType_TYPE_MAX {
		return os.Getenv("STRIPE_PRICE_ID_MAX")
	}
	if planType == proto.PlanType_TYPE_TEAM {
		return os.Getenv("STRIPE_PRICE_ID")
	}
	return ""
}

func (s Server) getSubscription(ctx context.Context, workspaceId string) (*proto.Subscription, error) {
	var createdAt sql.NullTime
	var customerID sql.NullString
	var planType proto.PlanType
	var trialEndsAt sql.NullTime

	err := s.db.QueryRowContext(ctx, `
        SELECT
            sl.customer_id,
            sl.plan_type,
            sl.created_at,
			sl.trial_ends_at
        FROM subscription_log sl
        WHERE sl.workspace_id = $1
        ORDER BY sl.created_at DESC
        LIMIT 1
        `,
		workspaceId,
	).Scan(&customerID, &planType, &createdAt, &trialEndsAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}

	// If latest plan is TRIAL, use preselected latestTrialEndsAt and bypass Stripe
	if planType == proto.PlanType_TYPE_TRIAL {
		var cancelAt int64
		var expired bool
		if trialEndsAt.Valid {
			cancelAt = trialEndsAt.Time.Unix()
			expired = trialEndsAt.Time.Unix() < time.Now().Unix()
		}
		return &proto.Subscription{
			PlanType:   planType,
			CustomerId: customerID.String,
			UpdatedAt:  createdAt.Time.Unix(),
			CancelAt:   cancelAt,
			Expired:    expired,
		}, nil
	}

	priceID := getPriceID(planType)

	if priceID != "" { // one of the paid plans
		stripe.Key = os.Getenv("STRIPE_SECRET_KEY")
		params := &stripe.CustomerParams{}
		params.AddExpand("subscriptions")
		c, err := customer.Get(customerID.String, params)

		if err != nil {
			log.Err(err).Send()
			return nil, err
		}
		if c.Subscriptions != nil {
			for _, sub := range c.Subscriptions.Data {
				if sub.Status == "active" || sub.Status == "past_due" {
					for _, item := range sub.Items.Data {
						if item.Price.ID == priceID && !item.Deleted {
							return &proto.Subscription{
								PlanType:             planType,
								UpdatedAt:            createdAt.Time.Unix(),
								CustomerId:           customerID.String,
								StripeSubscriptionId: sub.ID,
								StripeCustomerEmail:  c.Email,
								CancelAt:             sub.CancelAt,
								ItemId:               item.ID,
							}, nil

						}
					}
				}
			}
		}
		// no active subscription
		return &proto.Subscription{
			PlanType:   planType,
			CustomerId: customerID.String,
			UpdatedAt:  createdAt.Time.Unix(),
			Expired:    true,
		}, nil
	}
	// free plan or unknown plan
	return &proto.Subscription{
		PlanType:   planType,
		CustomerId: customerID.String,
		UpdatedAt:  createdAt.Time.Unix(),
	}, nil
}

func (s Server) createCheckoutSession(ctx context.Context, workspaceInfo user.WorkspaceInfo, req *proto.CreateSubscriptionRequest) (*stripe.CheckoutSession, error) {
	newPriceID := getPriceID(req.PlanType)
	if newPriceID == "" {
		log.Error().Int("plan_type", int(req.PlanType)).Msg("Unknown plan type")
		return nil, status.Error(codes.InvalidArgument, "Unknown plan type")
	}
	claims := user.GetClaims(ctx)
	stripe.Key = os.Getenv("STRIPE_SECRET_KEY")
	sub, err := s.getSubscription(ctx, workspaceInfo.ID)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	var customerID string
	if sub != nil {
		customerID = sub.CustomerId
		if sub.StripeSubscriptionId != "" {
			log.Error().Str("customerID", customerID).Msg("Subscription already exists")
			return nil, status.Error(codes.InvalidArgument, "Subscription already exists")
		}
	}
	if customerID == "" { // create new customer
		customerParams := &stripe.CustomerParams{
			Email: stripe.String(claims.Email),
			Name:  stripe.String(workspaceInfo.Name),
		}
		c, err := customer.New(customerParams)
		if err != nil {
			log.Err(err).Send()
			return nil, err
		}
		customerID = c.ID
	}
	_, err = s.db.ExecContext(ctx, `insert into subscription_log (workspace_id, plan_type, customer_id, authored_by) values ($1, $2, $3, $4)`,
		workspaceInfo.ID,
		req.PlanType,
		customerID,
		claims.Email,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	var quantity int64 = 1
	if req.PlanType == proto.PlanType_TYPE_GROW {
		quantity = workspaceInfo.BilledUsers
	}
	params := &stripe.CheckoutSessionParams{
		Customer: stripe.String(customerID),
		Mode:     stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(newPriceID),
				Quantity: stripe.Int64(quantity),
			},
		},
		TaxIDCollection: &stripe.CheckoutSessionTaxIDCollectionParams{
			Enabled: stripe.Bool(true),
		},
		CustomerUpdate: &stripe.CheckoutSessionCustomerUpdateParams{
			Name:    stripe.String("auto"),
			Address: stripe.String("auto"),
		},
		SuccessURL:          stripe.String(req.UiUrl),
		CancelURL:           stripe.String(req.UiUrl),
		AllowPromotionCodes: stripe.Bool(true),
	}

	return session.New(params)

}

func (s Server) updateSeats(ctx context.Context) error {
	workspaceInfo := checkWorkspace(ctx)
	if workspaceInfo.PlanType == proto.PlanType_TYPE_GROW {
		stripe.Key = os.Getenv("STRIPE_SECRET_KEY")
		sub, err := s.getSubscription(ctx, workspaceInfo.ID)
		if err != nil {
			log.Err(err).Send()
			return err
		}
		if sub == nil {
			err := fmt.Errorf("subscription not found while updating seats")
			log.Error().Str("workspace_id", workspaceInfo.ID).Err(err).Send()
			return err
		}
		params := &stripe.SubscriptionParams{
			Items: []*stripe.SubscriptionItemsParams{
				{
					ID:       stripe.String(sub.ItemId),
					Quantity: stripe.Int64(workspaceInfo.BilledUsers),
				},
			},
		}
		_, err = subscription.Update(sub.StripeSubscriptionId, params)
		if err != nil {
			log.Err(err).Send()
			return err
		}
	}
	return nil

}

func (s Server) GetStripePortalSession(ctx context.Context, req *proto.GetStripePortalSessionRequest) (*proto.GetStripePortalSessionResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	workspaceInfo := checkWorkspace(ctx)
	if workspaceInfo.ID == "" {
		log.Error().Msg("Workspace not found when getting stripe portal session")
		return nil, status.Error(codes.NotFound, "Workspace not found")
	}
	if workspaceInfo.UserRole != proto.UserRole_ROLE_ADMIN {
		log.Error().Msg("Only admins can access billing portal")
		return nil, status.Error(codes.PermissionDenied, "Only admins can access billing portal")
	}
	if workspaceInfo.PlanType == proto.PlanType_TYPE_UNSPECIFIED || workspaceInfo.PlanType == proto.PlanType_TYPE_PERSONAL {
		log.Error().Msg("Workspace has no paid subscription when getting stripe portal session")
		return nil, status.Error(codes.NotFound, "Subscription not found")
	}

	sub, err := s.getSubscription(ctx, workspaceInfo.ID)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	if sub == nil {
		log.Error().Msg("Subscription not found when getting stripe portal session")
		return nil, status.Error(codes.NotFound, "Subscription not found")
	}
	if sub.PlanType == proto.PlanType_TYPE_TEAM || sub.PlanType == proto.PlanType_TYPE_GROW || sub.PlanType == proto.PlanType_TYPE_MAX {
		stripe.Key = os.Getenv("STRIPE_SECRET_KEY")
		params := &stripe.BillingPortalSessionParams{
			Customer:  stripe.String(sub.CustomerId),
			ReturnURL: stripe.String(req.UiUrl),
		}
		session, err := bs.New(params)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
		return &proto.GetStripePortalSessionResponse{
			Url: session.URL,
		}, nil
	}
	log.Error().Msg("Unknown plan type when getting stripe portal session")
	return nil, status.Error(codes.InvalidArgument, "Unknown plan type")
}

func (s Server) createDefaultSubscription(ctx context.Context, workspaceID string, email string) error {
	_, err := s.db.ExecContext(ctx, `insert into subscription_log (workspace_id, plan_type, authored_by) values ($1, $2, $3)`,
		workspaceID,
		user.GetDefaultSubscription(),
		email,
	)
	if err != nil {
		log.Err(err).Send()
		return err
	}
	return nil
}

func (s Server) createTrialSubscription(ctx context.Context, workspaceID string, email string) error {
	trialEndsAt := time.Now().Add(14 * 24 * time.Hour) // 14 days from now

	_, err := s.db.ExecContext(ctx, `insert into subscription_log (workspace_id, plan_type, authored_by, trial_ends_at) values ($1, $2, $3, $4)`,
		workspaceID,
		proto.PlanType_TYPE_TRIAL,
		email,
		trialEndsAt,
	)
	if err != nil {
		log.Err(err).Send()
		return err
	}
	return nil
}

func (s Server) CreateSubscription(ctx context.Context, req *proto.CreateSubscriptionRequest) (*proto.CreateSubscriptionResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	workspaceInfo := checkWorkspace(ctx)
	if workspaceInfo.ID == "" {
		return nil, status.Error(codes.NotFound, "Workspace not found")
	}
	if workspaceInfo.UserRole != proto.UserRole_ROLE_ADMIN {
		log.Error().Msg("Only admins can create subscriptions when creating subscription")
		return nil, status.Error(codes.PermissionDenied, "Only admins can create subscriptions")
	}
	switch req.PlanType {
	case proto.PlanType_TYPE_PERSONAL:
		if workspaceInfo.PlanType != proto.PlanType_TYPE_UNSPECIFIED {
			// you cannot downgrade from paid plans to personal
			log.Error().Msg("Workspace already has a subscription when creating personal subscription")
			return nil, status.Error(codes.InvalidArgument, "Workspace already has a subscription")
		}
		if workspaceInfo.AddedUsersCount > 1 {
			log.Error().Msg("Workspace has more than one user, cannot downgrade to personal plan")
			return nil, status.Error(codes.InvalidArgument, "Workspace has more than one user, cannot downgrade to personal plan")
		}
		err := s.createDefaultSubscription(ctx, workspaceInfo.ID, claims.Email)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
		s.userStreams.Ping([]string{claims.Email})
		return &proto.CreateSubscriptionResponse{
			RedirectUrl: "/", // redirect to home page
		}, nil
	case proto.PlanType_TYPE_TRIAL:
		if workspaceInfo.PlanType != proto.PlanType_TYPE_PERSONAL {
			log.Error().Msg("Workspace is not on personal plan when creating trial subscription")
			return nil, status.Error(codes.InvalidArgument, "Workspace is not on personal plan when creating trial subscription")
		}
		err := s.createTrialSubscription(ctx, workspaceInfo.ID, claims.Email)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
		s.userStreams.Ping([]string{claims.Email})
		return &proto.CreateSubscriptionResponse{}, nil
	case proto.PlanType_TYPE_TEAM, proto.PlanType_TYPE_GROW, proto.PlanType_TYPE_MAX:
		stripe.Key = os.Getenv("STRIPE_SECRET_KEY")
		sub, err := s.getSubscription(ctx, workspaceInfo.ID)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
		if sub != nil {
			// updating existing subscription
			if sub.PlanType == req.PlanType && !sub.Expired {
				log.Error().Msg("Subscription already exists when creating subscription")
				return nil, status.Error(codes.InvalidArgument, "Subscription already exists")
			}
			if sub.StripeSubscriptionId != "" {
				// update subscription to new plan
				newPriceID := getPriceID(req.PlanType)
				if newPriceID == "" {
					log.Error().Int("plan_type", int(req.PlanType)).Msg("Unknown plan type")
					return nil, status.Error(codes.InvalidArgument, "Unknown plan type")
				}
				var quantity int64 = 1
				if req.PlanType == proto.PlanType_TYPE_GROW {
					quantity = workspaceInfo.BilledUsers
				}

				// Use transaction to ensure consistency
				// If Stripe update fails, subscription_log insert will be rolled back
				tx, err := s.db.BeginTx(ctx, nil)
				if err != nil {
					log.Err(err).Send()
					return nil, status.Error(codes.Internal, err.Error())
				}
				defer tx.Rollback()

				// Insert new subscription log entry
				_, err = tx.ExecContext(ctx, `
					INSERT INTO subscription_log (workspace_id, plan_type, customer_id, authored_by)
					VALUES ($1, $2, $3, $4)`,
					workspaceInfo.ID,
					req.PlanType,
					sub.CustomerId,
					claims.Email,
				)
				if err != nil {
					log.Err(err).Send()
					return nil, status.Error(codes.Internal, err.Error())
				}

				// Update Stripe subscription
				params := &stripe.SubscriptionParams{
					Items: []*stripe.SubscriptionItemsParams{
						{
							ID:       stripe.String(sub.ItemId),
							Price:    stripe.String(newPriceID),
							Quantity: stripe.Int64(quantity),
						},
					},
				}
				_, err = subscription.Update(sub.StripeSubscriptionId, params)
				if err != nil {
					// Transaction will rollback, keeping DB consistent
					log.Err(err).Str("workspace_id", workspaceInfo.ID).Msg("Failed to update Stripe subscription, rolling back")
					return nil, status.Error(codes.Internal, err.Error())
				}

				// Commit transaction
				err = tx.Commit()
				if err != nil {
					log.Err(err).Send()
					return nil, status.Error(codes.Internal, err.Error())
				}

				s.userStreams.Ping([]string{claims.Email})
				return &proto.CreateSubscriptionResponse{}, nil
			}
		}
		session, err := s.createCheckoutSession(ctx, workspaceInfo, req)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
		return &proto.CreateSubscriptionResponse{
			RedirectUrl: session.URL,
		}, nil
	}
	return nil, status.Error(codes.InvalidArgument, "Unknown plan type")
}
