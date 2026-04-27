package mcpschema

import (
	"sort"

	gproto "google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
)

// ForProto builds MCP input schema from proto request message plus explicit required fields.
func ForProto(message gproto.Message, required []string) map[string]any {
	return ForProtoWithExtra(message, required, map[string]any{}, nil)
}

// ForProtoWithExtra builds MCP input schema from proto request plus non-proto transport fields.
func ForProtoWithExtra(message gproto.Message, required []string, extraProps map[string]any, extraRequired []string) map[string]any {
	props := protoMessageProperties(message.ProtoReflect().Descriptor(), map[protoreflect.FullName]bool{})
	for name, schema := range extraProps {
		props[name] = schema
	}
	return Object(append(required, extraRequired...), props)
}

// Object creates consistent JSON-schema object definitions.
func Object(required []string, properties map[string]any) map[string]any {
	return map[string]any{
		"type":                 "object",
		"required":             uniqueSorted(required),
		"properties":           properties,
		"additionalProperties": false,
	}
}

// String returns reusable string schema snippet.
func String() map[string]any {
	return map[string]any{"type": "string"}
}

// Integer returns reusable integer schema snippet.
func Integer() map[string]any {
	return map[string]any{"type": "integer"}
}

// protoMessageProperties converts proto message descriptor fields into JSON-schema properties.
func protoMessageProperties(desc protoreflect.MessageDescriptor, seen map[protoreflect.FullName]bool) map[string]any {
	if seen[desc.FullName()] {
		return map[string]any{}
	}
	seen[desc.FullName()] = true
	properties := map[string]any{}
	fields := desc.Fields()
	for i := 0; i < fields.Len(); i++ {
		field := fields.Get(i)
		properties[string(field.Name())] = protoFieldSchema(field, seen)
	}
	delete(seen, desc.FullName())
	return properties
}

// protoFieldSchema converts one proto field descriptor into JSON-schema definition.
func protoFieldSchema(field protoreflect.FieldDescriptor, seen map[protoreflect.FullName]bool) map[string]any {
	if field.IsMap() {
		return map[string]any{
			"type":                 "object",
			"additionalProperties": protoSingularFieldSchema(field.MapValue(), seen),
		}
	}
	if field.IsList() {
		return map[string]any{
			"type":  "array",
			"items": protoSingularFieldSchema(field, seen),
		}
	}
	return protoSingularFieldSchema(field, seen)
}

// protoSingularFieldSchema handles non-list field type mapping from proto kinds to JSON-schema.
func protoSingularFieldSchema(field protoreflect.FieldDescriptor, seen map[protoreflect.FullName]bool) map[string]any {
	switch field.Kind() {
	case protoreflect.BoolKind:
		return map[string]any{"type": "boolean"}
	case protoreflect.StringKind:
		return map[string]any{"type": "string"}
	case protoreflect.BytesKind:
		return map[string]any{"type": "string", "contentEncoding": "base64"}
	case protoreflect.DoubleKind, protoreflect.FloatKind:
		return map[string]any{"type": "number"}
	case protoreflect.Int32Kind, protoreflect.Sint32Kind, protoreflect.Sfixed32Kind,
		protoreflect.Int64Kind, protoreflect.Sint64Kind, protoreflect.Sfixed64Kind,
		protoreflect.Uint32Kind, protoreflect.Fixed32Kind,
		protoreflect.Uint64Kind, protoreflect.Fixed64Kind:
		return map[string]any{"type": "integer"}
	case protoreflect.EnumKind:
		return map[string]any{
			"type": "string",
			"enum": enumValueNames(field.Enum()),
		}
	case protoreflect.MessageKind, protoreflect.GroupKind:
		return Object(nil, protoMessageProperties(field.Message(), seen))
	default:
		return map[string]any{"type": "string"}
	}
}

// enumValueNames extracts enum symbolic names for schema hints.
func enumValueNames(desc protoreflect.EnumDescriptor) []string {
	values := desc.Values()
	result := make([]string, 0, values.Len())
	for i := 0; i < values.Len(); i++ {
		result = append(result, string(values.Get(i).Name()))
	}
	return result
}

// uniqueSorted deduplicates and sorts strings for stable schema output.
func uniqueSorted(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	uniq := map[string]bool{}
	for _, value := range values {
		if value == "" {
			continue
		}
		uniq[value] = true
	}
	result := make([]string, 0, len(uniq))
	for value := range uniq {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}
