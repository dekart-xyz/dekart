package dekart

import (
	"bufio"
	"dekart/src/proto"
	"dekart/src/server/user"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
)

// HandleAgentChat forwards an authenticated member's turn and flushes each SSE line.
func (s *Server) HandleAgentChat(w http.ResponseWriter, r *http.Request) {
	claims := user.GetClaims(r.Context())
	// The agent acts as a signed-in member, including on otherwise anonymous instances.
	if claims == nil || claims.Email == "" || claims.Email == user.UnknownEmail {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}
	workspace := user.CheckWorkspaceCtx(r.Context())
	// Only a resolved workspace grants access to the agent.
	if workspace.ID == "" {
		http.Error(w, "Workspace not found", http.StatusForbidden)
		return
	}
	// Only current editors and admins may create the reports used in a turn.
	if workspace.UserRole != proto.UserRole_ROLE_EDITOR && workspace.UserRole != proto.UserRole_ROLE_ADMIN {
		http.Error(w, "Only admins and editors can use the agent", http.StatusForbidden)
		return
	}
	// Read-only workspaces cannot create the reports used by an agent turn.
	if err := requireWorkspaceWrite(r.Context()); err != nil {
		writeGrpcErrorAsHTTP(w, err, "agent chat")
		return
	}
	bearer := strings.Fields(r.Header.Get("Authorization"))
	// The agent needs the verified bearer to run CLI commands as this member.
	if len(bearer) != 2 || !strings.EqualFold(bearer[0], "Bearer") {
		http.Error(w, "Bearer token required", http.StatusUnauthorized)
		return
	}
	// ALB proxy identity does not verify caller-supplied bearer tokens.
	if os.Getenv("DEKART_REQUIRE_AMAZON_OIDC") == "1" && claims.DeviceToken != bearer[1] {
		http.Error(w, "Verified device bearer required", http.StatusUnauthorized)
		return
	}
	request, err := http.NewRequestWithContext(r.Context(), http.MethodPost,
		strings.TrimRight(os.Getenv("DEKART_AGENT_URL"), "/")+"/chat", r.Body)
	if err != nil {
		writeAgentUnavailable(w)
		return
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Dekart-User-Email", claims.Email)
	request.Header.Set("X-Dekart-User-Token", bearer[1])
	role := "Editor"
	if workspace.UserRole == proto.UserRole_ROLE_ADMIN {
		role = "Admin"
	}
	request.Header.Set("X-Dekart-User-Role", role)
	// Redirects must not carry the caller's credential to another service.
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Do(request)
	if err != nil {
		writeAgentUnavailable(w)
		return
	}
	defer response.Body.Close()
	w.Header().Set("Content-Type", response.Header.Get("Content-Type"))
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(response.StatusCode)
	reader := bufio.NewReader(response.Body)
	controller := http.NewResponseController(w)
	for {
		line, readErr := reader.ReadBytes('\n')
		// Keep comments and blank lines intact so idle traffic reaches the browser immediately.
		if len(line) > 0 {
			if _, err := w.Write(line); err != nil {
				return
			}
			if err := controller.Flush(); err != nil {
				return
			}
		}
		if readErr != nil {
			// A truncated stream must not appear to the browser as successful completion.
			if readErr != io.EOF {
				panic(http.ErrAbortHandler)
			}
			return
		}
	}
}

// writeAgentUnavailable returns JSON before any streaming headers have been sent.
func writeAgentUnavailable(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadGateway)
	json.NewEncoder(w).Encode(map[string]string{"error": "Agent unavailable"})
}
