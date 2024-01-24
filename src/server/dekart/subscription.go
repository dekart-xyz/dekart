package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/user"
	"os"

	"github.com/rs/zerolog/log"
	"github.com/stripe/stripe-go/v76"
	"github.com/stripe/stripe-go/v76/checkout/session"
	"github.com/stripe/stripe-go/v76/customer"
	"github.com/stripe/stripe-go/v76/subscription"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s Server) getSubscription(ctx context.Context, organizationId string) (*proto.Subscription, error) {
	var createdAt sql.NullTime
	var customerID sql.NullString
	var planType proto.PlanType
	var paymentCancelled bool

	err := s.db.QueryRowContext(ctx, `
		SELECT
			created_at,
			customer_id,
			plan_type,
			payment_cancelled,
			created_at
		FROM subscription_log
		WHERE organization_id = $1
		ORDER BY created_at DESC
		LIMIT 1
		`,
		organizationId,
	).Scan(&createdAt, &customerID, &planType, &paymentCancelled, &createdAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	if planType == proto.PlanType_TYPE_TEAM {
		stripe.Key = os.Getenv("STRIPE_SECRET_KEY")
		params := &stripe.CustomerParams{}
		params.AddExpand("subscriptions")
		c, err := customer.Get(customerID.String, params)

		if err != nil {
			log.Err(err).Send()
			return &proto.Subscription{
				UpdatedAt: createdAt.Time.Unix(),
			}, err
		}
		if c.Subscriptions == nil {
			return &proto.Subscription{
				UpdatedAt: createdAt.Time.Unix(),
			}, nil
		}
		for _, subscription := range c.Subscriptions.Data {
			if subscription.Status == "active" {
				return &proto.Subscription{
					PlanType:             planType,
					UpdatedAt:            createdAt.Time.Unix(),
					CustomerId:           customerID.String,
					StripeSubscriptionId: subscription.ID,
					StripeCustomerEmail:  c.Email,
					CancelAt:             subscription.CancelAt,
				}, nil
			}
		}
		// no active subscription
		return &proto.Subscription{
			UpdatedAt: createdAt.Time.Unix(),
		}, nil
	}
	return &proto.Subscription{
		PlanType:  planType,
		UpdatedAt: createdAt.Time.Unix(),
	}, nil
}

type ContextKey string

const contextKey ContextKey = "subscription"

type SubscriptionInfo struct {
	Active         bool
	OrganizationId string
}

func (s Server) createCheckoutSession(ctx context.Context, organizationID string, req *proto.CreateSubscriptionRequest) (*stripe.CheckoutSession, error) {
	claims := user.GetClaims(ctx)
	stripe.Key = os.Getenv("STRIPE_SECRET_KEY")
	customerParams := &stripe.CustomerParams{
		Email: stripe.String(claims.Email),
	}
	customer, err := customer.New(customerParams)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	_, err = s.db.ExecContext(ctx, `insert into subscription_log (organization_id, plan_type, customer_id, authored_by) values ($1, $2, $3, $4)`,
		organizationID,
		req.PlanType,
		customer.ID,
		claims.Email,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	params := &stripe.CheckoutSessionParams{
		Customer: stripe.String(customer.ID),
		Mode:     stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(os.Getenv("STRIPE_PRICE_ID")),
				Quantity: stripe.Int64(1),
			},
		},
		SuccessURL: stripe.String(req.UiUrl),
		CancelURL:  stripe.String(req.UiUrl),
	}

	return session.New(params)

}

func (s Server) CancelSubscription(ctx context.Context, req *proto.CancelSubscriptionRequest) (*proto.CancelSubscriptionResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	organizationInfo := checkOrganization(ctx)
	if organizationInfo.ID == "" {
		return nil, status.Error(codes.NotFound, "Organization not found")
	}

	sub, err := s.getSubscription(ctx, organizationInfo.ID)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	if sub == nil {
		return nil, status.Error(codes.NotFound, "Subscription not found")
	}
	if sub.PlanType == proto.PlanType_TYPE_UNSPECIFIED {
		return nil, status.Error(codes.NotFound, "Subscription not found")
	}

	if sub.PlanType == proto.PlanType_TYPE_PERSONAL {
		_, err := s.db.ExecContext(ctx, `
			INSERT INTO subscription_log (organization_id, authored_by)
			VALUES ($1, $2)
		`,
			checkOrganization(ctx).ID,
			claims.Email,
		)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
		s.userStreams.PingAll()
	}
	if sub.PlanType == proto.PlanType_TYPE_TEAM {

		// cancel stripe subscription
		stripe.Key = os.Getenv("STRIPE_SECRET_KEY")
		params := &stripe.SubscriptionParams{
			CancelAtPeriodEnd: stripe.Bool(true),
		}
		_, err := subscription.Update(sub.StripeSubscriptionId, params)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}

		// update subscription log to reflect cancellation
		_, err = s.db.ExecContext(ctx, `
			INSERT INTO subscription_log (organization_id, customer_id,  payment_cancelled, plan_type, authored_by)
			VALUES ($1, $2, true, $3, $4)
		`,
			organizationInfo.ID,
			sub.CustomerId,
			sub.PlanType,
			claims.Email,
		)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}

		s.userStreams.PingAll()

		return &proto.CancelSubscriptionResponse{}, nil
	}
	return &proto.CancelSubscriptionResponse{}, nil
}

func (s Server) CreateSubscription(ctx context.Context, req *proto.CreateSubscriptionRequest) (*proto.CreateSubscriptionResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	organizationInfo := checkOrganization(ctx)
	if organizationInfo.ID == "" {
		return nil, status.Error(codes.NotFound, "Organization not found")
	}
	switch req.PlanType {
	case proto.PlanType_TYPE_PERSONAL:
		_, err := s.db.ExecContext(ctx, `insert into subscription_log (organization_id, plan_type, authored_by) values ($1, $2, $3)`,
			organizationInfo.ID,
			req.PlanType,
			claims.Email,
		)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
		s.userStreams.Ping([]string{claims.Email})
		return &proto.CreateSubscriptionResponse{
			RedirectUrl: "/", // redirect to home page
		}, nil
	case proto.PlanType_TYPE_TEAM:
		session, err := s.createCheckoutSession(ctx, organizationInfo.ID, req)
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
