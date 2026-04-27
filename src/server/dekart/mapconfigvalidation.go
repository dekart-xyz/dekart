package dekart

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v5"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const keplerMapConfigSchemaURL = "inmemory://kepler_map_config_v1.schema.json"

//go:embed kepler_map_config_v1.schema.json
var keplerMapConfigSchemaJSON string

type mapConfigDataIDRef struct {
	path string
	id   string
}

type mapConfigValidationIssue struct {
	Path     string `json:"path"`
	Reason   string `json:"reason"`
	Expected string `json:"expected"`
	Actual   string `json:"actual"`
}

type mapConfigValidationError struct {
	Issues []mapConfigValidationIssue `json:"issues"`
}

func (e *mapConfigValidationError) Error() string {
	if e == nil {
		return ""
	}
	return formatMapConfigValidationIssues(e.Issues)
}

var (
	keplerMapConfigSchemaOnce sync.Once
	keplerMapConfigSchema     *jsonschema.Schema
	keplerMapConfigSchemaErr  error
)

// validateReportMapConfig validates Kepler map config shape and dataset bindings for one report.
func (s Server) validateReportMapConfig(ctx context.Context, reportID string, mapConfig string) error {
	if strings.TrimSpace(mapConfig) == "" {
		return nil
	}

	datasetIDs, err := s.getReportDatasetIDSet(ctx, reportID)
	if err != nil {
		return status.Error(codes.Internal, err.Error())
	}
	issues := validateKeplerMapConfigV1Detailed(mapConfig, datasetIDs)
	if len(issues) == 0 {
		return nil
	}
	return &mapConfigValidationError{Issues: issues}
}

// getReportDatasetIDSet returns report dataset ids as a lookup set.
func (s Server) getReportDatasetIDSet(ctx context.Context, reportID string) (map[string]struct{}, error) {
	datasets, err := s.getDatasets(ctx, reportID)
	if err != nil {
		return nil, err
	}
	ids := make(map[string]struct{}, len(datasets))
	for _, dataset := range datasets {
		id := strings.TrimSpace(dataset.GetId())
		if id != "" {
			ids[id] = struct{}{}
		}
	}
	return ids, nil
}

// validateKeplerMapConfigV1 validates Kepler v1 config shape and returns human-readable issues.
func validateKeplerMapConfigV1(mapConfig string, datasetIDs map[string]struct{}) []string {
	issues := validateKeplerMapConfigV1Detailed(mapConfig, datasetIDs)
	if len(issues) == 0 {
		return nil
	}
	formatted := make([]string, 0, len(issues))
	for _, issue := range issues {
		formatted = append(formatted, formatMapConfigIssue(issue))
	}
	return uniqueSortedStrings(formatted)
}

// validateKeplerMapConfigV1Detailed validates Kepler v1 config and returns machine-readable issues.
func validateKeplerMapConfigV1Detailed(mapConfig string, datasetIDs map[string]struct{}) []mapConfigValidationIssue {
	var rootAny any
	if err := json.Unmarshal([]byte(mapConfig), &rootAny); err != nil {
		return []mapConfigValidationIssue{{
			Path:     "map_config",
			Reason:   "invalid_json",
			Expected: "valid JSON object",
			Actual:   err.Error(),
		}}
	}

	issues := make([]mapConfigValidationIssue, 0)
	rootObject, ok := rootAny.(map[string]any)
	if !ok {
		issues = append(issues, mapConfigValidationIssue{
			Path:     "map_config",
			Reason:   "invalid_type",
			Expected: "JSON object",
			Actual:   fmt.Sprintf("%T", rootAny),
		})
		return uniqueMapConfigIssues(issues)
	}

	schema, err := getKeplerMapConfigSchema()
	if err != nil {
		return []mapConfigValidationIssue{{
			Path:     "map_config",
			Reason:   "schema_unavailable",
			Expected: "Kepler v1 schema available",
			Actual:   err.Error(),
		}}
	}
	if err := schema.Validate(rootAny); err != nil {
		issues = append(issues, formatSchemaValidationIssues(err)...)
	}
	refs := collectDataIDRefs(rootObject)
	validateDataIDRefs(refs, datasetIDs, &issues)
	return uniqueMapConfigIssues(issues)
}

func getKeplerMapConfigSchema() (*jsonschema.Schema, error) {
	keplerMapConfigSchemaOnce.Do(func() {
		compiler := jsonschema.NewCompiler()
		if err := compiler.AddResource(keplerMapConfigSchemaURL, strings.NewReader(keplerMapConfigSchemaJSON)); err != nil {
			keplerMapConfigSchemaErr = err
			return
		}
		keplerMapConfigSchema, keplerMapConfigSchemaErr = compiler.Compile(keplerMapConfigSchemaURL)
	})
	return keplerMapConfigSchema, keplerMapConfigSchemaErr
}

func formatSchemaValidationIssues(err error) []mapConfigValidationIssue {
	var validationErr *jsonschema.ValidationError
	if !errors.As(err, &validationErr) {
		return []mapConfigValidationIssue{{
			Path:     "map_config",
			Reason:   "schema_validation_error",
			Expected: "valid Kepler v1 map config",
			Actual:   err.Error(),
		}}
	}
	issues := make([]mapConfigValidationIssue, 0)
	var visit func(*jsonschema.ValidationError)
	visit = func(current *jsonschema.ValidationError) {
		if current == nil {
			return
		}
		if len(current.Causes) == 0 {
			path := jsonPointerToMapConfigPath(current.InstanceLocation)
			message := strings.TrimSpace(current.Message)
			if message == "" {
				message = "invalid value"
			}
			issues = append(issues, mapConfigValidationIssue{
				Path:     path,
				Reason:   "schema_violation",
				Expected: "value matching Kepler v1 schema",
				Actual:   message,
			})
			return
		}
		for _, child := range current.Causes {
			visit(child)
		}
	}
	visit(validationErr)
	return uniqueMapConfigIssues(issues)
}

func jsonPointerToMapConfigPath(pointer string) string {
	if pointer == "" || pointer == "/" {
		return "map_config"
	}
	parts := strings.Split(pointer, "/")
	path := "map_config"
	for _, part := range parts[1:] {
		if part == "" {
			continue
		}
		part = strings.ReplaceAll(part, "~1", "/")
		part = strings.ReplaceAll(part, "~0", "~")
		if _, err := strconv.Atoi(part); err == nil {
			path += "[" + part + "]"
			continue
		}
		path += "." + part
	}
	return path
}

func collectDataIDRefs(root map[string]any) []mapConfigDataIDRef {
	config, ok := getObject(root, "config")
	if !ok {
		return nil
	}
	visState, ok := getObject(config, "visState")
	if !ok {
		return nil
	}

	refs := make([]mapConfigDataIDRef, 0)
	collectLayerDataIDRefs(visState, &refs)
	collectFilterDataIDRefs(visState, &refs)
	collectTooltipFieldDataIDRefs(visState, &refs)
	return refs
}

func collectLayerDataIDRefs(visState map[string]any, refs *[]mapConfigDataIDRef) {
	layersRaw, ok := visState["layers"]
	if !ok {
		return
	}
	layers, ok := layersRaw.([]any)
	if !ok {
		return
	}
	for i, layerRaw := range layers {
		layer, ok := layerRaw.(map[string]any)
		if !ok {
			continue
		}
		config, ok := getObject(layer, "config")
		if !ok {
			continue
		}
		dataID, ok := config["dataId"].(string)
		if !ok {
			continue
		}
		id := strings.TrimSpace(dataID)
		if id == "" {
			continue
		}
		*refs = append(*refs, mapConfigDataIDRef{
			path: fmt.Sprintf("map_config.config.visState.layers[%d].config.dataId", i),
			id:   id,
		})
	}
}

func collectFilterDataIDRefs(visState map[string]any, refs *[]mapConfigDataIDRef) {
	filtersRaw, ok := visState["filters"]
	if !ok {
		return
	}
	filters, ok := filtersRaw.([]any)
	if !ok {
		return
	}
	for i, filterRaw := range filters {
		filter, ok := filterRaw.(map[string]any)
		if !ok {
			continue
		}
		path := fmt.Sprintf("map_config.config.visState.filters[%d].dataId", i)
		switch dataID := filter["dataId"].(type) {
		case string:
			id := strings.TrimSpace(dataID)
			if id == "" {
				continue
			}
			*refs = append(*refs, mapConfigDataIDRef{path: path, id: id})
		case []any:
			for j, value := range dataID {
				id, ok := value.(string)
				if !ok {
					continue
				}
				id = strings.TrimSpace(id)
				if id == "" {
					continue
				}
				*refs = append(*refs, mapConfigDataIDRef{
					path: fmt.Sprintf("%s[%d]", path, j),
					id:   id,
				})
			}
		}
	}
}

func collectTooltipFieldDataIDRefs(visState map[string]any, refs *[]mapConfigDataIDRef) {
	interactionConfig, ok := getObject(visState, "interactionConfig")
	if !ok {
		return
	}
	tooltip, ok := getObject(interactionConfig, "tooltip")
	if !ok {
		return
	}
	collectTooltipDataIDRefsByKey(tooltip, "fields", refs)
	collectTooltipDataIDRefsByKey(tooltip, "fieldsToShow", refs)
}

func collectTooltipDataIDRefsByKey(tooltip map[string]any, key string, refs *[]mapConfigDataIDRef) {
	fields, ok := getObject(tooltip, key)
	if !ok {
		return
	}
	for dataID := range fields {
		id := strings.TrimSpace(dataID)
		if id == "" {
			continue
		}
		*refs = append(*refs, mapConfigDataIDRef{
			path: fmt.Sprintf("map_config.config.visState.interactionConfig.tooltip.%s.%s", key, id),
			id:   id,
		})
	}
}

// validateDataIDRefs verifies that all referenced data ids exist in report datasets.
func validateDataIDRefs(dataIDRefs []mapConfigDataIDRef, datasetIDs map[string]struct{}, issues *[]mapConfigValidationIssue) {
	if len(dataIDRefs) == 0 {
		return
	}
	knownIDs := sortedDatasetIDs(datasetIDs)
	for _, ref := range dataIDRefs {
		if _, ok := datasetIDs[ref.id]; ok {
			continue
		}
		if len(knownIDs) == 0 {
			*issues = append(*issues, mapConfigValidationIssue{
				Path:     ref.path,
				Reason:   "unknown_dataset_id",
				Expected: "existing report dataset_id",
				Actual:   ref.id,
			})
			continue
		}
		*issues = append(*issues, mapConfigValidationIssue{
			Path:     ref.path,
			Reason:   "unknown_dataset_id",
			Expected: fmt.Sprintf("one of: %s", strings.Join(knownIDs, ", ")),
			Actual:   ref.id,
		})
	}
}

func getObject(source map[string]any, key string) (map[string]any, bool) {
	raw, exists := source[key]
	if !exists {
		return nil, false
	}
	value, ok := raw.(map[string]any)
	return value, ok
}

func sortedDatasetIDs(datasetIDs map[string]struct{}) []string {
	ids := make([]string, 0, len(datasetIDs))
	for id := range datasetIDs {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

func uniqueSortedStrings(values []string) []string {
	if len(values) == 0 {
		return values
	}
	sort.Strings(values)
	unique := make([]string, 0, len(values))
	for i, value := range values {
		if i == 0 || value != values[i-1] {
			unique = append(unique, value)
		}
	}
	return unique
}

func formatMapConfigIssue(issue mapConfigValidationIssue) string {
	if issue.Reason == "schema_violation" {
		return fmt.Sprintf("schema violation at %s: %s", issue.Path, issue.Actual)
	}
	if issue.Expected != "" {
		return fmt.Sprintf("%s %s (expected: %s, actual: %s)", issue.Path, issue.Reason, issue.Expected, issue.Actual)
	}
	return fmt.Sprintf("%s %s (actual: %s)", issue.Path, issue.Reason, issue.Actual)
}

func uniqueMapConfigIssues(values []mapConfigValidationIssue) []mapConfigValidationIssue {
	if len(values) == 0 {
		return values
	}
	sort.Slice(values, func(i, j int) bool {
		return formatMapConfigIssue(values[i]) < formatMapConfigIssue(values[j])
	})
	unique := make([]mapConfigValidationIssue, 0, len(values))
	last := ""
	for _, value := range values {
		current := formatMapConfigIssue(value)
		if current == last {
			continue
		}
		unique = append(unique, value)
		last = current
	}
	return unique
}

func formatMapConfigValidationIssues(issues []mapConfigValidationIssue) string {
	if len(issues) == 0 {
		return ""
	}
	if len(issues) == 1 {
		return fmt.Sprintf("Map config validation failed: %s", formatMapConfigIssue(issues[0]))
	}
	parts := make([]string, 0, len(issues))
	for _, issue := range issues {
		parts = append(parts, formatMapConfigIssue(issue))
	}
	return fmt.Sprintf("Map config validation failed (%d issues): %s", len(issues), strings.Join(parts, "; "))
}
