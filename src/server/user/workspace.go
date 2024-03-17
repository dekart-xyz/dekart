package user

import (
	"context"
	"dekart/src/proto"

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
	ID              string
	PlanType        proto.PlanType
	Name            string
	AddedUsersCount int64
	IsPlayground    bool
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
