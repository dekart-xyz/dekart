package dekart

import (
	"strings"
	"testing"
)

func TestValidateKeplerMapConfigV1_ValidPointLayer(t *testing.T) {
	mapConfig := `{
		"version": "v1",
		"config": {
			"visState": {
				"layers": [
					{
						"id": "layer-1",
						"type": "point",
						"config": {
							"dataId": "dataset-1",
							"label": "Test Layer",
							"color": [0, 204, 153],
							"columns": {"lat": "lat", "lng": "lng"},
							"isVisible": true,
							"visConfig": {}
						},
						"visualChannels": {"colorScale": "ordinal"}
					}
				],
				"filters": []
			}
		}
	}`
	issues := validateKeplerMapConfigV1(mapConfig, map[string]struct{}{"dataset-1": {}})
	if len(issues) > 0 {
		t.Fatalf("expected no issues, got: %v", issues)
	}
}

func TestValidateKeplerMapConfigV1_UnknownLayerDataID(t *testing.T) {
	mapConfig := `{
		"version": "v1",
		"config": {
			"visState": {
				"layers": [
					{
						"id": "layer-1",
						"type": "point",
						"config": {
							"dataId": "dataset-unknown",
							"columns": {"lat": "lat", "lng": "lng"}
						}
					}
				]
			}
		}
	}`
	issues := validateKeplerMapConfigV1(mapConfig, map[string]struct{}{"dataset-1": {}})
	if len(issues) == 0 {
		t.Fatal("expected validation issues")
	}
	assertContainsIssue(t, issues, "map_config.config.visState.layers[0].config.dataId unknown_dataset_id")
}

func TestValidateKeplerMapConfigV1_MissingLayersFiltersIsAllowed(t *testing.T) {
	mapConfig := `{
		"version": "v1",
		"config": {
			"visState": {
				"interactionConfig": {
					"tooltip": {
						"enabled": true
					}
				}
			}
		}
	}`
	issues := validateKeplerMapConfigV1(mapConfig, map[string]struct{}{})
	if len(issues) > 0 {
		t.Fatalf("expected no issues, got: %v", issues)
	}
}

func TestValidateKeplerMapConfigV1_PointLayerLatLngRequired(t *testing.T) {
	mapConfig := `{
		"version": "v1",
		"config": {
			"visState": {
				"layers": [
					{
						"id": "layer-1",
						"type": "point",
						"config": {
							"dataId": "dataset-1",
							"columns": {"lat": null, "lng": ""}
						}
					}
				]
			}
		}
	}`
	issues := validateKeplerMapConfigV1(mapConfig, map[string]struct{}{"dataset-1": {}})
	if len(issues) == 0 {
		t.Fatal("expected validation issues")
	}
	assertContainsIssue(t, issues, "schema violation at map_config.config.visState.layers[0].config.columns.lat")
	assertContainsIssue(t, issues, "schema violation at map_config.config.visState.layers[0].config.columns.lng")
}

func TestValidateKeplerMapConfigV1_FilterShapeAndDataID(t *testing.T) {
	mapConfig := `{
		"version": "v1",
		"config": {
			"visState": {
				"filters": [
					{"dataId": "dataset-unknown", "name": "", "type": "multiSelect", "value": []}
				]
			}
		}
	}`
	issues := validateKeplerMapConfigV1(mapConfig, map[string]struct{}{"dataset-1": {}})
	if len(issues) == 0 {
		t.Fatal("expected validation issues")
	}
	assertContainsIssue(t, issues, "schema violation at map_config.config.visState.filters[0]: missing properties: 'id'")
	assertContainsIssue(t, issues, "schema violation at map_config.config.visState.filters[0].name")
	assertContainsIssue(t, issues, "map_config.config.visState.filters[0].dataId unknown_dataset_id")
}

func TestValidateKeplerMapConfigV1_TooltipFieldsDataID(t *testing.T) {
	mapConfig := `{
		"version": "v1",
		"config": {
			"visState": {
				"interactionConfig": {
					"tooltip": {
						"fields": {
							"dataset-unknown": [{"name": "provider"}]
						}
					}
				}
			}
		}
	}`
	issues := validateKeplerMapConfigV1(mapConfig, map[string]struct{}{"dataset-1": {}})
	if len(issues) == 0 {
		t.Fatal("expected validation issues")
	}
	assertContainsIssue(t, issues, "map_config.config.visState.interactionConfig.tooltip.fields.dataset-unknown unknown_dataset_id")
}

func TestValidateKeplerMapConfigV1_TooltipFieldsToShowDataID(t *testing.T) {
	mapConfig := `{
		"version": "v1",
		"config": {
			"visState": {
				"interactionConfig": {
					"tooltip": {
						"fieldsToShow": {
							"dataset-unknown": [{"name": "provider"}]
						}
					}
				}
			}
		}
	}`
	issues := validateKeplerMapConfigV1(mapConfig, map[string]struct{}{"dataset-1": {}})
	if len(issues) == 0 {
		t.Fatal("expected validation issues")
	}
	assertContainsIssue(t, issues, "map_config.config.visState.interactionConfig.tooltip.fieldsToShow.dataset-unknown unknown_dataset_id")
}

func TestValidateKeplerMapConfigV1_BasicSchemaShape(t *testing.T) {
	mapConfig := `{"version":"v2","config":{"mapState":[]}}`
	issues := validateKeplerMapConfigV1(mapConfig, map[string]struct{}{})
	if len(issues) == 0 {
		t.Fatal("expected validation issues")
	}
	assertContainsIssue(t, issues, `schema violation at map_config.version: value must be "v1"`)
	assertContainsIssue(t, issues, "schema violation at map_config.config.mapState")
}

func TestValidateKeplerMapConfigV1_PointLayerColumnModeGeojsonRequiresGeojsonColumn(t *testing.T) {
	mapConfig := `{
		"version": "v1",
		"config": {
			"visState": {
				"layers": [
					{
						"id": "layer-1",
						"type": "point",
						"config": {
							"dataId": "dataset-1",
							"columnMode": "geojson",
							"columns": {"lat": "lat", "lng": "lng"}
						}
					}
				],
				"filters": []
			}
		}
	}`
	issues := validateKeplerMapConfigV1(mapConfig, map[string]struct{}{"dataset-1": {}})
	if len(issues) == 0 {
		t.Fatal("expected validation issues")
	}
	assertContainsIssue(t, issues, "schema violation at map_config.config.visState.layers[0]")
	assertContainsIssue(t, issues, "geojson")
}

func TestValidateKeplerMapConfigV1_ArcNeighborsModeRequiresNeighborsColumns(t *testing.T) {
	mapConfig := `{
		"version": "v1",
		"config": {
			"visState": {
				"layers": [
					{
						"id": "layer-1",
						"type": "arc",
						"config": {
							"dataId": "dataset-1",
							"columnMode": "neighbors",
							"columns": {"lat": "lat", "lng": "lng"}
						}
					}
				],
				"filters": []
			}
		}
	}`
	issues := validateKeplerMapConfigV1(mapConfig, map[string]struct{}{"dataset-1": {}})
	if len(issues) == 0 {
		t.Fatal("expected validation issues")
	}
	assertContainsIssue(t, issues, "schema violation at map_config.config.visState.layers[0]")
	assertContainsIssue(t, issues, "neighbors")
}

func TestValidateKeplerMapConfigV1_InvalidFilterTypeAndLayerBlending(t *testing.T) {
	mapConfig := `{
		"version": "v1",
		"config": {
			"visState": {
				"layers": [],
				"filters": [
					{
						"id": "f1",
						"dataId": "dataset-1",
						"name": "category",
						"type": "notAFilter",
						"value": []
					}
				],
				"layerBlending": "invalidMode"
			}
		}
	}`
	issues := validateKeplerMapConfigV1(mapConfig, map[string]struct{}{"dataset-1": {}})
	if len(issues) == 0 {
		t.Fatal("expected validation issues")
	}
	assertContainsIssue(t, issues, "schema violation at map_config.config.visState.filters[0].type")
	assertContainsIssue(t, issues, "schema violation at map_config.config.visState.layerBlending")
}

func assertContainsIssue(t *testing.T, issues []string, expected string) {
	t.Helper()
	for _, issue := range issues {
		if strings.Contains(issue, expected) {
			return
		}
	}
	t.Fatalf("expected issue containing %q, got: %v", expected, issues)
}
