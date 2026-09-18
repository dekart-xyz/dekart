package dekart

import (
	"encoding/json"
	"testing"

	"dekart/src/proto"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdateDatasetIdsRemapsOnlyMapBindings(t *testing.T) {
	const oldID = "dataset-old"
	report := &proto.Report{MapConfig: `{
  "version":"v1",
  "config":{
    "visState":{
      "layers":[{"id":"layer","config":{"dataId":"dataset-old","label":"keep dataset-old here"}}],
      "filters":[{"dataId":["dataset-old"],"name":["value"]}],
      "interactionConfig":{"tooltip":{"fields":{"dataset-old":[{"name":"value"}]},"fieldsToShow":{"dataset-old":[{"name":"value"}]}}}
    },
    "mapState":{},
    "mapStyle":{}
  },
  "note":"dataset-old is free text"
}`}

	remapped, ids, err := updateDatasetIds(report, []*proto.Dataset{{Id: oldID}})
	require.NoError(t, err)
	require.Len(t, ids, 1)
	assert.NotEqual(t, oldID, ids[0])

	var root map[string]any
	require.NoError(t, json.Unmarshal([]byte(remapped), &root))
	visState := root["config"].(map[string]any)["visState"].(map[string]any)
	layerConfig := visState["layers"].([]any)[0].(map[string]any)["config"].(map[string]any)
	assert.Equal(t, ids[0], layerConfig["dataId"])
	assert.Equal(t, "keep dataset-old here", layerConfig["label"])
	assert.Equal(t, ids[0], visState["filters"].([]any)[0].(map[string]any)["dataId"].([]any)[0])
	tooltip := visState["interactionConfig"].(map[string]any)["tooltip"].(map[string]any)
	_, hasOldFields := tooltip["fields"].(map[string]any)[oldID]
	_, hasNewFields := tooltip["fields"].(map[string]any)[ids[0]]
	assert.False(t, hasOldFields)
	assert.True(t, hasNewFields)
	_, hasOldFieldsToShow := tooltip["fieldsToShow"].(map[string]any)[oldID]
	_, hasNewFieldsToShow := tooltip["fieldsToShow"].(map[string]any)[ids[0]]
	assert.False(t, hasOldFieldsToShow)
	assert.True(t, hasNewFieldsToShow)
	assert.Equal(t, "dataset-old is free text", root["note"])
}

func TestUpdateDatasetIdsRejectsMalformedMapConfig(t *testing.T) {
	_, _, err := updateDatasetIds(&proto.Report{MapConfig: "{"}, []*proto.Dataset{{Id: "dataset-old"}})
	require.Error(t, err)
}
