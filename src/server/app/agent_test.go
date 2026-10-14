package app

import (
	"bufio"
	"context"
	"dekart/src/proto"
	"dekart/src/server/dekart"
	"dekart/src/server/user"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// agentTestServer uses the production route and real HTTP deadline support.
func agentTestServer(t *testing.T, claims *user.Claims, workspace user.WorkspaceInfo) *httptest.Server {
	t.Helper()
	router := configureHTTP(&dekart.Server{}, user.ClaimsCheck{})
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := context.WithValue(r.Context(), user.ContextKey, claims)
		router.ServeHTTP(w, r.WithContext(user.SetWorkspaceCtx(ctx, workspace)))
	}))
	server.Config.WriteTimeout = 65 * time.Second
	server.Start()
	t.Cleanup(server.Close)
	return server
}

// TestAgentChatForwarding covers identity isolation, errors, and unchanged SSE payloads.
func TestAgentChatForwarding(t *testing.T) {
	for _, test := range []struct {
		name    string
		role    proto.UserRole
		claims  bool
		enabled bool
		status  int
	}{
		{"editor", proto.UserRole_ROLE_EDITOR, true, true, 200},
		{"admin", proto.UserRole_ROLE_ADMIN, true, true, 200},
		{"viewer", proto.UserRole_ROLE_VIEWER, true, true, 403},
		{"removed member", proto.UserRole_ROLE_UNSPECIFIED, true, true, 403},
		{"unauthenticated", proto.UserRole_ROLE_EDITOR, false, true, 401},
		{"disabled", proto.UserRole_ROLE_EDITOR, true, false, 404},
	} {
		t.Run(test.name, func(t *testing.T) {
			called := false
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				called = true
				body, _ := io.ReadAll(r.Body)
				if r.URL.Path != "/chat" || r.Method != "POST" || string(body) != `{"message":"hello","session_id":"session"}` {
					t.Errorf("wrong upstream request: %s %s %s", r.Method, r.URL.Path, body)
				}
				if r.Header.Get("X-Dekart-User-Email") != "editor@example.com" || r.Header.Get("X-Dekart-User-Token") != "verified-token" || r.Header.Get("X-Dekart-User-Role") != map[proto.UserRole]string{proto.UserRole_ROLE_EDITOR: "Editor", proto.UserRole_ROLE_ADMIN: "Admin"}[test.role] {
					t.Error("caller identity not forwarded")
				}
				if r.Header.Get("Authorization") != "" {
					t.Error("unexpected authorization forwarded")
				}
				w.Header().Set("Content-Type", "text/event-stream")
				fmt.Fprint(w, ": keepalive\n\nevent: text\ndata: {\"delta\":\"hi\"}\n\n")
			}))
			defer upstream.Close()
			agentURL := upstream.URL
			if !test.enabled {
				agentURL = ""
			}
			t.Setenv("DEKART_AGENT_URL", agentURL)
			var claims *user.Claims
			if test.claims {
				claims = &user.Claims{Email: "editor@example.com"}
			}
			server := agentTestServer(t, claims, user.WorkspaceInfo{ID: "workspace", UserRole: test.role})
			req, _ := http.NewRequest("POST", server.URL+"/api/v1/agent/chat", strings.NewReader(`{"message":"hello","session_id":"session"}`))
			req.Header.Set("Authorization", "Bearer verified-token")
			req.Header.Set("X-Dekart-User-Email", "attacker@example.com")
			resp, err := server.Client().Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			body, _ := io.ReadAll(resp.Body)
			if resp.StatusCode != test.status {
				t.Fatalf("status=%d body=%s", resp.StatusCode, body)
			}
			if test.status == 200 && (resp.Header.Get("Content-Type") != "text/event-stream" || string(body) != ": keepalive\n\nevent: text\ndata: {\"delta\":\"hi\"}\n\n") {
				t.Fatalf("stream changed: %s", body)
			}
			if test.status != 200 && called {
				t.Fatal("rejected request reached agent")
			}
		})
	}
}

// TestAgentChatUnavailable returns a browser-readable JSON error before a stream starts.
func TestAgentChatUnavailable(t *testing.T) {
	upstream := httptest.NewServer(http.NotFoundHandler())
	upstream.Close()
	t.Setenv("DEKART_AGENT_URL", upstream.URL)
	server := agentTestServer(t, &user.Claims{Email: "editor@example.com"}, user.WorkspaceInfo{ID: "workspace", UserRole: proto.UserRole_ROLE_EDITOR})
	req, _ := http.NewRequest("POST", server.URL+"/api/v1/agent/chat", strings.NewReader(`{"message":"hi"}`))
	req.Header.Set("Authorization", "Bearer verified-token")
	resp, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 502 || !strings.HasPrefix(resp.Header.Get("Content-Type"), "application/json") || !strings.Contains(string(body), `"error"`) {
		t.Fatalf("status=%d type=%s body=%s", resp.StatusCode, resp.Header.Get("Content-Type"), body)
	}
}

// TestAgentChatAppCORS permits browser preflight for the configured demo app.
func TestAgentChatAppCORS(t *testing.T) {
	t.Setenv("DEKART_AGENT_URL", "http://unused")
	t.Setenv("DEKART_APP_URL", "https://dekart.example")
	original := allowedOrigin
	allowedOrigin = "https://chat.example"
	t.Cleanup(func() { allowedOrigin = original })
	server := agentTestServer(t, nil, user.WorkspaceInfo{})
	req, _ := http.NewRequest("OPTIONS", server.URL+"/api/v1/agent/chat", nil)
	req.Header.Set("Origin", "https://chat.example")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "Authorization, Content-Type")
	resp, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 || resp.Header.Get("Access-Control-Allow-Origin") != "https://chat.example" || !strings.Contains(resp.Header.Get("Access-Control-Allow-Headers"), "Authorization") {
		t.Fatalf("preflight rejected: %d %v", resp.StatusCode, resp.Header)
	}
}

// TestAgentChatKeepalives outlasts the server's 65-second absolute write timeout.
func TestAgentChatKeepalives(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		for index := 0; index < 6; index++ {
			select {
			case <-r.Context().Done():
				return
			case <-time.After(15 * time.Second):
			}
			fmt.Fprint(w, ": keepalive\n\n")
			http.NewResponseController(w).Flush()
		}
		select {
		case <-r.Context().Done():
		case <-time.After(10 * time.Second):
		}
	}))
	defer upstream.Close()
	t.Setenv("DEKART_AGENT_URL", upstream.URL)
	server := agentTestServer(t, &user.Claims{Email: "editor@example.com"}, user.WorkspaceInfo{ID: "workspace", UserRole: proto.UserRole_ROLE_EDITOR})
	start := time.Now()
	req, _ := http.NewRequest("POST", server.URL+"/api/v1/agent/chat", strings.NewReader(`{"message":"hi"}`))
	req.Header.Set("Authorization", "Bearer verified-token")
	resp, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("status=%d", resp.StatusCode)
	}
	scanner := bufio.NewScanner(resp.Body)
	count := 0
	for scanner.Scan() {
		if scanner.Text() == ": keepalive" {
			count++
			if elapsed := time.Since(start); elapsed < time.Duration(count)*15*time.Second-time.Second || elapsed > time.Duration(count)*15*time.Second+5*time.Second {
				t.Fatalf("keepalive %d buffered until %s", count, elapsed)
			}
		}
	}
	if scanner.Err() != nil || count != 6 || time.Since(start) < 100*time.Second {
		t.Fatalf("stream ended: count=%d elapsed=%s error=%v", count, time.Since(start), scanner.Err())
	}
}

// TestAgentChatRequiresMemberAccess rejects incomplete credentials and read-only membership.
func TestAgentChatRequiresMemberAccess(t *testing.T) {
	t.Setenv("DEKART_AGENT_URL", "http://127.0.0.1:1")
	for _, test := range []struct {
		name, email, workspace, bearer string
		readOnly                       bool
		status                         int
	}{
		{"no workspace", "editor@example.com", "", "Bearer token", false, 403},
		{"anonymous", user.UnknownEmail, "workspace", "Bearer token", false, 401},
		{"read only", "editor@example.com", "workspace", "Bearer token", true, 403},
		{"no bearer", "editor@example.com", "workspace", "", false, 401},
	} {
		t.Run(test.name, func(t *testing.T) {
			server := agentTestServer(t, &user.Claims{Email: test.email}, user.WorkspaceInfo{ID: test.workspace, UserRole: proto.UserRole_ROLE_EDITOR, ReadOnly: test.readOnly})
			req, _ := http.NewRequest("POST", server.URL+"/api/v1/agent/chat", strings.NewReader(`{"message":"hi"}`))
			req.Header.Set("Authorization", test.bearer)
			resp, err := server.Client().Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != test.status {
				t.Fatalf("status=%d", resp.StatusCode)
			}
		})
	}
}

// TestAgentChatALBRequiresVerifiedDeviceBearer refuses a proxy identity paired with an unrelated token.
func TestAgentChatALBRequiresVerifiedDeviceBearer(t *testing.T) {
	t.Setenv("DEKART_REQUIRE_AMAZON_OIDC", "1")
	t.Setenv("DEKART_AGENT_URL", "http://127.0.0.1:1")
	server := agentTestServer(t, &user.Claims{Email: "editor@example.com"}, user.WorkspaceInfo{ID: "workspace", UserRole: proto.UserRole_ROLE_EDITOR})
	req, _ := http.NewRequest("POST", server.URL+"/api/v1/agent/chat", strings.NewReader(`{"message":"hi"}`))
	req.Header.Set("Authorization", "Bearer unverified")
	response, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != 401 {
		t.Fatalf("unverified bearer status=%d", response.StatusCode)
	}
}
