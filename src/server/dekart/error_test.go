package dekart

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"google.golang.org/api/googleapi"
)

func TestHttpError_SnowflakeJWTInvalid(t *testing.T) {
	// Test the specific Snowflake JWT token invalid error case
	errorMessage := "390144 (08004): JWT token is invalid."
	expectedStatus := http.StatusForbidden
	expectedBody := "Snowflake: 390144 (08004): JWT token is invalid. Check that your Snowflake public key or OAuth configuration is up to date.\n"

	// Create a mock error
	mockErr := &mockError{message: errorMessage}

	// Create a response recorder
	recorder := httptest.NewRecorder()

	// Call HttpError
	HttpError(recorder, mockErr)

	// Assert the response
	assert.Equal(t, expectedStatus, recorder.Code)
	assert.Equal(t, expectedBody, recorder.Body.String())
}

func TestHttpError_BigQueryJobNotFound(t *testing.T) {
	// Test the specific BigQuery job not found error case
	errorMessage := "Not found: Job village-data-analytics:IWd2upGJrrRp5Wf4C6Olta8J5g2, notFound"
	expectedStatus := http.StatusNotFound
	expectedBody := errorMessage + " Check missing bigquery.jobs.get permission on the submitting project\n"

	// Create a mock Google API error
	mockGoogleErr := &googleapi.Error{
		Code:    404,
		Message: errorMessage,
	}

	// Create a response recorder
	recorder := httptest.NewRecorder()

	// Call HttpError
	HttpError(recorder, mockGoogleErr)

	// Assert the response
	assert.Equal(t, expectedStatus, recorder.Code)
	assert.Equal(t, expectedBody, recorder.Body.String())
}

// mockError implements the error interface for testing
type mockError struct {
	message string
}

func (e *mockError) Error() string {
	return e.message
}
