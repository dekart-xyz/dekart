package dekart

import (
	"database/sql"
	"encoding/json"
	"path/filepath"
	"testing"

	"dekart/src/proto"
	"dekart/src/server/user"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Exercise saved metadata through the same server methods used by the browser and MCP.
func TestConnectionDocsURL(t *testing.T) {
	t.Setenv("DEKART_DATASOURCE", "USER")
	t.Setenv("DEKART_CLOUD", "")
	t.Setenv("DEKART_ALLOW_FILE_UPLOAD", "0")
	db, err := sql.Open("sqlite3", ":memory:")
	require.NoError(t, err)
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	files, err := filepath.Glob("../../../sqlite/migrations/*.up.sql")
	require.NoError(t, err)
	require.NotEmpty(t, files)
	for _, file := range files {
		execMigration(t, db, filepath.Join("sqlite/migrations", filepath.Base(file)))
	}
	server := NewServer(db, nil, nil)
	ctx := user.SetWorkspaceCtx(testUserContext("admin@example.com"), user.WorkspaceInfo{
		ID: "workspace-1", PlanType: proto.PlanType_TYPE_COMMUNITY, UserRole: proto.UserRole_ROLE_ADMIN,
	})
	for _, kind := range []proto.ConnectionType{proto.ConnectionType_CONNECTION_TYPE_BIGQUERY, proto.ConnectionType_CONNECTION_TYPE_HTTP} {
		t.Run(kind.String(), func(t *testing.T) {
			connection := &proto.Connection{
				ConnectionName: "Open EV Data", ConnectionType: kind,
				BigqueryProjectId: "dekart-open-ev-workspace", HttpDocsUrl: "https://example.com/docs",
			}
			if kind == proto.ConnectionType_CONNECTION_TYPE_HTTP {
				connection.HttpBaseUrl = "https://example.com/data/"
			}
			created, err := server.CreateConnection(ctx, &proto.CreateConnectionRequest{Connection: connection})
			require.NoError(t, err)
			id := created.Connection.Id
			// Check both individual loading and discovery, including the MCP JSON field name.
			for index, docs := range []string{"https://example.com/docs", "http://example.com/updated", ""} {
				connection.HttpDocsUrl = docs
				// Read the first value directly after creation, then verify updates and clearing.
				if index > 0 {
					_, err := server.UpdateConnection(ctx, &proto.UpdateConnectionRequest{Connection: connection})
					require.NoError(t, err)
				}
				saved, err := server.getConnection(ctx, id)
				require.NoError(t, err)
				require.Equal(t, docs, saved.HttpDocsUrl)
				raw, err := server.callListConnectionsTool(ctx)
				require.NoError(t, err)
				var result struct {
					Connections []map[string]any `json:"connections"`
				}
				require.NoError(t, json.Unmarshal(raw, &result))
				found := false
				for _, metadata := range result.Connections {
					if metadata["id"] == id {
						found = true
						require.Equal(t, "Open EV Data", metadata["connection_name"])
						returnedDocs, _ := metadata["http_docs_url"].(string)
						require.Equal(t, docs, returnedDocs)
					}
				}
				require.True(t, found)
			}
			for _, invalid := range []string{"ftp://example.com/docs", "javascript:alert(1)", "/docs", "https:///docs"} {
				t.Run(invalid, func(t *testing.T) {
					connection.HttpDocsUrl = invalid
					_, err := server.UpdateConnection(ctx, &proto.UpdateConnectionRequest{Connection: connection})
					require.Equal(t, codes.InvalidArgument, status.Code(err))
					connection.Id = ""
					_, err = server.CreateConnection(ctx, &proto.CreateConnectionRequest{Connection: connection})
					require.Equal(t, codes.InvalidArgument, status.Code(err))
					connection.Id = id
				})
			}
		})
	}
}

// Metadata edits must preserve the saved Wherobots credential without resubmitting it.
func TestUpdateWherobotsDocsWithoutKey(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()
	server := NewServer(db, nil, nil)
	ctx := user.SetWorkspaceCtx(testUserContext("admin@example.com"), user.WorkspaceInfo{
		ID: "workspace-1", PlanType: proto.PlanType_TYPE_COMMUNITY, UserRole: proto.UserRole_ROLE_ADMIN,
	})
	id := "11111111-1111-1111-1111-111111111111"
	mock.ExpectExec(`update connections set`).WithArgs("Wherobots", "api.cloud.wherobots.com", "eu-central-1", "tiny", "https://example.com/docs", id).WillReturnResult(sqlmock.NewResult(0, 1))
	_, err = server.UpdateConnection(ctx, &proto.UpdateConnectionRequest{Connection: &proto.Connection{
		Id: id, ConnectionName: "Wherobots", ConnectionType: proto.ConnectionType_CONNECTION_TYPE_WHEROBOTS,
		WherobotsHost: "api.cloud.wherobots.com", WherobotsRegion: "eu-central-1", WherobotsRuntime: "tiny", HttpDocsUrl: "https://example.com/docs",
	}})
	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())
}
