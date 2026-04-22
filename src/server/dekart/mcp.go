package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	device "dekart/src/server/deviceauth"
	"dekart/src/server/mcp"
	"dekart/src/server/mcpschema"
	"dekart/src/server/reportsnapshot"
	"dekart/src/server/user"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type mcpTool struct {
	Name          string         `json:"name"`
	Description   string         `json:"description"`
	InputSchema   map[string]any `json:"inputSchema"`
	WhenToUse     string         `json:"when_to_use,omitempty"`
	WhenNotToUse  string         `json:"when_not_to_use,omitempty"`
	SideEffects   []string       `json:"side_effects,omitempty"`
	ExampleInput  map[string]any `json:"example_input,omitempty"`
	NextTools     []string       `json:"next_tools,omitempty"`
	ReferenceDocs []string       `json:"reference_docs,omitempty"`
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
	case "update_report_title":
		return s.callUpdateReportTitleTool(ctx, request.Arguments)
	case "update_report_map_config":
		return s.callUpdateReportMapConfigTool(ctx, request.Arguments)
	case "update_dataset_name":
		return s.callUpdateDatasetNameTool(ctx, request.Arguments)
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

// callUpdateReportTitleTool updates report title while keeping existing map config and params.
func (s *Server) callUpdateReportTitleTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	request := &proto.UpdateReportTitleRequest{}
	if err := mcp.DecodeProtoArgs(raw, request); err != nil {
		return nil, err
	}
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	workspaceInfo := checkWorkspace(ctx)
	if workspaceInfo.Expired {
		return nil, status.Error(codes.PermissionDenied, "workspace is read-only")
	}
	if _, err := uuid.Parse(request.ReportId); err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	updatedAt := time.Now()
	newVersionID := newUUID()
	var (
		result sql.Result
		err    error
	)
	if workspaceInfo.IsPlayground {
		result, err = s.db.ExecContext(ctx,
			`update
			reports
		set title=$1, updated_at=$2, version_id=$3
		where id=$4 and author_email=$5 and is_playground=true`,
			request.Title,
			updatedAt,
			newVersionID,
			request.ReportId,
			claims.Email,
		)
	} else {
		result, err = s.db.ExecContext(ctx,
			`update
			reports
		set title=$1, updated_at=$2, version_id=$3
		where id=$4 and (author_email=$5 or allow_edit) and workspace_id=$6`,
			request.Title,
			updatedAt,
			newVersionID,
			request.ReportId,
			claims.Email,
			workspaceInfo.ID,
		)
	}
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	affectedRows, err := result.RowsAffected()
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if affectedRows == 0 {
		return nil, status.Error(codes.NotFound, fmt.Sprintf("report not found id:%s", request.ReportId))
	}
	if err := s.createReportSnapshotWithVersionID(ctx, newVersionID, request.ReportId, claims.Email, proto.ReportSnapshot_TRIGGER_TYPE_REPORT_CHANGE); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.reportStreams.Ping(request.ReportId)
	return mcp.MarshalProtoJSON(&proto.UpdateReportTitleResponse{UpdatedAt: updatedAt.Unix()})
}

// callUpdateReportMapConfigTool updates report map config while keeping existing title and params.
func (s *Server) callUpdateReportMapConfigTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	request := &proto.UpdateReportMapConfigRequest{}
	if err := mcp.DecodeProtoArgs(raw, request); err != nil {
		return nil, err
	}
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	workspaceInfo := checkWorkspace(ctx)
	if workspaceInfo.Expired {
		return nil, status.Error(codes.PermissionDenied, "workspace is read-only")
	}
	if _, err := uuid.Parse(request.ReportId); err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	if len(request.MapConfig) > MaxMapConfigSize {
		return nil, status.Errorf(codes.InvalidArgument,
			"Map configuration is too large (%d bytes). Maximum allowed size is %d bytes. Please simplify your map configuration.",
			len(request.MapConfig), MaxMapConfigSize)
	}
	updatedAt := time.Now()
	newVersionID := newUUID()
	var (
		result sql.Result
		err    error
	)
	if workspaceInfo.IsPlayground {
		result, err = s.db.ExecContext(ctx,
			`update
			reports
		set map_config=$1, updated_at=$2, version_id=$3
		where id=$4 and author_email=$5 and is_playground=true`,
			request.MapConfig,
			updatedAt,
			newVersionID,
			request.ReportId,
			claims.Email,
		)
	} else {
		result, err = s.db.ExecContext(ctx,
			`update
			reports
		set map_config=$1, updated_at=$2, version_id=$3
		where id=$4 and (author_email=$5 or allow_edit) and workspace_id=$6`,
			request.MapConfig,
			updatedAt,
			newVersionID,
			request.ReportId,
			claims.Email,
			workspaceInfo.ID,
		)
	}
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	affectedRows, err := result.RowsAffected()
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if affectedRows == 0 {
		return nil, status.Error(codes.NotFound, fmt.Sprintf("report not found id:%s", request.ReportId))
	}
	if err := s.createReportSnapshotWithVersionID(ctx, newVersionID, request.ReportId, claims.Email, proto.ReportSnapshot_TRIGGER_TYPE_REPORT_CHANGE); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.reportStreams.Ping(request.ReportId)
	return mcp.MarshalProtoJSON(&proto.UpdateReportMapConfigResponse{UpdatedAt: updatedAt.Unix()})
}

// callUpdateDatasetNameTool updates one dataset name by dataset_id.
func (s *Server) callUpdateDatasetNameTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	request := &proto.UpdateDatasetNameRequest{}
	if err := mcp.DecodeProtoArgs(raw, request); err != nil {
		return nil, err
	}
	response, err := s.UpdateDatasetName(ctx, request)
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
			Name:         "create_report",
			Description:  "Create a new report in current workspace context.",
			InputSchema:  mcpschema.Object(nil, map[string]any{}),
			WhenToUse:    "Use at the start of a new map workflow when no report exists yet.",
			WhenNotToUse: "Do not use when you already have a target report_id and only need to edit it.",
			SideEffects:  []string{"write"},
			ExampleInput: map[string]any{},
			NextTools:    []string{"create_dataset", "update_report_title", "create_report_snapshot"},
		},
		{
			Name:         "create_dataset",
			Description:  "Add one dataset to existing report.",
			InputSchema:  mcpschema.ForProto(&proto.CreateDatasetRequest{}, []string{"report_id"}),
			WhenToUse:    "Use after create_report (or on an existing report) to create a dataset slot.",
			WhenNotToUse: "Do not use when you want to rename or remove an existing dataset.",
			SideEffects:  []string{"write"},
			ExampleInput: map[string]any{
				"report_id": "00000000-0000-0000-0000-000000000000",
			},
			NextTools: []string{"create_file", "update_dataset_name", "remove_dataset"},
		},
		{
			Name:         "remove_dataset",
			Description:  "Remove one dataset by dataset_id.",
			InputSchema:  mcpschema.ForProto(&proto.RemoveDatasetRequest{}, []string{"dataset_id"}),
			WhenToUse:    "Use to delete a dataset that should no longer appear in a report.",
			WhenNotToUse: "Do not use for temporary hide/visibility changes in map config.",
			SideEffects:  []string{"delete"},
			ExampleInput: map[string]any{
				"dataset_id": "00000000-0000-0000-0000-000000000000",
			},
			NextTools: []string{"create_dataset", "update_report_map_config"},
		},
		{
			Name:         "create_file",
			Description:  "Create file metadata entry for a dataset.",
			InputSchema:  mcpschema.ForProto(&proto.CreateFileRequest{}, []string{"dataset_id"}),
			WhenToUse:    "Use before multipart upload to allocate a file_id under a dataset.",
			WhenNotToUse: "Do not use if you only need to rename dataset/report metadata.",
			SideEffects:  []string{"write"},
			ExampleInput: map[string]any{
				"dataset_id": "00000000-0000-0000-0000-000000000000",
			},
			NextTools: []string{"start_file_upload_session", "complete_file_upload_session"},
		},
		{
			Name:         "update_report_title",
			Description:  "Update report title by report_id.",
			InputSchema:  mcpschema.ForProto(&proto.UpdateReportTitleRequest{}, []string{"report_id", "title"}),
			WhenToUse:    "Use to rename a report without changing map configuration.",
			WhenNotToUse: "Do not use to update layers, styles, filters, or dataset mappings.",
			SideEffects:  []string{"write"},
			ExampleInput: map[string]any{
				"report_id": "00000000-0000-0000-0000-000000000000",
				"title":     "My Updated Report Title",
			},
			NextTools: []string{"update_report_map_config", "create_report_snapshot"},
		},
		{
			Name:         "update_report_map_config",
			Description:  "Update report map config by report_id.",
			InputSchema:  mcpschema.ForProto(&proto.UpdateReportMapConfigRequest{}, []string{"report_id", "map_config"}),
			WhenToUse:    "Use to apply Kepler.gl map configuration changes (layers, filters, map style, map state).",
			WhenNotToUse: "Do not use when only report title or dataset name should change.",
			SideEffects:  []string{"write"},
			ExampleInput: map[string]any{
				"report_id":  "00000000-0000-0000-0000-000000000000",
				"map_config": "{\"version\":\"v1\",\"config\":{\"visState\":{\"layers\":[]},\"mapState\":{},\"mapStyle\":{}}}",
			},
			NextTools: []string{"create_report_snapshot", "update_report_title"},
		},
		{
			Name:         "update_dataset_name",
			Description:  "Update dataset name by dataset_id.",
			InputSchema:  mcpschema.ForProto(&proto.UpdateDatasetNameRequest{}, []string{"dataset_id", "name"}),
			WhenToUse:    "Use to rename a dataset label shown in the map UI.",
			WhenNotToUse: "Do not use to change dataset content or file bytes.",
			SideEffects:  []string{"write"},
			ExampleInput: map[string]any{
				"dataset_id": "00000000-0000-0000-0000-000000000000",
				"name":       "Renamed Dataset",
			},
			NextTools: []string{"create_file", "update_report_map_config"},
		},
	}
	if reportsnapshot.IsEnabled() {
		tools = append(tools, mcpTool{
			Name:         "create_report_snapshot",
			Description:  "Create one short-lived URL for report snapshot rendering.",
			InputSchema:  mcpschema.ForProto(&proto.CreateReportSnapshotRequest{}, []string{"report_id"}),
			WhenToUse:    "Use after map updates when you need a rendered PNG snapshot URL for verification or sharing.",
			WhenNotToUse: "Do not use for mutating report or dataset data.",
			SideEffects:  []string{"read"},
			ExampleInput: map[string]any{
				"report_id": "00000000-0000-0000-0000-000000000000",
			},
			NextTools: []string{"update_report_map_config", "update_report_title"},
		})
	}
	return append(tools, mcpUploadToolDefinitions()...)
}
