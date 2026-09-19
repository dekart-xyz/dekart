package dekart

import (
	"encoding/json"
	"testing"

	"dekart/src/proto"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func validWidgetsConfig() string {
	return `{"version":1,"provider":"sqlrooms","config":{"dashboardsById":{"dataset-old":{"id":"dataset-old","title":"Widgets","panelOrder":["count_1","category_1"],"panels":[{"id":"count_1","type":"vgplot","title":"Rows","config":{"chartType":"number","settings":{"operation":"count","format":"auto","decimals":2,"subtitle":"","prefix":"","suffix":""}}},{"id":"category_1","type":"vgplot","title":"Category","config":{"chartType":"count-plot","settings":{"field":"category","metric":"count","sort":"value-desc","maxBars":20}}}]}}}}`
}

func TestValidateWidgetsConfigV1(t *testing.T) {
	require.NoError(t, validateWidgetsConfig(validWidgetsConfig()))
	for name, value := range map[string]string{
		"blank":         " ",
		"runtime SQL":   `{"version":1,"provider":"sqlrooms","config":{"dashboardsById":{},"sqlQuery":"select 1"}}`,
		"selection":     `{"version":1,"provider":"sqlrooms","config":{"dashboardsById":{}},"selection":[]}`,
		"future chart":  `{"version":1,"provider":"sqlrooms","config":{"dashboardsById":{"d":{"id":"d","title":"x","panelOrder":["p"],"panels":[{"id":"p","type":"vgplot","title":"x","config":{"chartType":"pie","settings":{}}}]}}}}`,
		"bad order":     `{"version":1,"provider":"sqlrooms","config":{"dashboardsById":{"d":{"id":"d","title":"x","panelOrder":[],"panels":[{"id":"p","type":"vgplot","title":"x","config":{"chartType":"number","settings":{"operation":"count"}}}]}}}}`,
		"missing field": `{"version":1,"provider":"sqlrooms","config":{"dashboardsById":{"d":{"id":"d","title":"x","panelOrder":["p"],"panels":[{"id":"p","type":"vgplot","title":"x","config":{"chartType":"number","settings":{"operation":"sum"}}}]}}}}`,
	} {
		t.Run(name, func(t *testing.T) { require.Error(t, validateWidgetsConfig(value)) })
	}
}

func TestRemapWidgetDatasetsOnlyChangesBindings(t *testing.T) {
	remapped, err := remapWidgetDatasets(validWidgetsConfig(), []*proto.Dataset{{Id: "dataset-old"}}, []string{"dataset-new"})
	require.NoError(t, err)
	var value map[string]any
	require.NoError(t, json.Unmarshal([]byte(remapped), &value))
	dashboards := value["config"].(map[string]any)["dashboardsById"].(map[string]any)
	require.NotContains(t, dashboards, "dataset-old")
	require.Equal(t, "dataset-new", dashboards["dataset-new"].(map[string]any)["id"])
	require.Contains(t, remapped, `"field":"category"`)
}

func TestRemoveWidgetDataset(t *testing.T) {
	updated, changed, err := removeWidgetDataset(validWidgetsConfig(), "dataset-old")
	require.NoError(t, err)
	require.True(t, changed)
	require.NotContains(t, updated, "dataset-old")
	require.NoError(t, validateWidgetsConfig(updated))
}

func TestRemoveWidgetDatasetRejectsUnknownConfig(t *testing.T) {
	unknown := `{"version":2,"provider":"future","config":{}}`
	_, changed, err := removeWidgetDataset(unknown, "dataset-old")
	require.Error(t, err)
	require.False(t, changed)
}

func TestFilterWidgetDatasetsPreventsStaleBindingRestore(t *testing.T) {
	updated, changed, err := filterWidgetDatasets(validWidgetsConfig(), func(id string) bool {
		return id != "dataset-old"
	})
	require.NoError(t, err)
	require.True(t, changed)
	require.NotContains(t, updated, "dataset-old")
	require.NoError(t, validateWidgetsConfig(updated))
}

func TestValidateExpectedReportVersion(t *testing.T) {
	current := "version-current"
	stale := "version-stale"
	widgets := validWidgetsConfig()
	require.NoError(t, validateExpectedReportVersion(current, &current, &widgets))
	require.NoError(t, validateExpectedReportVersion(current, nil, nil))
	require.Equal(t, codes.Aborted, status.Code(validateExpectedReportVersion(current, &stale, nil)))
	require.Equal(t, codes.FailedPrecondition, status.Code(validateExpectedReportVersion(current, nil, &widgets)))
}
