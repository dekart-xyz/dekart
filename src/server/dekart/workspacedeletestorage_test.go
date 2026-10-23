package dekart

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"dekart/src/proto"
	"dekart/src/server/notifications"
	"dekart/src/server/storage"

	gcsstorage "cloud.google.com/go/storage"
	"github.com/stretchr/testify/require"
)

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

// GetObject records bucket and object names without contacting cloud storage.
func (s workspaceDeleteStorage) GetObject(_ context.Context, bucket, name string) storage.StorageObject {
	return workspaceDeleteStoredObject{backend: s, name: bucket + "/" + name}
}

// Delete records observable storage calls and returns the scenario's configured outcome.
func (o workspaceDeleteStoredObject) Delete(context.Context) error {
	*o.backend.deleted = append(*o.backend.deleted, o.name)
	// Return the configured storage outcome for the selected object.
	if o.name == o.backend.fail {
		return o.backend.deleteErr
	}
	return nil
}

// Deletion removes owned objects while preserving objects and rows used by surviving reports.
func TestDeleteWorkspaceStorage(t *testing.T) {
	s, ctx := workspaceDeleteFixture(t)
	t.Setenv("DEKART_CLOUD_STORAGE_BUCKET", "default")
	t.Setenv("DEKART_CLOUD_PUBLIC_STORAGE_BUCKET", "public")
	_, err := s.db.Exec(`INSERT INTO workspaces(id,name) VALUES('surviving','Surviving');
 INSERT INTO reports(id,workspace_id,is_public) VALUES('report','delete-me',true),('fork','surviving',false);
 INSERT INTO connections(id,connection_name,workspace_id) VALUES('own-connection','Own bucket','delete-me');
 INSERT INTO files(id,file_source_id,mime_type)
 VALUES('file','upload','text/csv'),
 ('shared-file','shared','text/csv'),
 ('fork-file','shared','text/csv'),
 ('user-file','user-upload','text/csv'),
 ('old-file','historical','text/csv');
 INSERT INTO datasets(id,report_id,file_id,connection_id)
 VALUES('dataset','report','file',NULL),
 ('shared-dataset','report','shared-file',NULL),
 ('fork-dataset','fork','fork-file',NULL),
 ('user-dataset','report','user-file','own-connection');
 INSERT INTO queries(id,query_text) VALUES('query','select 1'),('shared-query','select 1'),('fork-query','select 1');
 INSERT INTO datasets(id,report_id,query_id)
 VALUES('query-dataset','report','query'),
 ('shared-query-dataset','report','shared-query'),
 ('fork-query-dataset','fork','fork-query');
 INSERT INTO query_jobs(id,query_id,job_result_id,query_params_hash)
 VALUES('job','query','result',''),
 ('shared-job','shared-query','shared-result',''),
 ('fork-job','fork-query','shared-result','');
 INSERT INTO report_snapshots(version_id,report_id,author_email,trigger_type)
 VALUES('version','report','admin@example.com',1);
 INSERT INTO dataset_snapshots(snapshot_id,report_version_id,dataset_id,report_id,file_id,author_email)
 VALUES('snapshot','version','old-dataset','report','old-file','admin@example.com');
 INSERT INTO map_previews(report_id,resource_id) VALUES('report','preview');`)
	require.NoError(t, err)
	deleted := []string{}
	s.storage = workspaceDeleteStorage{deleted: &deleted}
	publicDeletes := make(chan string, 16)
	endpoint := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		publicDeletes <- r.Method + " " + r.URL.Path
		w.WriteHeader(http.StatusNoContent)
	}))
	defer endpoint.Close()
	// Exercise the real public-storage adapter against a local GCS endpoint.
	t.Setenv("STORAGE_EMULATOR_HOST", endpoint.URL)
	_, err = s.DeleteWorkspace(ctx, &proto.DeleteWorkspaceRequest{WorkspaceId: "delete-me"})
	require.NoError(t, err)
	require.ElementsMatch(t, []string{
		"default/upload.csv", "default/historical.csv", "default/result.csv",
	}, deleted)
	publicPaths := []string{}
	for len(publicDeletes) > 0 {
		publicPaths = append(publicPaths, <-publicDeletes)
	}
	require.ElementsMatch(t, []string{
		"DELETE /storage/v1/b/public/o/upload.csv",
		"DELETE /storage/v1/b/public/o/user-upload.csv",
		"DELETE /storage/v1/b/public/o/historical.csv",
		"DELETE /storage/v1/b/public/o/result.csv",
		"DELETE /storage/v1/b/public/o/preview.png",
	}, publicPaths)
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

// Meet5 could not delete its expired workspace with an unfinished upload in live data and history.
func TestDeleteWorkspaceUnfinishedUpload(t *testing.T) {
	s, ctx := workspaceDeleteFixture(t)
	t.Setenv("DEKART_CLOUD_STORAGE_BUCKET", "default")
	t.Setenv("DEKART_CLOUD_PUBLIC_STORAGE_BUCKET", "")
	_, err := s.db.Exec(`INSERT INTO reports(id,workspace_id) VALUES('report','delete-me');
 INSERT INTO files(id) VALUES('unfinished-file');
 INSERT INTO datasets(id,report_id,file_id) VALUES('dataset','report','unfinished-file');
 INSERT INTO report_snapshots(version_id,report_id,author_email,trigger_type)
 VALUES('version','report','admin@example.com',1);
 INSERT INTO dataset_snapshots(snapshot_id,report_version_id,dataset_id,report_id,file_id,author_email)
 VALUES('snapshot','version','dataset','report','unfinished-file','admin@example.com');`)
	require.NoError(t, err)
	deleted := []string{}
	s.storage = workspaceDeleteStorage{deleted: &deleted}

	_, err = s.DeleteWorkspace(ctx, &proto.DeleteWorkspaceRequest{WorkspaceId: "delete-me"})
	require.NoError(t, err)
	require.Empty(t, deleted)
	var count int
	require.NoError(t, s.db.QueryRow(`SELECT count(*) FROM workspaces WHERE id='delete-me' AND deleted_at IS NOT NULL`).Scan(&count))
	require.Equal(t, 1, count)
	require.NoError(t, s.db.QueryRow(`SELECT count(*) FROM files WHERE id='unfinished-file'`).Scan(&count))
	require.Zero(t, count)
}

// Missing objects are successful cleanup; other failures are included with retained connections.
func TestDeleteWorkspaceCleanupNotifiesAdmin(t *testing.T) {
	for _, tc := range []struct {
		name          string
		deleteErr     error
		failedObjects []string
	}{
		{"failed delete", errors.New("delete failed"), []string{"gs://default/upload.csv"}},
		{"already absent", gcsstorage.ErrObjectNotExist, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
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
			s.storage = workspaceDeleteStorage{deleted: &deleted, fail: "default/upload.csv", deleteErr: tc.deleteErr}
			sent := make(chan notifications.WorkspaceDeleteCleanupFailed, 2)
			s.notifications = workspaceDeleteNotification{Service: notifications.NewNoop(), sent: sent}
			_, err = s.DeleteWorkspace(ctx, &proto.DeleteWorkspaceRequest{WorkspaceId: "delete-me"})
			require.NoError(t, err)
			select {
			case n := <-sent:
				require.Equal(t, "admin@example.com", n.RecipientEmail)
				require.ElementsMatch(t, tc.failedObjects, n.ObjectURLs)
				require.Equal(t, []string{"Source connection (shared-connection)"}, n.RetainedConnections)
			case <-time.After(time.Second):
				t.Fatal("missing cleanup notification")
			}
			require.Empty(t, sent)
			require.Equal(t, []string{"default/upload.csv"}, deleted)
		})
	}
}
