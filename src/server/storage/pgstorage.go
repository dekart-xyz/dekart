package storage

import (
	"context"
	"database/sql"
	"dekart/src/server/errtype"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"time"

	_ "github.com/lib/pq"
	"github.com/rs/zerolog/log"
)

type PGStorage struct {
	UnsupportedUploadSessionStorage
	metadataDB        *sql.DB
	dataSourceConnStr string
}

type PGStorageObject struct {
	metadataDB        *sql.DB
	dataSourceConnStr string
	jobID             string
}

func NewPGStorage(metadataDB *sql.DB) *PGStorage {
	dataSourceConnStr := os.Getenv("DEKART_POSTGRES_DATASOURCE_CONNECTION")
	if dataSourceConnStr == "" {
		// Backward-compatible fallback for old env name.
		dataSourceConnStr = os.Getenv("DEKART_POSTGRES_DATA_CONNECTION")
	}
	if dataSourceConnStr == "" {
		log.Fatal().Msg("DEKART_POSTGRES_DATASOURCE_CONNECTION is required for DEKART_STORAGE=PG")
	}
	return &PGStorage{
		UnsupportedUploadSessionStorage: NewUnsupportedUploadSessionStorage("postgres-replay"),
		metadataDB:                      metadataDB,
		dataSourceConnStr:               dataSourceConnStr,
	}
}

func (s *PGStorage) CanSaveQuery(context.Context, string) bool {
	return false
}

func (s *PGStorage) GetObject(_ context.Context, _ string, object string) StorageObject {
	return PGStorageObject{
		metadataDB:        s.metadataDB,
		dataSourceConnStr: s.dataSourceConnStr,
		jobID:             object,
	}
}

func (o PGStorageObject) GetWriter(context.Context) io.WriteCloser {
	return errorWriteCloser{err: fmt.Errorf("GetWriter is not supported for PG replay storage")}
}

func (o PGStorageObject) GetReader(ctx context.Context) (io.ReadCloser, error) {
	queryText, err := o.getQueryText(ctx)
	if err != nil {
		return nil, err
	}
	dataDB, err := sql.Open("postgres", o.dataSourceConnStr)
	if err != nil {
		return nil, err
	}
	rows, err := dataDB.QueryContext(ctx, queryText)
	if err != nil {
		_ = dataDB.Close()
		return nil, err
	}
	columnTypes, err := rows.ColumnTypes()
	if err != nil {
		rows.Close()
		_ = dataDB.Close()
		return nil, err
	}
	pr, pw := io.Pipe()
	csvWriter := csv.NewWriter(pw)
	go func() {
		defer rows.Close()
		defer dataDB.Close()
		columnNames := make([]string, len(columnTypes))
		for i, columnType := range columnTypes {
			columnNames[i] = columnType.Name()
		}
		if err := csvWriter.Write(columnNames); err != nil {
			_ = pw.CloseWithError(err)
			return
		}
		for rows.Next() {
			values := make([]interface{}, len(columnTypes))
			for i := range columnTypes {
				values[i] = new(sql.NullString)
			}
			if err := rows.Scan(values...); err != nil {
				_ = pw.CloseWithError(err)
				return
			}
			csvRow := make([]string, len(columnTypes))
			for i := range values {
				csvRow[i] = values[i].(*sql.NullString).String
			}
			if err := csvWriter.Write(csvRow); err != nil {
				_ = pw.CloseWithError(err)
				return
			}
		}
		if err := rows.Err(); err != nil {
			_ = pw.CloseWithError(err)
			return
		}
		csvWriter.Flush()
		if err := csvWriter.Error(); err != nil {
			_ = pw.CloseWithError(err)
			return
		}
		_ = pw.Close()
	}()
	return pr, nil
}

func (o PGStorageObject) getQueryText(ctx context.Context) (string, error) {
	var queryText sql.NullString
	err := o.metadataDB.QueryRowContext(
		ctx,
		`select query_text from query_jobs where id = $1 order by created_at desc limit 1`,
		o.jobID,
	).Scan(&queryText)
	if err == sql.ErrNoRows {
		err = o.metadataDB.QueryRowContext(
			ctx,
			`select query_text from query_jobs where job_result_id = $1 order by created_at desc limit 1`,
			o.jobID,
		).Scan(&queryText)
	}
	if err != nil {
		return "", err
	}
	if queryText.String == "" {
		return "", &errtype.EmptyResult{}
	}
	return queryText.String, nil
}

func (o PGStorageObject) GetCreatedAt(ctx context.Context) (*time.Time, error) {
	createdAt := time.Time{}
	err := o.metadataDB.QueryRowContext(
		ctx,
		`select created_at from query_jobs where id = $1 order by created_at desc limit 1`,
		o.jobID,
	).Scan(&createdAt)
	if err == sql.ErrNoRows {
		err = o.metadataDB.QueryRowContext(
			ctx,
			`select created_at from query_jobs where job_result_id = $1 order by created_at desc limit 1`,
			o.jobID,
		).Scan(&createdAt)
	}
	if err != nil {
		return nil, err
	}
	return &createdAt, nil
}

func (o PGStorageObject) GetSize(context.Context) (*int64, error) {
	return nil, nil
}

func (o PGStorageObject) CopyFromS3(context.Context, string) error {
	return fmt.Errorf("CopyFromS3 is not supported for PG replay storage")
}

func (o PGStorageObject) CopyTo(ctx context.Context, writer io.WriteCloser) error {
	reader, err := o.GetReader(ctx)
	if err != nil {
		errtype.LogError(err, "Error getting reader while copying PG replay result")
		return err
	}
	defer reader.Close()
	if _, err := io.Copy(writer, reader); err != nil {
		return err
	}
	return writer.Close()
}

func (o PGStorageObject) Delete(context.Context) error {
	return fmt.Errorf("Delete is not supported for PG replay storage")
}
