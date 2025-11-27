package query

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/rs/zerolog/log"
)

type QueryDetails struct {
	ReportID, PrevQuerySourceId, ConnectionID, QueryText string
}

func GetQueryDetails(ctx context.Context, db *sql.DB, queryID string) (*QueryDetails, error) {
	queriesRows, err := db.QueryContext(ctx,
		`select
			reports.id,
			queries.query_source_id,
			datasets.connection_id,
			queries.query_text
		from queries
			left join datasets on queries.id = datasets.query_id
			left join reports on (datasets.report_id = reports.id or queries.report_id = reports.id)
		where queries.id = $1
		limit 1`,
		queryID,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	defer queriesRows.Close()
	var reportID string
	var prevQuerySourceId string
	var connectionID sql.NullString
	var queryText string
	for queriesRows.Next() {
		err := queriesRows.Scan(&reportID, &prevQuerySourceId, &connectionID, &queryText)
		if err != nil {
			log.Err(err).Send()
			return nil, err
		}
	}
	return &QueryDetails{
		ReportID:          reportID,
		PrevQuerySourceId: prevQuerySourceId,
		ConnectionID:      connectionID.String,
		QueryText:         queryText,
	}, nil
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
