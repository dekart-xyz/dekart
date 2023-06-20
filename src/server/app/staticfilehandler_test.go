package app

import (
	"io/ioutil"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestServeHTTP(t *testing.T) {
	// Prepare a temporary directory for testing
	testDir, err := ioutil.TempDir("./", "testtmp")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(testDir) // clean up after test

	// Write a test file to the directory
	testFileContent := []byte("test file content")
	err = ioutil.WriteFile(filepath.Join(testDir, "index.html"), testFileContent, 0644)
	if err != nil {
		t.Fatal(err)
	}

	// Initialize the handler
	handler := NewStaticFilesHandler(testDir)

	// Create a test server
	server := httptest.NewServer(handler)
	defer server.Close()

	t.Run("Test with a valid path", func(t *testing.T) {
		resp, err := http.Get(server.URL + "/index.html")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode, "Should succeed with status 200")

		body, _ := ioutil.ReadAll(resp.Body)
		assert.Equal(t, testFileContent, body, "Should return correct file content")
	})

	t.Run("Test with an invalid path", func(t *testing.T) {
		resp, err := http.Get(server.URL + "/nonexistent.txt")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()

		assert.Equal(t, http.StatusNotFound, resp.StatusCode, "Should return status 404 for non-existing file")
	})
	t.Run("Test with uncontrolled data used in path expression", func(t *testing.T) {
		resp, err := http.Get(server.URL + "/staticfilehandler.go")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()

		assert.Equal(t, http.StatusNotFound, resp.StatusCode, "Should return status 404 for non-existing file")
	})
}
