package dekart

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

// Anonymous requests must stop before touching the database or object storage.
func TestServeQuerySourceUnauthorized(t *testing.T) {
	server := Server{}
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/v1/query-source/query/source", nil)
	require.NotPanics(t, func() { server.ServeQuerySource(response, request) })
	require.Equal(t, http.StatusUnauthorized, response.Code)
	require.Equal(t, "Unauthorized\n", response.Body.String())
}
