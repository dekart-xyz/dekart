package dekart

import (
	"dekart/src/server/errtype"
	"fmt"
	"net/http"
	"runtime"

	"github.com/rs/zerolog/log"
	"google.golang.org/api/googleapi"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func GRPCError(msg string, err error) error {
	if err == nil {
		return nil
	}
	if errtype.ContextCancelledRe.MatchString(err.Error()) {
		log.Warn().Err(err).Msg("Context Cancelled")
		return status.Errorf(codes.Canceled, "Context Cancelled")
	}
	log.Err(err).Msg(msg)
	return status.Errorf(codes.Internal, err.Error())
}

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

	// Handle specific RPC error format for PermissionDenied using regex
	matches := errtype.RPCPermissionDeniedRe.FindStringSubmatch(err.Error())
	if len(matches) > 1 {
		log.Warn().Err(err).Msg("Permission Denied Error")
		desc := matches[1]
		http.Error(w, "Permission Denied: "+desc, http.StatusForbidden)
		return
	}

	if errtype.ContextCancelledRe.MatchString(err.Error()) {
		log.Warn().Err(err).Msg("Context Cancelled")
		http.Error(w, "Context Cancelled", http.StatusRequestTimeout)
		return
	}

	if errtype.WriteTimeoutRe.MatchString(err.Error()) {
		log.Warn().Err(err).Msg("Client Write Timeout")
		http.Error(w, "Write Timeout", http.StatusGatewayTimeout)
		return
	}

	log.Err(err).Interface("details", err).Stack().Msg("Unknown API Error")
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func MarshalStackSimple(err error) interface{} {
	return getTraceString()
}

func getTraceString() string {
	var trace []string
	for i := 3; i < 12; i++ {
		_, file, line, ok := runtime.Caller(i)
		if !ok {
			break
		}
		trace = append(trace, fmt.Sprintf("%s:%d", file, line))
	}
	return fmt.Sprintf("%v", trace)
}
