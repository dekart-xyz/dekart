package mcpschema

import "strings"

// NormalizeInputSchema enforces strict top-level schema shape and returns required fields.
func NormalizeInputSchema(schema map[string]any) (map[string]any, []string) {
	normalized := map[string]any{}
	for key, value := range schema {
		normalized[key] = value
	}

	required := normalizeRequiredFields(normalized["required"])
	normalized["required"] = required

	properties, ok := normalized["properties"].(map[string]any)
	if !ok || properties == nil {
		properties = map[string]any{}
	}
	normalized["properties"] = properties

	if _, ok := normalized["type"].(string); !ok {
		normalized["type"] = "object"
	}
	if _, ok := normalized["additionalProperties"]; !ok {
		normalized["additionalProperties"] = false
	}
	return normalized, required
}

// MinimalExampleInput builds required-only example payload using declared schema.
func MinimalExampleInput(required []string, properties map[string]any, existing map[string]any) map[string]any {
	example := map[string]any{}
	for _, field := range required {
		if value, ok := existing[field]; ok {
			example[field] = value
			continue
		}
		example[field] = minimalExampleValue(field, properties[field])
	}
	return example
}

// normalizeRequiredFields returns deterministic required field names from JSON-schema value.
func normalizeRequiredFields(raw any) []string {
	seen := map[string]bool{}
	result := make([]string, 0)
	appendField := func(value string) {
		if strings.TrimSpace(value) == "" || seen[value] {
			return
		}
		seen[value] = true
		result = append(result, value)
	}

	switch values := raw.(type) {
	case []string:
		for _, value := range values {
			appendField(value)
		}
	case []any:
		for _, item := range values {
			value, ok := item.(string)
			if ok {
				appendField(value)
			}
		}
	}
	return result
}

// minimalExampleValue returns one minimal placeholder compatible with field schema.
func minimalExampleValue(fieldName string, rawSchema any) any {
	schema, _ := rawSchema.(map[string]any)
	if schema != nil {
		if value, ok := schema["const"]; ok {
			return value
		}
		switch values := schema["enum"].(type) {
		case []any:
			if len(values) > 0 {
				return values[0]
			}
		case []string:
			if len(values) > 0 {
				return values[0]
			}
		}

		fieldType := schema["type"]
		switch values := fieldType.(type) {
		case []any:
			for _, value := range values {
				if token, ok := value.(string); ok && token != "null" {
					fieldType = token
					break
				}
			}
		case []string:
			for _, token := range values {
				if token != "null" {
					fieldType = token
					break
				}
			}
		}

		switch fieldType {
		case "boolean":
			return false
		case "integer", "number":
			return 0
		case "array":
			return []any{}
		case "object":
			return map[string]any{}
		}
	}

	name := strings.ToLower(strings.TrimSpace(fieldName))
	if strings.HasSuffix(name, "_id") || name == "id" || strings.Contains(name, "uuid") {
		return "00000000-0000-0000-0000-000000000000"
	}
	if strings.Contains(name, "email") {
		return "user@example.com"
	}
	if strings.Contains(name, "url") || strings.Contains(name, "uri") {
		return "https://example.com"
	}
	if strings.Contains(name, "markdown") || strings.Contains(name, "readme") {
		return "# Title"
	}
	if strings.Contains(name, "map_config") {
		return "{\"version\":\"v1\",\"config\":{}}"
	}
	return ""
}
