package bqutils

import (
	"fmt"

	"cloud.google.com/go/bigquery"
)

func GetTableFromJob(job *bigquery.Job) (*bigquery.Table, error) {
	cfg, err := job.Config()
	if err != nil {
		return nil, err
	}
	queryConfig, ok := cfg.(*bigquery.QueryConfig)
	if !ok {
		return nil, fmt.Errorf("was expecting QueryConfig type for configuration")
	}
	return queryConfig.Dst, nil
}
