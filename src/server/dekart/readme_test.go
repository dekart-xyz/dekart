package dekart

import (
	"errors"
	"testing"

	"dekart/src/proto"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// A stale browser must not delete a newer README, and a failed snapshot must roll back deletion.
func TestRemoveReadmeConditionalTransaction(t *testing.T) {
	for _, tc := range []struct {
		name            string
		expected        string
		snapshotFailure bool
		omitVersion     bool
		code            codes.Code
	}{
		{name: "stale browser", expected: "old-version", code: codes.Aborted},
		{name: "snapshot failure", expected: "version-1", snapshotFailure: true, code: codes.Internal},
		{name: "conditional success", expected: "version-1", code: codes.OK},
		{name: "unconditional MCP success", omitVersion: true, code: codes.OK},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("DEKART_POSTGRES_DB", "dekart")
			reportID := "00000000-0000-0000-0000-000000000001"
			email := "user@example.com"
			db, mock, err := sqlmock.New()
			require.NoError(t, err)
			defer db.Close()
			expectSnapshotReportAccess(mock, reportID, email, 0)
			// Playground access uses the same permission gate without subscription fixtures.
			mock.ExpectQuery("SELECT workspace_id, is_playground").WithArgs(reportID).
				WillReturnRows(sqlmock.NewRows([]string{"workspace_id", "is_playground"}).AddRow(nil, true))
			mock.ExpectBegin()
			mock.ExpectQuery("select id from reports where id=\\$1 for update").WithArgs(reportID).
				WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(reportID))
			if !tc.omitVersion {
				mock.ExpectQuery("SELECT version_id FROM reports").WithArgs(reportID).
					WillReturnRows(sqlmock.NewRows([]string{"version_id"}).AddRow("version-1"))
			}
			if tc.snapshotFailure || tc.code == codes.OK {
				mock.ExpectExec("update reports set readme = null").WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), reportID).
					WillReturnResult(sqlmock.NewResult(0, 1))
				mock.ExpectQuery("select id from reports where id=\\$1 for update").WithArgs(reportID).
					WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(reportID))
				if tc.snapshotFailure {
					mock.ExpectExec("INSERT INTO report_snapshots").WillReturnError(errors.New("snapshot unavailable"))
				} else {
					for _, table := range []string{"report_snapshots", "dataset_snapshots", "query_snapshots"} {
						mock.ExpectExec("INSERT INTO " + table).WillReturnResult(sqlmock.NewResult(0, 1))
					}
					for range 3 {
						mock.ExpectExec("WITH ranked AS").WithArgs(reportID).WillReturnResult(sqlmock.NewResult(0, 0))
					}
				}
			}
			if tc.code == codes.OK {
				mock.ExpectCommit()
			} else {
				mock.ExpectRollback()
			}
			request := &proto.RemoveReadmeRequest{ReportId: reportID}
			if !tc.omitVersion {
				request.ExpectedVersionId = &tc.expected
			}
			server := NewServer(db, nil, nil)
			response, err := server.RemoveReadme(snapshotTestContext(email), request)
			if tc.code == codes.OK {
				require.NotEmpty(t, response.GetVersionId())
				require.NotEqual(t, "version-1", response.GetVersionId())
			}
			require.Equal(t, tc.code, status.Code(err))
			require.NoError(t, mock.ExpectationsWereMet())
		})
	}
}
