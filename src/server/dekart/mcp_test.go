package dekart

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestWriteMCPCallError_HTTPErrorPreservesStatus(t *testing.T) {
	recorder := httptest.NewRecorder()

	writeMCPCallError(recorder, &mcpHTTPError{statusCode: http.StatusRequestEntityTooLarge, message: "file too large"})

	assert.Equal(t, http.StatusRequestEntityTooLarge, recorder.Code)
	assert.Equal(t, "file too large\n", recorder.Body.String())
}

func TestCallUploadHandlerJSON_PropagatesHandlerStatusAndMessage(t *testing.T) {
	server := &Server{}
	handler := func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "workspace is read-only", http.StatusForbidden)
	}

	payload, err := server.callUploadHandlerJSON(context.Background(), http.MethodPost, nil, nil, handler)

	assert.Nil(t, payload)
	var httpErr *mcpHTTPError
	assert.True(t, errors.As(err, &httpErr))
	assert.Equal(t, http.StatusForbidden, httpErr.statusCode)
	assert.Equal(t, "workspace is read-only", httpErr.message)
}

func TestCallUploadHandlerJSON_UsesStatusTextWhenBodyEmpty(t *testing.T) {
	server := &Server{}
	handler := func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}

	payload, err := server.callUploadHandlerJSON(context.Background(), http.MethodPost, nil, nil, handler)

	assert.Nil(t, payload)
	var httpErr *mcpHTTPError
	assert.True(t, errors.As(err, &httpErr))
	assert.Equal(t, http.StatusUnauthorized, httpErr.statusCode)
	assert.Equal(t, http.StatusText(http.StatusUnauthorized), httpErr.message)
}
