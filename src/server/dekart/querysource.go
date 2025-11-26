package dekart

import (
	"context"
	"crypto/sha1"
	"dekart/src/proto"
	"dekart/src/server/conn"
	"dekart/src/server/errtype"
	"dekart/src/server/user"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/rs/zerolog/log"

	"github.com/gorilla/mux"
)

func (s Server) ServeQuerySource(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	ctx := r.Context()
	claims := user.GetClaims(ctx)
	if claims == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
	}

	connection, err := s.getConnectionFromQueryID(ctx, vars["query"])

	if err != nil {
		errtype.LogError(err, "Error getting connection from query id")
		HttpError(w, err)
		return
	}

	// if connection.Id == "default" {
	// 	// dataset has no connection, it means it's a playground dataset
	// 	ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{IsPlayground: true})
	// }

	conCtx := conn.GetCtx(ctx, connection)
	bucketName := s.getBucketNameFromConnection(connection)

	if !s.storage.CanSaveQuery(conCtx, bucketName) {
		http.Error(w, "Query source not available for this connection", http.StatusBadRequest)
		return
	}

	obj := s.storage.GetObject(conCtx, bucketName, fmt.Sprintf("%s.sql", vars["source"]))
	created, err := obj.GetCreatedAt(conCtx)
	if err != nil {
		HttpError(w, err)
		return
	}
	objectReader, err := obj.GetReader(conCtx)
	if err != nil {
		HttpError(w, err)
		return
	}
	defer objectReader.Close()
	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Cache-Control", "public, max-age=31536000")
	w.Header().Set("Last-Modified", created.Format(time.UnixDate))
	if _, err := io.Copy(w, objectReader); err != nil {
		HttpError(w, err)
		return
	}
}

// queryWasNotUpdated was not updated because it was changed
type queryWasNotUpdated struct{}

func (e *queryWasNotUpdated) Error() string {
	return "query was not updated"
}

// storeQuerySync creates a new immutable query record and updates the dataset to reference it
// Returns the new query ID, or error if the dataset was already updated (optimistic locking failure)
func (s Server) storeQuerySync(ctx context.Context, queryID string, queryText string) (string, error) {
	h := sha1.New()
	queryTextByte := []byte(queryText)
	h.Write(queryTextByte)
	newQuerySourceId := fmt.Sprintf("%x", h.Sum(nil))

	// Create new query record
	newQueryID := newUUID()

	// Insert new query record
	_, err := s.db.ExecContext(ctx,
		`insert into queries (id, query_text, query_source, query_source_id)
			 values ($1, $2, $3, $4)`,
		newQueryID,
		queryText,
		proto.Query_QUERY_SOURCE_INLINE,
		newQuerySourceId,
	)

	if err != nil {
		errtype.LogError(err, "Error creating new query record")
		return "", err
	}

	// Optimistically update dataset to reference new query ID
	// Only update if dataset still references the old query ID
	result, err := s.db.ExecContext(ctx,
		`update datasets set query_id=$1, updated_at=CURRENT_TIMESTAMP
		 where query_id=$2`,
		newQueryID,
		queryID,
	)
	if err != nil {
		errtype.LogError(err, "Error updating dataset query_id")
		return "", err
	}

	affectedRows, _ := result.RowsAffected()
	if affectedRows == 0 {
		// Dataset was already updated to reference a different query
		log.Warn().Str("prevQueryId", queryID).Str("newQueryId", newQueryID).Msg("Dataset query_id not updated - already changed")
		return "", &queryWasNotUpdated{}
	} else {
		// Create dataset snapshot
		err := s.createDatasetSnapshotWithQueryID(ctx, newQueryID)
		if err != nil {
			errtype.LogError(err, "Error creating dataset snapshot")
			return "", err
		}
	}

	return newQueryID, nil
}

// legacy for query source stored in the storage
func (s Server) getQueryText(ctx context.Context, querySourceId string, bucketName string) (string, error) {
	if querySourceId == "" {
		return "", nil
	}
	reader, err := s.storage.GetObject(ctx, bucketName, fmt.Sprintf("%s.sql", querySourceId)).GetReader(ctx)
	if err != nil {
		return "", err
	}

	data, err := io.ReadAll(reader)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
