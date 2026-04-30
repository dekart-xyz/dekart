package dekart

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/user"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"
)

func TestCheckCreateReportGate_DisabledOutsideCloud(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "")
	server := Server{}
	allowed, workspaceCount, owners, err := server.checkCreateReportGate(
		context.Background(),
		"person@acme.com",
		user.WorkspaceInfo{ID: "w1", PlanType: proto.PlanType_TYPE_PERSONAL},
	)
	require.NoError(t, err)
	require.True(t, allowed)
	require.Zero(t, workspaceCount)
	require.Empty(t, owners)
}

func TestCheckCreateReportGate_AllowedForNonCompanyEmail(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "1")
	server := Server{}
	allowed, workspaceCount, owners, err := server.checkCreateReportGate(
		context.Background(),
		"person@gmail.com",
		user.WorkspaceInfo{ID: "w1", PlanType: proto.PlanType_TYPE_PERSONAL},
	)
	require.NoError(t, err)
	require.True(t, allowed)
	require.Zero(t, workspaceCount)
	require.Empty(t, owners)
}

func TestCheckCreateReportGate_BlocksThirdMapInAdditionalWorkspace(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "1")
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	server := Server{db: db}
	ctx := context.Background()

	mock.ExpectQuery("WITH latest_workspace_log").
		WithArgs("acme.com", "w2").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_count", "is_first_workspace", "owner_emails"}).
			AddRow(2, false, "{owner1@acme.com,owner2@acme.com}"))

	mock.ExpectQuery("SELECT COUNT\\(\\*\\)\\s+FROM reports").
		WithArgs("w2").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))

	allowed, workspaceCount, owners, err := server.checkCreateReportGate(
		ctx,
		"person@acme.com",
		user.WorkspaceInfo{ID: "w2", PlanType: proto.PlanType_TYPE_PERSONAL},
	)
	require.NoError(t, err)
	require.False(t, allowed)
	require.Equal(t, 2, workspaceCount)
	require.Equal(t, []string{"owner1@acme.com", "owner2@acme.com"}, owners)
	require.NoError(t, mock.ExpectationsWereMet())
}
