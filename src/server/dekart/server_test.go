package dekart

import (
	"dekart/src/proto"
	"dekart/src/server/user"
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

func TestRequireReportWorkspaceWrite_RejectsCloudPersonalWorkspace(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "1")
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	reportID := "00000000-0000-0000-0000-000000000011"
	workspaceID := "00000000-0000-0000-0000-000000000012"
	mock.ExpectQuery("SELECT workspace_id, is_playground").
		WithArgs(reportID).
		WillReturnRows(sqlmock.NewRows([]string{"workspace_id", "is_playground"}).AddRow(workspaceID, false))
	mock.ExpectQuery("SELECT").
		WithArgs(workspaceID).
		WillReturnRows(sqlmock.NewRows([]string{"customer_id", "plan_type", "created_at", "trial_ends_at"}).
			AddRow(nil, proto.PlanType_TYPE_PERSONAL, time.Now(), nil))
	server := NewServer(db, nil, nil)
	err = server.requireReportWorkspaceWrite(testUserContext("user@example.com"), reportID)

	require.Error(t, err)
	require.Equal(t, codes.PermissionDenied, status.Code(err))
	require.Equal(t, "workspace is read-only", status.Convert(err).Message())
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestRequireWorkspaceIDWrite_RejectsCloudPersonalWorkspace(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "1")
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	workspaceID := "00000000-0000-0000-0000-000000000014"
	mock.ExpectQuery("SELECT customer_id, plan_type, created_at, trial_ends_at").
		WithArgs(workspaceID).
		WillReturnRows(sqlmock.NewRows([]string{"customer_id", "plan_type", "created_at", "trial_ends_at"}).
			AddRow(nil, proto.PlanType_TYPE_PERSONAL, time.Now(), nil))
	server := NewServer(db, nil, nil)
	err = server.requireWorkspaceIDWrite(testUserContext("user@example.com"), workspaceID)

	require.Equal(t, codes.PermissionDenied, status.Code(err))
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestCreateSubscription_TrialPingsConnectedMembers(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	streams := user.NewStreams()
	memberChannel, _ := streams.Register(user.Claims{Email: "member@example.com"}, 0)
	<-memberChannel

	workspaceID := "00000000-0000-0000-0000-000000000021"
	createdAt := time.Now()
	personalRow := subscriptionRow{createdAt: createdAt, planType: proto.PlanType_TYPE_PERSONAL}
	mock.ExpectQuery("WITH status AS").
		WithArgs(workspaceID).
		WillReturnRows(sqlmock.NewRows([]string{"email", "status", "created_at", "accepted", "authored_by", "id", "role"}).
			AddRow("admin@example.com", 1, time.Now(), nil, "admin@example.com", "00000000-0000-0000-0000-000000000022", proto.UserRole_ROLE_ADMIN).
			AddRow("member@example.com", 1, time.Now(), true, "admin@example.com", "00000000-0000-0000-0000-000000000023", proto.UserRole_ROLE_EDITOR))
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT id FROM workspaces").
		WithArgs(workspaceID).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(workspaceID))
	mock.ExpectQuery("SELECT customer_id, plan_type, created_at, trial_ends_at").
		WithArgs(workspaceID).
		WillReturnRows(sqlmock.NewRows([]string{"customer_id", "plan_type", "created_at", "trial_ends_at"}).
			AddRow(nil, proto.PlanType_TYPE_PERSONAL, createdAt, nil))
	mock.ExpectExec("insert into subscription_log").
		WithArgs(workspaceID, proto.PlanType_TYPE_TRIAL, "admin@example.com", sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
	server := &Server{db: db, userStreams: streams}
	ctx := user.SetWorkspaceCtx(testUserContext("admin@example.com"), user.WorkspaceInfo{
		ID:       workspaceID,
		PlanType: proto.PlanType_TYPE_PERSONAL,
		UserRole: proto.UserRole_ROLE_ADMIN,
	})

	_, err = server.CreateSubscription(ctx, &proto.CreateSubscriptionRequest{
		PlanType: proto.PlanType_TYPE_TRIAL,
		Revision: personalRow.revision(),
	})

	require.NoError(t, err)
	select {
	case <-memberChannel:
	case <-time.After(time.Second):
		t.Fatal("connected member did not receive trial activation update")
	}
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestCreateSubscription_PreservesAbortedForStaleTrial(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	workspaceID := "00000000-0000-0000-0000-000000000041"
	createdAt := time.Now()
	mock.ExpectQuery("WITH status AS").
		WithArgs(workspaceID).
		WillReturnRows(sqlmock.NewRows([]string{"email", "status", "created_at", "accepted", "authored_by", "id", "role"}).
			AddRow("admin@example.com", 1, createdAt, nil, "admin@example.com", "00000000-0000-0000-0000-000000000042", proto.UserRole_ROLE_ADMIN))
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT id FROM workspaces").
		WithArgs(workspaceID).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(workspaceID))
	mock.ExpectQuery("SELECT customer_id, plan_type, created_at, trial_ends_at").
		WithArgs(workspaceID).
		WillReturnRows(sqlmock.NewRows([]string{"customer_id", "plan_type", "created_at", "trial_ends_at"}).
			AddRow(nil, proto.PlanType_TYPE_TRIAL, createdAt, createdAt.Add(14*24*time.Hour)))
	mock.ExpectRollback()

	server := &Server{db: db, userStreams: user.NewStreams()}
	ctx := user.SetWorkspaceCtx(testUserContext("admin@example.com"), user.WorkspaceInfo{
		ID:       workspaceID,
		PlanType: proto.PlanType_TYPE_PERSONAL,
		UserRole: proto.UserRole_ROLE_ADMIN,
	})
	_, err = server.CreateSubscription(ctx, &proto.CreateSubscriptionRequest{
		PlanType: proto.PlanType_TYPE_TRIAL,
		Revision: "stale",
	})

	require.Equal(t, codes.Aborted, status.Code(err))
	require.NoError(t, mock.ExpectationsWereMet())
}
