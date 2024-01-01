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

func (s Server) AddUser(ctx context.Context, req *proto.AddUserRequest) (*proto.AddUserResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	sub := checkSubscription(ctx)
	if !sub.Active {
		return nil, status.Error(codes.NotFound, "Subscription not found")
	}
	organizationID := sub.OrganizationId
	_, err := s.db.ExecContext(
		ctx,
		`
			INSERT INTO organization_log (organization_id, email, user_status, authored_by)
			VALUES ($1, $2, $3, $4)
		`,
		organizationID,
		req.Email,
		proto.UserStatus_USER_STATUS_PENDING,
		claims.Email,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.userStreams.PingAll()
	return &proto.AddUserResponse{}, nil
}

func (s Server) RemoveUser(ctx context.Context, req *proto.RemoveUserRequest) (*proto.RemoveUserResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	sub := checkSubscription(ctx)
	if !sub.Active {
		return nil, status.Error(codes.NotFound, "Subscription not found")
	}
	organizationID := sub.OrganizationId
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO organization_log (organization_id, email, user_status, authored_by)
		VALUES ($1, $2, $3, $4)
	`, organizationID, req.Email, proto.UserStatus_USER_STATUS_REMOVED, claims.Email)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.userStreams.PingAll()
	return &proto.RemoveUserResponse{}, nil
}

func (s Server) getLastOrganizationUpdate(ctx context.Context, organizationID string) (int64, error) {
	if organizationID == "" {
		return 0, nil
	}
	var createdAt sql.NullTime
	err := s.db.QueryRowContext(ctx, `
		SELECT
			created_at
		FROM
			organization_log
		WHERE
			organization_id = $1
		ORDER BY
			created_at DESC
		LIMIT 1
		`, organizationID).Scan(&createdAt)
	if err != nil {
		log.Err(err).Send()
		return 0, err
	}
	return createdAt.Time.Unix(), nil
}

func (s Server) getOrganizationUsers(ctx context.Context, organizationID string) ([]*proto.User, error) {
	users := make([]*proto.User, 0)
	// In this query, the subquery (aliased as subq) gets the maximum created_at for each email.
	//The main query then joins organization_log with this subquery on email and created_at, effectively getting the active value at the time of the last log for each user.
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			ol.email,
			ol.user_status,
			ol.created_at
		FROM
			organization_log ol
		JOIN
			(SELECT
				email,
				max(created_at) as max_created_at
			FROM
				organization_log
			WHERE
				organization_id = $1
			GROUP BY
				email) subq
		ON
			ol.email = subq.email AND ol.created_at = subq.max_created_at
		ORDER BY
			ol.created_at DESC
		`, organizationID)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var updatedAt sql.NullTime
		user := proto.User{}
		err := rows.Scan(&user.Email, &user.Status, &updatedAt)
		user.UpdatedAt = updatedAt.Time.Unix()
		if err != nil {
			log.Err(err).Send()
			return nil, err
		}
		users = append(users, &user)
	}
	return users, nil
}

func (s Server) ListUsers(ctx context.Context, req *proto.ListUsersRequest) (*proto.ListUsersResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	sub := checkSubscription(ctx)
	if !sub.Active {
		return nil, status.Error(codes.NotFound, "Subscription not found")
	}
	user, err := s.getOrganizationUsers(ctx, sub.OrganizationId)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &proto.ListUsersResponse{
		Users: user,
	}, nil
}
