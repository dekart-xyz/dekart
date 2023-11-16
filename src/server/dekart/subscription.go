package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/user"

	"github.com/rs/zerolog/log"
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

func checkSubscription(ctx context.Context) bool {
	active, ok := ctx.Value(contextKey).(bool)
	if !ok {
		return false
	}
	return active
}

func (s Server) CreateSubscription(ctx context.Context, req *proto.CreateSubscriptionRequest) (*proto.CreateSubscriptionResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
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
}
