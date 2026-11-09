package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/conn"
	device "dekart/src/server/deviceauth"
	"dekart/src/server/mcp"
	"dekart/src/server/query"
	"dekart/src/server/secrets"
	"dekart/src/server/user"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	gproto "google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
)

type addReportReadmeMCPArgs struct {
	ReportId string `json:"report_id"`
	Markdown string `json:"markdown"`
}

const mcpBigQueryServiceAccountRequiredMessage = "BigQuery via MCP requires a service-account-backed connection"
const mcpCreateConnectionDisabledMessage = "create_connection via MCP is disabled; create the connection in Dekart UI first"

// callMCPTool dispatches one named MCP tool to existing RPC/upload handlers.
func (s *Server) callMCPTool(ctx context.Context, request *mcpCallRequest) (json.RawMessage, error) {
	switch request.Name {
	case "list_connections":
		return s.callListConnectionsTool(ctx)
	case "create_connection":
		return nil, status.Error(codes.FailedPrecondition, mcpCreateConnectionDisabledMessage)
	case "create_report":
		return s.callCreateReportTool(ctx)
	case "create_dataset":
		return s.callCreateDatasetTool(ctx, request.Arguments)
	case "create_query":
		return s.callCreateQueryTool(ctx, request.Arguments)
	case "update_query":
		return s.callUpdateQueryTool(ctx, request.Arguments)
	case "run_query":
		return s.callRunQueryTool(ctx, request.Arguments)
	case "check_job_status":
		return s.callCheckJobStatusTool(ctx, request.Arguments)
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
	case "update_report_widgets_config":
		return s.callUpdateReportWidgetsConfigTool(ctx, request.Arguments)
	case "get_widgets_config_schema":
		return s.callGetWidgetsConfigSchemaTool()
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

// sanitizeConnectionForMCP strips secrets from connection payloads returned by MCP tools.
func sanitizeConnectionForMCP(connection *proto.Connection) *proto.Connection {
	if connection == nil {
		return nil
	}
	// Clone protobuf message to avoid copying internal mutex state by value.
	sanitized := gproto.Clone(connection).(*proto.Connection)
	clearSecretFields(sanitized)
	return sanitized
}

func clearSecretFields(message gproto.Message) {
	if message == nil {
		return
	}
	protoMessage := message.ProtoReflect()
	fields := protoMessage.Descriptor().Fields()
	secretFullName := (&proto.Secret{}).ProtoReflect().Descriptor().FullName()
	for i := 0; i < fields.Len(); i++ {
		field := fields.Get(i)
		if field.Kind() != protoreflect.MessageKind {
			continue
		}
		if field.Message() == nil || field.Message().FullName() != secretFullName {
			continue
		}
		protoMessage.Clear(field)
	}
}

// requiresMCPGoogleCredential identifies BigQuery connections that need delegated user auth.
func requiresMCPGoogleCredential(connection *proto.Connection) bool {
	if connection == nil {
		return false
	}
	if connection.ConnectionType != proto.ConnectionType_CONNECTION_TYPE_BIGQUERY {
		return false
	}
	if connection.GetId() == conn.SystemConnectionID && os.Getenv("DEKART_CLOUD") == "" {
		return false
	}
	return connection.BigqueryKey == nil
}

// requireMCPBigQueryCredential validates credentials only for the selected connection.
func requireMCPBigQueryCredential(ctx context.Context, connection *proto.Connection) error {
	if requiresMCPGoogleCredential(connection) {
		if err := user.ValidateMCPGoogleAccessToken(ctx); err != nil {
			return newMCPGoogleCredentialError(err)
		}
		return nil
	}
	if connection == nil || connection.ConnectionType != proto.ConnectionType_CONNECTION_TYPE_BIGQUERY {
		return nil
	}
	if connection.BigqueryKey == nil {
		return nil
	}
	if connection.BigqueryKey.ServerEncrypted != "" {
		return nil
	}
	if secrets.SecretToString(connection.BigqueryKey, user.GetClaims(ctx)) == "" {
		return status.Error(codes.FailedPrecondition, mcpBigQueryServiceAccountRequiredMessage)
	}
	return nil
}

func (s *Server) requireMCPCreateQueryConnection(ctx context.Context, request *proto.CreateQueryRequest) error {
	// DuckDB definitions are intentionally connectionless.
	if request.ExecutionEngine == proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_DUCKDB {
		if request.GetConnectionId() != "" {
			return status.Error(codes.InvalidArgument, "DuckDB query cannot reference a connection")
		}
		return nil
	}
	if request.ExecutionEngine != proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_CONNECTION {
		return status.Error(codes.InvalidArgument, "execution_engine is required")
	}
	if request.GetConnectionId() == "" {
		return status.Error(codes.InvalidArgument, "connection_id is required for connection queries")
	}
	connection, err := s.getConnection(ctx, request.GetConnectionId())
	if err != nil {
		return status.Error(codes.Internal, err.Error())
	}
	if connection == nil && !conn.IsSystemConnectionID(request.GetConnectionId()) {
		return status.Error(codes.NotFound, "connection not found")
	}
	return requireMCPBigQueryCredential(ctx, connection)
}

// filterConnectionsForMCPRunQueriesScope keeps only MCP-supported connections for
// initial run-queries rollout. This does not alter global gRPC connection listing.
func filterConnectionsForMCPRunQueriesScope(connections []*proto.Connection) []*proto.Connection {
	filtered := make([]*proto.Connection, 0, len(connections))
	for _, connection := range connections {
		// Cloud's internal system connection stays hidden; workspace connections remain discoverable.
		if connection == nil || (connection.GetId() == conn.SystemConnectionID && os.Getenv("DEKART_CLOUD") != "") {
			continue
		}
		filtered = append(filtered, connection)
	}
	return filtered
}

// callListConnectionsTool returns workspace connection list with secrets removed.
func (s *Server) callListConnectionsTool(ctx context.Context) (json.RawMessage, error) {
	response, err := s.GetConnectionList(ctx, &proto.GetConnectionListRequest{})
	if err != nil {
		return nil, err
	}
	filtered := filterConnectionsForMCPRunQueriesScope(response.GetConnections())
	sanitized := make([]map[string]any, 0, len(filtered))
	for _, connection := range filtered {
		raw, err := mcp.MarshalProtoJSON(sanitizeConnectionForMCP(connection))
		if err != nil {
			return nil, err
		}
		var metadata map[string]any
		if err := json.Unmarshal(raw, &metadata); err != nil {
			return nil, err
		}
		// MCP discovery exposes header names while keeping their values on the server.
		if connection.ConnectionType == proto.ConnectionType_CONNECTION_TYPE_HTTP {
			if err := s.loadHTTPConnection(ctx, connection, false); err != nil {
				return nil, err
			}
			headerNames := make([]string, 0)
			if encrypted := connection.GetHttpHeadersJson().GetServerEncrypted(); encrypted != "" {
				raw, err := secrets.ServerDecrypt(encrypted)
				if err != nil {
					return nil, err
				}
				var headers map[string]string
				if err := json.Unmarshal([]byte(raw), &headers); err != nil {
					return nil, err
				}
				for name := range headers {
					headerNames = append(headerNames, name)
				}
			}
			sort.Strings(headerNames)
			metadata["http_header_names"] = headerNames
		}
		sanitized = append(sanitized, metadata)
	}
	return mcp.MarshalJSON(map[string]any{"connections": sanitized})
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
		if checkWorkspace(ctx).ReadOnlyReason == proto.GetWorkspaceResponse_READ_ONLY_REASON_TRIAL_NOT_STARTED {
			trialURL := "/workspace/trial"
			if frontendBaseURL := device.RequestFrontendBaseURL(nil); frontendBaseURL != "" {
				trialURL = fmt.Sprintf("%s/workspace/trial", frontendBaseURL)
			}
			return nil, status.Errorf(codes.FailedPrecondition, "trial not started; ask the user to open %s and start the 14-day trial", trialURL)
		}
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

// callCreateQueryTool creates one query for dataset_id and connection_id.
func (s *Server) callCreateQueryTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	request := &proto.CreateQueryRequest{}
	if err := mcp.DecodeProtoArgs(raw, request); err != nil {
		return nil, err
	}
	if request.ExecutionEngine == proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_UNSPECIFIED {
		request.ExecutionEngine = proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_CONNECTION
	}
	response, err := s.createQuery(ctx, request, s.requireMCPCreateQueryConnection)
	if err != nil {
		return nil, err
	}
	return mcp.MarshalProtoJSON(response)
}

// callUpdateQueryTool updates query text without executing query jobs.
func (s *Server) callUpdateQueryTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	request := &proto.UpdateQueryRequest{}
	if err := mcp.DecodeProtoArgs(raw, request); err != nil {
		return nil, err
	}
	queryDetails, err := s.getWritableQueryDetails(ctx, request.GetQueryId())
	if err != nil {
		return nil, err
	}
	var response *proto.UpdateQueryResponse
	// DuckDB validation is compiler-owned and must be read from the saved graph transaction.
	if queryDetails.ExecutionEngine == proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_DUCKDB {
		response, err = s.updateDuckDBQueryForMCP(ctx, request, queryDetails)
	} else {
		response, err = s.updateQuery(ctx, request, s.validateMCPUpdateQuery)
	}
	if err != nil {
		return nil, err
	}
	return mcp.MarshalProtoJSON(response)
}

func (s *Server) validateMCPUpdateQuery(ctx context.Context, request *proto.UpdateQueryRequest, queryDetails *query.QueryDetails) (*proto.QueryDryRunResult, error) {
	if queryDetails.ExecutionEngine != proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_CONNECTION {
		return nil, status.Error(codes.FailedPrecondition, "query has no supported execution engine")
	}
	connection, err := s.getConnection(ctx, queryDetails.ConnectionID)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	// In USER/self-hosted modes, system/default may resolve to nil connection.
	// Skip dry-run in that case and allow UpdateQuery to proceed.
	if connection == nil {
		return nil, nil
	}
	if err := requireMCPBigQueryCredential(ctx, connection); err != nil {
		return nil, err
	}
	dryRun, err := s.dryRunQuery(ctx, connection, request.GetQueryText())
	if err != nil {
		return nil, err
	}
	if dryRun.GetSupported() && !dryRun.GetValid() {
		return nil, status.Error(codes.InvalidArgument, dryRun.GetMessage())
	}
	return dryRun, nil
}

// callRunQueryTool starts query execution and returns immediately without waiting for completion.
func (s *Server) callRunQueryTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	request := &proto.RunQueryRequest{}
	if err := mcp.DecodeProtoArgs(raw, request); err != nil {
		return nil, err
	}
	if user.GetClaims(ctx) == nil {
		return nil, Unauthenticated
	}
	if err := validateUUIDField(request.GetQueryId(), "query_id"); err != nil {
		return nil, err
	}
	queryDetails, err := query.GetQueryDetails(ctx, s.db, request.GetQueryId())
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	// Only explicit capability opt-in may change the MCP response to a local program.
	if queryDetails.ExecutionEngine == proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_DUCKDB && request.GetAcceptDuckdbExecution() {
		// Saved DuckDB definitions and parameters are server-owned for preparation.
		if request.GetQueryText() != "" || len(request.GetQueryParams()) != 0 {
			return nil, status.Error(codes.InvalidArgument, "query_text and query_params are not accepted for DuckDB execution")
		}
		response, err := s.prepareDuckDBExecution(ctx, &proto.PrepareDuckDBExecutionRequest{
			QueryId:           request.GetQueryId(),
			QueryParamsValues: request.GetQueryParamsValues(),
		}, requireMCPBigQueryCredential)
		if err != nil {
			return nil, err
		}
		return mcp.MarshalProtoJSON(response)
	}
	response, err := s.runQueryRequest(ctx, request, requireMCPBigQueryCredential)
	if err != nil {
		return nil, err
	}
	return mcp.MarshalProtoJSON(response)
}

// callCheckJobStatusTool returns current status for one job_id.
func (s *Server) callCheckJobStatusTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	request := &proto.CheckJobStatusRequest{}
	if err := mcp.DecodeProtoArgs(raw, request); err != nil {
		return nil, err
	}
	if user.GetClaims(ctx) == nil {
		return nil, Unauthenticated
	}
	if strings.TrimSpace(request.GetJobId()) == "" {
		return nil, status.Error(codes.InvalidArgument, "job_id is required")
	}
	job, err := s.getQueryJob(ctx, request.GetJobId())
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if job == nil {
		return nil, status.Error(codes.NotFound, "Job not found")
	}
	reportID, err := s.getReportIDFromJobID(ctx, request.GetJobId())
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if reportID == "" {
		return nil, status.Error(codes.NotFound, "No report found for job")
	}
	report, err := s.getReport(ctx, reportID)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if report == nil {
		return nil, status.Error(codes.NotFound, "Report not found")
	}
	return mcp.MarshalProtoJSON(&proto.CheckJobStatusResponse{QueryJob: job})
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
	if _, err := uuid.Parse(request.ReportId); err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	// Match UpdateReport authorization before applying this MCP-only partial update.
	report, err := s.getReport(ctx, request.ReportId)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if report == nil {
		return nil, status.Error(codes.NotFound, fmt.Sprintf("report not found id:%s", request.ReportId))
	}
	if err := s.requireReportWorkspaceWrite(ctx, request.ReportId); err != nil {
		return nil, err
	}
	if !report.CanWrite {
		return nil, status.Error(codes.PermissionDenied, "cannot write to report")
	}
	updatedAt := time.Now()
	newVersionID := newUUID()
	var result sql.Result
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
	if _, err := uuid.Parse(request.ReportId); err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	// Match UpdateReport authorization before applying this MCP-only partial update.
	report, err := s.getReport(ctx, request.ReportId)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if report == nil {
		return nil, status.Error(codes.NotFound, fmt.Sprintf("report not found id:%s", request.ReportId))
	}
	if err := s.requireReportWorkspaceWrite(ctx, request.ReportId); err != nil {
		return nil, err
	}
	if !report.CanWrite {
		return nil, status.Error(codes.PermissionDenied, "cannot write to report")
	}
	if len(request.MapConfig) > MaxMapConfigSize {
		return nil, status.Errorf(codes.InvalidArgument,
			"Map configuration is too large (%d bytes). Maximum allowed size is %d bytes. Please simplify your map configuration.",
			len(request.MapConfig), MaxMapConfigSize)
	}
	//Start a transaction and lock the report before validating or applying an authoritative MCP map update.
	newVersionID := newUUID()
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	defer tx.Rollback()
	if err := lockReportTx(ctx, tx, request.ReportId); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	updatedAt := time.Now()
	// Validate bindings while the report lock prevents concurrent dataset changes.
	if err := s.validateReportMapConfigTx(ctx, tx, request.ReportId, request.MapConfig); err != nil {
		return nil, err
	}
	var result sql.Result
	if workspaceInfo.IsPlayground {
		result, err = tx.ExecContext(ctx,
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
		result, err = tx.ExecContext(ctx,
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
	// Create the report snapshot and commit it atomically with the MCP map update.
	if err := s.createReportSnapshotWithVersionIDTx(ctx, tx, newVersionID, request.ReportId, claims.Email, proto.ReportSnapshot_TRIGGER_TYPE_REPORT_CHANGE); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if err := tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.reportStreams.Ping(request.ReportId)
	return mcp.MarshalProtoJSON(&proto.UpdateReportMapConfigResponse{UpdatedAt: updatedAt.Unix()})
}

// callGetWidgetsConfigSchemaTool returns the JSON schema used for widgets config validation.
func (s *Server) callGetWidgetsConfigSchemaTool() (json.RawMessage, error) {
	_ = s
	var schema map[string]any
	if err := json.Unmarshal([]byte(widgetsConfigSchemaJSON), &schema); err != nil {
		return nil, status.Error(codes.Internal, "failed to load widgets config schema")
	}
	return mcp.MarshalJSON(map[string]any{
		"schema_id":      schema["$id"],
		"schema_version": schema["$schema"],
		"title":          schema["title"],
		"schema":         schema,
	})
}

// callUpdateReportWidgetsConfigTool replaces report chart configuration while keeping map config and title.
func (s *Server) callUpdateReportWidgetsConfigTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	request := &proto.UpdateReportWidgetsConfigRequest{}
	if err := mcp.DecodeProtoArgs(raw, request); err != nil {
		return nil, err
	}
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	workspaceInfo := checkWorkspace(ctx)
	// Agent-facing argument errors follow the CreateDataset strings, the one deliberate
	// departure from the map tool, which returns the raw uuid.Parse error.
	if strings.TrimSpace(request.ReportId) == "" {
		return nil, status.Error(codes.InvalidArgument, "report_id is required")
	}
	if _, err := uuid.Parse(request.ReportId); err != nil {
		return nil, status.Error(codes.InvalidArgument, fmt.Sprintf("invalid report_id format: %v", err))
	}
	// Match UpdateReport authorization before applying this MCP-only partial update.
	report, err := s.getReport(ctx, request.ReportId)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if report == nil {
		return nil, status.Error(codes.NotFound, fmt.Sprintf("report not found id:%s", request.ReportId))
	}
	if err := s.requireReportWorkspaceWrite(ctx, request.ReportId); err != nil {
		return nil, err
	}
	if !report.CanWrite {
		return nil, status.Error(codes.PermissionDenied, "cannot write to report")
	}
	// Start a transaction and lock the report before validating or applying an authoritative MCP widgets update.
	newVersionID := newUUID()
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	defer tx.Rollback()
	if err := lockReportTx(ctx, tx, request.ReportId); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	updatedAt := time.Now()
	// Validate both the document and its report-owned dataset bindings under the same lock as the write.
	if err := s.validateReportWidgetsConfigTx(ctx, tx, request.ReportId, request.WidgetsConfig); err != nil {
		return nil, err
	}
	var result sql.Result
	if workspaceInfo.IsPlayground {
		result, err = tx.ExecContext(ctx,
			`update
			reports
		set widgets_config=$1, updated_at=$2, version_id=$3
		where id=$4 and author_email=$5 and is_playground=true`,
			request.WidgetsConfig,
			updatedAt,
			newVersionID,
			request.ReportId,
			claims.Email,
		)
	} else {
		result, err = tx.ExecContext(ctx,
			`update
			reports
		set widgets_config=$1, updated_at=$2, version_id=$3
		where id=$4 and (author_email=$5 or allow_edit) and workspace_id=$6`,
			request.WidgetsConfig,
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
	// Create the report snapshot and commit it atomically with the MCP widgets update.
	if err := s.createReportSnapshotWithVersionIDTx(ctx, tx, newVersionID, request.ReportId, claims.Email, proto.ReportSnapshot_TRIGGER_TYPE_REPORT_CHANGE); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if err := tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.reportStreams.Ping(request.ReportId)
	return mcp.MarshalProtoJSON(&proto.UpdateReportWidgetsConfigResponse{UpdatedAt: updatedAt.Unix()})
}

// callAddReportReadmeTool adds readme markdown without exposing dataset deletion.
func (s *Server) callAddReportReadmeTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	// MCP intentionally excludes from_dataset_id because dataset deletion must be explicit.
	args := &addReportReadmeMCPArgs{}
	if err := mcp.DecodeArgs(raw, args); err != nil {
		return nil, err
	}
	response, err := s.AddReadme(ctx, &proto.AddReadmeRequest{
		ReportId: args.ReportId,
		Markdown: args.Markdown,
	})
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
	// getReport requires an authenticated identity as an internal invariant.
	if user.GetClaims(ctx) == nil {
		return nil, Unauthenticated
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
	queries, err := s.getQueries(ctx, datasets)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return mcp.MarshalProtoJSON(&proto.GetReportPropertiesResponse{
		Report:   report,
		Datasets: datasets,
		Queries:  queries,
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
