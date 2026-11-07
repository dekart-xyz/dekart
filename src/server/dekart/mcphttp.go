// REVIEW: Keep request handling and error responses together so access checks stay visible at the endpoint.
package dekart

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/user"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/Masterminds/semver/v3"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const minimumCLIVersion = "0.22.0"

type mcpToolsResponse struct {
	Tools []mcpTool `json:"tools"`
}

type mcpCallRequest struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

type mcpCallResponse struct {
	Result any `json:"result"`
}

type mcpValidationErrorResponse struct {
	Error  string                     `json:"error"`
	Issues []mapConfigValidationIssue `json:"issues"`
}

type mcpCredentialErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
	Hint    string `json:"hint"`
}

type mcpCredentialError struct {
	statusCode int
	response   mcpCredentialErrorResponse
}

// Error returns a credential error without including the credential value.
func (e *mcpCredentialError) Error() string {
	return e.response.Message
}

// HandleCreateReport wraps CreateReport RPC with protojson HTTP endpoint.
func (s *Server) HandleCreateReport(w http.ResponseWriter, r *http.Request) {
	request := &proto.CreateReportRequest{}
	if err := readProtoJSON(r, request); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	response, err := s.CreateReport(r.Context(), request)
	if err != nil {
		writeGrpcErrorAsHTTP(w, err, "create report")
		return
	}
	writeProtoJSON(w, http.StatusOK, response)
}

// HandleCreateDataset wraps CreateDataset RPC with protojson HTTP endpoint.
func (s *Server) HandleCreateDataset(w http.ResponseWriter, r *http.Request) {
	request := &proto.CreateDatasetRequest{}
	if err := readProtoJSON(r, request); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	response, err := s.CreateDataset(r.Context(), request)
	if err != nil {
		writeGrpcErrorAsHTTP(w, err, "create dataset")
		return
	}
	writeProtoJSON(w, http.StatusOK, response)
}

// HandleCreateFile wraps CreateFile RPC with protojson HTTP endpoint.
func (s *Server) HandleCreateFile(w http.ResponseWriter, r *http.Request) {
	request := &proto.CreateFileRequest{}
	if err := readProtoJSON(r, request); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	response, err := s.CreateFile(r.Context(), request)
	if err != nil {
		writeGrpcErrorAsHTTP(w, err, "create file")
		return
	}
	writeProtoJSON(w, http.StatusOK, response)
}

// requireMCPEditor checks workspace role without blocking subscription-limited discovery.
func requireMCPEditor(ctx context.Context) error {
	if user.GetClaims(ctx) == nil {
		return Unauthenticated
	}
	role := checkWorkspace(ctx).UserRole
	// Only explicit editor and admin membership grants access to the agent tools.
	if role != proto.UserRole_ROLE_ADMIN && role != proto.UserRole_ROLE_EDITOR {
		return status.Error(codes.PermissionDenied, "Only editors can use GeoSQL in Claude")
	}
	return nil
}

// HandleMCPTools returns available MCP tool definitions for agent discovery.
func (s *Server) HandleMCPTools(w http.ResponseWriter, r *http.Request) {
	if err := requireMCPEditor(r.Context()); err != nil {
		writeMCPCallError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, mcpToolsResponse{Tools: mcpToolDefinitions()})
}

// HandleMCPCall executes one MCP tool call and returns structured result payload.
func (s *Server) HandleMCPCall(w http.ResponseWriter, r *http.Request) {
	if err := requireMCPEditor(r.Context()); err != nil {
		writeMCPCallError(w, err)
		return
	}
	// Old CLI versions cannot execute statement-attached HTTP sources.
	if agent := r.UserAgent(); strings.HasPrefix(agent, "dekart-cli/") {
		version, err := semver.StrictNewVersion(strings.TrimPrefix(agent, "dekart-cli/"))
		if err == nil && version.LessThan(semver.MustParse(minimumCLIVersion)) {
			http.Error(w, "Update GeoSQL and the Dekart CLI: pip install --upgrade geosql dekart", http.StatusPreconditionFailed)
			return
		}
	}
	request := &mcpCallRequest{}
	if err := decodeJSONBody(r, request); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(request.Name) == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	ctx := user.WithMCPGoogleAccessTokenHeader(r.Context(), r.Header.Get(user.MCPGoogleAccessTokenHeader))
	// Track dispatched calls without including arguments or tool results.
	data, _ := json.Marshal(map[string]string{
		"device_id": user.GetClaims(ctx).DeviceID,
		"tool_name": request.Name,
	})
	_, _ = s.TrackEvent(ctx, &proto.TrackEventRequest{
		EventName: "MCPToolCall", EventDataJson: string(data),
	})
	result, err := s.callMCPTool(ctx, request)
	if err != nil {
		writeMCPCallError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, mcpCallResponse{Result: result})
}

// decodeJSONBody decodes request body JSON into target struct.
func decodeJSONBody(r *http.Request, target any) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	return nil
}

// writeJSON writes a JSON HTTP response with provided status code.
func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}

// newMCPGoogleCredentialError maps delegated Google auth failures to agent guidance.
func newMCPGoogleCredentialError(err error) *mcpCredentialError {
	credentialErr := &mcpCredentialError{
		statusCode: http.StatusServiceUnavailable,
		response: mcpCredentialErrorResponse{
			Error:   "google_token_validation_unavailable",
			Message: "Google access token could not be validated",
			Hint:    "Retry later.",
		},
	}
	switch {
	case errors.Is(err, user.ErrMCPGoogleAccessTokenMissing):
		credentialErr.statusCode = http.StatusPreconditionFailed
		credentialErr.response = mcpCredentialErrorResponse{
			Error:   "bigquery_passthrough_auth_required",
			Message: "BigQuery passthrough requires local gcloud authorization",
			Hint:    "Upgrade Dekart CLI to a version that supports BigQuery passthrough, then run `dekart init` and follow the gcloud setup prompts.",
		}
	case errors.Is(err, user.ErrMCPGoogleAccessTokenInvalid):
		credentialErr.statusCode = http.StatusUnauthorized
		credentialErr.response = mcpCredentialErrorResponse{
			Error:   "google_access_token_invalid",
			Message: "Google access token is invalid or expired",
			Hint:    "Retry once, then run `gcloud auth login --account <your Dekart email>` if the token is still rejected.",
		}
	case errors.Is(err, user.ErrMCPGoogleAccountMismatch):
		credentialErr.statusCode = http.StatusForbidden
		credentialErr.response = mcpCredentialErrorResponse{
			Error:   "google_account_mismatch",
			Message: "Google account does not match the Dekart account",
			Hint:    "Select the same Google account as Dekart, then run `dekart init` again.",
		}
	case errors.Is(err, user.ErrMCPGooglePrincipalUnsupported):
		credentialErr.statusCode = http.StatusForbidden
		credentialErr.response = mcpCredentialErrorResponse{
			Error:   "google_principal_unsupported",
			Message: "Google service-account principals are not supported for passthrough",
			Hint:    "Use a normal Google user account.",
		}
	case errors.Is(err, user.ErrMCPGoogleScopeInsufficient):
		credentialErr.statusCode = http.StatusForbidden
		credentialErr.response = mcpCredentialErrorResponse{
			Error:   "google_scope_insufficient",
			Message: "Google access token does not include the cloud-platform scope",
			Hint:    "Run `gcloud auth login` for the Dekart account, then try again.",
		}
	}
	return credentialErr
}

// writeMCPCallError maps tool call errors to HTTP responses for MCP clients.
func writeMCPCallError(w http.ResponseWriter, err error) {
	var widgetsValidationErr *widgetsConfigValidationError
	if errors.As(err, &widgetsValidationErr) {
		writeJSON(w, http.StatusBadRequest, mcpValidationErrorResponse{
			Error:  "widgets_config_validation_failed",
			Issues: widgetsValidationErr.Issues,
		})
		return
	}
	var validationErr *mapConfigValidationError
	if errors.As(err, &validationErr) {
		writeJSON(w, http.StatusBadRequest, mcpValidationErrorResponse{
			Error:  "map_config_validation_failed",
			Issues: validationErr.Issues,
		})
		return
	}
	var credentialErr *mcpCredentialError
	if errors.As(err, &credentialErr) {
		writeJSON(w, credentialErr.statusCode, credentialErr.response)
		return
	}
	var httpErr *mcpHTTPError
	if errors.As(err, &httpErr) {
		http.Error(w, httpErr.message, httpErr.statusCode)
		return
	}
	if _, ok := status.FromError(err); ok {
		writeGrpcErrorAsHTTP(w, err, "mcp tool call")
		return
	}
	http.Error(w, err.Error(), http.StatusBadRequest)
}
