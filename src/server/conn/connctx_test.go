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

func TestValidateReqConnection_PostgresDefaultsSSLModeLocally(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "")
	con := validPostgresConnection()

	err := ValidateReqConnection(con)

	require.NoError(t, err)
	require.Equal(t, PostgresSSLModeDisable, con.PostgresSslMode)
}

func TestValidateReqConnection_PostgresDefaultsSSLModeToRequireInCloud(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "1")
	con := validPostgresConnection()

	err := ValidateReqConnection(con)

	require.NoError(t, err)
	require.Equal(t, PostgresSSLModeRequire, con.PostgresSslMode)
}

func TestValidateReqConnection_PostgresRejectsDisableInCloud(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "1")
	con := validPostgresConnection()
	con.PostgresSslMode = PostgresSSLModeDisable

	err := ValidateReqConnection(con)

	require.Error(t, err)
	require.Equal(t, codes.InvalidArgument, status.Code(err))
	require.Equal(t, "postgres_ssl_mode=disable is not allowed in cloud", status.Convert(err).Message())
}

func TestValidateReqConnection_PostgresRejectsPrivateHostInCloud(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "1")
	con := validPostgresConnection()
	con.PostgresHost = "127.0.0.1"

	err := ValidateReqConnection(con)

	require.Error(t, err)
	require.Equal(t, codes.InvalidArgument, status.Code(err))
	require.Equal(t, "postgres_host must resolve to a public address in cloud", status.Convert(err).Message())
}

func TestValidateReqConnection_PostgresAllowsDevClaimsLocalFixtureInCloud(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "1")
	t.Setenv("DEKART_DEV_CLAIMS", "1")
	con := validPostgresConnection()
	con.PostgresHost = "localhost"

	err := ValidateReqConnection(con)

	require.NoError(t, err)
}

func TestPostgresKeywordDSNEscapesValues(t *testing.T) {
	dsn := PostgresKeywordDSN(
		PostgresDSNParam{Key: "user", Value: "de kart"},
		PostgresDSNParam{Key: "password", Value: `pa'ss\word`},
	)

	require.Equal(t, `user='de kart' password='pa\'ss\\word'`, dsn)
}

func validPostgresConnection() *proto.Connection {
	return &proto.Connection{
		Id:               "test-connection",
		ConnectionName:   "Postgres",
		ConnectionType:   proto.ConnectionType_CONNECTION_TYPE_POSTGRES,
		PostgresHost:     "8.8.8.8",
		PostgresUsername: "postgres",
		PostgresPassword: &proto.Secret{ClientEncrypted: "secret"},
		PostgresDatabase: "dekart_geo",
		PostgresPort:     5432,
	}
}
