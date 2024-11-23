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
	if GetDefaultSubscription() != proto.PlanType_TYPE_PREMIUM {
		return true // for cloud users always create workspace
	}
	if os.Getenv("DEKART_ALLOW_WORKSPACE_CREATION") != "" {
		return true
	}
	return false // by default do not allow workspace creation, default workspace will be created
}
