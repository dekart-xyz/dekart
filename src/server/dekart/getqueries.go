package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"fmt"
	"strings"
	"time"

	"github.com/lib/pq"
	"github.com/rs/zerolog/log"
)

func rowsToQueries(queryRows *sql.Rows) ([]*proto.Query, error) {
	queries := make([]*proto.Query, 0)
	for queryRows.Next() {
		var queryText string
		query := proto.Query{}
		var createdAt time.Time
		var updatedAt time.Time
		if err := queryRows.Scan(
			&query.Id,
			&queryText,
			&createdAt,
			&updatedAt,
			&query.QuerySource,
			&query.QuerySourceId,
		); err != nil {
			log.Fatal().Err(err).Send()
		}

		switch query.QuerySource {
		case proto.Query_QUERY_SOURCE_UNSPECIFIED:
			err := fmt.Errorf("unknown query source query id=%s", query.Id)
			log.Err(err).Send()
			return nil, err
		case proto.Query_QUERY_SOURCE_INLINE:
			query.QueryText = queryText
		}
		query.CreatedAt = createdAt.Unix()
		query.UpdatedAt = updatedAt.Unix()
		queries = append(queries, &query)
	}
	return queries, nil
}

func (s Server) getQueries(ctx context.Context, datasets []*proto.Dataset) ([]*proto.Query, error) {
	queryIds := make([]string, 0)
	for _, dataset := range datasets {
		if dataset.QueryId != "" {
			queryIds = append(queryIds, dataset.QueryId)
		}
	}
	if len(queryIds) > 0 {
		queryIdsStr := strings.Join(queryIds, ",")
		queryRows, err := s.db.QueryContext(ctx,
			`select
				id,
				query_text,
				created_at,
				updated_at,
				query_source,
				query_source_id
			from queries where id = ANY($1) order by created_at asc`,
			pq.Array(queryIds),
		)
		if err != nil {
			log.Fatal().Err(err).Msgf("select from queries failed, ids: %s", queryIdsStr)
		}
		defer queryRows.Close()
		return rowsToQueries(queryRows)
	}
	return make([]*proto.Query, 0), nil
}
