//go:build integration

package bqjob

import (
	"bytes"
	"context"
	"testing"

	"cloud.google.com/go/bigquery"
	"dekart/src/server/job"
	"github.com/goccy/bigquery-emulator/server"
	"github.com/goccy/bigquery-emulator/types"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/require"
	"google.golang.org/api/option"
)

func TestJob_getResultTable(t *testing.T) {
	ctx := context.Background()

	const (
		projectName = "test"
	)

	bqServer, err := server.New(server.TempStorage)
	require.NoError(t, err)

	err = bqServer.Load(
		server.StructSource(
			types.NewProject(
				projectName,
				types.NewDataset(
					"dataset1",
					types.NewTable(
						"table_a",
						[]*types.Column{
							types.NewColumn("id", types.INTEGER),
							types.NewColumn("name", types.STRING),
						},
						types.Data{
							{"id": 1, "name": "alice"},
							{"id": 2, "name": "bob"},
						},
					),
				),
			),
		),
	)
	require.NoError(t, err)

	testServer := bqServer.TestServer()
	defer func() {
		testServer.Close()
		bqServer.Close()
	}()

	client, err := bigquery.NewClient(
		ctx,
		projectName,
		option.WithEndpoint(testServer.URL),
		option.WithoutAuthentication(),
	)
	require.NoError(t, err)

	defer client.Close()

	out := &bytes.Buffer{}
	log := zerolog.New(out)

	t.Run("happy path", func(t *testing.T) {
		query := client.Query("SELECT * FROM dataset1.table_a")
		query.Dst = client.Dataset("dataset1").Table("table_a")
		bqjob, err := query.Run(ctx)
		require.NoError(t, err)

		_, err = bqjob.Config()
		require.NoError(t, err)

		deakrtJob := &Job{
			BasicJob:    job.BasicJob{Logger: log},
			bigqueryJob: bqjob,
		}

		got, err := deakrtJob.getResultTable()
		require.NoError(t, err)

		want := &bigquery.Table{
			ProjectID: projectName,
			DatasetID: "dataset1",
			TableID:   "table_a",
		}
		require.Equal(t, want.FullyQualifiedName(), got.FullyQualifiedName())

	})
}
