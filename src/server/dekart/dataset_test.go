package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/conn"
	"dekart/src/server/reportsnapshot"
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
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
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

type snapshotCredentialStorage struct {
	storage.Storage
	t                *testing.T
	wantToken        string
	wantConnectionID string
}

func (s *snapshotCredentialStorage) GetObject(ctx context.Context, _ string, name string) storage.StorageObject {
	return &snapshotCredentialObject{
		StorageObject:    s.Storage.GetObject(ctx, "", name),
		t:                s.t,
		wantToken:        s.wantToken,
		wantConnectionID: s.wantConnectionID,
	}
}

type snapshotCredentialObject struct {
	storage.StorageObject
	t                *testing.T
	wantToken        string
	wantConnectionID string
}

func (o *snapshotCredentialObject) GetReader(ctx context.Context) (io.ReadCloser, error) {
	require.Equal(o.t, o.wantToken, user.GetClaims(ctx).MCPGoogleAccessToken)
	require.Equal(o.t, o.wantConnectionID, conn.FromCtx(ctx).Id)
	return o.StorageObject.GetReader(ctx)
}

func testUserContext(email string) context.Context {
	return context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: email})
}

func TestCreateDataset_InvalidReportID_ReturnsInvalidArgument(t *testing.T) {
	server := Server{}
	_, err := server.CreateDataset(testUserContext("test@example.com"), &proto.CreateDatasetRequest{ReportId: "null"})
	require.Error(t, err)

	st, ok := status.FromError(err)
	require.True(t, ok)
	require.Equal(t, codes.InvalidArgument, st.Code())
	require.Contains(t, st.Message(), "invalid report_id format")
}

func TestCreateDataset_EmptyReportID_ReturnsInvalidArgument(t *testing.T) {
	server := Server{}
	_, err := server.CreateDataset(testUserContext("test@example.com"), &proto.CreateDatasetRequest{ReportId: ""})
	require.Error(t, err)

	st, ok := status.FromError(err)
	require.True(t, ok)
	require.Equal(t, codes.InvalidArgument, st.Code())
	require.Equal(t, "report_id is required", st.Message())
}

func TestServeDatasetSourceRejectsDatasetOutsideSnapshotReport(t *testing.T) {
	datasetID := "00000000-0000-0000-0000-000000000031"
	requestedReportID := "00000000-0000-0000-0000-000000000032"
	snapshotReportID := "00000000-0000-0000-0000-000000000033"
	email := "user@example.com"
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()
	mock.ExpectQuery("select report_id from datasets").
		WithArgs(datasetID).
		WillReturnRows(sqlmock.NewRows([]string{"report_id"}).AddRow(requestedReportID))
	expectSnapshotReportAccess(mock, requestedReportID, email, 0)
	server := NewServer(db, nil, nil)
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{
		Email:         email,
		SnapshotToken: "snapshot-token",
		ReportID:      snapshotReportID,
	})
	ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{ID: "workspace-1"})
	request := httptest.NewRequest(http.MethodGet, "/api/v1/dataset-source/"+datasetID+"/source.csv", nil).WithContext(ctx)
	request = mux.SetURLVars(request, map[string]string{"dataset": datasetID, "source": "source", "extension": "csv"})
	recorder := httptest.NewRecorder()

	server.ServeDatasetSource(recorder, request)

	require.Equal(t, http.StatusForbidden, recorder.Code)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestServeDatasetSourceRejectsSourceOutsideSnapshotDataset(t *testing.T) {
	datasetID := "00000000-0000-0000-0000-000000000041"
	reportID := "00000000-0000-0000-0000-000000000042"
	email := "user@example.com"
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()
	mock.ExpectQuery("select report_id from datasets").
		WithArgs(datasetID).
		WillReturnRows(sqlmock.NewRows([]string{"report_id"}).AddRow(reportID))
	expectSnapshotReportAccess(mock, reportID, email, 0)
	mock.ExpectQuery("select count\\(\\*\\) from").
		WithArgs(datasetID, "foreign-source").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery("select qj.http_sources").WithArgs(datasetID).WillReturnRows(sqlmock.NewRows([]string{"http_sources"}))
	server := NewServer(db, nil, nil)
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{
		Email:         email,
		SnapshotToken: "snapshot-token",
		ReportID:      reportID,
	})
	ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{ID: "workspace-1"})
	request := httptest.NewRequest(http.MethodGet, "/api/v1/dataset-source/"+datasetID+"/foreign-source.csv", nil).WithContext(ctx)
	request = mux.SetURLVars(request, map[string]string{"dataset": datasetID, "source": "foreign-source", "extension": "csv"})
	recorder := httptest.NewRecorder()

	server.ServeDatasetSource(recorder, request)

	require.Equal(t, http.StatusForbidden, recorder.Code)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestServeDatasetSourceRestoresSnapshotCredentialForConnectionReader(t *testing.T) {
	datasetID := "00000000-0000-0000-0000-000000000051"
	reportID := "00000000-0000-0000-0000-000000000052"
	connectionID := "00000000-0000-0000-0000-000000000053"
	sourceID := "owned-source"
	email := "user@example.com"
	delegatedToken := "delegated-token"
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	mock.ExpectQuery("select report_id from datasets").WithArgs(datasetID).
		WillReturnRows(sqlmock.NewRows([]string{"report_id"}).AddRow(reportID))
	expectSnapshotReportAccess(mock, reportID, email, 1)
	mock.ExpectQuery("select count\\(\\*\\) from").WithArgs(datasetID, sourceID).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	expectSnapshotReportAccess(mock, reportID, email, 1)
	mock.ExpectQuery("select qj.http_sources").WithArgs(datasetID).WillReturnRows(sqlmock.NewRows([]string{"http_sources"}))
	mock.ExpectQuery("select q.execution_engine").WithArgs(datasetID).WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery("select\\s+connection_id\\s+from datasets").WithArgs(datasetID).
		WillReturnRows(sqlmock.NewRows([]string{"connection_id"}).AddRow(connectionID))
	mock.ExpectQuery("select\\s+id,\\s+connection_name").WithArgs(connectionID).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "connection_name", "bigquery_project_id", "cloud_storage_bucket", "connection_type",
			"snowflake_account_id", "snowflake_username", "snowflake_password_encrypted", "snowflake_key_encrypted",
			"snowflake_warehouse", "bigquery_key_encrypted", "dataset_count", "wherobots_host",
			"wherobots_key_encrypted", "wherobots_region", "wherobots_runtime", "postgres_host",
			"postgres_username", "postgres_password_encrypted", "postgres_database", "postgres_port", "postgres_ssl_mode",
		}).AddRow(connectionID, "BigQuery passthrough", "project", "", proto.ConnectionType_CONNECTION_TYPE_BIGQUERY,
			nil, nil, nil, nil, nil, nil, 1, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil))
	mock.ExpectQuery("select dw_job_id, dw_job_location from query_jobs").WithArgs(sourceID).
		WillReturnRows(sqlmock.NewRows([]string{"dw_job_id", "dw_job_location"}))
	mock.ExpectQuery("select result_uri from query_jobs").WithArgs(sourceID).
		WillReturnRows(sqlmock.NewRows([]string{"result_uri"}))

	token, _, err := reportsnapshot.IssueToken(reportsnapshot.Claims{
		Email:                email,
		WorkspaceID:          "workspace-1",
		ReportID:             reportID,
		MCPGoogleAccessToken: delegatedToken,
	})
	require.NoError(t, err)
	t.Cleanup(func() { reportsnapshot.DeleteToken(token) })
	storageRoot := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(storageRoot, sourceID+".csv"), []byte("value\n1\n"), 0o600))
	objectStorage := &snapshotCredentialStorage{
		Storage: storage.NewLocalFSStorage(storageRoot),
		t:       t, wantToken: delegatedToken, wantConnectionID: connectionID,
	}
	server := NewServer(db, objectStorage, nil)
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{
		Email: email, SnapshotToken: token, WorkspaceID: "workspace-1", ReportID: reportID,
	})
	ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{ID: "workspace-1"})
	request := httptest.NewRequest(http.MethodGet, "/api/v1/dataset-source/"+datasetID+"/"+sourceID+".csv", nil).WithContext(ctx)
	request = mux.SetURLVars(request, map[string]string{"dataset": datasetID, "source": sourceID, "extension": "csv"})
	recorder := httptest.NewRecorder()

	server.ServeDatasetSource(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, "value\n1\n", recorder.Body.String())
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestDatasetOwnsSourceSupportsLegacyQueryID(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()
	mock.ExpectQuery("union select id from queries where id=\\$1").
		WithArgs("legacy-query", "owned-source").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	server := NewServer(db, nil, nil)

	owned, err := server.datasetOwnsSource(context.Background(), "legacy-query", "owned-source")

	require.NoError(t, err)
	require.True(t, owned)
	require.NoError(t, mock.ExpectationsWereMet())
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
