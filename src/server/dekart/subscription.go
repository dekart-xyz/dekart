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
	var active bool
	var lastUpdated sql.NullTime
	err := s.db.QueryRowContext(ctx, `
		select count(id) > 0, MAX(updated_at) from subscriptions where owner_email=$1 and not archived
	`, email).Scan(&active, &lastUpdated)
	if err != nil {
		log.Err(err).Send()
		return false, 0, status.Error(codes.Internal, err.Error())
	}
	return active, lastUpdated.Time.Unix(), nil
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

func createCheckoutSession(ctx context.Context, req *proto.CreateSubscriptionRequest) (*stripe.CheckoutSession, error) {
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
		s, err := createCheckoutSession(ctx, req)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
		return &proto.CreateSubscriptionResponse{
			RedirectUrl: s.URL,
		}, nil
	}
	return nil, status.Error(codes.InvalidArgument, "Unknown plan type")
}
