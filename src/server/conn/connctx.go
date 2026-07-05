package conn

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"fmt"
	"net"
	"net/netip"
	"os"
	"strconv"
	"strings"

	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type ConnectionContextKey string

const connectionContextKey ConnectionContextKey = "connection"

var dekartBigQueryProjectID = os.Getenv("DEKART_BIGQUERY_PROJECT_ID")
var dekartCloudStorageBucket = os.Getenv("DEKART_CLOUD_STORAGE_BUCKET")
var dekartDataSource = os.Getenv("DEKART_DATASOURCE")
var dekartStorage = os.Getenv("DEKART_STORAGE")
var dekartRequireGoogleOAuth = os.Getenv("DEKART_REQUIRE_GOOGLE_OAUTH")

func IsUserDefined() bool {
	if dekartDataSource == "USER" {
		return true
	}
	return (dekartBigQueryProjectID == "" && dekartDataSource == "BQ") ||
		(dekartCloudStorageBucket == "" && dekartDataSource != "SNOWFLAKE") ||
		dekartRequireGoogleOAuth == "1" // use user defined connection when require google oauth to reduce the number of possible configurations
}

// CanShareReports returns true if reports can be shared between users for backend configured connections
func CanShareReports() bool {
	// For backend configured connections, we can share reports only if the datasource is Snowflake or the cloud storage bucket is set
	return (dekartCloudStorageBucket != "" && (dekartDataSource == "BQ" || dekartDataSource == "PG")) ||
		dekartDataSource == "SNOWFLAKE" ||
		(dekartDataSource == "PG" && dekartStorage == "PG")
}

func GetCtx(ctx context.Context, connection *proto.Connection) context.Context {
	return context.WithValue(ctx, connectionContextKey, connection)
}

func FromCtx(ctx context.Context) *proto.Connection {
	connection, ok := ctx.Value(connectionContextKey).(*proto.Connection)
	if !ok {
		log.Error().Err(fmt.Errorf("connection not found in context")).Stack().Send()
		return &proto.Connection{}
	}
	return connection
}

// SystemConnectionID is a special connection ID used for connection configured in env variables
const SystemConnectionID = "00000000-0000-0000-0000-000000000000"

const (
	PostgresSSLModeDisable = "disable"
	PostgresSSLModeRequire = "require"
)

type PostgresDSNParam struct {
	Key   string
	Value string
}

// PostgresKeywordDSN quotes lib/pq keyword DSN values so credentials remain data.
func PostgresKeywordDSN(params ...PostgresDSNParam) string {
	quoted := make([]string, 0, len(params))
	for _, param := range params {
		value := strings.NewReplacer(`\`, `\\`, `'`, `\'`).Replace(param.Value)
		quoted = append(quoted, fmt.Sprintf("%s='%s'", param.Key, value))
	}
	return strings.Join(quoted, " ")
}

// BuildPostgresKeywordDSN applies Cloud host safety, SSL defaults, and lib/pq quoting.
func BuildPostgresKeywordDSN(connection *proto.Connection, password string) (string, error) {
	sslMode, err := NormalizePostgresSSLMode(connection.PostgresSslMode)
	if err != nil {
		return "", err
	}
	hostKey := "host"
	hostValue := connection.PostgresHost
	if hostaddr, err := ResolvePostgresHostForCloud(connection.PostgresHost); err != nil {
		return "", err
	} else if hostaddr != "" {
		hostKey = "hostaddr"
		hostValue = hostaddr
	}
	return PostgresKeywordDSN(
		PostgresDSNParam{Key: hostKey, Value: hostValue},
		PostgresDSNParam{Key: "port", Value: strconv.Itoa(int(connection.PostgresPort))},
		PostgresDSNParam{Key: "user", Value: connection.PostgresUsername},
		PostgresDSNParam{Key: "dbname", Value: connection.PostgresDatabase},
		PostgresDSNParam{Key: "password", Value: password},
		PostgresDSNParam{Key: "sslmode", Value: sslMode},
	), nil
}

func IsSystemConnectionID(connectionID string) bool {
	return connectionID == SystemConnectionID || connectionID == "default" || connectionID == ""
}

func ConnectionIDToNullString(connectionID string) sql.NullString {
	if IsSystemConnectionID(connectionID) {
		return sql.NullString{Valid: false}
	}
	return sql.NullString{String: connectionID, Valid: true}
}

func CopyConnectionCtx(sourceCtx, destCtx context.Context) context.Context {
	connection := FromCtx(sourceCtx)
	return GetCtx(destCtx, connection)
}

// NormalizePostgresSSLMode keeps old local records compatible while enforcing TLS in Cloud.
func NormalizePostgresSSLMode(sslMode string) (string, error) {
	if sslMode == "" {
		if os.Getenv("DEKART_CLOUD") != "" {
			return PostgresSSLModeRequire, nil
		}
		return PostgresSSLModeDisable, nil
	}
	if sslMode != PostgresSSLModeDisable && sslMode != PostgresSSLModeRequire {
		return "", status.Error(codes.InvalidArgument, "postgres_ssl_mode must be disable or require")
	}
	if os.Getenv("DEKART_CLOUD") != "" && sslMode == PostgresSSLModeDisable {
		return "", status.Error(codes.InvalidArgument, "postgres_ssl_mode=disable is not allowed in cloud")
	}
	return sslMode, nil
}

func isPublicPostgresAddr(addr netip.Addr) bool {
	addr = addr.Unmap()
	return addr.IsValid() &&
		!addr.IsUnspecified() &&
		!addr.IsLoopback() &&
		!addr.IsPrivate() &&
		!addr.IsLinkLocalUnicast() &&
		!addr.IsLinkLocalMulticast() &&
		!addr.IsMulticast()
}

// ResolvePostgresHostForCloud prevents Cloud connectors from probing internal networks.
func ResolvePostgresHostForCloud(host string) (string, error) {
	if os.Getenv("DEKART_CLOUD") == "" {
		return "", nil
	}
	if os.Getenv("DEKART_DEV_CLAIMS") == "1" {
		return "", nil
	}
	if addr, err := netip.ParseAddr(host); err == nil {
		if !isPublicPostgresAddr(addr) {
			return "", status.Error(codes.InvalidArgument, "postgres_host must resolve to a public address in cloud")
		}
		return addr.Unmap().String(), nil
	}
	ips, err := net.LookupIP(host)
	if err != nil || len(ips) == 0 {
		return "", status.Error(codes.InvalidArgument, "postgres_host must resolve to a public address in cloud")
	}
	for _, ip := range ips {
		addr, ok := netip.AddrFromSlice(ip)
		if !ok || !isPublicPostgresAddr(addr) {
			return "", status.Error(codes.InvalidArgument, "postgres_host must resolve to a public address in cloud")
		}
	}
	addr, _ := netip.AddrFromSlice(ips[0])
	return addr.Unmap().String(), nil
}

// ValidatePostgresHostForCloud validates hostnames before saving or testing Cloud Postgres connections.
func ValidatePostgresHostForCloud(host string) error {
	_, err := ResolvePostgresHostForCloud(host)
	return err
}

func ValidateReqConnection(con *proto.Connection) error {
	if con == nil {
		return status.Error(codes.InvalidArgument, "connection is required")
	}
	if con.ConnectionName == "" {
		return status.Error(codes.InvalidArgument, "connection_name is required")
	}
	if con.ConnectionType == proto.ConnectionType_CONNECTION_TYPE_BIGQUERY {
		if con.BigqueryKey != nil && con.BigqueryKey.ClientEncrypted == "" && con.BigqueryKey.ServerEncrypted == "" {
			return status.Error(codes.InvalidArgument, "bigquery_key is empty")
		}
	}
	if con.ConnectionType == proto.ConnectionType_CONNECTION_TYPE_SNOWFLAKE {
		if con.SnowflakeAccountId == "" {
			return status.Error(codes.InvalidArgument, "snowflake_account_id is required")
		}
		if con.SnowflakeUsername == "" {
			return status.Error(codes.InvalidArgument, "snowflake_username is required")
		}
	}
	if con.ConnectionType == proto.ConnectionType_CONNECTION_TYPE_WHEROBOTS {
		if con.WherobotsHost == "" {
			return status.Error(codes.InvalidArgument, "wherobots_host is required")
		}
		if con.WherobotsKey == nil {
			return status.Error(codes.InvalidArgument, "wherobots_key is required")
		}
		if con.WherobotsRegion == "" {
			return status.Error(codes.InvalidArgument, "wherobots_region is required")
		}
		if con.WherobotsRuntime == "" {
			return status.Error(codes.InvalidArgument, "wherobots_runtime is required")
		}

	}
	if con.ConnectionType == proto.ConnectionType_CONNECTION_TYPE_POSTGRES {
		if con.PostgresHost == "" {
			return status.Error(codes.InvalidArgument, "postgres_host is required")
		}
		if err := ValidatePostgresHostForCloud(con.PostgresHost); err != nil {
			return err
		}
		if con.PostgresUsername == "" {
			return status.Error(codes.InvalidArgument, "postgres_username is required")
		}
		if con.PostgresPassword == nil && (con.Id == "" || con.Id == "test-connection") {
			return status.Error(codes.InvalidArgument, "postgres_password is required")
		}
		if con.PostgresDatabase == "" {
			return status.Error(codes.InvalidArgument, "postgres_database is required")
		}
		if con.PostgresPort <= 0 {
			return status.Error(codes.InvalidArgument, "postgres_port is required")
		}
		sslMode, err := NormalizePostgresSSLMode(con.PostgresSslMode)
		if err != nil {
			return err
		}
		con.PostgresSslMode = sslMode
	}
	return nil
}
