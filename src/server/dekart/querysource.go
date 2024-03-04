package dekart

import (
	"context"
	"crypto/sha1"
	"dekart/src/proto"
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
		log.Err(err).Msg("Error getting connection from query id")
		HttpError(w, err)
		return
	}

	bucketName := s.getBucketNameFromConnection(connection)

	obj := s.storage.GetObject(bucketName, fmt.Sprintf("%s.sql", vars["source"]))
	created, err := obj.GetCreatedAt(ctx)
	if err != nil {
		HttpError(w, err)
		return
	}
	objectReader, err := obj.GetReader(ctx)
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

func (s Server) storeQuerySync(ctx context.Context, bucketName, queryID string, queryText string, prevQuerySourceId string) error {
	h := sha1.New()
	queryTextByte := []byte(queryText)
	h.Write(queryTextByte)
	newQuerySourceId := fmt.Sprintf("%x", h.Sum(nil))
	storageWriter := s.storage.GetObject(bucketName, fmt.Sprintf("%s.sql", newQuerySourceId)).GetWriter(ctx)
	_, err := storageWriter.Write(queryTextByte)
	if err != nil {
		log.Err(err).Msg("Error writing query_text to storage")
		storageWriter.Close()
		return err
	}
	err = storageWriter.Close()
	if err != nil {
		log.Err(err).Str("bucketName", bucketName).Msg("Error writing query_text to storage")
		return err
	}

	result, err := s.db.ExecContext(ctx,
		`update queries set query_source_id=$1, query_source=$2, updated_at=now() where id=$3 and query_source_id=$4`,
		newQuerySourceId,
		proto.Query_QUERY_SOURCE_STORAGE,
		queryID,
		prevQuerySourceId,
	)
	if err != nil {
		return err
	}
	affectedRows, _ := result.RowsAffected()
	if affectedRows == 0 {
		return &queryWasNotUpdated{}
	}
	return nil
}

func (s Server) storeQuery(userCtx context.Context, reportID string, queryID string, queryText string, prevQuerySourceId string) {
	ctx, cancel := context.WithTimeout(user.CopyClaims(userCtx, context.Background()), time.Second*5)
	defer cancel()
	connection, err := s.getConnectionFromQueryID(ctx, queryID)

	if err != nil {
		log.Err(err).Msg("Error getting connection from query id")
		return
	}

	bucketName := s.getBucketNameFromConnection(connection)

	err = s.storeQuerySync(ctx, bucketName, queryID, queryText, prevQuerySourceId)
	if _, ok := err.(*queryWasNotUpdated); ok {
		log.Warn().Msg("Query text not updated")
		return
	} else if err != nil {
		log.Err(err).Msg("Error updating query text")
		return
	}
	log.Debug().Msg("Query text updated in storage")
	s.reportStreams.Ping(reportID)
}

func (s Server) getQueryText(ctx context.Context, querySourceId string, bucketName string) (string, error) {
	if querySourceId == "" {
		return "", nil
	}
	reader, err := s.storage.GetObject(bucketName, fmt.Sprintf("%s.sql", querySourceId)).GetReader(ctx)
	if err != nil {
		return "", err
	}

	data, err := io.ReadAll(reader)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
