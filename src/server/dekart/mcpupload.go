package dekart

import (
	"bytes"
	"context"
	"dekart/src/server/mcp"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"

	"dekart/src/proto"
	"dekart/src/server/mcpschema"
	"github.com/gorilla/mux"
)

type mcpHTTPError struct {
	statusCode int
	message    string
}

// Error returns textual representation for logging/debugging.
func (e *mcpHTTPError) Error() string {
	return fmt.Sprintf("http %d: %s", e.statusCode, e.message)
}

// callStartFileUploadSessionTool starts multipart upload session for one file.
func (s *Server) callStartFileUploadSessionTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	args := &proto.CreateFileUploadSessionRequest{}
	if err := mcp.DecodeProtoArgs(raw, args); err != nil {
		return nil, err
	}
	request := &proto.CreateFileUploadSessionRequest{Name: args.GetName(), MimeType: args.GetMimeType(), TotalSize: args.GetTotalSize()}
	requestBody, err := mcp.MarshalProtoJSON(request)
	if err != nil {
		return nil, err
	}
	return s.callUploadHandlerJSON(ctx, http.MethodPost, map[string]string{"id": args.GetFileId()}, requestBody, s.HandleStartFileUploadSession)
}

// callCompleteFileUploadSessionTool completes multipart upload for one file/session.
func (s *Server) callCompleteFileUploadSessionTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	args := &proto.CompleteFileUploadSessionRequest{}
	if err := mcp.DecodeProtoArgs(raw, args); err != nil {
		return nil, err
	}
	request := &proto.CompleteFileUploadSessionRequest{Parts: args.GetParts(), TotalSize: args.GetTotalSize()}
	requestBody, err := mcp.MarshalProtoJSON(request)
	if err != nil {
		return nil, err
	}
	vars := map[string]string{"id": args.GetFileId(), "session_id": args.GetUploadSessionId()}
	return s.callUploadHandlerJSON(ctx, http.MethodPost, vars, requestBody, s.HandleCompleteFileUploadSession)
}

// callAbortFileUploadSessionTool aborts multipart upload session for one file/session.
func (s *Server) callAbortFileUploadSessionTool(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	args := &proto.AbortFileUploadSessionRequest{}
	if err := mcp.DecodeProtoArgs(raw, args); err != nil {
		return nil, err
	}
	vars := map[string]string{"id": args.GetFileId(), "session_id": args.GetUploadSessionId()}
	return s.callUploadHandlerJSON(ctx, http.MethodDelete, vars, nil, s.HandleAbortFileUploadSession)
}

// callUploadHandlerJSON executes existing upload HTTP handler with synthetic request/vars.
func (s *Server) callUploadHandlerJSON(ctx context.Context, method string, vars map[string]string, body []byte, handler func(http.ResponseWriter, *http.Request)) (json.RawMessage, error) {
	request, err := http.NewRequest(method, "/", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request = request.WithContext(ctx)
	request.Header.Set("Content-Type", "application/json")
	request = mux.SetURLVars(request, vars)

	recorder := httptest.NewRecorder()
	handler(recorder, request)
	if recorder.Code >= http.StatusBadRequest {
		message := strings.TrimSpace(recorder.Body.String())
		if message == "" {
			message = http.StatusText(recorder.Code)
		}
		if message == "" {
			message = "request failed"
		}
		return nil, &mcpHTTPError{statusCode: recorder.Code, message: message}
	}
	payload := recorder.Body.Bytes()
	if len(payload) == 0 {
		payload = []byte(`{}`)
	}
	return json.RawMessage(payload), nil
}

// mcpUploadToolDefinitions returns upload-focused MCP tools and schemas.
func mcpUploadToolDefinitions() []mcpTool {
	return []mcpTool{
		{
			Name:        "start_file_upload_session",
			Description: "Start multipart upload session for a file. Upload part bytes with plain HTTP PUT to returned upload_part_endpoint; then call complete.",
			InputSchema: mcpschema.ForProto(&proto.CreateFileUploadSessionRequest{}, []string{"file_id", "name", "mime_type", "total_size"}),
		},
		{
			Name:        "complete_file_upload_session",
			Description: "Complete multipart upload session and finalize file.",
			InputSchema: mcpschema.ForProto(&proto.CompleteFileUploadSessionRequest{}, []string{"file_id", "upload_session_id", "parts", "total_size"}),
		},
		{
			Name:        "abort_file_upload_session",
			Description: "Abort multipart upload session for a file.",
			InputSchema: mcpschema.ForProto(&proto.AbortFileUploadSessionRequest{}, []string{"file_id", "upload_session_id"}),
		},
	}
}
