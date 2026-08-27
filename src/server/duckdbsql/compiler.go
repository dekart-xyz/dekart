package duckdbsql

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"

	_ "github.com/duckdb/duckdb-go/v2"
)

var openParserDatabase = sync.OnceValues(func() (*sql.DB, error) {
	db, err := sql.Open("duckdb", "")
	if err == nil {
		// One parser connection bounds the native memory retained by the process.
		db.SetMaxOpenConns(1)
	}
	return db, err
})

var safeTableFunctions = map[string]bool{
	"GENERATE_SERIES": true,
	"RANGE":           true,
	"UNNEST":          true,
}

// Result contains the shared graph analysis and exact browser execution SQL.
type Result struct {
	SQL          string
	Dependencies []string
	Error        string
}

// Compile parses one read-only statement and resolves report dataset references.
func Compile(ctx context.Context, query string, datasetsByLabel map[string][]string, parameterNames []string) Result {
	compiled, dependencies, err := compile(ctx, query, datasetsByLabel, parameterNames)
	if err != nil {
		return Result{Dependencies: dependencies, Error: err.Error()}
	}
	return Result{SQL: compiled, Dependencies: dependencies}
}

// compile delegates SQL syntax to DuckDB and only applies Dekart reference policy.
func compile(ctx context.Context, query string, datasetsByLabel map[string][]string, parameterNames []string) (string, []string, error) {
	query, parameterNames, err := encodeParameters(query, parameterNames)
	if err != nil {
		return "", nil, err
	}
	ast, err := parse(ctx, query)
	if err != nil {
		return "", nil, err
	}
	statements, ok := ast["statements"].([]any)
	if !ok || len(statements) != 1 {
		return "", nil, fmt.Errorf("DuckDB SQL must contain exactly one statement")
	}
	dependencies := make([]string, 0)
	seenDependencies := make(map[string]bool)
	if err := rewriteAST(ast, nil, datasetsByLabel, parameterNames, &dependencies, seenDependencies); err != nil {
		return "", dependencies, err
	}
	sort.Strings(dependencies)
	compiled, err := deserialize(ctx, ast)
	compiled = restoreParameterInputs(compiled, parameterNames)
	return compiled, dependencies, err
}

// parse uses DuckDB's parser without binding or executing the submitted SQL.
func parse(ctx context.Context, query string) (map[string]any, error) {
	if strings.TrimSpace(query) == "" {
		return nil, fmt.Errorf("DuckDB query is empty")
	}
	db, err := openParserDatabase()
	if err != nil {
		return nil, err
	}
	var serialized string
	if err := db.QueryRowContext(ctx, `select json_serialize_sql(?::varchar)::varchar`, query).Scan(&serialized); err != nil {
		return nil, err
	}
	ast := make(map[string]any)
	decoder := json.NewDecoder(bytes.NewBufferString(serialized))
	decoder.UseNumber()
	if err := decoder.Decode(&ast); err != nil {
		return nil, err
	}
	if failed, _ := ast["error"].(bool); failed {
		message, _ := ast["error_message"].(string)
		return nil, fmt.Errorf("DuckDB SQL is invalid: %s", message)
	}
	return ast, nil
}

// deserialize turns the resolved DuckDB AST back into browser execution SQL.
func deserialize(ctx context.Context, ast map[string]any) (string, error) {
	serialized, err := json.Marshal(ast)
	if err != nil {
		return "", err
	}
	db, err := openParserDatabase()
	if err != nil {
		return "", err
	}
	var query string
	if err := db.QueryRowContext(ctx, `select json_deserialize_sql(?::json)`, string(serialized)).Scan(&query); err != nil {
		return "", err
	}
	return query, nil
}

// rewriteAST resolves Dekart parameters and datasets while enforcing source policy.
func rewriteAST(value any, inheritedCTEs map[string]bool, datasetsByLabel map[string][]string, parameterNames []string, dependencies *[]string, seenDependencies map[string]bool) error {
	switch value := value.(type) {
	case []any:
		for _, child := range value {
			if err := rewriteAST(child, inheritedCTEs, datasetsByLabel, parameterNames, dependencies, seenDependencies); err != nil {
				return err
			}
		}
	case map[string]any:
		if _, ok := value["named_param_map"]; ok {
			value["named_param_map"] = []any{}
		}
		ctes := inheritedCTEs
		if value["type"] == "SELECT_NODE" {
			ctes = extendCTEs(inheritedCTEs, value["cte_map"])
		}
		if value["class"] == "PARAMETER" {
			if err := rewriteParameter(value, len(parameterNames)); err != nil {
				return err
			}
		}
		switch value["type"] {
		case "BASE_TABLE":
			if err := rewriteBaseTable(value, ctes, datasetsByLabel, parameterNames, dependencies, seenDependencies); err != nil {
				return err
			}
		case "TABLE_FUNCTION":
			function, _ := value["function"].(map[string]any)
			name, _ := function["function_name"].(string)
			if !safeTableFunctions[strings.ToUpper(name)] {
				return fmt.Errorf("DuckDB SQL cannot use table function %s", name)
			}
		}
		for _, key := range sortedKeys(value) {
			if err := rewriteAST(value[key], ctes, datasetsByLabel, parameterNames, dependencies, seenDependencies); err != nil {
				return err
			}
		}
	}
	return nil
}

// rewriteParameter converts a parsed DuckDB parameter into the browser token.
func rewriteParameter(value map[string]any, parameterCount int) error {
	identifier, _ := value["identifier"].(string)
	const prefix = "__DEKART_INPUT_PARAMETER_"
	index, err := strconv.Atoi(strings.TrimSuffix(strings.TrimPrefix(identifier, prefix), "__"))
	if err != nil || index < 0 || index >= parameterCount || identifier != strings.TrimPrefix(parameterInputMarker(index), "$") {
		return fmt.Errorf("invalid DuckDB query parameter $%s", identifier)
	}
	delete(value, "identifier")
	value["class"] = "COLUMN_REF"
	value["type"] = "COLUMN_REF"
	value["column_names"] = []string{fmt.Sprintf("__DEKART_BOUND_PARAMETER_%d__", index)}
	return nil
}

// sortedKeys makes validation errors and partial dependency results deterministic.
func sortedKeys(value map[string]any) []string {
	keys := make([]string, 0, len(value))
	for key := range value {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// extendCTEs adds the names visible from a SELECT node to its inherited scope.
func extendCTEs(inherited map[string]bool, value any) map[string]bool {
	ctes := make(map[string]bool, len(inherited))
	for name := range inherited {
		ctes[name] = true
	}
	cteMap, _ := value.(map[string]any)
	entries, _ := cteMap["map"].([]any)
	for _, entry := range entries {
		definition, _ := entry.(map[string]any)
		name, _ := definition["key"].(string)
		ctes[strings.ToLower(name)] = true
	}
	return ctes
}

// rewriteBaseTable maps datasets."Label" to the immutable browser table name.
func rewriteBaseTable(table map[string]any, ctes map[string]bool, datasetsByLabel map[string][]string, parameterNames []string, dependencies *[]string, seenDependencies map[string]bool) error {
	catalog, _ := table["catalog_name"].(string)
	schema, _ := table["schema_name"].(string)
	name, _ := table["table_name"].(string)
	if catalog == "" && schema == "" && ctes[strings.ToLower(name)] {
		return nil
	}
	if catalog != "" || !strings.EqualFold(schema, "datasets") {
		return fmt.Errorf("DuckDB SQL can only read report datasets")
	}
	name = restoreParameterInputs(name, parameterNames)
	matches := datasetsByLabel[name]
	if len(matches) == 0 {
		return fmt.Errorf("dataset %q was not found. Update the DuckDB SQL or dataset name", name)
	}
	if len(matches) > 1 {
		return fmt.Errorf("dataset %q is ambiguous because %d datasets use this name. Rename a dataset or update the SQL", name, len(matches))
	}
	datasetID := strings.ToLower(matches[0])
	table["catalog_name"] = ""
	table["schema_name"] = "datasets"
	table["table_name"] = "d_" + strings.ReplaceAll(datasetID, "-", "_")
	if !seenDependencies[datasetID] {
		*dependencies = append(*dependencies, datasetID)
		seenDependencies[datasetID] = true
	}
	return nil
}

// encodeParameters lets DuckDB distinguish placeholders from literal text and comments.
func encodeParameters(query string, parameterNames []string) (string, []string, error) {
	upperQuery := strings.ToUpper(query)
	if strings.Contains(upperQuery, "__DEKART_BOUND_PARAMETER_") || strings.Contains(upperQuery, "__DEKART_INPUT_PARAMETER_") {
		return "", nil, fmt.Errorf("DuckDB SQL uses a reserved parameter identifier")
	}
	parameterNames = append([]string(nil), parameterNames...)
	sort.Strings(parameterNames)
	for index, name := range parameterNames {
		query = strings.ReplaceAll(query, "{{"+name+"}}", parameterInputMarker(index))
	}
	return query, parameterNames, nil
}

// parameterInputMarker is valid DuckDB syntax but reserved from user SQL.
func parameterInputMarker(index int) string {
	return fmt.Sprintf("$__DEKART_INPUT_PARAMETER_%d__", index)
}

// restoreParameterInputs recovers parameter-shaped text parsed inside literals or identifiers.
func restoreParameterInputs(value string, parameterNames []string) string {
	for index, name := range parameterNames {
		value = strings.ReplaceAll(value, parameterInputMarker(index), "{{"+name+"}}")
	}
	return value
}
