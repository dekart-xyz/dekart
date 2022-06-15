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
	obj := s.storage.GetObject(fmt.Sprintf("%s.csv", vars["id"]))
	ctreated, err := obj.GetCreatedAt(ctx)
	if err != nil {
		log.Err(err).Send()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	objectReader, err := obj.GetReader(ctx)
	if err != nil {
		log.Err(err).Send()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer objectReader.Close()
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Cache-Control", "public, max-age=31536000")
	w.Header().Set("Last-Modified", ctreated.Format(time.UnixDate))
	if _, err := io.Copy(w, objectReader); err != nil {
		log.Err(err).Send()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}
