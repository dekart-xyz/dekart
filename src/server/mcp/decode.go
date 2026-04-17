package mcp

import (
	"bytes"
	"encoding/json"

	"google.golang.org/protobuf/encoding/protojson"
	gproto "google.golang.org/protobuf/proto"
)

// DecodeArgs decodes tool arguments and enforces strict JSON fields.
func DecodeArgs(raw json.RawMessage, target any) error {
	if len(raw) == 0 {
		raw = []byte(`{}`)
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	return nil
}

// DecodeProtoArgs decodes tool arguments into a proto request without duplicating schema structs.
func DecodeProtoArgs(raw json.RawMessage, target gproto.Message) error {
	if len(raw) == 0 {
		raw = []byte(`{}`)
	}
	unmarshaler := protojson.UnmarshalOptions{DiscardUnknown: false}
	return unmarshaler.Unmarshal(raw, target)
}
