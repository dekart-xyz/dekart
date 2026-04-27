package dekart

import (
	"errors"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/encoding/protojson"
	gproto "google.golang.org/protobuf/proto"
	"io"
	"net/http"
)

// writeProtoJSON writes proto message as JSON with stable field names for HTTP clients.
func writeProtoJSON(w http.ResponseWriter, statusCode int, payload gproto.Message) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	marshaller := protojson.MarshalOptions{UseProtoNames: true}
	jsonOut, err := marshaller.Marshal(payload)
	if err != nil {
		log.Error().Err(err).Msg("Failed to encode proto JSON response")
		return
	}
	if _, err := w.Write(jsonOut); err != nil {
		log.Error().Err(err).Msg("Failed to write proto JSON response")
	}
}

// readProtoJSON decodes request body JSON into a proto message.
func readProtoJSON(r *http.Request, payload gproto.Message) error {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return err
	}
	if len(body) == 0 {
		return errors.New("empty body")
	}
	unmarshaller := protojson.UnmarshalOptions{DiscardUnknown: true}
	if err := unmarshaller.Unmarshal(body, payload); err != nil {
		return err
	}
	return nil
}

// writeGrpcErrorAsHTTP converts gRPC status errors into HTTP responses for protojson endpoints.
func writeGrpcErrorAsHTTP(w http.ResponseWriter, err error, operation string) {
	grpcStatus, ok := status.FromError(err)
	if !ok {
		log.Error().Err(err).Msg(operation + " failed")
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	switch grpcStatus.Code() {
	case codes.InvalidArgument:
		http.Error(w, grpcStatus.Message(), http.StatusBadRequest)
	case codes.Unauthenticated:
		http.Error(w, grpcStatus.Message(), http.StatusUnauthorized)
	case codes.PermissionDenied:
		http.Error(w, grpcStatus.Message(), http.StatusForbidden)
	case codes.NotFound:
		http.Error(w, grpcStatus.Message(), http.StatusNotFound)
	case codes.FailedPrecondition:
		http.Error(w, grpcStatus.Message(), http.StatusPreconditionFailed)
	default:
		log.Error().Err(err).Msg(operation + " failed")
		http.Error(w, "internal server error", http.StatusInternalServerError)
	}
}
