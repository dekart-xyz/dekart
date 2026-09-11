package dekart

import (
	"encoding/json"
	"fmt"
	"strings"

	"dekart/src/proto"
)

// validateWidgetsConfig bounds the embedded builder to declarative report dashboards.
func validateWidgetsConfig(value string) error {
	if len(value) > MaxMapConfigSize {
		return fmt.Errorf("widget configuration is too large")
	}
	var config map[string]json.RawMessage
	if err := json.Unmarshal([]byte(value), &config); err != nil {
		return fmt.Errorf("invalid widget configuration")
	}
	var version int
	var provider string
	if json.Unmarshal(config["version"], &version) != nil || version != 1 {
		return fmt.Errorf("unsupported widget configuration version")
	}
	if json.Unmarshal(config["provider"], &provider) != nil || provider != "sqlrooms" {
		return fmt.Errorf("unsupported widget provider")
	}
	var state struct {
		Dashboards map[string]struct {
			Panels []struct {
				Type   string `json:"type"`
				Config struct {
					ChartType string `json:"chartType"`
				} `json:"config"`
			} `json:"panels"`
		} `json:"dashboardsById"`
	}
	if json.Unmarshal(config["config"], &state) != nil || state.Dashboards == nil {
		return fmt.Errorf("missing dashboard configuration")
	}
	for _, dashboard := range state.Dashboards {
		for _, panel := range dashboard.Panels {
			if panel.Type != "vgplot" || (panel.Config.ChartType != "count-plot" && panel.Config.ChartType != "histogram") {
				return fmt.Errorf("unsupported widget type")
			}
		}
	}
	return nil
}

// remapWidgetDatasets changes structural table bindings while preserving titles and field names.
func remapWidgetDatasets(value string, datasets []*proto.Dataset, ids []string) (string, error) {
	if value == "" {
		return "", nil
	}
	if err := validateWidgetsConfig(value); err != nil {
		return "", err
	}
	var root map[string]interface{}
	if err := json.Unmarshal([]byte(value), &root); err != nil {
		return "", err
	}
	dashboards := root["config"].(map[string]interface{})["dashboardsById"].(map[string]interface{})
	for i, dataset := range datasets {
		entry, exists := dashboards[dataset.Id]
		if !exists {
			continue
		}
		dashboard := entry.(map[string]interface{})
		dashboard["id"] = ids[i]
		remapWidgetLayout(dashboard["layout"], dataset.Id, ids[i])
		for _, key := range []string{"selectedTable", "lastSelectedTable"} {
			if _, exists := dashboard[key]; exists {
				dashboard[key] = `"memory"."widgets"."d_` + strings.ReplaceAll(ids[i], "-", "_") + `"`
			}
		}
		delete(dashboards, dataset.Id)
		dashboards[ids[i]] = dashboard
	}
	result, err := json.Marshal(root)
	return string(result), err
}

// Layout IDs and panel metadata are typed references; chart titles are never rewritten.
func remapWidgetLayout(value interface{}, oldID, newID string) {
	switch node := value.(type) {
	case map[string]interface{}:
		if id, ok := node["id"].(string); ok && strings.HasPrefix(id, "dashboard:"+oldID+":") {
			node["id"] = strings.Replace(id, "dashboard:"+oldID+":", "dashboard:"+newID+":", 1)
		}
		if node["dashboardId"] == oldID {
			node["dashboardId"] = newID
		}
		for _, key := range []string{"children", "layouts", "panel", "meta", "lg", "sm"} {
			remapWidgetLayout(node[key], oldID, newID)
		}
		if id, ok := node["i"].(string); ok && strings.HasPrefix(id, "dashboard:"+oldID+":") {
			node["i"] = strings.Replace(id, "dashboard:"+oldID+":", "dashboard:"+newID+":", 1)
		}
	case []interface{}:
		for _, child := range node {
			remapWidgetLayout(child, oldID, newID)
		}
	}
}
