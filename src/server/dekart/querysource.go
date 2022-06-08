package dekart

import (
	"dekart/src/server/user"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/rs/zerolog/log"
)

func (s Server) ServeQuerySource(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	ctx := r.Context()
	claims := user.GetClaims(ctx)
	if claims == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
	}

	key := fmt.Sprintf("%s.sql", vars["id"])

	// obj := s.bucket.Object(fmt.Sprintf("%s.sql", vars["id"]))
	// attrs, err := obj.Attrs(ctx)
	// if err != nil {
	// 	log.Err(err).Send()
	// 	http.Error(w, err.Error(), http.StatusInternalServerError)
	// 	return
	// }
	// objectReader, err := obj.NewReader(ctx)

	objectReader, err := s.bucket.Reader(ctx, key)
	if err != nil {
		log.Err(err).Send()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	metadata, err := s.bucket.GetObjectMetadata(ctx, key)
	if err != nil {
		log.Err(err).Send()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", *metadata.ContentType)
	w.Header().Set("Cache-Control", "public, max-age=31536000")
	w.Header().Set("Last-Modified", metadata.LastModified.Format(time.UnixDate))
	if _, err := io.Copy(w, objectReader); err != nil {
		log.Err(err).Send()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}
