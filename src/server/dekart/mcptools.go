package dekart

import (
	"dekart/src/proto"
	"dekart/src/server/mcpschema"
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
			Name:         "list_connections",
			Description:  "List available workspace and system connections visible to caller. Secret fields are never returned.",
			InputSchema:  mcpschema.Object(nil, map[string]any{}),
			WhenToUse:    "Use before creating datasets or queries to discover available connection ids/types/names.",
			WhenNotToUse: "Do not use when you already have a valid connection_id and need to perform writes.",
			SideEffects:  []string{"read"},
			ExampleInput: map[string]any{},
			NextTools:    []string{"create_dataset"},
		},
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
			NextTools: []string{"create_file", "update_dataset_name", "remove_dataset", "update_report_widgets_config"},
		},
		{
			Name:         "create_query",
			Description:  "Create connection-backed or browser/local DuckDB query metadata for one dataset.",
			InputSchema:  mcpschema.ForProto(&proto.CreateQueryRequest{}, []string{"dataset_id"}),
			WhenToUse:    "Use after dataset creation; connection queries require connection_id while DuckDB queries omit it.",
			WhenNotToUse: "Do not use for file-based datasets or when query already exists and only query text needs update.",
			SideEffects:  []string{"write"},
			ExampleInput: map[string]any{"dataset_id": "00000000-0000-0000-0000-000000000000", "connection_id": "00000000-0000-0000-0000-000000000000"},
			NextTools:    []string{"create_report_snapshot"},
		},
		{
			Name:         "update_query",
			Description:  "Update query text for an existing query_id without executing query jobs.",
			InputSchema:  mcpschema.ForProto(&proto.UpdateQueryRequest{}, []string{"query_id", "query_text"}),
			WhenToUse:    "Use when SQL text must be changed for an existing query without triggering execution.",
			WhenNotToUse: "Do not use to run queries; use run_query workflow for execution.",
			SideEffects:  []string{"write"},
			ExampleInput: map[string]any{"query_id": "00000000-0000-0000-0000-000000000000", "query_text": "select 1"},
			NextTools:    []string{"create_report_snapshot"},
		},
		{
			Name:         "run_query",
			Description:  "Start connection execution or explicitly prepare a DuckDB query for local execution.",
			InputSchema:  mcpschema.ForProto(&proto.RunQueryRequest{}, []string{"query_id"}),
			WhenToUse:    "Use after query text is ready and execution should begin asynchronously.",
			WhenNotToUse: "Do not use when only SQL text should be edited without running; use update_query instead.",
			SideEffects:  []string{"write"},
			ExampleInput: map[string]any{"query_id": "00000000-0000-0000-0000-000000000000"},
			NextTools:    []string{"check_job_status", "create_report_snapshot", "update_report_widgets_config"},
		},
		{
			Name:         "check_job_status",
			Description:  "Check current status for one query job by job_id.",
			InputSchema:  mcpschema.ForProto(&proto.CheckJobStatusRequest{}, []string{"job_id"}),
			WhenToUse:    "Use to poll execution progress after run_query.",
			WhenNotToUse: "Do not use before job_id is known.",
			SideEffects:  []string{"read"},
			ExampleInput: map[string]any{"job_id": "00000000-0000-0000-0000-000000000000"},
			NextTools:    []string{"check_job_status"},
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
			NextTools: []string{"create_report_snapshot", "update_report_title", "update_report_widgets_config"},
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
			Name:         "update_report_widgets_config",
			Description:  "Replace report chart configuration by report_id.",
			InputSchema:  mcpschema.ForProto(&proto.UpdateReportWidgetsConfigRequest{}, []string{"report_id", "widgets_config"}),
			WhenToUse:    "Use to create, edit, reorder or delete charts on a report. This is a complete replacement: send the full widgets_config document, including charts you are not changing. Call get_report_properties first to read the current widgets_config, and get_widgets_config_schema to learn the format. Every widget dataId must be a dataset_id from get_report_properties.",
			WhenNotToUse: "Do not use to change map layers, styles, or which rows are filtered. Filter selections live in map_config and are set with update_report_map_config.",
			SideEffects:  []string{"write"},
			ExampleInput: map[string]any{
				"report_id":      "00000000-0000-0000-0000-000000000000",
				"widgets_config": "{\"version\":1,\"widgets\":[{\"id\":\"status-count\",\"dataId\":\"11111111-1111-1111-1111-111111111111\",\"type\":\"count-plot\",\"title\":\"By status\",\"settings\":{\"field\":\"status\"}}]}",
			},
			NextTools: []string{"get_report_properties", "create_report_snapshot"},
		},
		{
			Name:         "get_widgets_config_schema",
			Description:  "Return the Dekart widgets_config v1 JSON schema used by MCP validation.",
			InputSchema:  mcpschema.Object(nil, map[string]any{}),
			WhenToUse:    "Use before building or editing widgets_config to discover the envelope, allowed chart types, required settings, enums and numeric bounds. Category, Search and Histogram can set crossFilter true to filter other loaded datasets whose column has the exact same name and compatible type; integer and real are compatible. Number cannot use crossFilter.",
			WhenNotToUse: "Do not use for map layers, filters or selections. Those belong to map_config and get_map_config_schema.",
			SideEffects:  []string{"read"},
			ExampleInput: map[string]any{},
			NextTools:    []string{"get_report_properties", "update_report_widgets_config"},
		},
		{
			Name:        "add_report_readme",
			Description: "Add report readme markdown without changing report datasets.",
			InputSchema: mcpschema.Object([]string{"report_id", "markdown"}, map[string]any{
				"report_id": mcpschema.String(),
				"markdown":  mcpschema.String(),
			}),
			WhenToUse:    "Use to create a readme on reports that currently have no readme content.",
			WhenNotToUse: "Do not use when only report title/map config should change, or when a dataset should be removed; use remove_dataset explicitly for dataset deletion.",
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
			Description:  "Read report properties (title, map_config, widgets_config, readme), datasets, and queries by report_id.",
			InputSchema:  mcpschema.ForProto(&proto.GetReportPropertiesRequest{}, []string{"report_id"}),
			WhenToUse:    "Use before mutating report state to fetch current report and dataset context.",
			WhenNotToUse: "Do not use when you only need to create a new report.",
			SideEffects:  []string{"read"},
			ExampleInput: map[string]any{
				"report_id": "00000000-0000-0000-0000-000000000000",
			},
			NextTools: []string{"update_report_title", "update_report_map_config", "update_report_readme", "get_widgets_config_schema", "update_report_widgets_config"},
		},
	}
	tools = append(tools, mcpTool{
		Name:         "create_report_snapshot",
		Description:  "Create a short-lived report snapshot render URL. Prefer local render using snapshot_render_url. snapshot_url png may not be available for large reports.",
		InputSchema:  mcpschema.ForProto(&proto.CreateReportSnapshotRequest{}, []string{"report_id"}),
		WhenToUse:    "Use after map updates when you need a render URL, or a PNG snapshot URL when available. Pass include_widgets true to verify charts written with update_report_widgets_config; the snapshot renders the map only by default.",
		WhenNotToUse: "Do not use for mutating report or dataset data.",
		SideEffects:  []string{"read"},
		ExampleInput: map[string]any{
			"report_id": "00000000-0000-0000-0000-000000000000",
		},
		NextTools: []string{"update_report_map_config", "update_report_title", "update_report_widgets_config"},
	})
	return normalizeMCPTools(append(tools, mcpUploadToolDefinitions()...))
}
