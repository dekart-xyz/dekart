package duckdbsql

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCompileRewritesDatasetReferencesAndParameters(t *testing.T) {
	result := Compile(context.Background(), `
		WITH source AS (
			SELECT '{{ignored}}' AS literal_value
			FROM datasets."Orders"
			-- datasets."Fake"; DELETE
		)
		SELECT * FROM source WHERE region = {{region}};
	`, map[string][]string{"Orders": {"dataset-id"}}, []string{"region"})

	require.Empty(t, result.Error)
	require.Equal(t, []string{"dataset-id"}, result.Dependencies)
	require.Contains(t, result.SQL, `datasets.d_dataset_id`)
	require.Contains(t, result.SQL, `region = __DEKART_BOUND_PARAMETER_0__`)
}

func TestCompileRejectsReservedParameterSentinelInStringLiteral(t *testing.T) {
	result := Compile(context.Background(), `SELECT '"__DEKART_BOUND_PARAMETER_0__"', {{region}}`, nil, []string{"region"})
	require.Equal(t, "DuckDB SQL uses a reserved parameter identifier", result.Error)
}

func TestCompileSupportsEscapedDatasetLabels(t *testing.T) {
	result := Compile(context.Background(), `SELECT * FROM datasets."A ""quoted"" label"`, map[string][]string{`A "quoted" label`: {"quoted-id"}}, nil)
	require.Empty(t, result.Error)
	require.Equal(t, []string{"quoted-id"}, result.Dependencies)
}

func TestCompilePreservesParameterShapedTextInDatasetLabels(t *testing.T) {
	result := Compile(context.Background(), `SELECT * FROM datasets."Sales {{region}}"`, map[string][]string{"Sales {{region}}": {"dataset-id"}}, []string{"region"})

	require.Empty(t, result.Error)
	require.Equal(t, []string{"dataset-id"}, result.Dependencies)
}

func TestCompilePreservesParameterShapedTextInCTENames(t *testing.T) {
	result := Compile(context.Background(), `WITH "{{region}}" AS (SELECT 1) SELECT * FROM "{{region}}"`, nil, []string{"region"})

	require.Empty(t, result.Error)
}

func TestCompileRejectsUnsafeSQL(t *testing.T) {
	unsafe := []string{
		`SELECT 1; SELECT 2`,
		`DELETE FROM datasets."Orders"`,
		`PRAGMA version`,
		`ATTACH 'other.db'`,
		`COPY (SELECT 1) TO 'result.csv'`,
		`CREATE TABLE example AS SELECT 1`,
		`INSTALL httpfs`,
		`LOAD httpfs`,
		`SELECT * FROM read_parquet('https://example.test/data.parquet')`,
		`SELECT * FROM unknown_extension_reader('https://example.test/data')`,
		`SELECT * FROM datasets.d_orders`,
		`SELECT * FROM dekart_internal.source_files`,
		`SELECT * FROM information_schema/**/.tables`,
		`SELECT * FROM duckdb_tables/**/()`,
		`/* unterminated`,
		`SELECT {{bad-name}}`,
		`SELECT __DEKART_BOUND_PARAMETER_0__, {{value}}`,
	}
	for _, sql := range unsafe {
		t.Run(sql, func(t *testing.T) {
			require.NotEmpty(t, Compile(context.Background(), sql, map[string][]string{"Orders": {"orders"}}, []string{"value"}).Error)
		})
	}
}

func TestCompileIgnoresParametersInDollarQuotedStrings(t *testing.T) {
	result := Compile(context.Background(), `SELECT $tag${{region}}$tag$ AS literal_value, {{region}} AS parameter_value`, nil, []string{"region"})

	require.Empty(t, result.Error)
	require.Contains(t, result.SQL, `'{{region}}'`)
	require.Equal(t, 1, strings.Count(result.SQL, "__DEKART_BOUND_PARAMETER_0__"))
}

func TestCompileLetsDuckDBParseParametersAroundEscapesAndNestedComments(t *testing.T) {
	result := Compile(context.Background(), `SELECT E'ignored\' {{missing}}', /* outer /* {{missing}} */ still ignored */ {{region}}`, nil, []string{"region"})

	require.Empty(t, result.Error)
	require.Contains(t, result.SQL, `{{missing}}`)
	require.Equal(t, 1, strings.Count(result.SQL, "__DEKART_BOUND_PARAMETER_0__"))
}

func TestCompileMatchesCTENamesCaseInsensitively(t *testing.T) {
	result := Compile(context.Background(), `WITH Foo AS (SELECT 1) SELECT * FROM foo`, nil, nil)

	require.Empty(t, result.Error)
}

func TestCompileHandlesCommentSeparatedDatasetReference(t *testing.T) {
	result := Compile(context.Background(), "SELECT * FROM datasets/**/.-- label\n\"Orders\"", map[string][]string{"Orders": {"orders"}}, nil)
	require.Empty(t, result.Error)
	require.Equal(t, []string{"orders"}, result.Dependencies)
	require.Contains(t, result.SQL, `datasets.d_orders`)
}

func TestCompileAllowsSafeInMemoryTableFunctions(t *testing.T) {
	for _, sql := range []string{
		`SELECT * FROM range(3)`,
		`SELECT * FROM generate_series(1, 3)`,
		`SELECT * FROM UNNEST([1, 2, 3])`,
		`SELECT * FROM LATERAL (SELECT 1 AS x)`,
	} {
		t.Run(sql, func(t *testing.T) {
			require.Empty(t, Compile(context.Background(), sql, nil, nil).Error)
		})
	}
}

func TestCompileReportsAmbiguousAndMissingDatasets(t *testing.T) {
	ambiguous := Compile(context.Background(), `SELECT * FROM datasets."Orders"`, map[string][]string{"Orders": {"one", "two"}}, nil)
	require.True(t, strings.Contains(strings.ToLower(ambiguous.Error), "ambiguous"))
	missing := Compile(context.Background(), `SELECT * FROM datasets."Missing"`, nil, nil)
	require.True(t, strings.Contains(strings.ToLower(missing.Error), "not found"))
}
