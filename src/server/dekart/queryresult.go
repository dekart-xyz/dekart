package dekart

import (
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/rs/zerolog/log"
)

func (s Server) ServeQueryResult(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	ctx := r.Context()
	obj := s.bucket.Object(fmt.Sprintf("%s.csv", vars["id"]))
	attrs, err := obj.Attrs(ctx)
	objectReader, err := obj.NewReader(ctx)
	if err != nil {
		log.Err(err).Send()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer objectReader.Close()
	w.Header().Set("Content-Type", attrs.ContentType)
	w.Header().Set("Content-Length", fmt.Sprintf("%d", attrs.Size))
	w.Header().Set("Cache-Control", "public, max-age=31536000")
	w.Header().Set("Last-Modified", attrs.Created.Format(time.UnixDate))
	if _, err := io.Copy(w, objectReader); err != nil {
		log.Err(err).Send()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}
