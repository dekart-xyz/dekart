package conn

import (
	"errors"
	"net"
	"testing"

	"dekart/src/proto"

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

func TestBuildPostgresKeywordDSNUsesResolvedCloudHost(t *testing.T) {
	tests := []struct {
		name          string
		host          string
		resolvedIPs   []net.IP
		lookupErr     error
		expectLookup  bool
		expectedHost  string
		expectedError bool
	}{
		{
			name:         "issue hostname resolves to public IPv4",
			host:         "yamabiko.proxy.rlwy.net",
			resolvedIPs:  []net.IP{net.ParseIP("192.0.2.1")},
			expectLookup: true,
			expectedHost: "192.0.2.1",
		},
		{
			name:         "hostname resolves to public IPv6",
			host:         "postgres.example.com",
			resolvedIPs:  []net.IP{net.ParseIP("2001:4860:4860::8888")},
			expectLookup: true,
			expectedHost: "2001:4860:4860::8888",
		},
		{
			name:         "hostname uses first of multiple public answers",
			host:         "multi.example.com",
			resolvedIPs:  []net.IP{net.ParseIP("2001:4860:4860::8888"), net.ParseIP("192.0.2.1")},
			expectLookup: true,
			expectedHost: "2001:4860:4860::8888",
		},
		{
			name:          "hostname with public and private answers is rejected",
			host:          "mixed.example.com",
			resolvedIPs:   []net.IP{net.ParseIP("192.0.2.1"), net.ParseIP("10.0.0.1")},
			expectLookup:  true,
			expectedError: true,
		},
		{
			name:          "DNS lookup failure",
			host:          "missing.example.com",
			lookupErr:     errors.New("DNS lookup failed"),
			expectLookup:  true,
			expectedError: true,
		},
		{
			name:          "DNS lookup returns no answers",
			host:          "empty.example.com",
			expectLookup:  true,
			expectedError: true,
		},
		{
			name:         "public IPv4 literal bypasses DNS",
			host:         "192.0.2.1",
			expectedHost: "192.0.2.1",
		},
		{
			name:         "public IPv6 literal bypasses DNS",
			host:         "2001:4860:4860::8888",
			expectedHost: "2001:4860:4860::8888",
		},
		{
			name:         "IPv4-mapped IPv6 literal is normalized",
			host:         "::ffff:192.0.2.1",
			expectedHost: "192.0.2.1",
		},
		{
			name:          "IPv6 loopback from reported failure is rejected",
			host:          "::1",
			expectedError: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("DEKART_CLOUD", "1")
			t.Setenv("DEKART_DEV_CLAIMS", "")
			lookupCalled := false
			lookupIP := func(host string) ([]net.IP, error) {
				lookupCalled = true
				require.Equal(t, test.host, host)
				return test.resolvedIPs, test.lookupErr
			}
			con := validPostgresConnection()
			con.PostgresHost = test.host

			dsn, err := buildPostgresKeywordDSN(con, "secret", lookupIP)

			require.Equal(t, test.expectLookup, lookupCalled)
			if test.expectedError {
				require.Equal(t, codes.InvalidArgument, status.Code(err))
				require.Equal(t, "postgres_host must resolve to a public address in cloud", status.Convert(err).Message())
				require.Empty(t, dsn)
				return
			}
			require.NoError(t, err)
			require.Contains(t, dsn, "host='"+test.expectedHost+"'")
			require.NotContains(t, dsn, "hostaddr=")
		})
	}
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
