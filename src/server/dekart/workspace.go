package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/user"
	"net/http"

	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s Server) getWorkspaceUpdate(ctx context.Context) (int64, error) {
	var updated_at sql.NullTime
	// for simplicity, we just get the max updated_at from the all tables.
	err := s.db.QueryRowContext(ctx, `
		SELECT max(updated_at) FROM (
			SELECT
				max(updated_at) as updated_at
			FROM workspaces
			UNION
			SELECT
				max(created_at) as updated_at
			FROM workspace_log
			UNION
			SELECT
				max(created_at) as updated_at
			FROM confirmation_log
		) max_updated_at
	`).Scan(&updated_at)
	if err != nil {
		log.Err(err).Send()
		return 0, err
	}
	return updated_at.Time.Unix(), nil
}

func (s Server) CreateWorkspace(ctx context.Context, req *proto.CreateWorkspaceRequest) (*proto.CreateWorkspaceResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	log.Debug().Msgf("CreateWorkspace: %v", req)
	workspaceID := newUUID()
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO workspaces (id, name)
		VALUES ($1, $2)
	`, workspaceID, req.WorkspaceName)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO workspace_log (workspace_id, email, status, authored_by, id)
		VALUES ($1, $2, 1, $2, $3)
	`, workspaceID, claims.Email, newUUID())
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.userStreams.PingAll()
	return &proto.CreateWorkspaceResponse{}, nil
}

func (s Server) UpdateWorkspace(ctx context.Context, req *proto.UpdateWorkspaceRequest) (*proto.UpdateWorkspaceResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	workspaceID := checkWorkspace(ctx).ID
	if workspaceID == "" {
		return nil, status.Error(codes.NotFound, "Workspace not found")
	}
	_, err := s.db.ExecContext(ctx, `
		UPDATE workspaces
		SET name = $2, updated_at = now()
		WHERE id = $1
	`, workspaceID, req.WorkspaceName)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.userStreams.PingAll()
	return &proto.UpdateWorkspaceResponse{}, nil
}

func (s Server) countActiveWorkspaceUsers(ctx context.Context, workspaceID string) (int64, error) {
	users, err := s.getWorkspaceUsers(ctx, workspaceID)
	if err != nil {
		return 0, err
	}
	var count int64
	for _, user := range users {
		if user.Status == proto.UserStatus_USER_STATUS_ACTIVE || user.Status == proto.UserStatus_USER_STATUS_PENDING {
			count++
		}
	}
	return count, nil
}

func (s Server) getWorkspaceUsers(ctx context.Context, workspaceID string) ([]*proto.User, error) {
	users := make([]*proto.User, 0)
	// In this query, the subquery (aliased as subq) gets the maximum created_at for each email.
	//The main query then joins workspace_log with this subquery on email and created_at, effectively getting the active value at the time of the last log for each user.
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			ol.email,
			ol.status,
			ol.created_at,
			cl.accepted,
			ol.authored_by,
			ol.id
		FROM
			workspace_log ol
		JOIN
			(SELECT
				email,
				max(created_at) as max_created_at
			FROM
				workspace_log
			WHERE
				workspace_id = $1
			GROUP BY
				email) subq
		ON
			ol.email = subq.email AND ol.created_at = subq.max_created_at
		LEFT JOIN confirmation_log AS cl ON ol.id = cl.workspace_log_id
		ORDER BY
			ol.created_at DESC
		`, workspaceID)
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
		var inviteID string
		user := proto.User{}
		err := rows.Scan(&user.Email, &status, &updatedAt, &accepted, &authoredBy, &inviteID)
		if err != nil {
			log.Err(err).Send()
			return nil, err
		}
		if status == 1 {
			if accepted.Valid && accepted.Bool || user.Email == authoredBy {
				user.Status = proto.UserStatus_USER_STATUS_ACTIVE
			} else if accepted.Valid {
				user.Status = proto.UserStatus_USER_STATUS_REJECTED
			} else {
				user.Status = proto.UserStatus_USER_STATUS_PENDING
				user.InviteId = inviteID
			}
		} else {
			user.Status = proto.UserStatus_USER_STATUS_REMOVED
		}
		users = append(users, &user)
	}
	return users, nil
}

func (s Server) getUserWorkspace(ctx context.Context, email string) (*proto.Workspace, error) {
	res, err := s.db.QueryContext(ctx, `
		SELECT
			o.id,
			o.name
		FROM workspaces AS o
		JOIN workspace_log AS ol ON o.id = ol.workspace_id
		JOIN (
			SELECT
				workspace_id,
				MAX(created_at) AS created_at
			FROM workspace_log
			WHERE email = $1
			GROUP BY workspace_id
		) AS oll ON ol.workspace_id = oll.workspace_id AND ol.created_at = oll.created_at
		LEFT JOIN confirmation_log AS cl ON ol.id = cl.workspace_log_id AND cl.authored_by = ol.email
		WHERE ol.status = 1 AND (ol.authored_by = $1 OR cl.accepted = TRUE)
		-- if user accepted the invite, we should show that workspace
		ORDER BY COALESCE(cl.created_at, ol.created_at) DESC, ol.created_at DESC
		LIMIT 1
	`, email)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	defer res.Close()
	if res.Next() {
		workspace := proto.Workspace{}
		err := res.Scan(&workspace.Id, &workspace.Name)
		if err != nil {
			log.Err(err).Send()
			return nil, err
		}
		return &workspace, nil
	}
	return nil, nil
}

func (s Server) checkPlaygroundUser(ctx context.Context, email string) (bool, error) {
	var isPlayground bool
	err := s.db.QueryRowContext(ctx, `
		SELECT is_playground
		FROM users
		WHERE email = $1
	`, email).Scan(&isPlayground)
	if err != nil {
		if err == sql.ErrNoRows {
			return false, nil
		}
		log.Err(err).Send()
		return false, err
	}
	return isPlayground, nil
}

func (s Server) SetWorkspaceContext(ctx context.Context, r *http.Request) context.Context {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return ctx
	}
	isPlayground := false
	if r != nil {
		isPlayground = r.Header.Get("X-Dekart-Playground") == "true"
	}
	if isPlayground {
		ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{
			IsPlayground: true,
		})
		return ctx
	}
	workspace, err := s.getUserWorkspace(ctx, claims.Email)
	if err != nil {
		log.Err(err).Send()
		return ctx
	}
	var workspaceId string
	var planType proto.PlanType
	var name string
	var addedUsersCount int64 = 0
	if workspace != nil {
		workspaceId = workspace.Id
		name = workspace.Name
		subscription, err := s.getSubscription(ctx, workspaceId)
		if err != nil {
			log.Err(err).Send()
			return ctx
		}
		if subscription != nil {
			planType = subscription.PlanType
		}
		addedUsersCount, err = s.countActiveWorkspaceUsers(ctx, workspaceId)
		if err != nil {
			log.Err(err).Send()
			return ctx
		}
	}

	ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{
		ID:              workspaceId,
		PlanType:        planType,
		Name:            name,
		AddedUsersCount: addedUsersCount,
	})
	return ctx
}

func checkWorkspace(ctx context.Context) user.WorkspaceInfo {
	return user.CheckWorkspaceCtx(ctx)
}

func (s Server) GetWorkspace(ctx context.Context, req *proto.GetWorkspaceRequest) (*proto.GetWorkspaceResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	invites, err := s.getInvites(ctx, claims.Email)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	workspaceInfo := checkWorkspace(ctx)
	if workspaceInfo.ID == "" {
		return &proto.GetWorkspaceResponse{
			Invites: invites,
		}, nil
	}
	subscription, err := s.getSubscription(ctx, workspaceInfo.ID)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	users, err := s.getWorkspaceUsers(ctx, workspaceInfo.ID)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &proto.GetWorkspaceResponse{
		Workspace: &proto.Workspace{
			Id:   workspaceInfo.ID,
			Name: workspaceInfo.Name,
		},
		Subscription:    subscription,
		Users:           users,
		Invites:         invites,
		AddedUsersCount: workspaceInfo.AddedUsersCount,
	}, nil
}

func (s Server) UpdateWorkspaceUser(ctx context.Context, req *proto.UpdateWorkspaceUserRequest) (*proto.UpdateWorkspaceUserResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	workspaceInfo := checkWorkspace(ctx)
	if workspaceInfo.ID == "" {
		return nil, status.Error(codes.NotFound, "Workspace not found")
	}
	if req.UserUpdateType == proto.UpdateWorkspaceUserRequest_USER_UPDATE_TYPE_UNSPECIFIED {
		log.Error().Msgf("User update type not specified")
		return nil, status.Error(codes.InvalidArgument, "User update type not specified")
	}
	if req.UserUpdateType == proto.UpdateWorkspaceUserRequest_USER_UPDATE_TYPE_REMOVE {
		if claims.Email == req.Email {
			return nil, status.Error(codes.InvalidArgument, "Cannot remove yourself")
		}
	}
	if req.UserUpdateType == proto.UpdateWorkspaceUserRequest_USER_UPDATE_TYPE_ADD {
		if workspaceInfo.PlanType == proto.PlanType_TYPE_PERSONAL && workspaceInfo.AddedUsersCount > 0 {
			return nil, status.Error(codes.InvalidArgument, "Cannot add more users to personal workspace")
		}
		if workspaceInfo.PlanType == proto.PlanType_TYPE_TEAM && workspaceInfo.AddedUsersCount > 20 {
			return nil, status.Error(codes.InvalidArgument, "Cannot add more users to team workspace")
		}
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO workspace_log (id, workspace_id, email, status, authored_by)
		VALUES ($1, $2, $3, $4, $5)
	`, newUUID(), workspaceInfo.ID, req.Email, req.UserUpdateType, claims.Email)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.userStreams.PingAll()
	return &proto.UpdateWorkspaceUserResponse{}, nil
}

func (s Server) getInvites(ctx context.Context, email string) ([]*proto.WorkspaceInvite, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			ol.created_at,
			o.id,
			ol.id,
			o.name,
			ol.authored_by
		FROM
			workspace_log ol
		JOIN
			(SELECT
				workspace_id,
				max(created_at) as max_created_at
			FROM
				workspace_log
			WHERE
				email = $1
			GROUP BY
				workspace_id) subq
		ON ol.workspace_id=subq.workspace_id AND ol.created_at = subq.max_created_at
		JOIN workspaces AS o ON ol.workspace_id = o.id
		LEFT JOIN confirmation_log AS cl ON ol.id = cl.workspace_log_id AND cl.authored_by = ol.email
		WHERE ol.status = 1 AND ol.authored_by != $1 AND cl.accepted is null
		ORDER BY ol.created_at DESC
		`, email)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	defer rows.Close()
	invites := make([]*proto.WorkspaceInvite, 0)
	for rows.Next() {
		invite := proto.WorkspaceInvite{}
		createdAt := sql.NullTime{}
		err := rows.Scan(&createdAt, &invite.WorkspaceId, &invite.InviteId, &invite.WorkspaceName, &invite.InviterEmail)
		if err != nil {
			log.Err(err).Send()
			return nil, err
		}
		invite.CreatedAt = createdAt.Time.Unix()
		invites = append(invites, &invite)
	}
	return invites, nil
}

func (s Server) RespondToInvite(ctx context.Context, req *proto.RespondToInviteRequest) (*proto.RespondToInviteResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO confirmation_log (workspace_log_id, accepted, authored_by)
		VALUES ($1, $2, $3)
	`, req.InviteId, req.Accept, claims.Email)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.userStreams.PingAll()
	return &proto.RespondToInviteResponse{}, nil
}
