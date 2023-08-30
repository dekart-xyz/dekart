package dekart

import (
	"net/http"

	"github.com/rs/zerolog/log"
	"google.golang.org/api/googleapi"
)

// HttpError writes error to http.ResponseWriter based on error type from service providers like Google API
func HttpError(w http.ResponseWriter, err error) {
	if err == nil {
		return
	}
	if googleErr, ok := err.(*googleapi.Error); ok {
		log.Err(err).Interface("googleapi.Error", googleErr).Msg("Google API Error")
		http.Error(w, googleErr.Message, googleErr.Code)
		return
	}
	log.Err(err).Interface("details", err).Msg("Unknown API Error")
	http.Error(w, err.Error(), http.StatusInternalServerError)
}
