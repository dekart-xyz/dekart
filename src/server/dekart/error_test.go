package dekart

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"google.golang.org/api/googleapi"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
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

func TestGRPCError_NilError(t *testing.T) {
	// Test that nil error returns nil
	result := GRPCError("test message", nil)
	assert.Nil(t, result)
}

func TestGRPCError_NormalError(t *testing.T) {
	// Test normal error returns Internal status
	mockErr := errors.New("database connection failed")
	result := GRPCError("Cannot connect to database", mockErr)

	assert.NotNil(t, result)
	st, ok := status.FromError(result)
	assert.True(t, ok)
	assert.Equal(t, codes.Internal, st.Code())
	assert.Equal(t, "database connection failed", st.Message())
}

func TestGRPCError_ContextCanceled(t *testing.T) {
	// Test context canceled error returns Canceled status
	mockErr := errors.New("context canceled")
	result := GRPCError("Cannot retrieve report", mockErr)

	assert.NotNil(t, result)
	st, ok := status.FromError(result)
	assert.True(t, ok)
	assert.Equal(t, codes.Canceled, st.Code())
	assert.Equal(t, "Context Cancelled", st.Message())
}

func TestGRPCError_PostgreSQLCanceled(t *testing.T) {
	// Test PostgreSQL canceling statement error returns Canceled status
	mockErr := errors.New("pq: canceling statement due to user request")
	result := GRPCError("Cannot retrieve report", mockErr)

	assert.NotNil(t, result)
	st, ok := status.FromError(result)
	assert.True(t, ok)
	assert.Equal(t, codes.Canceled, st.Code())
	assert.Equal(t, "Context Cancelled", st.Message())
}

func TestGRPCError_PostgreSQLCanceledWithPrefix(t *testing.T) {
	// Test PostgreSQL error with additional context
	mockErr := errors.New("ERROR: pq: canceling statement due to user request (SQLSTATE 57014)")
	result := GRPCError("Cannot execute query", mockErr)

	assert.NotNil(t, result)
	st, ok := status.FromError(result)
	assert.True(t, ok)
	assert.Equal(t, codes.Canceled, st.Code())
	assert.Equal(t, "Context Cancelled", st.Message())
}
