package dekart

import (
	"dekart/src/proto"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestRequireReportWorkspaceWrite_AllowsPlaygroundReportWithoutWorkspace(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	reportID := "00000000-0000-0000-0000-000000000001"
	mock.ExpectQuery("SELECT workspace_id, is_playground").
		WithArgs(reportID).
		WillReturnRows(sqlmock.NewRows([]string{"workspace_id", "is_playground"}).AddRow(nil, true))

	server := NewServer(db, nil, nil)
	err = server.requireReportWorkspaceWrite(testUserContext("user@example.com"), reportID)

	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestRequireReportWorkspaceWrite_RejectsPlaygroundReportWhenRuntimeLicenseExpired(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	reportID := "00000000-0000-0000-0000-000000000001"
	mock.ExpectQuery("SELECT workspace_id, is_playground").
		WithArgs(reportID).
		WillReturnRows(sqlmock.NewRows([]string{"workspace_id", "is_playground"}).AddRow(nil, true))

	expiredAt := time.Now().Add(-time.Minute)
	server := NewServerWithRuntimeLicense(db, nil, nil, RuntimeLicenseState{
		Required:  true,
		ExpiresAt: &expiredAt,
	})
	err = server.requireReportWorkspaceWrite(testUserContext("user@example.com"), reportID)

	require.Error(t, err)
	require.Equal(t, codes.PermissionDenied, status.Code(err))
	require.Contains(t, status.Convert(err).Message(), "license key expired")
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestRequireReportWorkspaceWrite_RejectsExpiredReportWorkspaceSubscription(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	reportID := "00000000-0000-0000-0000-000000000001"
	workspaceID := "00000000-0000-0000-0000-000000000002"
	mock.ExpectQuery("SELECT workspace_id, is_playground").
		WithArgs(reportID).
		WillReturnRows(sqlmock.NewRows([]string{"workspace_id", "is_playground"}).AddRow(workspaceID, false))
	mock.ExpectQuery("SELECT").
		WithArgs(workspaceID).
		WillReturnRows(sqlmock.NewRows([]string{"customer_id", "plan_type", "created_at", "trial_ends_at"}).
			AddRow("cus_test", proto.PlanType_TYPE_TRIAL, time.Now(), time.Now().Add(-time.Minute)))

	server := NewServer(db, nil, nil)
	err = server.requireReportWorkspaceWrite(testUserContext("user@example.com"), reportID)

	require.Error(t, err)
	require.Equal(t, codes.PermissionDenied, status.Code(err))
	require.Equal(t, "workspace is read-only", status.Convert(err).Message())
	require.NoError(t, mock.ExpectationsWereMet())
}
