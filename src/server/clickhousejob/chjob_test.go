package chjob

import (
	"context"
	"database/sql"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestStore_Create(t *testing.T) {
	store := &Store{
		clickhouseDB:   &sql.DB{},
		outputLocation: "s3://bucket/path",
		s3Config: s3Config{
			Endpoint:  "localhost:9000",
			AccessKey: "test-key",
			SecretKey: "test-secret",
		},
	}

	j, statusChan, err := store.Create("report1", "query1", "SELECT 1", context.Background())
	assert.NoError(t, err)
	assert.NotNil(t, j)
	assert.NotNil(t, statusChan)

	// Check job properties
	chJob, ok := j.(*Job)
	assert.True(t, ok)
	assert.Equal(t, "report1", chJob.ReportID)
	assert.Equal(t, "query1", chJob.QueryID)
	assert.Equal(t, "SELECT 1", chJob.QueryText)
}
