package dekart

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"dekart/src/proto"
	"dekart/src/server/user"

	"github.com/DATA-DOG/go-sqlmock"
	_ "github.com/mattn/go-sqlite3"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestCreateWorkspace_DisabledForSelfHostedByDefault(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "")
	t.Setenv("DEKART_ALLOW_WORKSPACE_CREATION", "")
	t.Setenv("DEKART_LICENSE_KEY", "")

	server := Server{}
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: "user@example.com"})

	_, err := server.CreateWorkspace(ctx, &proto.CreateWorkspaceRequest{WorkspaceName: "Acme"})

	require.Error(t, err)
	require.Equal(t, codes.PermissionDenied, status.Code(err))
}

func TestCreateWorkspace_AllowedForCloud(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "1")
	testCreateWorkspaceAllowed(t)
}

func TestCreateWorkspace_AllowedForSelfHostedWhenExplicitlyEnabled(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "")
	t.Setenv("DEKART_ALLOW_WORKSPACE_CREATION", "1")
	t.Setenv("DEKART_LICENSE_KEY", "")
	testCreateWorkspaceAllowed(t)
}

func testCreateWorkspaceAllowed(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	server := Server{db: db}
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: "user@example.com"})

	mock.ExpectExec("INSERT INTO workspaces").
		WithArgs(sqlmock.AnyArg(), "Acme").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO workspace_log").
		WithArgs(sqlmock.AnyArg(), "user@example.com", sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("insert into subscription_log").
		WithArgs(sqlmock.AnyArg(), user.GetDefaultSubscription(), "user@example.com").
		WillReturnResult(sqlmock.NewResult(0, 1))

	_, err = server.CreateWorkspace(ctx, &proto.CreateWorkspaceRequest{WorkspaceName: "Acme"})

	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestUpdateWorkspaceUser_RejectsUnknownEmail(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "")

	server := Server{}
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: user.UnknownEmail})
	ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{
		ID:       user.GetDefaultWorkspaceID(),
		PlanType: proto.PlanType_TYPE_COMMUNITY,
		UserRole: proto.UserRole_ROLE_ADMIN,
	})

	_, err := server.UpdateWorkspaceUser(ctx, &proto.UpdateWorkspaceUserRequest{
		Email:          "teammate@example.com",
		UserUpdateType: proto.UpdateWorkspaceUserRequest_USER_UPDATE_TYPE_ADD,
		Role:           proto.UserRole_ROLE_VIEWER,
	})

	require.Error(t, err)
	require.Equal(t, codes.PermissionDenied, status.Code(err))
}

func TestUpdateWorkspace_RenamesDefaultWorkspaceInSqlite(t *testing.T) {
	db, err := sql.Open("sqlite3", "file:update_workspace_test?mode=memory&cache=shared")
	require.NoError(t, err)
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE workspaces (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		INSERT INTO workspaces (id, name)
		VALUES (?, ?);
	`, user.GetDefaultWorkspaceID(), "Default")
	require.NoError(t, err)

	server := NewServer(db, nil, nil)
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: user.UnknownEmail})
	ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{
		ID:       user.GetDefaultWorkspaceID(),
		PlanType: proto.PlanType_TYPE_COMMUNITY,
		UserRole: proto.UserRole_ROLE_ADMIN,
	})

	_, err = server.UpdateWorkspace(ctx, &proto.UpdateWorkspaceRequest{WorkspaceName: "Default Local"})
	require.NoError(t, err)

	var name string
	err = db.QueryRow(`SELECT name FROM workspaces WHERE id = ?`, user.GetDefaultWorkspaceID()).Scan(&name)
	require.NoError(t, err)
	require.Equal(t, "Default Local", name)
}

func TestSetWorkspaceContext_UsesPersistedDefaultWorkspaceForUnknownEmail(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "")
	t.Setenv("DEKART_ALLOW_WORKSPACE_CREATION", "")
	t.Setenv("DEKART_LICENSE_KEY", "")

	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	server := Server{db: db}
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: user.UnknownEmail})
	workspaceID := user.GetDefaultWorkspaceID()
	now := time.Now()

	mock.ExpectQuery("WITH last_status").
		WithArgs(user.UnknownEmail).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "role", "plan_type"}))
	mock.ExpectExec("INSERT INTO workspaces").
		WithArgs(workspaceID).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO subscription_log").
		WithArgs(workspaceID, user.GetDefaultSubscription(), user.UnknownEmail).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO workspace_log").
		WithArgs(workspaceID, user.UnknownEmail, sqlmock.AnyArg(), proto.UserRole_ROLE_ADMIN).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("WITH last_status").
		WithArgs(user.UnknownEmail).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "role", "plan_type"}).
			AddRow(workspaceID, "Default", proto.UserRole_ROLE_ADMIN, proto.PlanType_TYPE_COMMUNITY))
	mock.ExpectQuery("SELECT\\s+sl.customer_id").
		WithArgs(workspaceID).
		WillReturnRows(sqlmock.NewRows([]string{"customer_id", "plan_type", "created_at", "trial_ends_at"}).
			AddRow("", proto.PlanType_TYPE_COMMUNITY, now, nil))
	mock.ExpectQuery("WITH status AS").
		WithArgs(workspaceID).
		WillReturnRows(sqlmock.NewRows([]string{"email", "status", "created_at", "accepted", "authored_by", "id", "role"}).
			AddRow(user.UnknownEmail, 1, now, nil, user.UnknownEmail, "invite-id", proto.UserRole_ROLE_ADMIN))

	ctx = server.SetWorkspaceContext(ctx, nil)
	workspace := user.CheckWorkspaceCtx(ctx)

	require.Equal(t, workspaceID, workspace.ID)
	require.Equal(t, "Default", workspace.Name)
	require.True(t, workspace.IsDefaultWorkspace)
	require.Equal(t, proto.PlanType_TYPE_COMMUNITY, workspace.PlanType)
	require.Equal(t, proto.UserRole_ROLE_ADMIN, workspace.UserRole)
	require.Equal(t, int64(1), workspace.AddedUsersCount)
	require.Equal(t, int64(1), workspace.BilledUsers)
	require.NoError(t, mock.ExpectationsWereMet())
}
