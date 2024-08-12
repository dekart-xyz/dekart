package dekart

import (
	"fmt"
	"net/http"
	"runtime"

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
	// Capture the caller information
	pc, file, line, ok := runtime.Caller(1)
	caller := ""
	if ok {
		fn := runtime.FuncForPC(pc)
		caller = fmt.Sprintf("called from %s:%d %s", file, line, fn.Name())
	}
	log.Err(err).Interface("details", err).Str("caller", caller).Msg("Unknown API Error")
	http.Error(w, err.Error(), http.StatusInternalServerError)
}
