package dekart

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/jwtkeys"
	"dekart/src/server/user"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// MCP entry points require an editor role even for tools that do not access reports.
func TestMCPEditorAccess(t *testing.T) {
	for _, role := range []proto.UserRole{proto.UserRole_ROLE_ADMIN, proto.UserRole_ROLE_EDITOR, proto.UserRole_ROLE_VIEWER, proto.UserRole_ROLE_UNSPECIFIED} {
		t.Run(role.String(), func(t *testing.T) {
			t.Setenv("DEKART_CLOUD", "")
			s := Server{}
			ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: "user@example.com"})
			ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{ID: "workspace-1", UserRole: role})
			want := http.StatusForbidden
			if role == proto.UserRole_ROLE_ADMIN || role == proto.UserRole_ROLE_EDITOR {
				want = http.StatusOK
			}
			for _, call := range []bool{false, true} {
				r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":"get_map_config_schema","arguments":{}}`)).WithContext(ctx)
				w := httptest.NewRecorder()
				if call {
					s.HandleMCPCall(w, r)
				} else {
					s.HandleMCPTools(w, r)
				}
				require.Equal(t, want, w.Code, w.Body.String())
				if want == http.StatusForbidden {
					require.Contains(t, w.Body.String(), "Only editors can use GeoSQL in Claude")
				}
			}
		})
	}
	s := Server{}
	for _, handler := range []http.HandlerFunc{s.HandleMCPTools, s.HandleMCPCall} {
		w := httptest.NewRecorder()
		handler(w, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":"get_map_config_schema"}`)))
		require.Equal(t, http.StatusUnauthorized, w.Code)
	}
}

// Token creation rejects viewers before signing or storing a token.
func TestCreateDeviceTokenRejectsViewer(t *testing.T) {
	s := Server{db: workspaceDeleteDatabase(t), userStreams: user.NewStreams()}
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: "viewer@example.com"})
	ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{ID: "workspace-1", UserRole: proto.UserRole_ROLE_VIEWER})
	_, err := s.CreateDeviceToken(ctx, &proto.CreateDeviceTokenRequest{})
	require.Equal(t, codes.PermissionDenied, status.Code(err))
	var count int
	require.NoError(t, s.db.QueryRow(`SELECT count(*) FROM device_auth_log`).Scan(&count))
	require.Zero(t, count)
}

// Subscription restrictions remain per operation, rather than blocking discovery.
func TestMCPPreTrialEditor(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "1")
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: "editor@example.com"})
	ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{ID: "pretrial", UserRole: proto.UserRole_ROLE_EDITOR, ReadOnly: true, ReadOnlyReason: proto.GetWorkspaceResponse_READ_ONLY_REASON_TRIAL_NOT_STARTED})
	s := Server{db: workspaceDeleteDatabase(t), userStreams: user.NewStreams()}
	w := httptest.NewRecorder()
	s.HandleMCPTools(w, httptest.NewRequest(http.MethodGet, "/", nil).WithContext(ctx))
	require.Equal(t, http.StatusOK, w.Code)
	w = httptest.NewRecorder()
	s.HandleMCPCall(w, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":"create_report","arguments":{}}`)).WithContext(ctx))
	require.Equal(t, http.StatusPreconditionFailed, w.Code)
	require.Contains(t, w.Body.String(), "start the 14-day trial")
}

// Every dispatched Cloud call records only identity and tool name, including failed calls.
func TestMCPUsageRecord(t *testing.T) {
	for _, cloud := range []string{"1", ""} {
		t.Run("cloud="+cloud, func(t *testing.T) {
			t.Setenv("DEKART_CLOUD", cloud)
			s := Server{db: workspaceDeleteDatabase(t), userStreams: user.NewStreams()}
			ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: "editor@example.com", DeviceID: "device-1"})
			ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{ID: "workspace-1", UserRole: proto.UserRole_ROLE_EDITOR})
			for _, name := range []string{"get_map_config_schema", "create_connection"} {
				w := httptest.NewRecorder()
				s.HandleMCPCall(w, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":"`+name+`","arguments":{"secret":"do not record"}}`)).WithContext(ctx))
			}
			rows, err := s.db.Query(`SELECT workspace_id,email,event_name,event_data_json FROM track_events`)
			require.NoError(t, err)
			defer rows.Close()
			var names []string
			for rows.Next() {
				var workspace, email, event, payload string
				require.NoError(t, rows.Scan(&workspace, &email, &event, &payload))
				require.Equal(t, "workspace-1", workspace)
				require.Equal(t, "editor@example.com", email)
				require.Equal(t, "MCPToolCall", event)
				var data map[string]string
				require.NoError(t, json.Unmarshal([]byte(payload), &data))
				require.Len(t, data, 2)
				require.Equal(t, "device-1", data["device_id"])
				names = append(names, data["tool_name"])
			}
			require.NoError(t, rows.Err())
			if cloud != "" {
				require.Equal(t, []string{"get_map_config_schema", "create_connection"}, names)
			} else {
				require.Empty(t, names)
			}
		})
	}
}

// Auth-disabled local requests receive the default admin role through the normal context setup.
func TestMCPLocalWithoutAuth(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "")
	s := Server{}
	check := user.NewClaimsCheck(user.ClaimsCheckConfig{}, nil)
	r := httptest.NewRequest(http.MethodPost, "/api/v1/mcp/call", strings.NewReader(`{"name":"get_map_config_schema","arguments":{}}`))
	ctx := s.SetWorkspaceContext(check.GetContext(r), r)
	w := httptest.NewRecorder()
	s.HandleMCPCall(w, r.WithContext(ctx))
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
}

// A bearer stays valid after demotion, but its workspace role must be read again on every request.
func TestMCPDeviceTokenDemotion(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "1")
	t.Setenv("DEKART_SQLITE", "1")
	t.Setenv("DEKART_DEVICE_AUTH_PRIVATE_KEY", "")
	t.Setenv("DEKART_DEVICE_AUTH_PUBLIC_KEY", "")
	db := workspaceDeleteDatabase(t)
	_, err := jwtkeys.EnsureBootstrapKeyInMemory(context.Background(), db)
	require.NoError(t, err)
	_, err = db.Exec(`INSERT INTO workspaces(id,name) VALUES('token-workspace','Token workspace');
 INSERT INTO workspace_log(id,workspace_id,email,status,authored_by,role,created_at)
 VALUES('editor','token-workspace','editor@example.com',1,'editor@example.com',2,'2026-01-01');
 INSERT INTO subscription_log(workspace_id,plan_type,authored_by,trial_ends_at)
 VALUES('token-workspace',6,'editor@example.com','2020-01-01');`)
	require.NoError(t, err)
	s := Server{db: db, userStreams: user.NewStreams()}
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: "editor@example.com", WorkspaceID: "token-workspace"})
	ctx = s.SetWorkspaceContext(ctx, nil)
	token, err := s.CreateDeviceToken(ctx, &proto.CreateDeviceTokenRequest{})
	require.NoError(t, err)
	check := user.NewClaimsCheck(user.ClaimsCheckConfig{RequireGoogleOAuth: true, GoogleOAuthClientId: "test", GoogleOAuthSecret: "test"}, db)
	for _, role := range []proto.UserRole{proto.UserRole_ROLE_EDITOR, proto.UserRole_ROLE_VIEWER} {
		if role == proto.UserRole_ROLE_VIEWER {
			_, err := db.Exec(`INSERT INTO workspace_log(id,workspace_id,email,status,authored_by,role,created_at)
   VALUES('demotion','token-workspace','editor@example.com',3,'editor@example.com',3,'2026-01-02')`)
			require.NoError(t, err)
		}
		for _, handler := range []http.HandlerFunc{s.HandleMCPTools, s.HandleMCPCall} {
			r := httptest.NewRequest(http.MethodPost, "/api/v1/mcp/call", strings.NewReader(`{"name":"get_map_config_schema","arguments":{}}`))
			r.Header.Set("Authorization", "Bearer "+token.Token)
			requestCtx := s.SetWorkspaceContext(check.GetContext(r), r)
			require.NotNil(t, user.GetClaims(requestCtx), "demotion must be checked independently of token validity")
			w := httptest.NewRecorder()
			handler(w, r.WithContext(requestCtx))
			want := http.StatusOK
			if role == proto.UserRole_ROLE_VIEWER {
				want = http.StatusForbidden
			}
			require.Equal(t, want, w.Code, w.Body.String())
		}
	}
}
