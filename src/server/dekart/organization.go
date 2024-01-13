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

func (s Server) CreateOrganization(ctx context.Context, req *proto.CreateOrganizationRequest) (*proto.CreateOrganizationResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	organizationID := newUUID()
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO organizations (id, name)
		VALUES ($1, $2, $3)
	`, organizationID, req.OrganizationName)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO organization_log (organization_id, email, status, authored_by)
		VALUES ($1, $2, 1, $2)
	`, organizationID, claims.Email)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.userStreams.PingAll()
	return &proto.CreateOrganizationResponse{}, nil
}

func (s Server) UpdateOrganization(ctx context.Context, req *proto.UpdateOrganizationRequest) (*proto.UpdateOrganizationResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	organizationID := checkOrganization(ctx).ID
	if organizationID == "" {
		return nil, status.Error(codes.NotFound, "Organization not found")
	}
	_, err := s.db.ExecContext(ctx, `
		UPDATE organizations
		SET name = $2, updated_at = now()
		WHERE id = $1
	`, organizationID, req.OrganizationName)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.userStreams.PingAll()
	return &proto.UpdateOrganizationResponse{}, nil
}

func (s Server) getOrganizationUsers(ctx context.Context, organizationID string) ([]*proto.User, error) {
	users := make([]*proto.User, 0)
	// In this query, the subquery (aliased as subq) gets the maximum created_at for each email.
	//The main query then joins organization_log with this subquery on email and created_at, effectively getting the active value at the time of the last log for each user.
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			ol.email,
			ol.status,
			ol.created_at,
			cl.accepted,
			oll.authored_by
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
		LEFT JOIN confirmation_log AS cl ON ol.id = cl.organization_log_id
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
		var accepted sql.NullBool
		var status int32
		var authoredBy string
		user := proto.User{}
		err := rows.Scan(&user.Email, &status, &updatedAt, &accepted, &authoredBy)
		if err != nil {
			log.Err(err).Send()
			return nil, err
		}
		if status == 1 {
			if accepted.Valid && accepted.Bool || user.Email == authoredBy {
				user.Status = proto.UserStatus_USER_STATUS_ACTIVE
			} else {
				user.Status = proto.UserStatus_USER_STATUS_PENDING
			}
		} else {
			user.Status = proto.UserStatus_USER_STATUS_REMOVED
		}
		users = append(users, &user)
	}
	return users, nil
}

func (s Server) getUserOrganization(ctx context.Context, email string) (*proto.Organization, error) {
	organization := proto.Organization{}
	err := s.db.QueryRowContext(ctx, `
		SELECT
			o.id,
			o.name
		FROM organizations AS o
		JOIN organization_log AS ol ON o.id = ol.organization_id
		JOIN (
			SELECT
				organization_id,
				MAX(created_at) AS created_at
			FROM organization_log
			WHERE email = $1
			GROUP BY organization_id
		) AS oll ON ol.organization_id = oll.organization_id AND ol.created_at = oll.created_at
		LEFT JOIN confirmation_log AS cl ON ol.id = cl.organization_log_id AND cl.authored_by = ol.email
		WHERE ol.status = 1 AND (ol.authored_by = $1 OR cl.accepted = TRUE)
		ORDER BY ol.created_at DESC
		LIMIT 1
	`, email).Scan(&organization.Id, &organization.Name)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	return &organization, nil
}

const organizationInfoKey = "organizationInfo"

type OrganizationInfo struct {
	ID       string
	PlanType proto.PlanType
	Name     string
}

func (s Server) SetOrganizationContext(ctx context.Context) context.Context {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return ctx
	}
	organization, err := s.getUserOrganization(ctx, claims.Email)
	if err != nil {
		log.Err(err).Send()
		return ctx
	}
	var organizationId string
	var planType proto.PlanType
	var name string
	if organization != nil {
		organizationId = organization.Id
		name = organization.Name
		subscription, err := s.getSubscription(ctx, organizationId)
		if err != nil {
			log.Err(err).Send()
			return ctx
		}
		if subscription != nil {
			planType = subscription.PlanType
		}
	}
	ctx = context.WithValue(ctx, organizationInfoKey, OrganizationInfo{
		ID:       organizationId,
		PlanType: planType,
		Name:     name,
	})
	return ctx
}

func checkOrganization(ctx context.Context) OrganizationInfo {
	organizationInfo, ok := ctx.Value(organizationInfoKey).(OrganizationInfo)
	if !ok {
		log.Error().Msgf("organizationInfo not found in context")
	}
	return organizationInfo
}

func (s Server) GetOrganization(ctx context.Context, req *proto.GetOrganizationRequest) (*proto.GetOrganizationResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	organizationInfo := checkOrganization(ctx)
	if organizationInfo.ID == "" {
		return nil, status.Error(codes.NotFound, "Organization not found")
	}
	subscription, err := s.getSubscription(ctx, organizationInfo.ID)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	users, err := s.getOrganizationUsers(ctx, organizationInfo.ID)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &proto.GetOrganizationResponse{
		Organization: &proto.Organization{
			Id:   organizationInfo.ID,
			Name: organizationInfo.Name,
		},
		Subscription: subscription,
		Users:        users,
	}, nil
}

func (s Server) UpdateOrganizationUser(ctx context.Context, req *proto.UpdateOrganizationUserRequest) (*proto.UpdateOrganizationUserResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	organizationInfo := checkOrganization(ctx)
	if organizationInfo.ID == "" {
		return nil, status.Error(codes.NotFound, "Organization not found")
	}
	if req.UserUpdateType == proto.UpdateOrganizationUserRequest_USER_UPDATE_TYPE_UNSPECIFIED {
		return nil, status.Error(codes.InvalidArgument, "User update type not specified")
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO organization_log (organization_id, email, status, authored_by)
		VALUES ($1, $2, $3, $4)
	`, organizationInfo.ID, req.Email, req.UserUpdateType, claims.Email)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.userStreams.PingAll()
	return &proto.UpdateOrganizationUserResponse{}, nil
}

func (s Server) GetInvites(ctx context.Context, req *proto.GetInvitesRequest) (*proto.GetInvitesResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			ol.created_at,
			o.organization_id,
			ol.id,
			o.name,
			ol.authored_by
		FROM
			organization_log ol
		JOIN
			(SELECT
				organization_id,
				max(created_at) as max_created_at
			FROM
				organization_log
			WHERE
				email = $1
			GROUP BY
				organization_id) subq
		ON ol.organization_id=subq.organization_id AND ol.created_at = subq.max_created_at
		JOIN organizations AS o ON ol.organization_id = o.id
		LEFT JOIN confirmation_log AS cl ON ol.id = cl.organization_log_id AND cl.authored_by = ol.email
		WHERE ol.status = 1 AND ol.authored_by != $1 AND cl.accepted is null
		ORDER BY ol.created_at DESC
		`, claims.Email)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	defer rows.Close()
	invites := make([]*proto.OrganizationInvite, 0)
	for rows.Next() {
		invite := proto.OrganizationInvite{}
		createdAt := sql.NullTime{}
		err := rows.Scan(&createdAt, &invite.OrganizationId, &invite.InviteId, &invite.OrganizationName, &invite.InviterEmail)
		if err != nil {
			log.Err(err).Send()
			return nil, err
		}
		invite.CreatedAt = createdAt.Time.Unix()
		invites = append(invites, &invite)
	}
	return &proto.GetInvitesResponse{
		Invites: invites,
	}, nil
}

func (s Server) RespondToInvite(ctx context.Context, req *proto.RespondToInviteRequest) (*proto.RespondToInviteResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO confirmation_log (organization_log_id, accepted, authored_by)
		VALUES (
			$1, $2, $3
	`, req.InviteId, req.Accept, claims.Email)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.userStreams.PingAll()
	return &proto.RespondToInviteResponse{}, nil
}
