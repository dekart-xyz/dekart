package dekart

import (
	"regexp"
	"testing"

	"dekart/src/proto"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func requireInvalidArgument(t *testing.T, err error, message string) {
	t.Helper()
	require.Error(t, err)
	st, ok := status.FromError(err)
	require.True(t, ok)
	require.Equal(t, codes.InvalidArgument, st.Code())
	require.Equal(t, message, st.Message())
}

func requireStatusCode(t *testing.T, err error, code codes.Code) {
	t.Helper()
	require.Error(t, err)
	st, ok := status.FromError(err)
	require.True(t, ok)
	require.Equal(t, code, st.Code())
}

func TestCreateQuery_InvalidDatasetID_ReturnsInvalidArgument(t *testing.T) {
	server := Server{}
	ctx := testUserContext("test@example.com")

	_, err := server.CreateQuery(ctx, &proto.CreateQueryRequest{DatasetId: ""})
	requireInvalidArgument(t, err, "dataset_id is required")

	_, err = server.CreateQuery(ctx, &proto.CreateQueryRequest{DatasetId: "not-a-uuid"})
	requireInvalidArgument(t, err, "invalid dataset_id format")
}

func TestUpdateQuery_InvalidQueryID_ReturnsInvalidArgument(t *testing.T) {
	server := Server{}
	ctx := testUserContext("test@example.com")

	_, err := server.UpdateQuery(ctx, &proto.UpdateQueryRequest{QueryId: ""})
	requireInvalidArgument(t, err, "query_id is required")

	_, err = server.UpdateQuery(ctx, &proto.UpdateQueryRequest{QueryId: "not-a-uuid"})
	requireInvalidArgument(t, err, "invalid query_id format")
}

func TestCreateQuery_MissingDatasetUUID_ReturnsNotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	datasetID := "00000000-0000-0000-0000-000000000001"
	mock.ExpectQuery(regexp.QuoteMeta(`select report_id from datasets where id=$1`)).
		WithArgs(datasetID).
		WillReturnRows(sqlmock.NewRows([]string{"report_id"}))
	mock.ExpectQuery(regexp.QuoteMeta(`select report_id from queries where id=$1 limit 1`)).
		WithArgs(datasetID).
		WillReturnRows(sqlmock.NewRows([]string{"report_id"}))

	server := Server{db: db}
	_, err = server.CreateQuery(testUserContext("test@example.com"), &proto.CreateQueryRequest{DatasetId: datasetID})
	requireStatusCode(t, err, codes.NotFound)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestUpdateQuery_MissingQueryUUID_ReturnsNotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	queryID := "00000000-0000-0000-0000-000000000001"
	mock.ExpectQuery(regexp.QuoteMeta(`select
			reports.id,
			queries.query_source_id,
			datasets.connection_id,
			queries.query_text
		from queries
			left join datasets on queries.id = datasets.query_id
			left join reports on (datasets.report_id = reports.id or queries.report_id = reports.id)
		where queries.id = $1
		limit 1`)).
		WithArgs(queryID).
		WillReturnRows(sqlmock.NewRows([]string{"id", "query_source_id", "connection_id", "query_text"}))

	server := Server{db: db}
	_, err = server.UpdateQuery(testUserContext("test@example.com"), &proto.UpdateQueryRequest{QueryId: queryID})
	requireStatusCode(t, err, codes.NotFound)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestRunQuery_MissingQueryUUID_ReturnsNotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	queryID := "00000000-0000-0000-0000-000000000001"
	mock.ExpectQuery(regexp.QuoteMeta(`select
			reports.id,
			queries.query_source_id,
			datasets.connection_id,
			queries.query_text
		from queries
			left join datasets on queries.id = datasets.query_id
			left join reports on (datasets.report_id = reports.id or queries.report_id = reports.id)
		where queries.id = $1
		limit 1`)).
		WithArgs(queryID).
		WillReturnRows(sqlmock.NewRows([]string{"id", "query_source_id", "connection_id", "query_text"}))

	server := Server{db: db}
	_, err = server.RunQuery(testUserContext("test@example.com"), &proto.RunQueryRequest{QueryId: queryID})
	requireStatusCode(t, err, codes.NotFound)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestRunQuery_InvalidQueryID_ReturnsInvalidArgument(t *testing.T) {
	server := Server{}
	ctx := testUserContext("test@example.com")

	_, err := server.RunQuery(ctx, &proto.RunQueryRequest{QueryId: ""})
	requireInvalidArgument(t, err, "query_id is required")

	_, err = server.RunQuery(ctx, &proto.RunQueryRequest{QueryId: "not-a-uuid"})
	requireInvalidArgument(t, err, "invalid query_id format")
}
