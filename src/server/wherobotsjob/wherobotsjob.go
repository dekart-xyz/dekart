package wherobotsjob

import (
	"context"
	"fmt"

	"dekart/src/proto"
	"dekart/src/server/conn"
	"dekart/src/server/job"
	"dekart/src/server/secrets"
	"dekart/src/server/storage"
	"dekart/src/server/user"
	"dekart/src/server/wherobotsdb"

	"github.com/rs/zerolog/log"
)

// Job implements job.Job for Wherobots-based queries
type Job struct {
	job.BasicJob
	// wherobotsConn *Connection
	connection *proto.Connection
	apiKey     string
}

// Store implements job.Store for Wherobots-based jobs
type Store struct {
	job.BasicStore
}

// NewStore returns a new Store for Wherobots
func NewStore() *Store {
	return &Store{}
}

// Run executes the query against Wherobots DB, streaming rows to the storageObject as CSV.
func (j *Job) Run(storageObject storage.StorageObject, connection *proto.Connection) error {

	//check if storageObject is GoogleCloudStorage
	_, isGoogleCloudStorage := storageObject.(storage.GoogleCloudStorageObject)

	go func() {
		// Create the Wherobots DB connection
		wConn, err := wherobotsdb.Connect(
			j.GetCtx(),
			connection.WherobotsHost,
			"",
			j.apiKey,
			wherobotsdb.Runtime(connection.WherobotsRuntime),
			wherobotsdb.Region(connection.WherobotsRegion),
			0,
			0,
		)
		if err != nil {
			log.Warn().Err(err).Msg("Failed to create wherobots connection")
			j.CancelWithError(err)
			return
		}
		defer wConn.Close()

		j.Status() <- int32(proto.QueryJob_JOB_STATUS_RUNNING)

		cursor := wConn.Cursor()
		defer cursor.Close()
		if err := cursor.Execute(j.QueryText); err != nil {
			j.CancelWithError(err)
			return
		}
		resultURI, fetchErr := cursor.GetResultURI()
		if fetchErr != nil {
			j.CancelWithError(fetchErr)
			return
		}
		size, err := cursor.GetResultSize()
		if err != nil {
			j.CancelWithError(err)
			return
		}
		if isGoogleCloudStorage && resultURI != "" {
			// now we need also to copy the result to the storageObject
			// Skip if resultURI is empty (empty result)
			j.Status() <- int32(proto.QueryJob_JOB_STATUS_READING_RESULTS)
			sourceObj := storage.NewPresignedS3Object(resultURI)
			err := sourceObj.CopyTo(j.GetCtx(), storageObject.GetWriter(j.GetCtx()))
			if err != nil {
				j.CancelWithError(err)
				return
			}
		}
		j.Lock()
		j.ResultReady = true
		j.ResultSize = size
		j.ResultURI = &resultURI
		j.Unlock()
		j.Status() <- int32(proto.QueryJob_JOB_STATUS_DONE)
		j.Cancel() // signals the job is complete

	}()
	return nil
}

// Create constructs a Wherobots job and attempts to connect
func Create(reportID string, queryID string, queryText string, userCtx context.Context) (job.Job, error) {
	connection := conn.FromCtx(userCtx)
	if connection.WherobotsKey == nil {
		err := fmt.Errorf("wherobotsKey must be provided")
		log.Error().Err(err).Msg("Invalid wherobots connection info")
		return nil, err
	}
	apiKey := secrets.SecretToString(connection.WherobotsKey, user.GetClaims(userCtx))

	j := &Job{
		BasicJob: job.BasicJob{
			ReportID:  reportID,
			QueryID:   queryID,
			QueryText: queryText,
			Logger:    log.With().Str("reportID", reportID).Str("queryID", queryID).Logger(),
		},
		connection: connection,
		apiKey:     apiKey,
	}
	j.Init(userCtx)
	return j, nil
}

// Create is the Store's method to instantiate a Wherobots job
func (s *Store) Create(reportID string, queryID string, queryText string, userCtx context.Context) (job.Job, chan int32, error) {
	j, err := Create(reportID, queryID, queryText, userCtx)
	if err != nil {
		return nil, nil, err
	}
	s.StoreJob(j)
	go s.RemoveJobWhenDone(j)
	return j, j.Status(), nil
}

// TestConnection verifies that Wherobots DB credentials are valid
func TestConnection(ctx context.Context, req *proto.TestConnectionRequest) (*proto.TestConnectionResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, fmt.Errorf("unauthenticated: claims are required")
	}
	conn := req.Connection
	if conn == nil {
		return nil, fmt.Errorf("connection is nil")
	}

	// Check secrets
	if conn.WherobotsKey == nil {
		return &proto.TestConnectionResponse{
			Success: false,
			Error:   "Either WherobotsKey is required",
		}, nil
	}
	apiKey := secrets.SecretToString(conn.WherobotsKey, claims)
	_, err := wherobotsdb.GetSession(
		ctx,
		conn.WherobotsHost,
		"",
		apiKey,
		wherobotsdb.Runtime(conn.WherobotsRuntime),
		wherobotsdb.Region(conn.WherobotsRegion),
		0, // waitTimeout
		0,
	)
	if err != nil {
		log.Warn().Err(err).Msg("Failed to connect to Wherobots when testing connection")
		return &proto.TestConnectionResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}
	return &proto.TestConnectionResponse{
		Success: true,
	}, nil
}
