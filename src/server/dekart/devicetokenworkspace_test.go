package dekart

import (
	"context"
	"testing"

	"dekart/src/proto"
	"dekart/src/server/report"
	"dekart/src/server/user"

	"github.com/stretchr/testify/require"
)

// A removed member must lose write access even with an existing workspace-scoped token.
func TestRemovedMemberDeviceTokenCreateReport(t *testing.T) {
	db := workspaceDeleteDatabase(t)

	workspaceID := "11111111-1111-1111-1111-111111111111"
	email := "removed@example.com"
	_, err := db.Exec(`INSERT INTO workspaces (id, name) VALUES (?, 'probe')`, workspaceID)
	require.NoError(t, err)
	_, err = db.Exec(`INSERT INTO workspace_log (id, workspace_id, email, status, authored_by, role, created_at)
		VALUES ('a', ?, ?, 1, ?, 2, '2026-01-01 00:00:00')`, workspaceID, email, email)
	require.NoError(t, err)
	_, err = db.Exec(`INSERT INTO workspace_log (id, workspace_id, email, status, authored_by, role, created_at)
		VALUES ('b', ?, ?, 2, 'admin@example.com', 2, '2026-01-02 00:00:00')`, workspaceID, email)
	require.NoError(t, err)
	_, err = db.Exec(`INSERT INTO subscription_log (workspace_id, plan_type, authored_by, trial_ends_at)
		VALUES (?, ?, 'admin@example.com', '2099-01-01 00:00:00')`, workspaceID, int32(proto.PlanType_TYPE_TRIAL))
	require.NoError(t, err)

	server := Server{db: db, reportStreams: report.NewStreams()}
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: email, WorkspaceID: workspaceID})
	ctx = server.SetWorkspaceContext(ctx, nil)

	_, err = server.CreateReport(ctx, &proto.CreateReportRequest{})
	require.Error(t, err)
	var count int
	require.NoError(t, db.QueryRow(`SELECT count(*) FROM reports WHERE workspace_id = ?`, workspaceID).Scan(&count))
	require.Zero(t, count)
}
