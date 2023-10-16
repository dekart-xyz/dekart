package dekart

import (
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
