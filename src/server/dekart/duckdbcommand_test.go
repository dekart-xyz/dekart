package dekart

import (
	"github.com/stretchr/testify/require"
	"testing"
)

func TestDuckDBCycleComponentsSeparatesCycles(t *testing.T) {
	queries := []duckDBGraphQuery{
		{queryID: "a", datasetID: "a-dataset", dependencyDatasetIDs: []string{"b-dataset"}},
		{queryID: "b", datasetID: "b-dataset", dependencyDatasetIDs: []string{"a-dataset"}},
		{queryID: "self", datasetID: "self-dataset", dependencyDatasetIDs: []string{"self-dataset", "a-dataset"}},
		{queryID: "plain", datasetID: "plain-dataset"},
	}

	components := duckDBCycleComponents(queries)
	require.NotEmpty(t, components["a"])
	require.Equal(t, components["a"], components["b"])
	require.NotEmpty(t, components["self"])
	require.NotEqual(t, components["a"], components["self"])
	require.Empty(t, components["plain"])
}

func TestCompileDuckDBParameterReferencesTargetsDatasetTable(t *testing.T) {
	compiled := compileDuckDBParameterReferences(`select __DEKART_BOUND_PARAMETER_0__`, "dataset-id", 1)
	require.Equal(t, `select (SELECT "p0" FROM dekart_internal."params_d_dataset_id")`, compiled)
}

func TestDuckDBAffectedQueriesIncludesDescendants(t *testing.T) {
	queries := []duckDBGraphQuery{
		{queryID: "root", datasetID: "root-dataset"},
		{queryID: "child", datasetID: "child-dataset", dependencyDatasetIDs: []string{"root-dataset"}},
		{queryID: "grandchild", datasetID: "grandchild-dataset", dependencyDatasetIDs: []string{"child-dataset"}},
		{queryID: "unrelated", datasetID: "unrelated-dataset"},
	}

	affected := affectedDuckDBQueryIDs(queries, []string{"root"})
	require.Equal(t, map[string]bool{"root": true, "child": true, "grandchild": true}, affected)
}
