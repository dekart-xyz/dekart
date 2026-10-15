package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/conn"
	"dekart/src/server/storage"
	"dekart/src/server/user"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	gcsstorage "cloud.google.com/go/storage"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gorilla/mux"
	"github.com/stretchr/testify/require"
	"google.golang.org/api/googleapi"
)

type missingResultStorage struct {
	storage.Storage
	object *missingResultObject
}

func (s missingResultStorage) GetObject(_ context.Context, _, _ string) storage.StorageObject {
	return s.object
}

type missingResultObject struct {
	storage.StorageObject
	createdErr   error
	readerErr    error
	readerOpened bool
}

func (o *missingResultObject) GetCreatedAt(context.Context) (*time.Time, error) {
	created := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	return &created, o.createdErr
}

func (o *missingResultObject) GetReader(ctx context.Context) (io.ReadCloser, error) {
	o.readerOpened = true
	if o.readerErr != nil {
		return nil, o.readerErr
	}
	return o.StorageObject.GetReader(ctx)
}

// Exercise the real handler with a GCS missing-object error at either read stage.
func TestServeDatasetSourceMissingQueryResult(t *testing.T) {
	for _, tc := range []struct {
		name       string
		createdErr error
		readerErr  error
		owned      bool
		lookupErr  error
		wantStatus int
		wantBody   string
	}{
		{name: "missing attributes", createdErr: gcsstorage.ErrObjectNotExist, owned: true, wantStatus: 410, wantBody: "expired\n"},
		{name: "missing reader", readerErr: gcsstorage.ErrObjectNotExist, owned: true, wantStatus: 410, wantBody: "expired\n"},
		{name: "not a completed owned result", createdErr: gcsstorage.ErrObjectNotExist, wantStatus: 404, wantBody: "storage: object doesn't exist\n"},
		{name: "lookup failure", createdErr: gcsstorage.ErrObjectNotExist, lookupErr: errors.New("database unavailable"), wantStatus: 500, wantBody: "database unavailable\n"},
		{name: "permission failure", createdErr: &googleapi.Error{Code: 403, Message: "denied"}, wantStatus: 403, wantBody: "denied\n"},
		{name: "network failure", readerErr: errors.New("network unavailable"), wantStatus: 500, wantBody: "network unavailable\n"},
		{name: "existing result", wantStatus: 200, wantBody: "value\n1\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("DEKART_DATASOURCE", "PG")
			t.Setenv("DEKART_CLOUD_STORAGE_BUCKET", "test-results")
			datasetID := "00000000-0000-0000-0000-000000000061"
			reportID := "00000000-0000-0000-0000-000000000062"
			sourceID := "owned-result"
			email := "user@example.com"
			db, mock, err := sqlmock.New()
			require.NoError(t, err)
			defer db.Close()
			mock.ExpectQuery("select report_id from datasets").WithArgs(datasetID).
				WillReturnRows(sqlmock.NewRows([]string{"report_id"}).AddRow(reportID))
			expectSnapshotReportAccess(mock, reportID, email, 0)
			expectSnapshotReportAccess(mock, reportID, email, 0)
			mock.ExpectQuery("select qj.http_sources").WithArgs(datasetID).
				WillReturnRows(sqlmock.NewRows([]string{"http_sources"}))
			mock.ExpectQuery("select q.execution_engine").WithArgs(datasetID).
				WillReturnError(sql.ErrNoRows)
			mock.ExpectQuery("select\\s+connection_id\\s+from datasets").WithArgs(datasetID).
				WillReturnRows(sqlmock.NewRows([]string{"connection_id"}).AddRow(conn.SystemConnectionID))
			mock.ExpectQuery("select dw_job_id, dw_job_location from query_jobs").WithArgs(sourceID).
				WillReturnRows(sqlmock.NewRows([]string{"dw_job_id", "dw_job_location"}))
			mock.ExpectQuery("select result_uri from query_jobs").WithArgs(sourceID).
				WillReturnRows(sqlmock.NewRows([]string{"result_uri"}))
			if isStorageObjectNotFound(tc.createdErr) || isStorageObjectNotFound(tc.readerErr) {
				lookup := mock.ExpectQuery("select exists").WithArgs(datasetID, sourceID,
					proto.QueryJob_JOB_STATUS_DONE, proto.QueryJob_JOB_STATUS_DONE_LEGACY)
				if tc.lookupErr != nil {
					lookup.WillReturnError(tc.lookupErr)
				} else {
					lookup.WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(tc.owned))
				}
			}
			root := t.TempDir()
			require.NoError(t, os.WriteFile(filepath.Join(root, sourceID+".csv"), []byte("value\n1\n"), 0o600))
			obj := &missingResultObject{
				StorageObject: storage.NewLocalFSStorage(root).GetObject(context.Background(), "", sourceID+".csv"),
				createdErr:    tc.createdErr, readerErr: tc.readerErr,
			}
			server := Server{db: db, storage: missingResultStorage{object: obj}}
			ctx := user.SetWorkspaceCtx(testUserContext(email), user.WorkspaceInfo{ID: "workspace-1"})
			request := httptest.NewRequest(http.MethodGet, "/api/v1/dataset-source/"+datasetID+"/"+sourceID+".csv", nil).WithContext(ctx)
			request = mux.SetURLVars(request, map[string]string{"dataset": datasetID, "source": sourceID, "extension": "csv"})
			recorder := httptest.NewRecorder()

			server.ServeDatasetSource(recorder, request)

			require.Equal(t, tc.wantStatus, recorder.Code)
			require.Equal(t, tc.wantBody, recorder.Body.String())
			require.Equal(t, tc.createdErr == nil, obj.readerOpened)
			if tc.wantStatus == 200 {
				require.Equal(t, "public, max-age=31536000", recorder.Header().Get("Cache-Control"))
				require.NotEmpty(t, recorder.Header().Get("Last-Modified"))
			}
			require.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

// Use real query-job records so ownership and completion exclusions exercise SQL.
func TestDatasetSourceStorageErrorRequiresCompletedOwnedResult(t *testing.T) {
	for _, tc := range []struct {
		name         string
		datasetQuery any
		jobQuery     string
		resultID     string
		jobStatus    proto.QueryJob_JobStatus
		wantStatus   int
	}{
		{name: "completed", datasetQuery: "query-1", jobQuery: "query-1", resultID: "result-1", jobStatus: proto.QueryJob_JOB_STATUS_DONE, wantStatus: 410},
		{name: "legacy completed status", datasetQuery: "query-1", jobQuery: "query-1", resultID: "result-1", jobStatus: proto.QueryJob_JOB_STATUS_DONE_LEGACY, wantStatus: 410},
		{name: "uploaded file", datasetQuery: nil, jobQuery: "query-1", resultID: "result-1", jobStatus: proto.QueryJob_JOB_STATUS_DONE, wantStatus: 404},
		{name: "foreign query", datasetQuery: "query-1", jobQuery: "query-2", resultID: "result-1", jobStatus: proto.QueryJob_JOB_STATUS_DONE, wantStatus: 404},
		{name: "unknown source", datasetQuery: "query-1", jobQuery: "query-1", resultID: "other-result", jobStatus: proto.QueryJob_JOB_STATUS_DONE, wantStatus: 404},
		{name: "pending", datasetQuery: "query-1", jobQuery: "query-1", resultID: "result-1", jobStatus: proto.QueryJob_JOB_STATUS_PENDING, wantStatus: 404},
		{name: "failed", datasetQuery: "query-1", jobQuery: "query-1", resultID: "result-1", jobStatus: proto.QueryJob_JOB_STATUS_UNSPECIFIED, wantStatus: 404},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db, err := sql.Open("sqlite3", ":memory:")
			require.NoError(t, err)
			defer db.Close()
			_, err = db.Exec(`create table datasets (id text, query_id text);
				create table query_jobs (query_id text, job_result_id text, job_status integer);`)
			require.NoError(t, err)
			_, err = db.Exec(`insert into datasets values ($1, $2)`, "dataset-1", tc.datasetQuery)
			require.NoError(t, err)
			_, err = db.Exec(`insert into query_jobs values ($1, $2, $3)`, tc.jobQuery, tc.resultID, tc.jobStatus)
			require.NoError(t, err)
			server := Server{db: db}
			err = server.datasetSourceStorageError(context.Background(), "dataset-1", "result-1", "source_extension_storage", gcsstorage.ErrObjectNotExist)
			recorder := httptest.NewRecorder()
			storageError(recorder, err)
			require.Equal(t, tc.wantStatus, recorder.Code)
		})
	}
}

func TestDatasetSourceStorageErrorPreservesOtherBranches(t *testing.T) {
	for _, branch := range []string{"public_storage", "dw_job_id_storage", "result_uri_presigned_s3"} {
		err := (Server{}).datasetSourceStorageError(context.Background(), "dataset-1", "result-1", branch, gcsstorage.ErrObjectNotExist)
		require.ErrorIs(t, err, gcsstorage.ErrObjectNotExist)
	}
}
