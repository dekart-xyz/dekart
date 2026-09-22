package dekart

import (
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"dekart/src/proto"

	"github.com/santhosh-tekuri/jsonschema/v5"
)

const widgetsConfigSchemaURL = "inmemory://widgets_config_v1.schema.json"

//go:embed widgets_config_v1.schema.json
var widgetsConfigSchemaJSON string

var (
	widgetsConfigSchemaOnce sync.Once
	widgetsConfigSchema     *jsonschema.Schema
	widgetsConfigSchemaErr  error
)

type persistedWidgetsConfig struct {
	Version int               `json:"version"`
	Widgets []persistedWidget `json:"widgets"`
}

type persistedWidget struct {
	ID       string         `json:"id"`
	DataID   string         `json:"dataId"`
	Type     string         `json:"type"`
	Title    string         `json:"title"`
	Settings map[string]any `json:"settings"`
}

type widgetsConfigValidationError struct {
	Issues []mapConfigValidationIssue `json:"issues"`
}

func (e *widgetsConfigValidationError) Error() string {
	if e == nil || len(e.Issues) == 0 {
		return ""
	}
	parts := make([]string, 0, len(e.Issues))
	for _, issue := range e.Issues {
		parts = append(parts, formatMapConfigIssue(issue))
	}
	return fmt.Sprintf("Widgets config validation failed: %s", strings.Join(parts, "; "))
}

func getWidgetsConfigSchema() (*jsonschema.Schema, error) {
	widgetsConfigSchemaOnce.Do(func() {
		compiler := jsonschema.NewCompiler()
		if err := compiler.AddResource(widgetsConfigSchemaURL, strings.NewReader(widgetsConfigSchemaJSON)); err != nil {
			widgetsConfigSchemaErr = err
			return
		}
		widgetsConfigSchema, widgetsConfigSchemaErr = compiler.Compile(widgetsConfigSchemaURL)
	})
	return widgetsConfigSchema, widgetsConfigSchemaErr
}

// validateWidgetsConfig accepts only Dekart's declarative flat V1 document.
func validateWidgetsConfig(value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("widget configuration must be a non-empty JSON object")
	}
	if len(value) > MaxMapConfigSize {
		return fmt.Errorf("widget configuration is too large")
	}
	var raw any
	if err := json.Unmarshal([]byte(value), &raw); err != nil {
		return fmt.Errorf("invalid widget configuration: %w", err)
	}
	schema, err := getWidgetsConfigSchema()
	if err != nil {
		return fmt.Errorf("widget schema unavailable: %w", err)
	}
	if err := schema.Validate(raw); err != nil {
		return fmt.Errorf("invalid widget configuration: %w", err)
	}
	var config persistedWidgetsConfig
	if err := json.Unmarshal([]byte(value), &config); err != nil {
		return fmt.Errorf("invalid widget configuration: %w", err)
	}
	widgetIDs := make(map[string]struct{}, len(config.Widgets))
	for _, widget := range config.Widgets {
		if _, exists := widgetIDs[widget.ID]; exists {
			return fmt.Errorf("widget id %q must be unique within the report", widget.ID)
		}
		widgetIDs[widget.ID] = struct{}{}
	}
	return nil
}

// validateReportWidgetsConfigTx validates shape and dataset membership under the report lock held by the caller.
func (s Server) validateReportWidgetsConfigTx(ctx context.Context, tx *sql.Tx, reportID string, value string) error {
	if err := validateWidgetsConfig(value); err != nil {
		return err
	}
	datasetIDs, err := reportDatasetIDsTx(ctx, tx, reportID)
	if err != nil {
		return err
	}
	var config persistedWidgetsConfig
	if err := json.Unmarshal([]byte(value), &config); err != nil {
		return fmt.Errorf("invalid widget configuration: %w", err)
	}
	knownIDs := sortedDatasetIDs(datasetIDs)
	issues := make([]mapConfigValidationIssue, 0)
	for i, widget := range config.Widgets {
		if _, exists := datasetIDs[widget.DataID]; exists {
			continue
		}
		expected := "existing report dataset_id"
		if len(knownIDs) > 0 {
			expected = fmt.Sprintf("one of: %s", strings.Join(knownIDs, ", "))
		}
		issues = append(issues, mapConfigValidationIssue{
			Path:     fmt.Sprintf("widgets_config.widgets[%d].dataId", i),
			Reason:   "unknown_dataset_id",
			Expected: expected,
			Actual:   widget.DataID,
		})
	}
	if len(issues) > 0 {
		return &widgetsConfigValidationError{Issues: issues}
	}
	return nil
}

// remapWidgetDatasets changes only explicit widget dataset bindings when a report is forked.
func remapWidgetDatasets(value string, datasets []*proto.Dataset, ids []string) (string, error) {
	if value == "" {
		return "", nil
	}
	if err := validateWidgetsConfig(value); err != nil {
		return "", err
	}
	// REVIEW: Report forks remap only explicit widget dataId bindings while preserving the rest of the flat document.
	var config persistedWidgetsConfig
	if err := json.Unmarshal([]byte(value), &config); err != nil {
		return "", err
	}
	replacements := make(map[string]string, len(datasets))
	for i, dataset := range datasets {
		replacements[dataset.Id] = ids[i]
	}
	for i := range config.Widgets {
		if replacement, exists := replacements[config.Widgets[i].DataID]; exists {
			config.Widgets[i].DataID = replacement
		}
	}
	result, err := json.Marshal(config)
	return string(result), err
}
