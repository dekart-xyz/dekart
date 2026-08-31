package dekart

import (
	"dekart/src/proto"
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

func TestPrerequisiteDuckDBQueriesScopesDependencies(t *testing.T) {
	queries := []duckDBGraphQuery{
		{queryID: "ancestor", datasetID: "ancestor-dataset", dependencyDatasetIDs: []string{"warehouse-dataset"}},
		{queryID: "root", datasetID: "root-dataset", dependencyDatasetIDs: []string{"file-dataset", "ancestor-dataset"}},
		{queryID: "consumer", datasetID: "consumer-dataset", dependencyDatasetIDs: []string{"root-dataset"}},
		{queryID: "unrelated", datasetID: "unrelated-dataset"},
	}

	ordered, selected, external, err := prerequisiteDuckDBQueries(queries, "root")
	require.NoError(t, err)
	require.Equal(t, []string{"ancestor", "root"}, []string{ordered[0].queryID, ordered[1].queryID})
	require.Equal(t, map[string]bool{"ancestor": true, "root": true}, selected)
	require.Equal(t, []string{"file-dataset", "warehouse-dataset"}, external)
}

func TestLowerDuckDBExecutionIsDeterministic(t *testing.T) {
	snapshot := &duckDBPreparationSnapshot{
		params: []*proto.QueryParam{
			{Name: "z", DefaultValue: "last"},
			{Name: "a", DefaultValue: "first"},
		},
		ordered: []duckDBGraphQuery{{queryID: "root", datasetID: "root-id"}},
		sources: []duckDBPreparationSource{
			{datasetID: "file-id", fileSource: "file-source", extension: "geojson"},
			{datasetID: "warehouse-id", queryID: "warehouse-query", extension: "csv"},
		},
	}
	jobs := map[string]*proto.QueryJob{
		"warehouse-id": {Id: "warehouse-job"},
		"root-id": {
			Id:        "root-job",
			QueryId:   "root",
			QueryText: `select (SELECT "p0" FROM dekart_internal."params_d_root_id") as value`,
			JobStatus: proto.QueryJob_JOB_STATUS_DONE,
		},
	}

	execution, err := lowerDuckDBExecution(snapshot, jobs, "qp_z=override")
	require.NoError(t, err)
	require.Equal(t, duckDBExecutionVersion, execution.DuckdbVersion)
	require.Equal(t, []string{"spatial", "parquet", "json", "h3"}, []string{
		execution.Extensions[0].Name,
		execution.Extensions[1].Name,
		execution.Extensions[2].Name,
		execution.Extensions[3].Name,
	})
	require.Equal(t, "community", execution.Extensions[3].Repository)
	require.Len(t, execution.Sources, 2)
	require.Equal(t, "file-source", execution.Sources[0].GetFileSourceId())
	require.Equal(t, "warehouse-job", execution.Sources[1].GetQueryJobId())
	require.Contains(t, execution.Statements[2].Sql, "getvariable('dekart_source_0_path')")
	require.Empty(t, execution.Statements[2].Parameters)
	require.Equal(t, []string{"first", "override"}, execution.Statements[4].Parameters)
	require.Contains(t, execution.Statements[5].Sql, `dekart_internal."job_root_job"`)
	require.Contains(t, execution.Statements[7].Sql, `datasets."d_root_id"`)
}

func TestInjectQueryParamsCanonicalizesBrowserFormEncoding(t *testing.T) {
	params := []*proto.QueryParam{
		{Name: "second", DefaultValue: "default"},
		{Name: "first", DefaultValue: "fallback"},
	}

	query, hashA, err := injectQueryParams("select {{first}}, {{second}}", params, "qp_first=&qp_second=~*%27")
	require.NoError(t, err)
	require.Equal(t, "select 'fallback', '~*'''", query)
	require.Equal(t, "c2c36bd27a62d5e99aaf7f2a3bea9a8a", hashA)
	_, hashB, err := injectQueryParams("", params, "qp_second=~*%27&qp_first=")
	require.NoError(t, err)
	require.Equal(t, hashA, hashB)
	_, omittedHash, err := injectQueryParams("", params, "qp_second=~*%27")
	require.NoError(t, err)
	require.NotEqual(t, hashA, omittedHash)
}
