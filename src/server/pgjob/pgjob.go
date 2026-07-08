package pgjob

import (
	"context"
	"database/sql"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"dekart/src/proto"
	"dekart/src/server/conn"
	"dekart/src/server/job"
	"dekart/src/server/secrets"
	"dekart/src/server/storage"
	"dekart/src/server/user"

	_ "github.com/lib/pq" // postgres driver
	"github.com/rs/zerolog/log"
)

type Job struct {
	job.BasicJob
	postgresDB    *sql.DB
	storageObject storage.StorageObject
	isReplayMode  bool
}

type Store struct {
	job.BasicStore
}

func NewStore() *Store {
	return &Store{}
}

// buildDSNFromConnection creates postgres DSN from connection payload.
func buildDSNFromConnection(connection *proto.Connection, claims *user.Claims) (string, error) {
	envDSN := os.Getenv("DEKART_POSTGRES_DATASOURCE_CONNECTION")
	if envDSN == "" {
		// Backward-compatible fallback for old env name.
		envDSN = os.Getenv("DEKART_POSTGRES_DATA_CONNECTION")
	}
	if os.Getenv("DEKART_DATASOURCE") == "PG" && envDSN != "" {
		return envDSN, nil
	}
	if conn.IsSystemConnectionID(connection.GetId()) && envDSN != "" {
		return envDSN, nil
	}
	password := secrets.SecretToString(connection.PostgresPassword, claims)
	if password == "" {
		// Legacy/system-style Postgres connections can omit per-connection credentials
		// and use process-level DSN instead.
		if envDSN != "" &&
			(connection.PostgresHost == "" ||
				connection.PostgresUsername == "" ||
				connection.PostgresDatabase == "" ||
				connection.PostgresPort <= 0) {
			return envDSN, nil
		}
		return "", fmt.Errorf("postgres_password is required")
	}
	return conn.BuildPostgresKeywordDSN(connection, password)
}

// Create creates a postgres job for report query execution.
func Create(reportID string, queryID string, queryText string, userCtx context.Context) (job.Job, error) {
	connection := conn.FromCtx(userCtx)
	if connection == nil {
		return nil, fmt.Errorf("connection is required")
	}
	claims := user.GetClaims(userCtx)
	if claims == nil {
		return nil, fmt.Errorf("claims are required")
	}
	dsn, err := buildDSNFromConnection(connection, claims)
	if err != nil {
		return nil, err
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}
	j := &Job{
		BasicJob: job.BasicJob{
			ReportID:  reportID,
			QueryID:   queryID,
			QueryText: queryText,
			Logger:    log.With().Str("reportID", reportID).Str("queryID", queryID).Logger(),
		},
		postgresDB: db,
	}
	j.Init(userCtx)
	return j, nil
}

func (s *Store) Create(reportID string, queryID string, queryText string, userCtx context.Context) (job.Job, chan int32, error) {
	j, err := Create(reportID, queryID, queryText, userCtx)
	if err != nil {
		log.Error().Err(err).Msg("failed to create postgres job")
		return nil, nil, err
	}
	s.StoreJob(j)
	go s.RemoveJobWhenDone(j)
	return j, j.Status(), nil
}

// TestConnection verifies that postgres credentials are valid.
func TestConnection(ctx context.Context, req *proto.TestConnectionRequest) (*proto.TestConnectionResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return &proto.TestConnectionResponse{
			Success: false,
			Error:   "claims are required",
		}, nil
	}
	if req == nil || req.Connection == nil {
		return &proto.TestConnectionResponse{
			Success: false,
			Error:   "connection is required",
		}, nil
	}
	dsn, err := buildDSNFromConnection(req.Connection, claims)
	if err != nil {
		return &proto.TestConnectionResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return &proto.TestConnectionResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}
	defer db.Close()
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := db.PingContext(pingCtx); err != nil {
		return &proto.TestConnectionResponse{
			Success: false,
			Error:   postgresConnectionError(err),
		}, nil
	}
	return &proto.TestConnectionResponse{
		Success: true,
	}, nil
}

// postgresConnectionError adds setup context to common lib/pq connection failures.
func postgresConnectionError(err error) string {
	msg := err.Error()
	lower := strings.ToLower(msg)
	switch {
	case strings.Contains(lower, "ssl") || strings.Contains(lower, "tls") || strings.Contains(lower, "certificate"):
		return "Postgres TLS connection failed. Check that the database accepts SSL connections and that SSL mode matches the server configuration: " + msg
	case strings.Contains(lower, "password authentication failed") || strings.Contains(lower, "authentication failed"):
		return "Postgres authentication failed. Check the username and password: " + msg
	case strings.Contains(lower, "does not exist"):
		return "Postgres database was not found. Check the database name: " + msg
	case strings.Contains(lower, "connection refused") || strings.Contains(lower, "timeout") || strings.Contains(lower, "no route to host") || strings.Contains(lower, "i/o timeout"):
		return "Postgres network connection failed. Check host, port, firewall, and Dekart Cloud IP allowlisting: " + msg
	default:
		return msg
	}
}

func (j *Job) Run(storageObject storage.StorageObject, connection *proto.Connection) error {
	j.storageObject = storageObject
	_, j.isReplayMode = j.storageObject.(storage.PGStorageObject)
	go func() {
		defer func() {
			if j.postgresDB != nil {
				if err := j.postgresDB.Close(); err != nil {
					j.Logger.Warn().Err(err).Msg("failed to close postgres connection")
				}
			}
		}()
		j.Status() <- int32(proto.QueryJob_JOB_STATUS_RUNNING)
		rows, err := j.postgresDB.QueryContext(j.GetCtx(), j.QueryText)
		if err != nil {
			j.Logger.Warn().Err(err).Str("queryText", j.QueryText).Msg("Error querying postgres")
			j.CancelWithError(err)
			return
		}
		defer rows.Close()

		if j.isReplayMode {
			jobID := j.GetID()
			j.Lock()
			j.DWJobID = &jobID
			j.ResultReady = true
			j.ResultSize = 0
			j.Unlock()
			j.Status() <- int32(proto.QueryJob_JOB_STATUS_DONE)
			j.Cancel()
			return
		}

		csvRows := make(chan []string, 10_000)
		defer close(csvRows)

		go j.write(csvRows)

		columnTypes, err := rows.ColumnTypes()
		if err != nil {
			j.Logger.Error().Err(err).Msg("Error getting column types")
			j.CancelWithError(err)
			return
		}

		firstRow := true
		for rows.Next() {
			if firstRow {
				firstRow = false
				j.Status() <- int32(proto.QueryJob_JOB_STATUS_READING_RESULTS)
				columnNames := make([]string, len(columnTypes))
				for i, columnType := range columnTypes {
					columnNames[i] = columnType.Name()
				}
				csvRows <- columnNames
			}

			csvRow := make([]string, len(columnTypes))
			values := make([]interface{}, len(columnTypes))
			for i := range columnTypes {
				values[i] = new(sql.NullString)
			}

			err = rows.Scan(values...)
			if err != nil {
				j.Logger.Error().Err(err).Msg("Error scanning row")
				j.CancelWithError(err)
				return
			}

			for i := range columnTypes {
				value := values[i]
				switch x := value.(type) {
				case *sql.NullString:
					csvRow[i] = x.String
				default:
					err = fmt.Errorf("incorrect type of data: %T", x)
					j.Logger.Error().Err(err).Msg("Unexpected postgres value type")
					j.CancelWithError(err)
					return
				}
			}
			csvRows <- csvRow
		}
		if err = rows.Err(); err != nil {
			j.Logger.Error().Err(err).Msg("Error iterating postgres rows")
			j.CancelWithError(err)
			return
		}
	}()
	return nil
}

func (j *Job) write(csvRows chan []string) {
	storageWriter := j.storageObject.GetWriter(j.GetCtx())
	csvWriter := csv.NewWriter(storageWriter)
	for {
		csvRow, more := <-csvRows
		if !more {
			break
		}
		err := csvWriter.Write(csvRow)
		if err == context.Canceled {
			break
		}
		if err != nil {
			j.Logger.Err(err).Send()
			j.CancelWithError(err)
			break
		}
	}
	j.close(storageWriter, csvWriter)
}

func (j *Job) close(storageWriter io.WriteCloser, csvWriter *csv.Writer) {
	csvWriter.Flush()
	err := storageWriter.Close()
	if err != nil {
		// Ensure all resources are properly released even when context is canceled
		if err == context.Canceled {
			return
		}
		j.Logger.Err(err).Send()
		j.CancelWithError(err)
		return
	}
	resultSize, err := j.storageObject.GetSize(j.GetCtx())
	if err != nil {
		j.Logger.Err(err).Send()
		j.CancelWithError(err)
		return
	}

	j.Lock()
	j.ResultSize = *resultSize
	j.ResultReady = true
	j.Unlock()

	j.Status() <- int32(proto.QueryJob_JOB_STATUS_DONE)
	j.Cancel()
}
