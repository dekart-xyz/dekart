package dekart

import "strings"

// Centralized mapping between file extensions and MIME types
var extToMime = map[string]string{
	"csv":     "text/csv",
	"geojson": "application/geo+json",
	"parquet": "application/vnd.apache.parquet",
	"json":    "application/json",
}

var mimeToExt = map[string]string{
	"text/csv":                       "csv",
	"application/geo+json":           "geojson",
	"application/vnd.apache.parquet": "parquet",
	"application/json":               "json",
	// Some sources use octet-stream for parquet
	"application/octet-stream": "parquet",
}

func getFileExtensionFromMime(mimeType string) string {
	if mimeType == "" {
		return ""
	}
	if ext, ok := mimeToExt[mimeType]; ok {
		return ext
	}
	return ""
}

func getContentTypeFromExtensionCentral(ext string) string {
	if ext == "" {
		return "text/csv"
	}
	e := strings.ToLower(ext)
	if mime, ok := extToMime[e]; ok {
		return mime
	}
	return "text/csv"
}
