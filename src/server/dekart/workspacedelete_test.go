package dekart

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"dekart/src/proto"
	"dekart/src/server/notifications"
	"dekart/src/server/report"
	"dekart/src/server/user"

	"github.com/stretchr/testify/require"
	"github.com/stripe/stripe-go/v76"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// workspaceDeleteDatabase applies the real schema with foreign-key checks for deletion and access tests.
func workspaceDeleteDatabase(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite3", ":memory:")
	require.NoError(t, err)
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	files, err := filepath.Glob("../../../sqlite/migrations/*.up.sql")
	require.NoError(t, err)
	for _, f := range files {
		execMigration(t, db, filepath.Join("sqlite/migrations", filepath.Base(f)))
	}
	_, err = db.Exec(`PRAGMA foreign_keys=ON`)
	require.NoError(t, err)
	return db
}

// workspaceDeleteFixture uses an expired Cloud workspace to exercise the deletion command.
func workspaceDeleteFixture(t *testing.T) (Server, context.Context) {
	t.Helper()
	t.Setenv("DEKART_CLOUD", "1")
	t.Setenv("DEKART_SQLITE", "1")
	db := workspaceDeleteDatabase(t)
	_, err := db.Exec(`INSERT INTO workspaces (id,name) VALUES ('delete-me','Delete me');
 INSERT INTO workspace_log (id,workspace_id,email,status,authored_by,role,created_at)
 VALUES ('admin','delete-me','admin@example.com',1,'admin@example.com',1,'2026-01-01');
 INSERT INTO subscription_log (workspace_id,plan_type,authored_by,trial_ends_at)
 VALUES ('delete-me',6,'admin@example.com','2020-01-01');`)
	require.NoError(t, err)
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: "admin@example.com"})
	ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{ID: "delete-me", Name: "Delete me", UserRole: proto.UserRole_ROLE_ADMIN, ReadOnly: true})
	return Server{db: db, userStreams: user.NewStreams(), reportStreams: report.NewStreams(), notifications: notifications.NewNoop()}, ctx
}

// The command enforces role, workspace, hosting and billing-independent deletion gates.
func TestDeleteWorkspaceRules(t *testing.T) {
	for _, tc := range []struct {
		name  string
		role  proto.UserRole
		id    string
		cloud bool
		def   bool
		code  codes.Code
	}{
		{"not admin", proto.UserRole_ROLE_EDITOR, "delete-me", true, false, codes.PermissionDenied},
		{"default", proto.UserRole_ROLE_ADMIN, "delete-me", true, true, codes.PermissionDenied},
		{"different workspace", proto.UserRole_ROLE_ADMIN, "other", true, false, codes.PermissionDenied},
		{"self hosted", proto.UserRole_ROLE_ADMIN, "delete-me", false, false, codes.PermissionDenied},
		{"expired trial", proto.UserRole_ROLE_ADMIN, "delete-me", true, false, codes.OK},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, ctx := workspaceDeleteFixture(t)
			// Exercise the same command outside Cloud mode.
			if !tc.cloud {
				t.Setenv("DEKART_CLOUD", "")
			}
			// Mark a persisted default workspace instead of relying on its ID.
			if tc.def {
				_, err := s.db.Exec(`UPDATE workspaces SET is_default=true WHERE id='delete-me'`)
				require.NoError(t, err)
			}
			ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{ID: "delete-me", UserRole: tc.role, ReadOnly: true})
			_, err := s.DeleteWorkspace(ctx, &proto.DeleteWorkspaceRequest{WorkspaceId: tc.id})
			require.Equal(t, tc.code, status.Code(err))
		})
	}
}

// Deletion keeps audit history while removing workspace and invitation access.
func TestDeleteWorkspacePreservesLogsAndRemovesInvites(t *testing.T) {
	s, ctx := workspaceDeleteFixture(t)
	_, err := s.db.Exec(`INSERT INTO workspace_log (id,workspace_id,email,status,authored_by,role,created_at) VALUES
 ('member','delete-me','member@example.com',1,'member@example.com',2,'2026-01-01'),
 ('pending','delete-me','pending@example.com',1,'admin@example.com',2,'2026-01-01'),
 ('rejected','delete-me','rejected@example.com',1,'admin@example.com',2,'2026-01-01');
 INSERT INTO confirmation_log(workspace_log_id,accepted,authored_by) VALUES ('rejected',false,'rejected@example.com');`)
	require.NoError(t, err)
	_, err = s.DeleteWorkspace(ctx, &proto.DeleteWorkspaceRequest{WorkspaceId: "delete-me"})
	require.NoError(t, err)
	var n int
	require.NoError(t, s.db.QueryRow(`SELECT count(*) FROM workspace_log WHERE status=1`).Scan(&n))
	require.Equal(t, 4, n)
	require.NoError(t, s.db.QueryRow(`SELECT count(*) FROM workspace_log WHERE status=2 AND authored_by='admin@example.com'`).Scan(&n))
	require.Equal(t, 4, n)
	require.NoError(t, s.db.QueryRow(`SELECT count(*) FROM confirmation_log`).Scan(&n))
	require.Equal(t, 1, n)
	require.NoError(t, s.db.QueryRow(`SELECT count(*) FROM subscription_log WHERE workspace_id='delete-me'`).Scan(&n))
	require.Equal(t, 1, n)
	require.NoError(t, s.db.QueryRow(`SELECT count(*) FROM workspaces WHERE id='delete-me' AND deleted_at IS NOT NULL`).Scan(&n))
	require.Equal(t, 1, n)
	for _, email := range []string{"admin@example.com", "member@example.com", "pending@example.com", "rejected@example.com"} {
		memberCtx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: email})
		memberCtx = s.SetWorkspaceContext(memberCtx, nil)
		workspace, err := s.GetWorkspace(memberCtx, &proto.GetWorkspaceRequest{})
		require.NoError(t, err)
		require.Nil(t, workspace.Workspace)
		require.Empty(t, workspace.Invites)
	}
}

type workspaceDeleteNotification struct {
	notifications.Service
	sent chan notifications.WorkspaceDeleteCleanupFailed
}

// SendWorkspaceDeleteCleanupFailed captures the asynchronous report at the notification boundary.
func (n workspaceDeleteNotification) SendWorkspaceDeleteCleanupFailed(v notifications.WorkspaceDeleteCleanupFailed) {
	n.sent <- v
}

// Stripe status is checked server-side even when the browser submits the command directly.
func TestDeleteWorkspacePaidSubscription(t *testing.T) {
	for _, tc := range []struct {
		name     string
		state    string
		cancelAt int64
		code     codes.Code
	}{
		{"active renewing", "active", 0, codes.FailedPrecondition},
		{"past due renewing", "past_due", 0, codes.FailedPrecondition},
		{"active scheduled cancellation", "active", 2000000000, codes.OK},
		{"past due scheduled cancellation", "past_due", 2000000000, codes.OK},
		{"canceled", "canceled", 0, codes.OK},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, ctx := workspaceDeleteFixture(t)
			t.Setenv("STRIPE_PRICE_ID", "price_test")
			endpoint := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprintf(w, `{"id":"cus_test","subscriptions":{"data":[{"id":"sub_test","status":%q,"cancel_at":%d,"items":{"data":[{"id":"item_test","price":{"id":"price_test"}}]}}]}}`, tc.state, tc.cancelAt)
			}))
			defer endpoint.Close()
			old := stripe.GetBackend(stripe.APIBackend)
			stripe.SetBackend(stripe.APIBackend, stripe.GetBackendWithConfig(stripe.APIBackend, &stripe.BackendConfig{URL: stripe.String(endpoint.URL), HTTPClient: endpoint.Client()}))
			t.Cleanup(func() { stripe.SetBackend(stripe.APIBackend, old) })
			_, err := s.db.Exec(`INSERT INTO subscription_log(workspace_id,plan_type,authored_by,customer_id,created_at)
 VALUES('delete-me',2,'admin@example.com','cus_test','2099-01-01')`)
			require.NoError(t, err)
			_, err = s.DeleteWorkspace(ctx, &proto.DeleteWorkspaceRequest{WorkspaceId: "delete-me"})
			require.Equal(t, tc.code, status.Code(err))
			var n int
			require.NoError(t, s.db.QueryRow(`SELECT count(*) FROM workspaces WHERE deleted_at IS NOT NULL`).Scan(&n))
			// Allowed cancellations must actually mark the workspace deleted.
			if tc.code == codes.OK {
				require.Equal(t, 1, n)
			} else {
				require.Zero(t, n)
			}
		})
	}
}

// Private forks and retained history must keep their source connection and its credentials.
func TestDeleteWorkspaceSharedPrivateConnection(t *testing.T) {
	for _, snapshotOnly := range []bool{false, true} {
		t.Run(fmt.Sprintf("snapshotOnly=%t", snapshotOnly), func(t *testing.T) {
			s, ctx := workspaceDeleteFixture(t)
			_, err := s.db.Exec(`INSERT INTO workspaces(id,name) VALUES('surviving','Surviving');
 INSERT INTO reports(id,workspace_id) VALUES('source','delete-me'),('fork','surviving');
 INSERT INTO connections(id,connection_name,workspace_id,snowflake_password_encrypted)
 VALUES('shared-connection','Source connection','delete-me','encrypted-test-password'),
 ('unused-connection','Unused connection','delete-me','unused-password');
 INSERT INTO datasets(id,report_id,connection_id)
 VALUES('source-dataset','source','shared-connection'),
 ('fork-dataset','fork','shared-connection');`)
			require.NoError(t, err)
			// Saved history alone must retain the connection after the live binding is removed.
			if snapshotOnly {
				_, err = s.db.Exec(`INSERT INTO report_snapshots(version_id,report_id,author_email,trigger_type)
 VALUES('fork-version','fork','member@example.com',1);
 INSERT INTO dataset_snapshots(snapshot_id,report_version_id,dataset_id,report_id,connection_id,author_email)
 VALUES('fork-snapshot','fork-version','fork-dataset','fork','shared-connection','member@example.com');
 UPDATE datasets SET connection_id=NULL WHERE id='fork-dataset';`)
				require.NoError(t, err)
			}
			sent := make(chan notifications.WorkspaceDeleteCleanupFailed, 2)
			s.notifications = workspaceDeleteNotification{Service: notifications.NewNoop(), sent: sent}
			_, err = s.DeleteWorkspace(ctx, &proto.DeleteWorkspaceRequest{WorkspaceId: "delete-me"})
			require.NoError(t, err)
			var count int
			require.NoError(t, s.db.QueryRow(`SELECT count(*) FROM datasets WHERE id='fork-dataset'`).Scan(&count))
			require.Equal(t, 1, count)
			var password string
			require.NoError(t, s.db.QueryRow(`SELECT snowflake_password_encrypted FROM connections WHERE id='shared-connection'`).Scan(&password))
			require.Equal(t, "encrypted-test-password", password)
			require.NoError(t, s.db.QueryRow(`SELECT count(*) FROM connections WHERE id='unused-connection'`).Scan(&count))
			require.Zero(t, count)
			// Deletion must preserve the surviving historical binding as well as its connection.
			if snapshotOnly {
				require.NoError(t, s.db.QueryRow(`SELECT count(*) FROM dataset_snapshots WHERE connection_id='shared-connection'`).Scan(&count))
				require.Equal(t, 1, count)
			}
			select {
			case n := <-sent:
				require.Equal(t, "admin@example.com", n.RecipientEmail)
				require.Empty(t, n.ObjectURLs)
				require.Equal(t, []string{"Source connection (shared-connection)"}, n.RetainedConnections)
			case <-time.After(time.Second):
				t.Fatal("missing retained-connection notification")
			}
			require.Empty(t, sent)
		})
	}
}
