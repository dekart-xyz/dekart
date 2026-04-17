package mcp

import (
	"encoding/json"

	"google.golang.org/protobuf/encoding/protojson"
	gproto "google.golang.org/protobuf/proto"
)

// MarshalProtoJSON encodes proto payloads with proto field names preserved.
func MarshalProtoJSON(payload gproto.Message) (json.RawMessage, error) {
	marshaler := protojson.MarshalOptions{UseProtoNames: true}
	out, err := marshaler.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(out), nil
}

// MarshalJSON encodes non-proto payloads for MCP JSON responses.
func MarshalJSON(payload any) (json.RawMessage, error) {
	out, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(out), nil
}
