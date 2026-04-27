package dekart

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestWriteMCPCallError_HTTPErrorPreservesStatus(t *testing.T) {
	recorder := httptest.NewRecorder()

	writeMCPCallError(recorder, &mcpHTTPError{statusCode: http.StatusRequestEntityTooLarge, message: "file too large"})

	assert.Equal(t, http.StatusRequestEntityTooLarge, recorder.Code)
	assert.Equal(t, "file too large\n", recorder.Body.String())
}

func TestWriteMCPCallError_GrpcInvalidArgumentMapsTo400(t *testing.T) {
	recorder := httptest.NewRecorder()

	writeMCPCallError(recorder, status.Error(codes.InvalidArgument, "invalid report_id format"))

	assert.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.Equal(t, "invalid report_id format\n", recorder.Body.String())
}

func TestWriteMCPCallError_MapConfigValidationErrorStructured(t *testing.T) {
	recorder := httptest.NewRecorder()

	writeMCPCallError(recorder, &mapConfigValidationError{
		Issues: []mapConfigValidationIssue{
			{
				Path:     "map_config.config.visState.layers[0].config.dataId",
				Reason:   "unknown_dataset_id",
				Expected: "one of: dataset-1",
				Actual:   "dataset-missing",
			},
		},
	})

	assert.Equal(t, http.StatusBadRequest, recorder.Code)
	var payload mcpValidationErrorResponse
	err := json.Unmarshal(recorder.Body.Bytes(), &payload)
	assert.NoError(t, err)
	assert.Equal(t, "map_config_validation_failed", payload.Error)
	if assert.Len(t, payload.Issues, 1) {
		assert.Equal(t, "map_config.config.visState.layers[0].config.dataId", payload.Issues[0].Path)
		assert.Equal(t, "unknown_dataset_id", payload.Issues[0].Reason)
		assert.Equal(t, "one of: dataset-1", payload.Issues[0].Expected)
		assert.Equal(t, "dataset-missing", payload.Issues[0].Actual)
	}
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

	datasetFileTool, ok := names["replace_file"]
	assert.True(t, ok)
	assert.Contains(t, datasetFileTool.InputSchema["required"], "dataset_id")

	addReadmeTool, ok := names["add_report_readme"]
	assert.True(t, ok)
	assert.Contains(t, addReadmeTool.InputSchema["required"], "report_id")
	assert.Contains(t, addReadmeTool.InputSchema["required"], "markdown")

	updateReadmeTool, ok := names["update_report_readme"]
	assert.True(t, ok)
	assert.Contains(t, updateReadmeTool.InputSchema["required"], "report_id")
	assert.Contains(t, updateReadmeTool.InputSchema["required"], "markdown")

	removeReadmeTool, ok := names["remove_report_readme"]
	assert.True(t, ok)
	assert.Contains(t, removeReadmeTool.InputSchema["required"], "report_id")

	reportPropsTool, ok := names["get_report_properties"]
	assert.True(t, ok)
	assert.Contains(t, reportPropsTool.InputSchema["required"], "report_id")

	mapConfigSchemaTool, ok := names["get_map_config_schema"]
	assert.True(t, ok)
	assert.Equal(t, []string{}, mapConfigSchemaTool.InputSchema["required"])
}

func TestCallMCPTool_UnknownTool(t *testing.T) {
	server := &Server{}
	_, err := server.callMCPTool(context.Background(), &mcpCallRequest{Name: "unknown_tool"})
	assert.Error(t, err)
	assert.True(t, strings.Contains(err.Error(), "unknown tool"))
}

func TestCallMCPTool_GetMapConfigSchema(t *testing.T) {
	server := &Server{}
	payload, err := server.callMCPTool(context.Background(), &mcpCallRequest{Name: "get_map_config_schema"})
	assert.NoError(t, err)
	var result map[string]any
	assert.NoError(t, json.Unmarshal(payload, &result))
	assert.Equal(t, "inmemory://kepler_map_config_v1.schema.json", result["schema_id"])
	_, hasSchema := result["schema"]
	assert.True(t, hasSchema)
}

func TestMCPToolDefinitions_AgentGuidanceFieldsPresent(t *testing.T) {
	tools := mcpToolDefinitions()
	assert.NotEmpty(t, tools)
	for _, tool := range tools {
		assert.NotEmpty(t, tool.WhenToUse, "tool %s missing when_to_use", tool.Name)
		assert.NotEmpty(t, tool.WhenNotToUse, "tool %s missing when_not_to_use", tool.Name)
		assert.NotEmpty(t, tool.SideEffects, "tool %s missing side_effects", tool.Name)
		assert.NotNil(t, tool.ExampleInput, "tool %s missing example_input", tool.Name)
		assert.NotEmpty(t, tool.NextTools, "tool %s missing next_tools", tool.Name)
	}
}

func TestMCPToolDefinitions_MapConfigToolHasKeplerReference(t *testing.T) {
	tools := mcpToolDefinitions()
	var mapConfigTool *mcpTool
	for i := range tools {
		if tools[i].Name == "update_report_map_config" {
			mapConfigTool = &tools[i]
			break
		}
	}
	if assert.NotNil(t, mapConfigTool) {
		assert.NotEmpty(t, mapConfigTool.ReferenceDocs)
		assert.Contains(t, strings.Join(mapConfigTool.ReferenceDocs, " "), "docs.kepler.gl")
		assert.Contains(t, strings.ToLower(mapConfigTool.WhenToUse), "dataid")
		assert.Contains(t, mapConfigTool.WhenToUse, "dataset_id")
	}
}

func TestMCPToolDefinitions_StrictSchemaAndRequiredFields(t *testing.T) {
	tools := mcpToolDefinitions()
	names := make(map[string]mcpTool, len(tools))
	for _, tool := range tools {
		names[tool.Name] = tool
	}

	createReportTool, ok := names["create_report"]
	if assert.True(t, ok) {
		required, typeOK := createReportTool.InputSchema["required"].([]string)
		assert.True(t, typeOK)
		assert.Equal(t, []string{}, required)
		assert.Equal(t, []string{}, createReportTool.RequiredFields)
		assert.Equal(t, map[string]any{}, createReportTool.ExampleInput)
	}

	updateReadmeTool, ok := names["update_report_readme"]
	if assert.True(t, ok) {
		required, typeOK := updateReadmeTool.InputSchema["required"].([]string)
		assert.True(t, typeOK)
		assert.Equal(t, []string{"markdown", "report_id"}, required)
		assert.Equal(t, []string{"markdown", "report_id"}, updateReadmeTool.RequiredFields)
		assert.Equal(t, "Updated report notes", updateReadmeTool.ExampleInput["markdown"])
		assert.Equal(t, "00000000-0000-0000-0000-000000000000", updateReadmeTool.ExampleInput["report_id"])
	}
}
