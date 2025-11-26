package query

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/rs/zerolog/log"
)

type QueryDetails struct {
	ReportID, ConnectionID, QueryText, DatasetID, NewQueryID string
}

func GetQueryDetails(ctx context.Context, db *sql.DB, queryID string) (*QueryDetails, error) {
	queriesRows, err := db.QueryContext(ctx,
		`select
			reports.id,
			datasets.connection_id,
			queries.query_text,
			dataset_snapshots.report_id as snapshot_report_id,
			dataset_snapshots.connection_id as snapshot_connection_id,
			datasets.id as dataset_id,
			dataset_snapshots.dataset_id as snapshot_id
		from queries
			left join datasets on queries.id = datasets.query_id
			left join reports on (datasets.report_id = reports.id or queries.report_id = reports.id)
			left join dataset_snapshots on queries.id = dataset_snapshots.query_id
		where queries.id = $1
		limit 1`,
		queryID,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	defer queriesRows.Close()
	var reportID sql.NullString
	var connectionID sql.NullString
	var queryText sql.NullString
	var snapshotReportID sql.NullString
	var snapshotConnectionID sql.NullString
	var datasetID sql.NullString
	var snapshotID sql.NullString
	var newQueryID sql.NullString
	if !queriesRows.Next() {
		return nil, fmt.Errorf("query not found id:%s", queryID)
	}
	err = queriesRows.Scan(&reportID, &connectionID, &queryText, &snapshotReportID, &snapshotConnectionID, &datasetID, &snapshotID)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	queryDetails := &QueryDetails{
		ReportID:     reportID.String,
		ConnectionID: connectionID.String,
		QueryText:    queryText.String,
		DatasetID:    datasetID.String,
		NewQueryID:   queryID,
	}
	if !reportID.Valid { // if report id is not found, use snapshot dataset
		queryDetails.ReportID = snapshotReportID.String
		queryDetails.ConnectionID = snapshotConnectionID.String
		queryDetails.DatasetID = snapshotID.String

		// fetch dataset details using db
		datasetRows, err := db.QueryContext(ctx,
			`select
				query_id
			from datasets
			where id = $1`,
			snapshotID.String,
		)
		if err != nil {
			log.Err(err).Send()
			return nil, err
		}
		defer datasetRows.Close()
		if datasetRows.Next() {
			err = datasetRows.Scan(&newQueryID)
			if err != nil {
				log.Err(err).Send()
				return nil, err
			}
			queryDetails.NewQueryID = newQueryID.String
		}
	}
	return queryDetails, nil
}

// fetch query details by job id
func GetQueryDetailsByResultID(ctx context.Context, db *sql.DB, resultID string) (*QueryDetails, error) {
	queriesRows, err := db.QueryContext(ctx,
		`select
			reports.id,
			datasets.connection_id,
			queries.query_text
		from query_jobs
			left join queries on queries.id = query_jobs.query_id
			left join datasets on queries.id = datasets.query_id
			left join reports on (datasets.report_id = reports.id or queries.report_id = reports.id)
		where query_jobs.job_result_id = $1
		limit 1`,
		resultID,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	defer queriesRows.Close()

	var reportID sql.NullString
	var connectionID sql.NullString
	var queryText sql.NullString
	if !queriesRows.Next() {
		return nil, fmt.Errorf("query not found for dw_job_id: %s", resultID)
	}
	err = queriesRows.Scan(&reportID, &connectionID, &queryText)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	if !reportID.Valid {
		return nil, fmt.Errorf("query not found for dw_job_id: %s", resultID)
	}
	return &QueryDetails{
		ReportID:     reportID.String,
		ConnectionID: connectionID.String,
		QueryText:    queryText.String,
	}, nil
}
