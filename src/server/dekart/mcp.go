package dekart

import (
	"context"
	"dekart/src/proto"
	device "dekart/src/server/deviceauth"
	"dekart/src/server/mcp"
	"dekart/src/server/mcpschema"
	"dekart/src/server/reportsnapshot"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"google.golang.org/grpc/status"
)

type mcpTool struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

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

// HandleMCPTools returns available MCP tool definitions for agent discovery.
func (s *Server) HandleMCPTools(w http.ResponseWriter, r *http.Request) {
	_ = s
	writeJSON(w, http.StatusOK, mcpToolsResponse{Tools: mcpToolDefinitions()})
}

// HandleMCPCall executes one MCP tool call and returns structured result payload.
func (s *Server) HandleMCPCall(w http.ResponseWriter, r *http.Request) {
	request := &mcpCallRequest{}
	if err := decodeJSONBody(r, request); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(request.Name) == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	result, err := s.callMCPTool(r.Context(), request)
	if err != nil {
		writeMCPCallError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, mcpCallResponse{Result: result})
}

// callMCPTool dispatches one named MCP tool to existing RPC/upload handlers.
func (s *Server) callMCPTool(ctx context.Context, request *mcpCallRequest) (json.RawMessage, error) {
	switch request.Name {
	case "create_report":
		return s.callCreateReportTool(ctx)
	case "create_dataset":
		return s.callCreateDatasetTool(ctx, request.Arguments)
	case "remove_dataset":
		return s.callRemoveDatasetTool(ctx, request.Arguments)
	case "create_file":
		return s.callCreateFileTool(ctx, request.Arguments)
	case "create_report_snapshot":
		return s.callCreateReportSnapshotTool(ctx, request.Arguments)
	case "start_file_upload_session":
		return s.callStartFileUploadSessionTool(ctx, request.Arguments)
	case "complete_file_upload_session":
		return s.callCompleteFileUploadSessionTool(ctx, request.Arguments)
	case "abort_file_upload_session":
		return s.callAbortFileUploadSessionTool(ctx, request.Arguments)
	default:
		return nil, fmt.Errorf("unknown tool: %s", request.Name)
	}
}

// callCreateReportTool creates a new report and returns CreateReportResponse JSON.
func (s *Server) callCreateReportTool(ctx context.Context) (json.RawMessage, error) {
	response, err := s.CreateReport(ctx, &proto.CreateReportRequest{})
	if err != nil {
		return nil, err
	}
	return mcp.MarshalJSON(buildMCPCreateReportResult(response.GetReport().GetId()))
}

// callCreateDatasetTool creates one dataset for report_id.
func (s *Server) callCreateDatasetTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	request := &proto.CreateDatasetRequest{}
	if err := mcp.DecodeProtoArgs(raw, request); err != nil {
		return nil, err
	}
	response, err := s.CreateDataset(ctx, request)
	if err != nil {
		return nil, err
	}
	return mcp.MarshalProtoJSON(response)
}

// callRemoveDatasetTool removes one dataset by dataset_id.
func (s *Server) callRemoveDatasetTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	request := &proto.RemoveDatasetRequest{}
	if err := mcp.DecodeProtoArgs(raw, request); err != nil {
		return nil, err
	}
	response, err := s.RemoveDataset(ctx, request)
	if err != nil {
		return nil, err
	}
	return mcp.MarshalProtoJSON(response)
}

// callCreateFileTool creates file entry for dataset_id and optional connection_id.
func (s *Server) callCreateFileTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	request := &proto.CreateFileRequest{}
	if err := mcp.DecodeProtoArgs(raw, request); err != nil {
		return nil, err
	}
	response, err := s.CreateFile(ctx, request)
	if err != nil {
		return nil, err
	}
	return mcp.MarshalProtoJSON(response)
}

// callCreateReportSnapshotTool calls snapshot RPC and returns protojson response payload.
func (s *Server) callCreateReportSnapshotTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	request := &proto.CreateReportSnapshotRequest{}
	if err := mcp.DecodeProtoArgs(raw, request); err != nil {
		return nil, err
	}
	response, err := s.CreateReportSnapshot(ctx, request)
	if err != nil {
		return nil, err
	}
	return mcp.MarshalProtoJSON(response)
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

// writeMCPCallError maps tool call errors to HTTP responses for MCP clients.
func writeMCPCallError(w http.ResponseWriter, err error) {
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

// buildMCPCreateReportResult builds MCP create_report payload with path/url helpers for agents.
func buildMCPCreateReportResult(reportID string) map[string]any {
	reportPath := fmt.Sprintf("/reports/%s", reportID)
	result := map[string]any{
		"report": map[string]any{
			"id": reportID,
		},
		"report_path": reportPath,
	}
	frontendBaseURL := device.RequestFrontendBaseURL(nil)
	if frontendBaseURL != "" {
		result["report_url"] = fmt.Sprintf("%s%s", frontendBaseURL, reportPath)
	}
	return result
}

// mcpToolDefinitions returns the current MCP tools and their input schemas.
func mcpToolDefinitions() []mcpTool {
	tools := []mcpTool{
		{
			Name:        "create_report",
			Description: "Create a new report in current workspace context.",
			InputSchema: mcpschema.Object(nil, map[string]any{}),
		},
		{
			Name:        "create_dataset",
			Description: "Add one dataset to existing report.",
			InputSchema: mcpschema.ForProto(&proto.CreateDatasetRequest{}, []string{"report_id"}),
		},
		{
			Name:        "remove_dataset",
			Description: "Remove one dataset by dataset_id.",
			InputSchema: mcpschema.ForProto(&proto.RemoveDatasetRequest{}, []string{"dataset_id"}),
		},
		{
			Name:        "create_file",
			Description: "Create file metadata entry for a dataset.",
			InputSchema: mcpschema.ForProto(&proto.CreateFileRequest{}, []string{"dataset_id"}),
		},
	}
	if reportsnapshot.IsEnabled() {
		tools = append(tools, mcpTool{
			Name:        "create_report_snapshot",
			Description: "Create one short-lived URL for report snapshot rendering.",
			InputSchema: mcpschema.ForProto(&proto.CreateReportSnapshotRequest{}, []string{"report_id"}),
		})
	}
	return append(tools, mcpUploadToolDefinitions()...)
}
