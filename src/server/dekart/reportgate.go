package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/user"
	"errors"
	"os"
)

const freeWorkspaceMapLimit = 3

var errReportLimitReached = errors.New("report limit reached")

type queryRower interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// checkCreateReportGate evaluates whether creating a report should be blocked by trial gate policy.
func (s Server) checkCreateReportGate(ctx context.Context, workspaceInfo user.WorkspaceInfo) (bool, error) {
	return checkCreateReportGate(ctx, s.db, workspaceInfo)
}

// checkCreateReportGateTx serializes free workspace map creation by locking the workspace row before counting maps.
func checkCreateReportGateTx(ctx context.Context, tx queryRower, workspaceInfo user.WorkspaceInfo) (bool, error) {
	if shouldBypassCreateReportGate(workspaceInfo) {
		return true, nil
	}
	if err := lockWorkspaceForMapCreation(ctx, tx, workspaceInfo.ID); err != nil {
		return false, err
	}
	return checkCreateReportGate(ctx, tx, workspaceInfo)
}

func checkCreateReportGate(ctx context.Context, db queryRower, workspaceInfo user.WorkspaceInfo) (bool, error) {
	if shouldBypassCreateReportGate(workspaceInfo) {
		return true, nil
	}
	mapsCount, err := countWorkspaceMaps(ctx, db, workspaceInfo.ID)
	if err != nil {
		return false, err
	}
	return mapsCount < freeWorkspaceMapLimit, nil
}

func shouldBypassCreateReportGate(workspaceInfo user.WorkspaceInfo) bool {
	if os.Getenv("DEKART_CLOUD") == "" {
		return true
	}
	if workspaceInfo.IsPlayground || workspaceInfo.IsDefaultWorkspace {
		return true
	}
	if workspaceInfo.PlanType != proto.PlanType_TYPE_PERSONAL {
		return true
	}
	return false
}

func lockWorkspaceForMapCreation(ctx context.Context, tx queryRower, workspaceID string) error {
	const q = `
		SELECT id
		FROM workspaces
		WHERE id = $1
		FOR UPDATE
	`
	var id string
	return tx.QueryRowContext(ctx, q, workspaceID).Scan(&id)
}

// countWorkspaceMaps returns number of non-archived non-playground reports in workspace.
func (s Server) countWorkspaceMaps(ctx context.Context, workspaceID string) (int, error) {
	return countWorkspaceMaps(ctx, s.db, workspaceID)
}

func countWorkspaceMaps(ctx context.Context, db queryRower, workspaceID string) (int, error) {
	const q = `
		SELECT COUNT(*)
		FROM reports
		WHERE workspace_id = $1
		  AND archived = FALSE
		  AND is_playground = FALSE
	`
	var count int
	if err := db.QueryRowContext(ctx, q, workspaceID).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}
