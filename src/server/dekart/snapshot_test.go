package dekart

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"dekart/src/proto"
	"dekart/src/server/user"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func snapshotTestContext(email string) context.Context {
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: email})
	return user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{
		ID:       "workspace-1",
		PlanType: proto.PlanType_TYPE_COMMUNITY,
		UserRole: proto.UserRole_ROLE_ADMIN,
	})
}

func expectSnapshotReportAccess(mock sqlmock.Sqlmock, reportID string, email string) {
	now := time.Now()
	mock.ExpectQuery("select\\s+r\\.id").
		WithArgs(email, reportID, reportID, reportID, reportID, false).
		WillReturnRows(sqlmock.NewRows([]string{
			"id",
			"map_config",
			"title",
			"is_author",
			"author_email",
			"discoverable",
			"allow_edit",
			"created_at",
			"updated_at",
			"is_playground",
			"connections_with_cache_num",
			"connections_num",
			"connections_with_sensitive_scope_num",
			"is_public",
			"track_viewers",
			"query_params",
			"allow_export",
			"readme",
			"workspace_id",
			"auto_refresh_interval_seconds",
			"version_id",
			"has_map_preview",
		}).AddRow(
			reportID,
			"{}",
			"Snapshot Report",
			true,
			email,
			false,
			true,
			now,
			now,
			false,
			0,
			0,
			0,
			false,
			false,
			[]byte{},
			false,
			sql.NullString{},
			sql.NullString{String: "workspace-1", Valid: true},
			int64(0),
			sql.NullString{String: "version-1", Valid: true},
			false,
		))
	mock.ExpectQuery("SELECT email").
		WithArgs(reportID).
		WillReturnRows(sqlmock.NewRows([]string{"email"}))
}

func TestCreateReportSnapshot_ReturnsRenderURLWithoutBrowserlessCapture(t *testing.T) {
	t.Setenv("DEKART_BROWSERLESS_TOKEN", "")
	t.Setenv("DEKART_APP_URL", "http://localhost:3000")
	reportID := "00000000-0000-0000-0000-000000000001"
	email := "user@example.com"

	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()
	expectSnapshotReportAccess(mock, reportID, email)

	server := NewServer(db, nil, nil)
	response, err := server.CreateReportSnapshot(snapshotTestContext(email), &proto.CreateReportSnapshotRequest{ReportId: reportID})

	require.NoError(t, err)
	require.Empty(t, response.SnapshotUrl)
	require.Contains(t, response.SnapshotRenderUrl, "/reports/"+reportID+"/snapshot?snapshot_token=")
	require.Positive(t, response.ExpiresIn)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestCreateReportSnapshot_AppendsValidViewportParamsToRenderURL(t *testing.T) {
	t.Setenv("DEKART_BROWSERLESS_TOKEN", "")
	t.Setenv("DEKART_APP_URL", "http://localhost:3000")
	reportID := "00000000-0000-0000-0000-000000000021"
	email := "user@example.com"

	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()
	expectSnapshotReportAccess(mock, reportID, email)

	server := NewServer(db, nil, nil)
	zoom := 12.0
	lat := 52.52
	lon := 13.405
	response, err := server.CreateReportSnapshot(snapshotTestContext(email), &proto.CreateReportSnapshotRequest{
		ReportId: reportID,
		Zoom:     &zoom,
		Lat:      &lat,
		Lon:      &lon,
	})

	require.NoError(t, err)
	renderURL, err := url.Parse(response.SnapshotRenderUrl)
	require.NoError(t, err)
	require.Equal(t, "12", renderURL.Query().Get("zoom"))
	require.Equal(t, "52.52", renderURL.Query().Get("lat"))
	require.Equal(t, "13.405", renderURL.Query().Get("lon"))
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestCreateReportSnapshot_IgnoresInvalidViewportParams(t *testing.T) {
	t.Setenv("DEKART_BROWSERLESS_TOKEN", "")
	t.Setenv("DEKART_APP_URL", "http://localhost:3000")
	reportID := "00000000-0000-0000-0000-000000000022"
	email := "user@example.com"

	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()
	expectSnapshotReportAccess(mock, reportID, email)

	server := NewServer(db, nil, nil)
	zoom := 25.0
	lat := -91.0
	lon := 181.0
	response, err := server.CreateReportSnapshot(snapshotTestContext(email), &proto.CreateReportSnapshotRequest{
		ReportId: reportID,
		Zoom:     &zoom,
		Lat:      &lat,
		Lon:      &lon,
	})

	require.NoError(t, err)
	renderURL, err := url.Parse(response.SnapshotRenderUrl)
	require.NoError(t, err)
	require.Empty(t, renderURL.Query().Get("zoom"))
	require.Empty(t, renderURL.Query().Get("lat"))
	require.Empty(t, renderURL.Query().Get("lon"))
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestCreateReportSnapshot_ReturnsImageURLWithBrowserlessCapture(t *testing.T) {
	t.Setenv("DEKART_BROWSERLESS_TOKEN", "token")
	t.Setenv("DEKART_APP_URL", "http://localhost:3000")
	reportID := "00000000-0000-0000-0000-000000000002"
	email := "user@example.com"

	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()
	expectSnapshotReportAccess(mock, reportID, email)

	server := NewServer(db, nil, nil)
	response, err := server.CreateReportSnapshot(snapshotTestContext(email), &proto.CreateReportSnapshotRequest{ReportId: reportID})

	require.NoError(t, err)
	require.Contains(t, response.SnapshotUrl, "/snapshot/report/")
	require.Contains(t, response.SnapshotRenderUrl, "/reports/"+reportID+"/snapshot?snapshot_token=")
	require.Positive(t, response.ExpiresIn)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestCreateReportSnapshot_AppendsViewportParamsToImageURLWithBrowserlessCapture(t *testing.T) {
	t.Setenv("DEKART_BROWSERLESS_TOKEN", "token")
	t.Setenv("DEKART_APP_URL", "http://localhost:3000")
	reportID := "00000000-0000-0000-0000-000000000023"
	email := "user@example.com"

	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()
	expectSnapshotReportAccess(mock, reportID, email)

	server := NewServer(db, nil, nil)
	zoom := 12.0
	lat := 52.52
	lon := 13.405
	response, err := server.CreateReportSnapshot(snapshotTestContext(email), &proto.CreateReportSnapshotRequest{
		ReportId: reportID,
		Zoom:     &zoom,
		Lat:      &lat,
		Lon:      &lon,
	})

	require.NoError(t, err)
	imageURL, err := url.Parse(response.SnapshotUrl)
	require.NoError(t, err)
	require.Equal(t, "12", imageURL.Query().Get("zoom"))
	require.Equal(t, "52.52", imageURL.Query().Get("lat"))
	require.Equal(t, "13.405", imageURL.Query().Get("lon"))
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestBuildSnapshotRenderURLForBrowserless_AppendsRequestViewportParams(t *testing.T) {
	t.Setenv("DEKART_SNAPSHOT_RENDER_BASE_URL_DEV", "http://localhost:3000")
	reportID := "00000000-0000-0000-0000-000000000024"
	request := httptest.NewRequest(http.MethodGet, "/snapshot/report/token.png?zoom=12&lat=52.52&lon=13.405", nil)

	renderURL, err := url.Parse(buildSnapshotRenderURLForBrowserless(
		request,
		"snapshot-token",
		reportID,
		snapshotViewportParamsFromQuery(request.URL.Query()),
	))

	require.NoError(t, err)
	require.Equal(t, "12", renderURL.Query().Get("zoom"))
	require.Equal(t, "52.52", renderURL.Query().Get("lat"))
	require.Equal(t, "13.405", renderURL.Query().Get("lon"))
}

func TestCreateReportSnapshot_RequiresAuthAndReportAccess(t *testing.T) {
	t.Setenv("DEKART_BROWSERLESS_TOKEN", "")
	server := &Server{}

	_, err := server.CreateReportSnapshot(context.Background(), &proto.CreateReportSnapshotRequest{ReportId: "report-1"})
	require.Equal(t, codes.Unauthenticated, status.Code(err))

	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()
	reportID := "00000000-0000-0000-0000-000000000003"
	email := "user@example.com"
	mock.ExpectQuery("select\\s+r\\.id").
		WithArgs(email, reportID, reportID, reportID, reportID, false).
		WillReturnRows(sqlmock.NewRows([]string{
			"id",
			"map_config",
			"title",
			"is_author",
			"author_email",
			"discoverable",
			"allow_edit",
			"created_at",
			"updated_at",
			"is_playground",
			"connections_with_cache_num",
			"connections_num",
			"connections_with_sensitive_scope_num",
			"is_public",
			"track_viewers",
			"query_params",
			"allow_export",
			"readme",
			"workspace_id",
			"auto_refresh_interval_seconds",
			"version_id",
			"has_map_preview",
		}))
	server = NewServer(db, nil, nil)

	_, err = server.CreateReportSnapshot(snapshotTestContext(email), &proto.CreateReportSnapshotRequest{ReportId: reportID})
	require.Equal(t, codes.NotFound, status.Code(err))
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestHandleSnapshotReport_DisabledWithoutBrowserlessCapture(t *testing.T) {
	t.Setenv("DEKART_BROWSERLESS_TOKEN", "")
	server := &Server{}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/snapshot/report/token.png", nil)

	server.HandleSnapshotReport(recorder, request)

	require.Equal(t, http.StatusNotFound, recorder.Code)
	require.Contains(t, recorder.Body.String(), "snapshot feature is disabled")
}
