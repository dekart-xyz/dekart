package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/errtype"
	"dekart/src/server/user"
	"net/http"
	"os"
	"time"

	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s Server) getWorkspaceUpdate(ctx context.Context) (int64, error) {
	var updatedAtStr sql.NullString // Use NullString to handle both Postgres and SQLite outputs
	var updatedAtTime sql.NullTime  // Use time for postgres

	// Query for the max updated_at across all relevant tables
	query := `
		SELECT MAX(updated_at) FROM (
			SELECT MAX(updated_at) AS updated_at FROM workspaces
			UNION
			SELECT MAX(created_at) AS updated_at FROM workspace_log
			UNION
			SELECT MAX(created_at) AS updated_at FROM confirmation_log
			UNION
			SELECT MAX(created_at) AS updated_at FROM subscription_log
		) max_updated_at;
	`
	var err error
	if IsSqlite() {
		err = s.db.QueryRowContext(ctx, query).Scan(&updatedAtStr)
	} else {
		err = s.db.QueryRowContext(ctx, query).Scan(&updatedAtTime)
	}
	if err != nil {
		errtype.LogError(err, "Error fetching max updated_at")
		return 0, err
	}

	if IsSqlite() {
		// If no timestamp is found, return 0
		if !updatedAtStr.Valid {
			return 0, nil
		}
		// Parse the timestamp string into a time.Time (SQLite stores in UTC)
		parsedTime, err := time.ParseInLocation("2006-01-02 15:04:05", updatedAtStr.String, time.UTC)
		if err != nil {
			errtype.LogError(err, "Error parsing updated_at timestamp")
			return 0, err
		}

		return parsedTime.Unix(), nil
	}
	return updatedAtTime.Time.Unix(), nil
}

func (s Server) CreateWorkspace(ctx context.Context, req *proto.CreateWorkspaceRequest) (*proto.CreateWorkspaceResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
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

	// create a subscription for the workspace
	err = s.createDefaultSubscription(ctx, workspaceID, claims.Email)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	return &proto.CreateWorkspaceResponse{}, nil
}

func (s Server) UpdateWorkspace(ctx context.Context, req *proto.UpdateWorkspaceRequest) (*proto.UpdateWorkspaceResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	workspaceInfo := checkWorkspace(ctx)
	if workspaceInfo.ID == "" {
		return nil, status.Error(codes.NotFound, "Workspace not found")
	}
	if workspaceInfo.Expired {
		return nil, status.Error(codes.PermissionDenied, "workspace is read-only")
	}
	if workspaceInfo.UserRole != proto.UserRole_ROLE_ADMIN {
		return nil, status.Error(codes.PermissionDenied, "Only admins can update workspace")
	}
	_, err := s.db.ExecContext(ctx, `
		UPDATE workspaces
		SET name = $2, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
	`, workspaceInfo.ID, req.WorkspaceName)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.userStreams.PingAll()
	return &proto.UpdateWorkspaceResponse{}, nil
}

func (s Server) countActiveWorkspaceUsers(ctx context.Context, workspaceID string) (int64, int64, error) {
	users, err := s.getWorkspaceUsers(ctx, workspaceID)
	if err != nil {
		return 0, 0, err
	}
	var count int64
	var countBilledUsers int64
	for _, user := range users {
		if user.Status == proto.UserStatus_USER_STATUS_ACTIVE || user.Status == proto.UserStatus_USER_STATUS_PENDING {
			count++
			if user.Role == proto.UserRole_ROLE_ADMIN || user.Role == proto.UserRole_ROLE_EDITOR {
				countBilledUsers++
			}
		}
	}
	return count, countBilledUsers, nil
}

func (s Server) getWorkspaceUsers(ctx context.Context, workspaceID string) ([]*proto.User, error) {
	users := make([]*proto.User, 0)
	// In this query, the subquery (aliased as subq) gets the maximum created_at for each email.
	//The main query then joins workspace_log with this subquery on email and created_at, effectively getting the active value at the time of the last log for each user.
	rows, err := s.db.QueryContext(ctx, `
		WITH status AS (
		SELECT
			ol.email,
			ol.status,
			ol.created_at,
			cl.accepted,
			ol.authored_by,
			ol.id,
			ol.role
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
				and status in (1, 2)
			GROUP BY
				email) subq
		ON
			ol.email = subq.email AND ol.created_at = subq.max_created_at
		LEFT JOIN confirmation_log AS cl ON ol.id = cl.workspace_log_id
		ORDER BY
			ol.created_at DESC
		), role AS (
		SELECT
			ol.email,
			ol.role,
			ol.created_at,
			ol.authored_by
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
				and status in (1, 3)
			GROUP BY
				email) subq
		ON
			ol.email = subq.email AND ol.created_at = subq.max_created_at and ol.workspace_id = $1
		)
		SELECT
			status.email,
			status.status,
			status.created_at,
			status.accepted,
			status.authored_by,
			status.id,
			COALESCE(role.role, status.role) as role
		FROM status
		LEFT JOIN role ON status.email = role.email;

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
		err := rows.Scan(&user.Email, &status, &updatedAt, &accepted, &authoredBy, &inviteID, &user.Role)
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

func (s Server) getUserWorkspace(ctx context.Context, email string) (*proto.Workspace, *proto.UserRole, error) {
	res, err := s.db.QueryContext(ctx, `
		with user_role as (
			SELECT
				ol.role,
				ol.email,
				ol.workspace_id
			FROM
				workspace_log ol
			JOIN (
				SELECT
					workspace_id,
					MAX(created_at) AS created_at
				FROM workspace_log
				WHERE
					email = $1
					and status in (1, 3)
				GROUP BY workspace_id
			) AS oll ON ol.workspace_id = oll.workspace_id AND ol.created_at = oll.created_at
			WHERE
				ol.email = $1
				AND ol.status in (1, 3)
		)
		SELECT
			o.id,
			o.name,
			ur.role
		FROM workspaces AS o
		JOIN workspace_log AS ol ON o.id = ol.workspace_id
		JOIN (
			SELECT
				workspace_id,
				MAX(created_at) AS created_at
			FROM workspace_log
			WHERE email = $1
			and status in (1, 2)
			GROUP BY workspace_id
		) AS oll ON ol.workspace_id = oll.workspace_id AND ol.created_at = oll.created_at
		LEFT JOIN confirmation_log AS cl ON ol.id = cl.workspace_log_id AND cl.authored_by = ol.email
		LEFT JOIN user_role AS ur ON ol.email = ur.email AND ol.workspace_id = ur.workspace_id
		WHERE ol.status = 1 AND (ol.authored_by = $1 OR cl.accepted = TRUE)
		-- if user accepted the invite, we should show that workspace
		ORDER BY COALESCE(cl.created_at, ol.created_at) DESC, ol.created_at DESC
		LIMIT 1
	`, email)
	if err != nil {
		log.Err(err).Send()
		return nil, nil, err
	}
	defer res.Close()
	role := proto.UserRole_ROLE_UNSPECIFIED
	if res.Next() {
		workspace := proto.Workspace{}
		err := res.Scan(&workspace.Id, &workspace.Name, &role)
		if err != nil {
			log.Err(err).Send()
			return nil, nil, err
		}
		return &workspace, &role, nil
	}
	if !user.CanCreateWorkspace() { // if user cannot create workspace, we should add the default workspace
		workspaceID := user.GetDefaultWorkspaceID()
		_, err = s.db.ExecContext(ctx, `
		INSERT INTO workspace_log (workspace_id, email, status, authored_by, id, role)
		VALUES ($1, $2, 1, $2, $3, $4)
	`, workspaceID, email, newUUID(), user.GetUserDefaultRole(email))
		if err != nil {
			log.Err(err).Send()
			return nil, nil, err
		}
		err = s.createDefaultSubscription(ctx, workspaceID, email)
		if err != nil {
			log.Err(err).Send()
			return nil, nil, err
		}
		return s.getUserWorkspace(ctx, email)
	}

	return nil, &role, nil
}

func (s Server) SetWorkspaceContext(ctx context.Context, r *http.Request) context.Context {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return ctx
	}

	// check if the request is from playground
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
	if claims.Email == user.UnknownEmail && os.Getenv("DEKART_CLOUD") == "" {
		// For backward compatibility, we switch to playground mode if the user is not authenticated
		ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{
			IsPlayground:       true,
			IsDefaultWorkspace: true,
		})
		return ctx
	}

	workspace, role, err := s.getUserWorkspace(ctx, claims.Email)
	if err != nil {
		log.Err(err).Send()
		return ctx
	}
	var workspaceId string
	var planType proto.PlanType
	var expired bool
	var name string
	var addedUsersCount int64 = 0
	var billedUsers int64 = 0
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
			expired = subscription.Expired
		}
		addedUsersCount, billedUsers, err = s.countActiveWorkspaceUsers(ctx, workspaceId)
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
		BilledUsers:     billedUsers,
		UserRole:        *role,
		Expired:         expired,
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
	if workspaceInfo.Expired {
		return nil, status.Error(codes.PermissionDenied, "workspace is read-only")
	}
	if workspaceInfo.UserRole != proto.UserRole_ROLE_ADMIN {
		return nil, status.Error(codes.PermissionDenied, "Only admin can update users")
	}
	if req.UserUpdateType == proto.UpdateWorkspaceUserRequest_USER_UPDATE_TYPE_UNSPECIFIED {
		log.Error().Msgf("User update type not specified")
		return nil, status.Error(codes.InvalidArgument, "User update type not specified")
	}
	if claims.Email == req.Email {
		return nil, status.Error(codes.InvalidArgument, "Cannot remove yourself")
	}
	if req.UserUpdateType == proto.UpdateWorkspaceUserRequest_USER_UPDATE_TYPE_ADD {
		if workspaceInfo.PlanType == proto.PlanType_TYPE_UNSPECIFIED {
			return nil, status.Error(codes.InvalidArgument, "Workspace plan not specified")
		}
		if workspaceInfo.PlanType == proto.PlanType_TYPE_PERSONAL && workspaceInfo.AddedUsersCount > 0 {
			return nil, status.Error(codes.InvalidArgument, "Cannot add more users to personal workspace")
		}
		if workspaceInfo.PlanType == proto.PlanType_TYPE_TEAM && workspaceInfo.AddedUsersCount > 29 {
			return nil, status.Error(codes.InvalidArgument, "Cannot add more users to team workspace")
		}
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO workspace_log (id, workspace_id, email, status, authored_by, role)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, newUUID(), workspaceInfo.ID, req.Email, req.UserUpdateType, claims.Email, req.Role)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	// because we are adding/removing users, we need to update the seats in the workspace context
	updatedCtx := s.SetWorkspaceContext(ctx, nil)
	err = s.updateSeats(updatedCtx)
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
				AND status in (1, 2)
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
