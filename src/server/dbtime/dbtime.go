package dbtime

import (
	"fmt"
	"time"
)

const databaseTimestampLayout = "2006-01-02 15:04:05"

// ParseTimestamp converts timestamp values returned by Postgres and SQLite drivers.
func ParseTimestamp(value any) (*time.Time, error) {
	switch timestamp := value.(type) {
	case time.Time:
		return &timestamp, nil
	case string:
		return ParseTimestampString(timestamp)
	case []byte:
		return ParseTimestampString(string(timestamp))
	default:
		return nil, fmt.Errorf("unsupported database timestamp type %T", value)
	}
}

// ParseTimestampString parses SQLite CURRENT_TIMESTAMP values, which are stored in UTC.
func ParseTimestampString(value string) (*time.Time, error) {
	parsed, err := time.ParseInLocation(databaseTimestampLayout, value, time.UTC)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database timestamp: %v", err)
	}
	return &parsed, nil
}
