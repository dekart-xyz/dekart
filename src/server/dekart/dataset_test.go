package dekart

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/user"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func testUserContext(email string) context.Context {
	return context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: email})
}

func TestCreateDataset_InvalidReportID_ReturnsInvalidArgument(t *testing.T) {
	server := Server{}
	_, err := server.CreateDataset(testUserContext("test@example.com"), &proto.CreateDatasetRequest{ReportId: "null"})
	require.Error(t, err)

	st, ok := status.FromError(err)
	require.True(t, ok)
	require.Equal(t, codes.InvalidArgument, st.Code())
	require.Contains(t, st.Message(), "invalid report_id format")
}

func TestCreateDataset_EmptyReportID_ReturnsInvalidArgument(t *testing.T) {
	server := Server{}
	_, err := server.CreateDataset(testUserContext("test@example.com"), &proto.CreateDatasetRequest{ReportId: ""})
	require.Error(t, err)

	st, ok := status.FromError(err)
	require.True(t, ok)
	require.Equal(t, codes.InvalidArgument, st.Code())
	require.Equal(t, "report_id is required", st.Message())
}
