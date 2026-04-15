package dekart

import (
	"errors"
	"github.com/rs/zerolog/log"
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
