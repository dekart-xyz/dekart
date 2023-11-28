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

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s Server) getSubsciptionActive(
	ctx context.Context,
	email string,
) (*proto.Subscription, error) {
	var createdAt sql.NullTime
	var customerID sql.NullString
	var planType proto.PlanType
	var cancelled bool
	err := s.db.QueryRowContext(ctx, `
		select created_at, customer_id, plan_type, cancelled from subscription_log where owner_email=$1 order by created_at desc limit 1
	`, email).Scan(&createdAt, &customerID, &planType, &cancelled)

	if err != nil {
		if err == sql.ErrNoRows {
			// No subscription
			return &proto.Subscription{
				Active: false,
			}, nil
		}
		log.Err(err).Send()
		return &proto.Subscription{
			Active: false,
		}, err
	}

	if !cancelled && customerID.Valid {
		stripe.Key = os.Getenv("STRIPE_SECRET_KEY")
		params := &stripe.CustomerParams{}
		params.AddExpand("subscriptions")
		c, err := customer.Get(customerID.String, params)

		if err != nil {
			log.Err(err).Send()
			return &proto.Subscription{
				Active:    false,
				UpdatedAt: createdAt.Time.Unix(),
			}, err
		}
		if c.Subscriptions == nil {
			return &proto.Subscription{
				Active:    false,
				UpdatedAt: createdAt.Time.Unix(),
			}, nil
		}
		for _, subcription := range c.Subscriptions.Data {
			if subcription.Status == "active" {
				return &proto.Subscription{
					Active:    true,
					PlanType:  planType,
					UpdatedAt: createdAt.Time.Unix(),
				}, nil
			}
		}
		// no active subscription
		return &proto.Subscription{
			Active:    false,
			UpdatedAt: createdAt.Time.Unix(),
		}, nil
	}
	return &proto.Subscription{
		Active:    !cancelled,
		PlanType:  planType,
		UpdatedAt: createdAt.Time.Unix(),
	}, nil
}

type ContextKey string

const contextKey ContextKey = "subscription"

func (s Server) SetSubsciptionContext(ctx context.Context) context.Context {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return ctx
	}
	sub, err := s.getSubsciptionActive(ctx, claims.Email)
	if err != nil {
		log.Err(err).Send()
		return ctx
	}
	ctx = context.WithValue(ctx, contextKey, sub.Active)
	return ctx
}

// func checkSubscription(ctx context.Context) bool {
// 	active, ok := ctx.Value(contextKey).(bool)
// 	if !ok {
// 		return false
// 	}
// 	return active
// }

func (s Server) createCheckoutSession(ctx context.Context, req *proto.CreateSubscriptionRequest) (*stripe.CheckoutSession, error) {
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
	_, err = s.db.ExecContext(ctx, `insert into subscription_log (owner_email, customer_id) values ($1, $2, $3)`,
		claims.Email,
		customer.ID,
		req.PlanType,
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

func (s Server) GetSubscription(ctx context.Context, req *proto.GetSubscriptionRequest) (*proto.GetSubscriptionResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	sub, err := s.getSubsciptionActive(ctx, claims.Email)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &proto.GetSubscriptionResponse{
		Subscription: sub,
	}, nil
}

func (s Server) CancelSubscription(ctx context.Context, req *proto.CancelSubscriptionRequest) (*proto.CancelSubscriptionResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	_, err := s.db.ExecContext(ctx, `insert into subscription_log (owner_email, cancelled) values ($1, $2)`,
		claims.Email,
		true,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.userStreams.Ping([]string{claims.Email})
	return &proto.CancelSubscriptionResponse{}, nil
}

func (s Server) CreateSubscription(ctx context.Context, req *proto.CreateSubscriptionRequest) (*proto.CreateSubscriptionResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	switch req.PlanType {
	case proto.PlanType_TYPE_PERSONAL:
		_, err := s.db.ExecContext(ctx, `insert into subscription_log (owner_email, plan_type) values ($1, $2)`,
			claims.Email,
			req.PlanType,
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
		session, err := s.createCheckoutSession(ctx, req)
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
