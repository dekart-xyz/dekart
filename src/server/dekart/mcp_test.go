package dekart

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestWriteMCPCallError_HTTPErrorPreservesStatus(t *testing.T) {
	recorder := httptest.NewRecorder()

	writeMCPCallError(recorder, &mcpHTTPError{statusCode: http.StatusRequestEntityTooLarge, message: "file too large"})

	assert.Equal(t, http.StatusRequestEntityTooLarge, recorder.Code)
	assert.Equal(t, "file too large\n", recorder.Body.String())
}

func TestCallUploadHandlerJSON_PropagatesHandlerStatusAndMessage(t *testing.T) {
	server := &Server{}
	handler := func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "workspace is read-only", http.StatusForbidden)
	}

	payload, err := server.callUploadHandlerJSON(context.Background(), http.MethodPost, nil, nil, handler)

	assert.Nil(t, payload)
	var httpErr *mcpHTTPError
	assert.True(t, errors.As(err, &httpErr))
	assert.Equal(t, http.StatusForbidden, httpErr.statusCode)
	assert.Equal(t, "workspace is read-only", httpErr.message)
}

func TestCallUploadHandlerJSON_UsesStatusTextWhenBodyEmpty(t *testing.T) {
	server := &Server{}
	handler := func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}

	payload, err := server.callUploadHandlerJSON(context.Background(), http.MethodPost, nil, nil, handler)

	assert.Nil(t, payload)
	var httpErr *mcpHTTPError
	assert.True(t, errors.As(err, &httpErr))
	assert.Equal(t, http.StatusUnauthorized, httpErr.statusCode)
	assert.Equal(t, http.StatusText(http.StatusUnauthorized), httpErr.message)
}

func TestMCPToolDefinitions_ContainsUpdateTools(t *testing.T) {
	tools := mcpToolDefinitions()
	names := make(map[string]mcpTool, len(tools))
	for _, tool := range tools {
		names[tool.Name] = tool
	}

	titleTool, ok := names["update_report_title"]
	assert.True(t, ok)
	assert.Contains(t, titleTool.InputSchema["required"], "report_id")
	assert.Contains(t, titleTool.InputSchema["required"], "title")

	mapConfigTool, ok := names["update_report_map_config"]
	assert.True(t, ok)
	assert.Contains(t, mapConfigTool.InputSchema["required"], "report_id")
	assert.Contains(t, mapConfigTool.InputSchema["required"], "map_config")

	datasetTool, ok := names["update_dataset_name"]
	assert.True(t, ok)
	assert.Contains(t, datasetTool.InputSchema["required"], "dataset_id")
	assert.Contains(t, datasetTool.InputSchema["required"], "name")
}

func TestCallMCPTool_UnknownTool(t *testing.T) {
	server := &Server{}
	_, err := server.callMCPTool(context.Background(), &mcpCallRequest{Name: "unknown_tool"})
	assert.Error(t, err)
	assert.True(t, strings.Contains(err.Error(), "unknown tool"))
}
