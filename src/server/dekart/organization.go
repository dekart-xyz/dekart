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

func (s Server) RespondToInvite(ctx context.Context, req *proto.RespondToInviteRequest) (*proto.RespondToInviteResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	organizationID := req.OrganizationId
	var userStatus int32
	if condition := req.Accept; condition {
		userStatus = int32(proto.UserStatus_USER_STATUS_ACTIVE)
	} else {
		userStatus = int32(proto.UserStatus_USER_STATUS_REMOVED)

	}
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO organization_log (organization_id, email, user_status, authored_by)
		SELECT
			ol.organization_id,
			ol.email,
			$3,
			ol.email
		from organization_log as ol
		join (
			SELECT
				organization_id,
				email,
				max(created_at) as created_at
			FROM
				organization_log
			WHERE
				email = $2 and organization_id = $1
			group by
				organization_id, email
		) as la on ol.organization_id = la.organization_id and ol.created_at = la.created_at and ol.email = la.email
		WHERE ol.user_status = 1
	`, organizationID, claims.Email, userStatus)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	rowsAffected, err := res.RowsAffected()

	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	if rowsAffected == 0 {
		return nil, status.Error(codes.NotFound, "Invite not found")
	}
	s.userStreams.PingAll()
	return &proto.RespondToInviteResponse{}, nil
}

func (s Server) GetInvites(ctx context.Context, req *proto.GetInvitesRequest) (*proto.GetInvitesResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			ol.created_at,
			ol.organization_id,
			o.name,
			ol.authored_by
		from organization_log as ol
		join organizations as o on ol.organization_id = o.id
		join (
			SELECT
			organization_id,
			email,
			max(created_at) as created_at
		FROM
			organization_log
		WHERE
			email = $1
		group by
			organization_id, email
		) as la on ol.organization_id = la.organization_id and ol.created_at = la.created_at and ol.email = la.email
		where ol.user_status = 1
`, claims.Email)

	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	defer rows.Close()
	invites := make([]*proto.OrganizationInvite, 0)
	for rows.Next() {
		invite := proto.OrganizationInvite{}
		organization := proto.Organization{}
		createdAt := sql.NullTime{}
		err := rows.Scan(&createdAt, &organization.Id, &organization.Name, &invite.InviterEmail)
		if err != nil {
			log.Err(err).Send()
			return nil, err
		}
		invite.CreatedAt = createdAt.Time.Unix()
		invite.Organization = &organization
		invites = append(invites, &invite)
	}
	return &proto.GetInvitesResponse{
		Invites: invites,
	}, nil
}

func (s Server) getLastOrganizationInviteUpdate(ctx context.Context) (int64, error) {
	claims := user.GetClaims(ctx)
	var createdAt sql.NullTime
	err := s.db.QueryRowContext(ctx, `
		SELECT
			max(o.created_at)
		from organization_log as o
		join (
			SELECT
			organization_id,
			email,
			max(created_at) as created_at
		FROM
			organization_log
		WHERE
			email = $1
		group by
			organization_id, email
		) as l on o.organization_id = l.organization_id and o.created_at = l.created_at and o.email = l.email
		where o.user_status = 1
		`, claims.Email).Scan(&createdAt)
	if err != nil {
		log.Err(err).Send()
		return 0, err
	}
	return createdAt.Time.Unix(), nil
}

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
