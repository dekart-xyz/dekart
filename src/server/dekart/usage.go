package dekart

import (
	"context"
	"dekart/src/proto"
	"fmt"

	"github.com/rs/zerolog/log"
)

func (s Server) GetUsage(ctx context.Context, req *proto.GetUsageRequest) (*proto.GetUsageResponse, error) {
	res := &proto.GetUsageResponse{}
	usage, err := s.db.QueryContext(ctx,
		`select
		(select count(*) from reports) as total_reports,
		(select count(*) from queries) as total_queries,
		(select count(*) from queries) as total_files,
		(select count(distinct author_email) from reports) as total_authors`)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	defer usage.Close()
	if usage.Next() {
		err = usage.Scan(
			&res.TotalReports,
			&res.TotalQueries,
			&res.TotalFiles,
			&res.TotalAuthors,
		)
		if err != nil {
			log.Err(err).Send()
			return nil, err
		}
		return res, nil
	}
	err = fmt.Errorf("no stats")
	log.Err(err).Send()
	return nil, err
}
