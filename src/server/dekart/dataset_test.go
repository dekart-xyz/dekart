package dekart

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/conn"
	"dekart/src/server/reportsnapshot"
	"dekart/src/server/storage"
	"dekart/src/server/user"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gorilla/mux"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

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
