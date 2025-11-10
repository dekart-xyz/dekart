package user

import (
	"context"
	"dekart/src/proto"
	"os"

	"github.com/rs/zerolog/log"
)

type workspaceInfoKeyType string

const workspaceInfoKey workspaceInfoKeyType = "workspaceInfo"

// CopyWorkspace copies workspace from sourceCtx to destCtx
func copyWorkspace(sourceCtx, destCtx context.Context) context.Context {
	workspace := CheckWorkspaceCtx(sourceCtx)
	return context.WithValue(destCtx, workspaceInfoKey, workspace)
}

type WorkspaceInfo struct {
	ID                 string
	PlanType           proto.PlanType
	Name               string
	AddedUsersCount    int64
	BilledUsers        int64 // Number of users that are billed for the workspace
	IsPlayground       bool
	IsDefaultWorkspace bool // Default workspace for the instance, similar to playground
	UserRole           proto.UserRole
	Expired            bool
}

func SetWorkspaceCtx(ctx context.Context, workspace WorkspaceInfo) context.Context {
	return context.WithValue(ctx, workspaceInfoKey, workspace)
}

func CheckWorkspaceCtx(ctx context.Context) WorkspaceInfo {
	workspaceInfo, ok := ctx.Value(workspaceInfoKey).(WorkspaceInfo)
	if !ok {
		log.Error().Msgf("workspaceInfo not found in context")
	}
	return workspaceInfo
}

// CanCreateWorkspace checks if users can create workspace
func CanCreateWorkspace() bool {
	if GetDefaultSubscription() != proto.PlanType_TYPE_SELF_HOSTED {
		return true // for cloud users always create workspace
	}
	if os.Getenv("DEKART_ALLOW_WORKSPACE_CREATION") != "" {
		return true
	}
	return false // by default do not allow workspace creation, default workspace will be created
}

// GetDefaultWorkspaceID returns default workspace ID
func GetDefaultWorkspaceID() string {
	return "00000000-0000-0000-0000-000000000000"
}

// getDefaultWorkspaceAdmin returns default workspace admin
func getDefaultWorkspaceAdmin() string {
	return os.Getenv("DEKART_DEFAULT_WORKSPACE_ADMIN")
}

// GetWorkspaceDefaultRole returns default user role for workspace
func GetWorkspaceDefaultRole() proto.UserRole {
	switch os.Getenv("DEKART_DEFAULT_WORKSPACE_ROLE") {
	case "admin":
		return proto.UserRole_ROLE_ADMIN
	case "editor":
		return proto.UserRole_ROLE_EDITOR
	case "viewer":
		return proto.UserRole_ROLE_VIEWER
	default:
		if getDefaultWorkspaceAdmin() == "" {
			// someone should be admin, then everyone else is admin
			return proto.UserRole_ROLE_ADMIN
		}
		return proto.UserRole_ROLE_VIEWER
	}
}

// GetUserDefaultRole returns default role for user
func GetUserDefaultRole(email string) proto.UserRole {
	if email == getDefaultWorkspaceAdmin() {
		return proto.UserRole_ROLE_ADMIN
	}
	return GetWorkspaceDefaultRole()
}
