package dekart

import (
	"path/filepath"
	"strings"
)

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

// resolveUploadMimeType uses a supported filename when the client can only declare generic binary data.
func resolveUploadMimeType(name, mimeType string) string {
	if mimeType != "application/octet-stream" {
		return mimeType
	}
	extension := strings.TrimPrefix(strings.ToLower(filepath.Ext(name)), ".")
	if inferred, ok := extToMime[extension]; ok {
		return inferred
	}
	return mimeType
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
