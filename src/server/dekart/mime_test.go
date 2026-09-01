package dekart

import "testing"

func TestGetFileExtensionFromMime(t *testing.T) {
	cases := map[string]string{
		"text/csv":                       "csv",
		"application/geo+json":           "geojson",
		"application/vnd.apache.parquet": "parquet",
		"application/octet-stream":       "parquet",
		"":                               "",
	}
	for mime, expected := range cases {
		if got := getFileExtensionFromMime(mime); got != expected {
			t.Fatalf("mime %q => %q, want %q", mime, got, expected)
		}
	}
}

func TestResolveUploadMimeType(t *testing.T) {
	cases := []struct {
		name     string
		mimeType string
		expected string
	}{
		{"sample.geojson", "application/octet-stream", "application/geo+json"},
		{"sample.parquet", "application/octet-stream", "application/vnd.apache.parquet"},
		{"sample.bin", "application/octet-stream", "application/octet-stream"},
		{"sample.csv", "application/geo+json", "application/geo+json"},
	}
	for _, testCase := range cases {
		if got := resolveUploadMimeType(testCase.name, testCase.mimeType); got != testCase.expected {
			t.Fatalf("resolveUploadMimeType(%q, %q) => %q, want %q", testCase.name, testCase.mimeType, got, testCase.expected)
		}
	}
}

func TestGetContentTypeFromExtensionCentral(t *testing.T) {
	cases := map[string]string{
		"csv":     "text/csv",
		"geojson": "application/geo+json",
		"parquet": "application/vnd.apache.parquet",
		"json":    "application/json",
		"":        "text/csv",
		"unknown": "text/csv",
	}
	for ext, expected := range cases {
		if got := getContentTypeFromExtensionCentral(ext); got != expected {
			t.Fatalf("ext %q => %q, want %q", ext, got, expected)
		}
	}
}
