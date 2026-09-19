// REVIEW: Validate Widgets V1 persistence, require version checks for widget writes, and structurally remap dashboard dataset bindings on forks.
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
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const widgetsConfigSchemaURL = "inmemory://widgets_config_v1.schema.json"

//go:embed widgets_config_v1.schema.json
var widgetsConfigSchemaJSON string

var (
	widgetsConfigSchemaOnce sync.Once
	widgetsConfigSchema     *jsonschema.Schema
	widgetsConfigSchemaErr  error
)

func validateExpectedReportVersion(currentVersion string, expectedVersion, widgetsConfig *string) error {
	if expectedVersion != nil && *expectedVersion != currentVersion {
		return status.Error(codes.Aborted, "This report changed in another session. Reload before saving.")
	}
	if widgetsConfig != nil && expectedVersion == nil {
		return status.Error(codes.FailedPrecondition, "Reload this dashboard before saving.")
	}
	return nil
}

type persistedWidgetsConfig struct {
	Config struct {
		Dashboards map[string]persistedWidgetDashboard `json:"dashboardsById"`
	} `json:"config"`
}

type persistedWidgetDashboard struct {
	ID         string                 `json:"id"`
	PanelOrder []string               `json:"panelOrder"`
	Panels     []persistedWidgetPanel `json:"panels"`
}

type persistedWidgetPanel struct {
	ID     string `json:"id"`
	Config struct {
		ChartType string `json:"chartType"`
		Settings  struct {
			Operation string `json:"operation"`
			Field     string `json:"field"`
		} `json:"settings"`
	} `json:"config"`
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

// validateWidgetsConfig accepts only Dekart's declarative V1 subset. Runtime
// table names, layouts, SQL and selections are intentionally absent.
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
	panelIDs := make(map[string]struct{})
	for key, dashboard := range config.Config.Dashboards {
		if key != dashboard.ID {
			return fmt.Errorf("dashboard id %q must match its key %q", dashboard.ID, key)
		}
		ordered := make(map[string]struct{}, len(dashboard.PanelOrder))
		for _, id := range dashboard.PanelOrder {
			ordered[id] = struct{}{}
		}
		if len(ordered) != len(dashboard.Panels) {
			return fmt.Errorf("dashboard %q panelOrder must contain every panel exactly once", key)
		}
		for _, panel := range dashboard.Panels {
			if _, exists := panelIDs[panel.ID]; exists {
				return fmt.Errorf("panel id %q must be unique within the report", panel.ID)
			}
			panelIDs[panel.ID] = struct{}{}
			if _, exists := ordered[panel.ID]; !exists {
				return fmt.Errorf("dashboard %q panelOrder is missing panel %q", key, panel.ID)
			}
			settings := panel.Config.Settings
			if panel.Config.ChartType == "number" && settings.Operation != "count" && strings.TrimSpace(settings.Field) == "" {
				return fmt.Errorf("number panel %q requires a field for %s", panel.ID, settings.Operation)
			}
		}
	}
	return nil
}

// remapWidgetDatasets structurally remaps only authoritative dataset bindings.
func remapWidgetDatasets(value string, datasets []*proto.Dataset, ids []string) (string, error) {
	if value == "" {
		return "", nil
	}
	if err := validateWidgetsConfig(value); err != nil {
		return "", err
	}
	var root map[string]any
	if err := json.Unmarshal([]byte(value), &root); err != nil {
		return "", err
	}
	dashboards := root["config"].(map[string]any)["dashboardsById"].(map[string]any)
	for i, dataset := range datasets {
		dashboard, exists := dashboards[dataset.Id]
		if !exists {
			continue
		}
		dashboard.(map[string]any)["id"] = ids[i]
		delete(dashboards, dataset.Id)
		dashboards[ids[i]] = dashboard
	}
	result, err := json.Marshal(root)
	return string(result), err
}

// removeWidgetDataset removes one dashboard from a persisted widget config.
func removeWidgetDataset(value, datasetID string) (string, bool, error) {
	if value == "" {
		return value, false, nil
	}
	if err := validateWidgetsConfig(value); err != nil {
		return "", false, err
	}
	return filterWidgetDatasets(value, func(id string) bool { return id != datasetID })
}

func filterWidgetDatasets(value string, keep func(string) bool) (string, bool, error) {
	var root map[string]any
	if err := json.Unmarshal([]byte(value), &root); err != nil {
		return "", false, err
	}
	dashboards := root["config"].(map[string]any)["dashboardsById"].(map[string]any)
	changed := false
	for datasetID := range dashboards {
		if !keep(datasetID) {
			delete(dashboards, datasetID)
			changed = true
		}
	}
	if !changed {
		return value, false, nil
	}
	result, err := json.Marshal(root)
	return string(result), true, err
}

// reconcileWidgetDatasetsTx prevents stale clients from restoring dashboards
// for datasets that were deleted while their save was in flight.
func reconcileWidgetDatasetsTx(ctx context.Context, tx *sql.Tx, reportID, value string) (string, error) {
	rows, err := tx.QueryContext(ctx, "SELECT id FROM datasets WHERE report_id=$1", reportID)
	if err != nil {
		return "", err
	}
	datasetIDs := make(map[string]struct{})
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return "", err
		}
		datasetIDs[id] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return "", err
	}
	if err := rows.Close(); err != nil {
		return "", err
	}
	result, _, err := filterWidgetDatasets(value, func(id string) bool {
		_, exists := datasetIDs[id]
		return exists
	})
	return result, err
}
