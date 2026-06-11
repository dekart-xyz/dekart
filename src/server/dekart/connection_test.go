package dekart

import (
	"dekart/src/proto"
	"dekart/src/server/user"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestValidateNewBigQueryConnectionTargetRejectsEmptyProjectAndKey(t *testing.T) {
	err := validateNewBigQueryConnectionTarget(&proto.Connection{
		ConnectionName: "BigQuery",
		ConnectionType: proto.ConnectionType_CONNECTION_TYPE_BIGQUERY,
	})

	require.Error(t, err)
	require.Equal(t, codes.InvalidArgument, status.Code(err))
	require.Equal(t, "bigquery_project_id or bigquery_key is required", status.Convert(err).Message())
}

func TestValidateNewBigQueryConnectionTargetAllowsProjectOnly(t *testing.T) {
	err := validateNewBigQueryConnectionTarget(&proto.Connection{
		ConnectionName:    "BigQuery",
		ConnectionType:    proto.ConnectionType_CONNECTION_TYPE_BIGQUERY,
		BigqueryProjectId: "dekart-dev",
	})

	require.NoError(t, err)
}

func TestValidateNewBigQueryConnectionTargetAllowsServiceAccountOnly(t *testing.T) {
	err := validateNewBigQueryConnectionTarget(&proto.Connection{
		ConnectionName: "BigQuery",
		ConnectionType: proto.ConnectionType_CONNECTION_TYPE_BIGQUERY,
		BigqueryKey:    &proto.Secret{ClientEncrypted: "secret"},
	})

	require.NoError(t, err)
}

func TestUpdateConnection_BigQueryAllowsMetadataOnlyServiceAccountEdit(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	server := NewServer(db, nil, nil)
	connectionID := "11111111-1111-1111-1111-111111111111"
	ctx := user.SetWorkspaceCtx(testUserContext("admin@example.com"), user.WorkspaceInfo{
		ID:       "workspace-1",
		PlanType: proto.PlanType_TYPE_COMMUNITY,
		UserRole: proto.UserRole_ROLE_ADMIN,
	})

	mock.ExpectExec(`update connections set\s+connection_name=\$1,\s+cloud_storage_bucket=\$2,\s+updated_at=CURRENT_TIMESTAMP\s+where id=\$3`).
		WithArgs("Renamed BigQuery", "metadata-bucket", connectionID).
		WillReturnResult(sqlmock.NewResult(0, 1))

	response, err := server.UpdateConnection(ctx, &proto.UpdateConnectionRequest{
		Connection: &proto.Connection{
			Id:                 connectionID,
			ConnectionName:     "Renamed BigQuery",
			ConnectionType:     proto.ConnectionType_CONNECTION_TYPE_BIGQUERY,
			CloudStorageBucket: "metadata-bucket",
		},
	})

	require.NoError(t, err)
	require.Equal(t, connectionID, response.GetConnection().GetId())
	require.NoError(t, mock.ExpectationsWereMet())
}
