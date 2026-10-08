// REVIEW: Replace approved HTTP readers with deterministic local paths and compile computed URL queries in their own scope.
package duckdbsql

import (
	"context"
	"crypto/sha256"
	"dekart/src/server/httpsource"
	"fmt"
	"strings"
)

// rewriteHTTPFunction replaces approved remote literals with browser-registered file names.
func rewriteHTTPFunction(
	function map[string]any,
	name string,
	parameterNames []string,
	sources []httpsource.Source,
	refs *[]HTTPSourceRef,
	datasetsByLabel map[string][]string,
	dependencies *[]string,
	seenDependencies map[string]bool,
) error {
	extensions := map[string]string{
		"read_json": "json", "read_json_auto": "json",
		"read_csv": "csv", "read_csv_auto": "csv",
		"read_parquet": "parquet", "st_read": "geojson",
	}
	extension, allowed := extensions[strings.ToLower(name)]
	if !allowed {
		return fmt.Errorf("Only read_json, read_csv, read_parquet and ST_Read can read an HTTP source.")
	}
	children, _ := function["children"].([]any)
	invalid := fmt.Errorf("%s needs a single quoted URL. Globs, lists, concatenation and parameters inside the URL are not supported.", name)
	if len(children) == 0 {
		return invalid
	}
	literal, _ := children[0].(map[string]any)
	gzip := false
	for _, child := range children[1:] {
		option, _ := child.(map[string]any)
		left, _ := option["left"].(map[string]any)
		names, _ := left["column_names"].([]any)
		alias := ""
		if len(names) == 1 {
			alias, _ = names[0].(string)
		}
		if strings.EqualFold(name, "ST_Read") && alias != "keep_wkb" {
			return invalid
		}
		right, _ := option["right"].(map[string]any)
		v, _ := right["value"].(map[string]any)
		if alias == "compression" && v["value"] == "gzip" {
			gzip = true
		}
	}
	// Compile the URL SELECT independently of the surrounding statement's CTE scope.
	if literal["class"] == "SUBQUERY" {
		return rewriteHTTPSubquery(function, literal, extension, gzip, parameterNames, sources, refs, datasetsByLabel, dependencies, seenDependencies)
	}
	constant, _ := literal["value"].(map[string]any)
	raw, ok := constant["value"].(string)
	raw = restoreParameterInputs(raw, parameterNames)
	if !ok || literal["class"] != "CONSTANT" || strings.ContainsAny(raw, "*?[]{}") && (strings.ContainsAny(strings.SplitN(raw, "?", 2)[0], "*?[]{}") || strings.Contains(raw, "{{")) {
		return invalid
	}
	gzip = gzip || strings.HasSuffix(strings.ToLower(strings.SplitN(raw, "?", 2)[0]), ".gz")
	match, err := httpsource.Resolve(raw, sources)
	if err != nil {
		return err
	}
	fileName := httpSourceFileName(match.SourceID+"\n"+match.URL, extension, gzip)
	constant["value"] = fileName
	ref := HTTPSourceRef{FileName: fileName, SourceID: match.SourceID, URL: match.URL, Extension: extension}
	for _, existing := range *refs {
		if existing.FileName == fileName {
			return nil
		}
	}
	*refs = append(*refs, ref)
	return nil
}

// rewriteHTTPSubquery separates URL evaluation from the file reader executed by the browser.
func rewriteHTTPSubquery(
	function,
	literal map[string]any,
	extension string,
	gzip bool,
	parameterNames []string,
	sources []httpsource.Source,
	refs *[]HTTPSourceRef,
	labels map[string][]string,
	dependencies *[]string,
	seen map[string]bool,
) error {
	invalid := fmt.Errorf("HTTP source URL subquery requires one format projection with a constant URL template")
	subquery, _ := literal["subquery"].(map[string]any)
	node, _ := subquery["node"].(map[string]any)
	projections, _ := node["select_list"].([]any)
	if node["type"] != "SELECT_NODE" || len(projections) != 1 {
		return invalid
	}
	projection, _ := projections[0].(map[string]any)
	args, _ := projection["children"].([]any)
	if projection["class"] != "FUNCTION" || projection["function_name"] != "format" || len(args) < 2 {
		return invalid
	}
	first, _ := args[0].(map[string]any)
	constant, _ := first["value"].(map[string]any)
	raw, ok := constant["value"].(string)
	if first["class"] != "CONSTANT" || !ok {
		return invalid
	}
	template, err := httpsource.ParseTemplate(restoreParameterInputs(raw, parameterNames), sources)
	if err != nil {
		return err
	}
	if template.Placeholders != len(args)-1 {
		return fmt.Errorf("HTTP source template placeholder and argument counts differ")
	}
	// No HTTP connection is available inside the URL query, so external readers fail validation.
	nested := []HTTPSourceRef{}
	if err := rewriteAST(subquery, nil, labels, parameterNames, dependencies, seen, nil, &nested); err != nil {
		return err
	}
	for index := 1; index < len(args); index++ {
		wrapper, err := parse(context.Background(), "SELECT url_encode(CAST(1 AS VARCHAR))")
		if err != nil {
			return err
		}
		statement := wrapper["statements"].([]any)[0].(map[string]any)
		wrapped := statement["node"].(map[string]any)["select_list"].([]any)[0].(map[string]any)
		wrapped["children"].([]any)[0].(map[string]any)["child"] = args[index]
		args[index] = wrapped
	}
	urlSQL, err := deserialize(context.Background(), map[string]any{"error": false, "statements": []any{subquery}})
	if err != nil {
		return err
	}
	urlSQL = restoreParameterInputs(urlSQL, parameterNames)
	// Registered bytes retain the template path's compression hint for DuckDB readers.
	gzip = gzip || strings.HasSuffix(strings.ToLower(strings.SplitN(template.URL, "?", 2)[0]), ".gz")
	fileName := httpSourceFileName(template.SourceID+"\n"+template.URL+"\n"+urlSQL, extension, gzip)
	replacement, err := parse(context.Background(), "SELECT '"+fileName+"'")
	if err != nil {
		return err
	}
	function["children"].([]any)[0] = replacement["statements"].([]any)[0].(map[string]any)["node"].(map[string]any)["select_list"].([]any)[0]
	*refs = append(*refs, HTTPSourceRef{FileName: fileName, SourceID: template.SourceID, Extension: extension, URLSQL: urlSQL, URLTemplate: template.URL})
	return nil
}

// httpSourceFileName keeps identical requests bound to the same registered file path.
func httpSourceFileName(key, extension string, gzip bool) string {
	hash := sha256.Sum256([]byte(key))
	fileName := fmt.Sprintf("dekart_internal/http_%x.%s", hash[:8], extension)
	if gzip {
		fileName += ".gz"
	}
	return fileName
}
