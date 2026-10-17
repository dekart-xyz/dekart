package dekart

import (
	gcsstorage "cloud.google.com/go/storage"
	"context"
	"database/sql"
	"dekart/src/server/storage"
	"errors"
	"fmt"
	"github.com/stripe/stripe-go/v76"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sort"
	"testing"
	"time"

	"dekart/src/proto"
	"dekart/src/server/notifications"
	"dekart/src/server/report"
	"dekart/src/server/user"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// workspaceDeleteFixture uses the real schema to exercise deletion rather than SQL expectations.
func workspaceDeleteFixture(t *testing.T) (Server, context.Context) {
	t.Helper()
	t.Setenv("DEKART_CLOUD", "1")
	t.Setenv("DEKART_SQLITE", "1")
	db, err := sql.Open("sqlite3", ":memory:")
	require.NoError(t, err)
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	files, err := filepath.Glob("../../../sqlite/migrations/*.up.sql")
	require.NoError(t, err)
	sort.Strings(files)
	for _, f := range files {
		execMigration(t, db, filepath.Join("sqlite/migrations", filepath.Base(f)))
	}
	_, err = db.Exec(`INSERT INTO workspaces (id,name) VALUES ('delete-me','Delete me');
 INSERT INTO workspace_log (id,workspace_id,email,status,authored_by,role,created_at) VALUES ('admin','delete-me','admin@example.com',1,'admin@example.com',1,'2026-01-01');
 INSERT INTO subscription_log (workspace_id,plan_type,authored_by,trial_ends_at) VALUES ('delete-me',6,'admin@example.com','2020-01-01');`)
	require.NoError(t, err)
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: "admin@example.com"})
	ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{ID: "delete-me", Name: "Delete me", UserRole: proto.UserRole_ROLE_ADMIN, ReadOnly: true})
	return Server{db: db, userStreams: user.NewStreams(), reportStreams: report.NewStreams(), notifications: notifications.NewNoop()}, ctx
}

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
			if !tc.cloud {
				t.Setenv("DEKART_CLOUD", "")
			}
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
		ws, err := s.getUserWorkspaces(ctx, email)
		require.NoError(t, err)
		require.Empty(t, ws)
		invites, err := s.getInvites(ctx, email)
		require.NoError(t, err)
		require.Empty(t, invites)
	}
}

// Fake objects record real cleanup decisions without touching any cloud bucket.
type workspaceDeleteStorage struct {
	storage.Storage
	deleted   *[]string
	fail      string
	deleteErr error
}
type workspaceDeleteStoredObject struct {
	storage.StorageObject
	backend workspaceDeleteStorage
	name    string
}

func (s workspaceDeleteStorage) GetObject(_ context.Context, bucket, name string) storage.StorageObject {
	return workspaceDeleteStoredObject{backend: s, name: bucket + "/" + name}
}
func (o workspaceDeleteStoredObject) Delete(context.Context) error {
	*o.backend.deleted = append(*o.backend.deleted, o.name)
	if o.name == o.backend.fail {
		if o.backend.deleteErr != nil {
			return o.backend.deleteErr
		}
		return errors.New("delete failed")
	}
	return nil
}

type workspaceDeleteNotification struct {
	notifications.Service
	sent chan notifications.WorkspaceDeleteCleanupFailed
}

func (n workspaceDeleteNotification) SendWorkspaceDeleteCleanupFailed(v notifications.WorkspaceDeleteCleanupFailed) {
	n.sent <- v
}

func TestDeleteWorkspaceStorage(t *testing.T) {
	s, ctx := workspaceDeleteFixture(t)
	t.Setenv("DEKART_CLOUD_STORAGE_BUCKET", "default")
	t.Setenv("DEKART_CLOUD_PUBLIC_STORAGE_BUCKET", "public")
	_, err := s.db.Exec(`INSERT INTO workspaces(id,name) VALUES('surviving','Surviving');
 INSERT INTO reports(id,workspace_id,is_public) VALUES('report','delete-me',true),('fork','surviving',false);
 INSERT INTO connections(id,connection_name,workspace_id) VALUES('own-connection','Own bucket','delete-me');
 INSERT INTO files(id,file_source_id,mime_type) VALUES('file','upload','text/csv'),('shared-file','shared','text/csv'),('fork-file','shared','text/csv'),('user-file','user-upload','text/csv'),('old-file','historical','text/csv');
 INSERT INTO datasets(id,report_id,file_id,connection_id) VALUES('dataset','report','file',NULL),('shared-dataset','report','shared-file',NULL),('fork-dataset','fork','fork-file',NULL),('user-dataset','report','user-file','own-connection');
 INSERT INTO queries(id,query_text) VALUES('query','select 1'),('shared-query','select 1'),('fork-query','select 1');
 INSERT INTO datasets(id,report_id,query_id) VALUES('query-dataset','report','query'),('shared-query-dataset','report','shared-query'),('fork-query-dataset','fork','fork-query');
 INSERT INTO query_jobs(id,query_id,job_result_id,query_params_hash) VALUES('job','query','result',''),('shared-job','shared-query','shared-result',''),('fork-job','fork-query','shared-result','');
 INSERT INTO report_snapshots(version_id,report_id,author_email,trigger_type) VALUES('version','report','admin@example.com',1);
 INSERT INTO dataset_snapshots(snapshot_id,report_version_id,dataset_id,report_id,file_id,author_email) VALUES('snapshot','version','old-dataset','report','old-file','admin@example.com');
 INSERT INTO map_previews(report_id,resource_id) VALUES('report','preview');`)
	require.NoError(t, err)
	deleted := []string{}
	fake := workspaceDeleteStorage{deleted: &deleted}
	s.storage = fake
	tx, err := s.db.BeginTx(ctx, nil)
	require.NoError(t, err)
	content, err := s.collectWorkspaceDeleteObjects(ctx, tx, "delete-me", fake)
	require.NoError(t, err)
	require.NoError(t, tx.Rollback())
	require.Empty(t, s.deleteWorkspaceObjects(ctx, content))
	require.ElementsMatch(t, []string{"default/upload.csv", "public/upload.csv", "public/user-upload.csv", "default/historical.csv", "public/historical.csv", "default/result.csv", "public/result.csv", "public/preview.png"}, deleted)
	// Public-object selection is proved above with fake storage; the command below exercises database deletion.
	_, err = s.db.Exec(`UPDATE reports SET is_public=false; DELETE FROM map_previews;`)
	require.NoError(t, err)
	// Historical and active rows must all disappear on the real command, while the fork survives.
	_, err = s.DeleteWorkspace(ctx, &proto.DeleteWorkspaceRequest{WorkspaceId: "delete-me"})
	require.NoError(t, err)
	var count int
	require.NoError(t, s.db.QueryRow(`SELECT count(*) FROM reports`).Scan(&count))
	require.Equal(t, 1, count)
	require.NoError(t, s.db.QueryRow(`SELECT count(*) FROM queries`).Scan(&count))
	require.Equal(t, 1, count)
	require.NoError(t, s.db.QueryRow(`SELECT count(*) FROM query_jobs`).Scan(&count))
	require.Equal(t, 1, count)
	require.NoError(t, s.db.QueryRow(`SELECT count(*) FROM files WHERE id IN ('file','shared-file','user-file','old-file')`).Scan(&count))
	require.Zero(t, count)
	require.NoError(t, s.db.QueryRow(`SELECT count(*) FROM files WHERE id='fork-file'`).Scan(&count))
	require.Equal(t, 1, count)
}

func TestDeleteWorkspaceFailedCleanupNotifiesAdmin(t *testing.T) {
	s, ctx := workspaceDeleteFixture(t)
	t.Setenv("DEKART_CLOUD_STORAGE_BUCKET", "default")
	_, err := s.db.Exec(`INSERT INTO reports(id,workspace_id) VALUES('report','delete-me');
 INSERT INTO files(id,file_source_id,mime_type) VALUES('file','upload','text/csv');
 INSERT INTO datasets(id,report_id,file_id) VALUES('dataset','report','file');
 INSERT INTO workspaces(id,name) VALUES('surviving','Surviving');
 INSERT INTO reports(id,workspace_id) VALUES('fork','surviving');
 INSERT INTO connections(id,connection_name,workspace_id) VALUES('shared-connection','Source connection','delete-me');
 INSERT INTO datasets(id,report_id,connection_id) VALUES('fork-dataset','fork','shared-connection');`)
	require.NoError(t, err)
	deleted := []string{}
	s.storage = workspaceDeleteStorage{deleted: &deleted, fail: "default/upload.csv"}
	sent := make(chan notifications.WorkspaceDeleteCleanupFailed, 2)
	s.notifications = workspaceDeleteNotification{Service: notifications.NewNoop(), sent: sent}
	_, err = s.DeleteWorkspace(ctx, &proto.DeleteWorkspaceRequest{WorkspaceId: "delete-me"})
	require.NoError(t, err)
	select {
	case n := <-sent:
		require.Equal(t, "admin@example.com", n.RecipientEmail)
		require.Equal(t, []string{"gs://default/upload.csv"}, n.ObjectURLs)
		require.Equal(t, []string{"Source connection (shared-connection)"}, n.RetainedConnections)
	case <-time.After(time.Second):
		t.Fatal("missing cleanup notification")
	}
	require.Empty(t, sent)
}

// Stripe status is checked server-side even when the browser submits the command directly.
func TestDeleteWorkspacePaidSubscription(t *testing.T) {
	for _, state := range []string{"active", "past_due"} {
		t.Run(state, func(t *testing.T) {
			s, ctx := workspaceDeleteFixture(t)
			t.Setenv("STRIPE_PRICE_ID", "price_test")
			endpoint := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprintf(w, `{"id":"cus_test","subscriptions":{"data":[{"id":"sub_test","status":%q,"cancel_at":2000000000,"items":{"data":[{"id":"item_test","price":{"id":"price_test"}}]}}]}}`, state)
			}))
			defer endpoint.Close()
			old := stripe.GetBackend(stripe.APIBackend)
			stripe.SetBackend(stripe.APIBackend, stripe.GetBackendWithConfig(stripe.APIBackend, &stripe.BackendConfig{URL: stripe.String(endpoint.URL), HTTPClient: endpoint.Client()}))
			t.Cleanup(func() { stripe.SetBackend(stripe.APIBackend, old) })
			_, err := s.db.Exec(`INSERT INTO subscription_log(workspace_id,plan_type,authored_by,customer_id,created_at) VALUES('delete-me',2,'admin@example.com','cus_test','2099-01-01')`)
			require.NoError(t, err)
			_, err = s.DeleteWorkspace(ctx, &proto.DeleteWorkspaceRequest{WorkspaceId: "delete-me"})
			require.Equal(t, codes.FailedPrecondition, status.Code(err))
			var n int
			require.NoError(t, s.db.QueryRow(`SELECT count(*) FROM workspaces WHERE deleted_at IS NOT NULL`).Scan(&n))
			require.Zero(t, n)
		})
	}
}

func TestDeleteWorkspaceAlreadyAbsentObject(t *testing.T) {
	deleted := []string{}
	fake := workspaceDeleteStorage{deleted: &deleted, fail: "default/absent.csv", deleteErr: gcsstorage.ErrObjectNotExist}
	content := workspaceDeleteContent{objects: []workspaceDeleteObject{{bucket: "default", name: "absent.csv", object: fake.GetObject(context.Background(), "default", "absent.csv")}}}
	require.Empty(t, (Server{}).deleteWorkspaceObjects(context.Background(), content))
}

// Private forks and retained history must keep their source connection and its credentials.
func TestDeleteWorkspaceSharedPrivateConnection(t *testing.T) {
	for _, snapshotOnly := range []bool{false, true} {
		t.Run(fmt.Sprintf("snapshotOnly=%t", snapshotOnly), func(t *testing.T) {
			s, ctx := workspaceDeleteFixture(t)
			_, err := s.db.Exec(`PRAGMA foreign_keys=ON;
 INSERT INTO workspaces(id,name) VALUES('surviving','Surviving');
 INSERT INTO reports(id,workspace_id) VALUES('source','delete-me'),('fork','surviving');
 INSERT INTO connections(id,connection_name,workspace_id,snowflake_password_encrypted) VALUES('shared-connection','Source connection','delete-me','encrypted-test-password'),('unused-connection','Unused connection','delete-me','unused-password');
 INSERT INTO datasets(id,report_id,connection_id) VALUES('source-dataset','source','shared-connection'),('fork-dataset','fork','shared-connection');`)
			require.NoError(t, err)
			if snapshotOnly {
				_, err = s.db.Exec(`INSERT INTO report_snapshots(version_id,report_id,author_email,trigger_type) VALUES('fork-version','fork','member@example.com',1);
 INSERT INTO dataset_snapshots(snapshot_id,report_version_id,dataset_id,report_id,connection_id,author_email) VALUES('fork-snapshot','fork-version','fork-dataset','fork','shared-connection','member@example.com');
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
