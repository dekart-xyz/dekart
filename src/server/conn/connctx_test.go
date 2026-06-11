package conn

import (
	"dekart/src/proto"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestValidateReqConnection_BigQueryAllowsEmptyProjectAndKeyForSecretPreservingUpdates(t *testing.T) {
	err := ValidateReqConnection(&proto.Connection{
		ConnectionName: "BigQuery",
		ConnectionType: proto.ConnectionType_CONNECTION_TYPE_BIGQUERY,
	})

	require.NoError(t, err)
}

func TestValidateReqConnection_BigQueryAllowsProjectOnly(t *testing.T) {
	err := ValidateReqConnection(&proto.Connection{
		ConnectionName:    "BigQuery",
		ConnectionType:    proto.ConnectionType_CONNECTION_TYPE_BIGQUERY,
		BigqueryProjectId: "dekart-dev",
	})

	require.NoError(t, err)
}

func TestValidateReqConnection_BigQueryAllowsServiceAccountOnly(t *testing.T) {
	err := ValidateReqConnection(&proto.Connection{
		ConnectionName: "BigQuery",
		ConnectionType: proto.ConnectionType_CONNECTION_TYPE_BIGQUERY,
		BigqueryKey:    &proto.Secret{ClientEncrypted: "secret"},
	})

	require.NoError(t, err)
}

func TestValidateReqConnection_BigQueryRejectsEmptyServiceAccount(t *testing.T) {
	err := ValidateReqConnection(&proto.Connection{
		ConnectionName: "BigQuery",
		ConnectionType: proto.ConnectionType_CONNECTION_TYPE_BIGQUERY,
		BigqueryKey:    &proto.Secret{},
	})

	require.Error(t, err)
	require.Equal(t, codes.InvalidArgument, status.Code(err))
	require.Equal(t, "bigquery_key is empty", status.Convert(err).Message())
}
