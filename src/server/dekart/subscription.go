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

func (s Server) getSubsciptionActive(ctx context.Context, email string) (bool, int64, error) {
	var lastUpdated sql.NullTime
	var customerID sql.NullString
	err := s.db.QueryRowContext(ctx, `
		select updated_at, customer_id from subscriptions where owner_email=$1 and not archived
	`, email).Scan(&lastUpdated, &customerID)

	if err != nil {
		if err == sql.ErrNoRows {
			// No subscription
			return false, 0, nil
		}
		log.Err(err).Send()
		return false, 0, status.Error(codes.Internal, err.Error())
	}
	if customerID.Valid {
		stripe.Key = os.Getenv("STRIPE_SECRET_KEY")
		params := &stripe.CustomerParams{}
		params.AddExpand("subscriptions")
		c, err := customer.Get(customerID.String, params)

		if err != nil {
			log.Err(err).Send()
			return false, 0, status.Error(codes.Internal, err.Error())
		}
		if c.Subscriptions == nil {
			return false, 0, nil
		}
		for _, subcription := range c.Subscriptions.Data {
			if subcription.Status == "active" {
				return true, lastUpdated.Time.Unix(), nil
			}
		}
		// no active subscription
		return false, lastUpdated.Time.Unix(), nil
	}
	return lastUpdated.Valid, lastUpdated.Time.Unix(), nil
}

type ContextKey string

const contextKey ContextKey = "subscription"

func (s Server) SetSubsciptionContext(ctx context.Context) context.Context {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return ctx
	}
	active, _, err := s.getSubsciptionActive(ctx, claims.Email)
	if err != nil {
		log.Err(err).Send()
		return ctx
	}
	ctx = context.WithValue(ctx, contextKey, active)
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
	id := newUUID()
	_, err = s.db.ExecContext(ctx, `insert into subscriptions (id, owner_email, customer_id) values ($1, $2, $3)`,
		id,
		claims.Email,
		customer.ID,
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
				Price:    stripe.String("price_1ODLzrCnpQUpbHMFAnP2ZWm2"),
				Quantity: stripe.Int64(1),
			},
		},
		SuccessURL: stripe.String(req.UiUrl),
		CancelURL:  stripe.String(req.UiUrl),
	}

	return session.New(params)

}

func (s Server) CreateSubscription(ctx context.Context, req *proto.CreateSubscriptionRequest) (*proto.CreateSubscriptionResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	log.Debug().Msgf("CreateSubscription: %s", req.PlanType)
	switch req.PlanType {
	case proto.PlanType_TYPE_PERSONAL:
		id := newUUID()
		_, err := s.db.ExecContext(ctx, `insert into subscriptions (id, owner_email) values ($1, $2)`,
			id,
			claims.Email,
		)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
		s.userStreams.Ping([]string{claims.Email})
		return &proto.CreateSubscriptionResponse{}, nil
	case proto.PlanType_TYPE_TEAM:
		// return nil, status.Error(codes.Unimplemented, "Team subscription is not implemented")
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
