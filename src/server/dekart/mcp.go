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
	Name           string         `json:"name"`
	Description    string         `json:"description"`
	InputSchema    map[string]any `json:"inputSchema"`
	RequiredFields []string       `json:"required_fields"`
	WhenToUse      string         `json:"when_to_use,omitempty"`
	WhenNotToUse   string         `json:"when_not_to_use,omitempty"`
	SideEffects    []string       `json:"side_effects,omitempty"`
	ExampleInput   map[string]any `json:"example_input"`
	NextTools      []string       `json:"next_tools,omitempty"`
	ReferenceDocs  []string       `json:"reference_docs,omitempty"`
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

type mcpValidationErrorResponse struct {
	Error  string                     `json:"error"`
	Issues []mapConfigValidationIssue `json:"issues"`
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
	case "replace_file":
		return s.callReplaceFileTool(ctx, request.Arguments)
	case "update_report_title":
		return s.callUpdateReportTitleTool(ctx, request.Arguments)
	case "update_report_map_config":
		return s.callUpdateReportMapConfigTool(ctx, request.Arguments)
	case "get_map_config_schema":
		return s.callGetMapConfigSchemaTool()
	case "add_report_readme":
		return s.callAddReportReadmeTool(ctx, request.Arguments)
	case "update_report_readme":
		return s.callUpdateReportReadmeTool(ctx, request.Arguments)
	case "remove_report_readme":
		return s.callRemoveReportReadmeTool(ctx, request.Arguments)
	case "update_dataset_name":
		return s.callUpdateDatasetNameTool(ctx, request.Arguments)
	case "get_report_properties":
		return s.callGetReportPropertiesTool(ctx, request.Arguments)
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

// callGetMapConfigSchemaTool returns the JSON schema used for map config validation.
func (s *Server) callGetMapConfigSchemaTool() (json.RawMessage, error) {
	_ = s
	var schema map[string]any
	if err := json.Unmarshal([]byte(keplerMapConfigSchemaJSON), &schema); err != nil {
		return nil, status.Error(codes.Internal, "failed to load map config schema")
	}
	return mcp.MarshalJSON(map[string]any{
		"schema_id":      schema["$id"],
		"schema_version": schema["$schema"],
		"title":          schema["title"],
		"schema":         schema,
	})
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

// callReplaceFileTool creates a new file and rebinds dataset to it.
func (s *Server) callReplaceFileTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	request := &proto.ReplaceFileRequest{}
	if err := mcp.DecodeProtoArgs(raw, request); err != nil {
		return nil, err
	}
	response, err := s.ReplaceFile(ctx, request)
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
	// Validate Kepler map config schema and dataset bindings before persisting.
	if err := s.validateReportMapConfig(ctx, request.ReportId, request.MapConfig); err != nil {
		return nil, err
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

// callAddReportReadmeTool adds readme markdown and optionally removes source dataset.
func (s *Server) callAddReportReadmeTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	request := &proto.AddReadmeRequest{}
	if err := mcp.DecodeProtoArgs(raw, request); err != nil {
		return nil, err
	}
	response, err := s.AddReadme(ctx, request)
	if err != nil {
		return nil, err
	}
	return mcp.MarshalProtoJSON(response)
}

// callUpdateReportReadmeTool replaces report readme markdown without dataset removal.
func (s *Server) callUpdateReportReadmeTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	request := &proto.UpdateReportReadmeRequest{}
	if err := mcp.DecodeProtoArgs(raw, request); err != nil {
		return nil, err
	}
	_, err := s.AddReadme(ctx, &proto.AddReadmeRequest{
		ReportId:      request.ReportId,
		Markdown:      request.Markdown,
		FromDatasetId: "",
	})
	if err != nil {
		return nil, err
	}
	return mcp.MarshalProtoJSON(&proto.UpdateReportReadmeResponse{})
}

// callRemoveReportReadmeTool removes readme from a report by report_id.
func (s *Server) callRemoveReportReadmeTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	request := &proto.RemoveReadmeRequest{}
	if err := mcp.DecodeProtoArgs(raw, request); err != nil {
		return nil, err
	}
	response, err := s.RemoveReadme(ctx, request)
	if err != nil {
		return nil, err
	}
	return mcp.MarshalProtoJSON(response)
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

// callGetReportPropertiesTool returns report metadata and datasets for one report_id.
func (s *Server) callGetReportPropertiesTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	request := &proto.GetReportPropertiesRequest{}
	if err := mcp.DecodeProtoArgs(raw, request); err != nil {
		return nil, err
	}
	if _, err := uuid.Parse(request.ReportId); err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	report, err := s.getReport(ctx, request.ReportId)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if report == nil {
		return nil, status.Error(codes.NotFound, fmt.Sprintf("report not found id:%s", request.ReportId))
	}
	datasets, err := s.getDatasets(ctx, request.ReportId)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return mcp.MarshalProtoJSON(&proto.GetReportPropertiesResponse{
		Report:   report,
		Datasets: datasets,
	})
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
	var validationErr *mapConfigValidationError
	if errors.As(err, &validationErr) {
		writeJSON(w, http.StatusBadRequest, mcpValidationErrorResponse{
			Error:  "map_config_validation_failed",
			Issues: validationErr.Issues,
		})
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

// normalizeMCPTool enforces strict schema, required_fields, and minimal example_input.
func normalizeMCPTool(tool mcpTool) mcpTool {
	normalizedSchema, required := mcpschema.NormalizeInputSchema(tool.InputSchema)
	tool.InputSchema = normalizedSchema
	tool.RequiredFields = required
	properties, _ := normalizedSchema["properties"].(map[string]any)
	tool.ExampleInput = mcpschema.MinimalExampleInput(required, properties, tool.ExampleInput)
	if tool.ExampleInput == nil {
		tool.ExampleInput = map[string]any{}
	}
	return tool
}

// normalizeMCPTools normalizes discoverability metadata for all MCP tools.
func normalizeMCPTools(tools []mcpTool) []mcpTool {
	normalized := make([]mcpTool, 0, len(tools))
	for _, tool := range tools {
		normalized = append(normalized, normalizeMCPTool(tool))
	}
	return normalized
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
			NextTools: []string{"start_file_upload_session", "complete_file_upload_session", "replace_file"},
		},
		{
			Name:         "replace_file",
			Description:  "Create a new file and rebind dataset to it, keeping old file metadata unchanged.",
			InputSchema:  mcpschema.ForProto(&proto.ReplaceFileRequest{}, []string{"dataset_id"}),
			WhenToUse:    "Use when dataset already has a file and you want to replace it with a new upload.",
			WhenNotToUse: "Do not use when creating the first file for a dataset; use create_file instead.",
			SideEffects:  []string{"write"},
			ExampleInput: map[string]any{
				"dataset_id": "00000000-0000-0000-0000-000000000000",
			},
			NextTools: []string{"start_file_upload_session", "complete_file_upload_session", "create_report_snapshot"},
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
			WhenToUse:    "Use to apply Kepler.gl map configuration changes (layers, filters, map style, map state). Before calling, agent should preflight map_config semantics: each layer dataId exists, required layer columns exist, and visual-channel field names exist in dataset schema. In visState.layers[*].config.dataId, use report dataset_id values (kepler data ids), not file_id or tab labels.",
			WhenNotToUse: "Do not use when only report title or dataset name should change.",
			SideEffects:  []string{"write"},
			ExampleInput: map[string]any{
				"report_id":  "00000000-0000-0000-0000-000000000000",
				"map_config": "{\"version\":\"v1\",\"config\":{\"visState\":{\"layers\":[]},\"mapState\":{},\"mapStyle\":{}}}",
			},
			NextTools: []string{"create_report_snapshot", "update_report_title"},
			ReferenceDocs: []string{
				"https://docs.kepler.gl/docs/api-reference/advanced-usages/saving-loading-w-schema",
			},
		},
		{
			Name:         "get_map_config_schema",
			Description:  "Return the Kepler v1 map_config JSON schema used by MCP validation.",
			InputSchema:  mcpschema.Object(nil, map[string]any{}),
			WhenToUse:    "Use before building or editing map_config to discover required fields, allowed enums, and layer-specific constraints.",
			WhenNotToUse: "Do not use for mutating report or dataset data.",
			SideEffects:  []string{"read"},
			ExampleInput: map[string]any{},
			NextTools:    []string{"get_report_properties", "update_report_map_config"},
			ReferenceDocs: []string{
				"https://docs.kepler.gl/docs/api-reference/advanced-usages/saving-loading-w-schema",
			},
		},
		{
			Name:         "add_report_readme",
			Description:  "Add report readme markdown; optionally remove source dataset after conversion.",
			InputSchema:  mcpschema.ForProto(&proto.AddReadmeRequest{}, []string{"report_id", "markdown"}),
			WhenToUse:    "Use to create a readme on reports that currently have no readme content.",
			WhenNotToUse: "Do not use when only report title/map config should change.",
			SideEffects:  []string{"write"},
			ExampleInput: map[string]any{
				"report_id": "00000000-0000-0000-0000-000000000000",
				"markdown":  "# Report notes",
			},
			NextTools: []string{"update_report_readme", "remove_report_readme", "get_report_properties"},
		},
		{
			Name:         "update_report_readme",
			Description:  "Replace report readme markdown by report_id.",
			InputSchema:  mcpschema.ForProto(&proto.UpdateReportReadmeRequest{}, []string{"report_id", "markdown"}),
			WhenToUse:    "Use to edit existing readme content without touching datasets.",
			WhenNotToUse: "Do not use to rename reports or change map styling.",
			SideEffects:  []string{"write"},
			ExampleInput: map[string]any{
				"report_id": "00000000-0000-0000-0000-000000000000",
				"markdown":  "Updated report notes",
			},
			NextTools: []string{"get_report_properties", "remove_report_readme", "create_report_snapshot"},
		},
		{
			Name:         "remove_report_readme",
			Description:  "Remove readme markdown from a report.",
			InputSchema:  mcpschema.ForProto(&proto.RemoveReadmeRequest{}, []string{"report_id"}),
			WhenToUse:    "Use when report readme should be cleared.",
			WhenNotToUse: "Do not use to remove datasets or report files.",
			SideEffects:  []string{"write"},
			ExampleInput: map[string]any{
				"report_id": "00000000-0000-0000-0000-000000000000",
			},
			NextTools: []string{"add_report_readme", "get_report_properties"},
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
		{
			Name:         "get_report_properties",
			Description:  "Read report properties (title, map_config, readme, datasets) by report_id.",
			InputSchema:  mcpschema.ForProto(&proto.GetReportPropertiesRequest{}, []string{"report_id"}),
			WhenToUse:    "Use before mutating report state to fetch current report and dataset context.",
			WhenNotToUse: "Do not use when you only need to create a new report.",
			SideEffects:  []string{"read"},
			ExampleInput: map[string]any{
				"report_id": "00000000-0000-0000-0000-000000000000",
			},
			NextTools: []string{"update_report_title", "update_report_map_config", "update_report_readme"},
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
	return normalizeMCPTools(append(tools, mcpUploadToolDefinitions()...))
}
