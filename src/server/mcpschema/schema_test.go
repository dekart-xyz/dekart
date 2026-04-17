package mcpschema

import (
	"reflect"
	"testing"

	"dekart/src/proto"
	"google.golang.org/protobuf/types/known/anypb"
	"google.golang.org/protobuf/types/known/structpb"
)

func TestUniqueSorted(t *testing.T) {
	if uniqueSorted(nil) != nil {
		t.Fatalf("uniqueSorted(nil) must return nil")
	}

	got := uniqueSorted([]string{"b", "a", "", "b", "c", "a"})
	want := []string{"a", "b", "c"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("uniqueSorted mismatch: got=%v want=%v", got, want)
	}
}

func TestObject(t *testing.T) {
	schema := Object(
		[]string{"z", "a", "a"},
		map[string]any{
			"id":   String(),
			"size": Integer(),
		},
	)

	if schema["type"] != "object" {
		t.Fatalf("schema.type mismatch: got=%v", schema["type"])
	}
	if schema["additionalProperties"] != false {
		t.Fatalf("schema.additionalProperties mismatch: got=%v", schema["additionalProperties"])
	}

	required, ok := schema["required"].([]string)
	if !ok {
		t.Fatalf("required type mismatch: got=%T", schema["required"])
	}
	if !reflect.DeepEqual(required, []string{"a", "z"}) {
		t.Fatalf("required mismatch: got=%v", required)
	}

	props, ok := schema["properties"].(map[string]any)
	if !ok {
		t.Fatalf("properties type mismatch: got=%T", schema["properties"])
	}
	if props["id"].(map[string]any)["type"] != "string" {
		t.Fatalf("id schema mismatch: got=%v", props["id"])
	}
	if props["size"].(map[string]any)["type"] != "integer" {
		t.Fatalf("size schema mismatch: got=%v", props["size"])
	}
}

func TestForProtoCompleteFileUploadSessionRequest(t *testing.T) {
	schema := ForProto(
		&proto.CompleteFileUploadSessionRequest{},
		[]string{"upload_session_id", "parts", "file_id", "total_size", "parts"},
	)

	props := schema["properties"].(map[string]any)
	if props["total_size"].(map[string]any)["type"] != "integer" {
		t.Fatalf("total_size type mismatch: got=%v", props["total_size"])
	}
	if props["file_id"].(map[string]any)["type"] != "string" {
		t.Fatalf("file_id type mismatch: got=%v", props["file_id"])
	}
	if props["upload_session_id"].(map[string]any)["type"] != "string" {
		t.Fatalf("upload_session_id type mismatch: got=%v", props["upload_session_id"])
	}

	parts := props["parts"].(map[string]any)
	if parts["type"] != "array" {
		t.Fatalf("parts type mismatch: got=%v", parts["type"])
	}
	partItem := parts["items"].(map[string]any)
	partProps := partItem["properties"].(map[string]any)
	if partProps["part_number"].(map[string]any)["type"] != "integer" {
		t.Fatalf("part_number type mismatch: got=%v", partProps["part_number"])
	}
	if partProps["etag"].(map[string]any)["type"] != "string" {
		t.Fatalf("etag type mismatch: got=%v", partProps["etag"])
	}
	if partProps["size"].(map[string]any)["type"] != "integer" {
		t.Fatalf("size type mismatch: got=%v", partProps["size"])
	}
}

func TestForProtoGetEnvResponse(t *testing.T) {
	schema := ForProto(&proto.GetEnvResponse{}, []string{"variables"})
	props := schema["properties"].(map[string]any)

	if props["server_time"].(map[string]any)["type"] != "integer" {
		t.Fatalf("server_time type mismatch: got=%v", props["server_time"])
	}

	variables := props["variables"].(map[string]any)
	if variables["type"] != "array" {
		t.Fatalf("variables type mismatch: got=%v", variables["type"])
	}
	variableItem := variables["items"].(map[string]any)
	variableProps := variableItem["properties"].(map[string]any)
	if variableProps["value"].(map[string]any)["type"] != "string" {
		t.Fatalf("variables.value type mismatch: got=%v", variableProps["value"])
	}
	typeSchema := variableProps["type"].(map[string]any)
	if typeSchema["type"] != "string" {
		t.Fatalf("variables.type JSON schema type mismatch: got=%v", typeSchema["type"])
	}
	enumValues, ok := typeSchema["enum"].([]string)
	if !ok {
		t.Fatalf("variables.type enum type mismatch: got=%T", typeSchema["enum"])
	}
	if len(enumValues) == 0 {
		t.Fatalf("variables.type enum must not be empty")
	}
}

func TestForProtoWithExtra(t *testing.T) {
	schema := ForProtoWithExtra(
		&proto.CreateDatasetRequest{},
		[]string{"report_id"},
		map[string]any{"trace_id": String()},
		[]string{"trace_id"},
	)

	required := schema["required"].([]string)
	if !reflect.DeepEqual(required, []string{"report_id", "trace_id"}) {
		t.Fatalf("required mismatch: got=%v", required)
	}

	props := schema["properties"].(map[string]any)
	if props["report_id"].(map[string]any)["type"] != "string" {
		t.Fatalf("report_id type mismatch: got=%v", props["report_id"])
	}
	if props["trace_id"].(map[string]any)["type"] != "string" {
		t.Fatalf("trace_id type mismatch: got=%v", props["trace_id"])
	}
}

func TestForProtoWellKnownTypes(t *testing.T) {
	anySchema := ForProto(&anypb.Any{}, nil)
	anyProps := anySchema["properties"].(map[string]any)
	valueSchema := anyProps["value"].(map[string]any)
	if valueSchema["type"] != "string" {
		t.Fatalf("any.value type mismatch: got=%v", valueSchema["type"])
	}
	if valueSchema["contentEncoding"] != "base64" {
		t.Fatalf("any.value contentEncoding mismatch: got=%v", valueSchema["contentEncoding"])
	}

	structSchema := ForProto(&structpb.Struct{}, nil)
	structProps := structSchema["properties"].(map[string]any)
	fieldsSchema := structProps["fields"].(map[string]any)
	if fieldsSchema["type"] != "object" {
		t.Fatalf("struct.fields type mismatch: got=%v", fieldsSchema["type"])
	}
	if _, ok := fieldsSchema["additionalProperties"]; !ok {
		t.Fatalf("struct.fields additionalProperties is required")
	}

	valueSchema2 := ForProto(&structpb.Value{}, nil)
	valueProps := valueSchema2["properties"].(map[string]any)
	if valueProps["number_value"].(map[string]any)["type"] != "number" {
		t.Fatalf("value.number_value type mismatch: got=%v", valueProps["number_value"])
	}
	if valueProps["bool_value"].(map[string]any)["type"] != "boolean" {
		t.Fatalf("value.bool_value type mismatch: got=%v", valueProps["bool_value"])
	}
}
