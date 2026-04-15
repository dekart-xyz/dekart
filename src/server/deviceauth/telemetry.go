package deviceauth

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"strings"

	"github.com/rs/zerolog/log"
)

// trackLifecycleEvent records device auth lifecycle telemetry in cloud mode only.
func trackLifecycleEvent(ctx context.Context, db *sql.DB, eventName, email, workspaceID, errorCode string) {
	if os.Getenv("DEKART_CLOUD") == "" {
		return
	}
	normalizedEmail := strings.TrimSpace(email)
	if normalizedEmail == "" {
		normalizedEmail = "device-auth"
	}
	if len(normalizedEmail) > 255 {
		normalizedEmail = normalizedEmail[:255]
	}
	eventData := map[string]string{
		"is_cloud":     "true",
		"workspace_id": strings.TrimSpace(workspaceID),
		"error_code":   strings.TrimSpace(errorCode),
	}
	eventDataJSON, err := json.Marshal(eventData)
	if err != nil {
		log.Warn().Err(err).Str("event_name", eventName).Msg("Failed to marshal device auth telemetry event payload")
		return
	}
	_, err = db.ExecContext(
		ctx,
		`INSERT INTO track_events (email, event_name, event_data_json)
		VALUES ($1, $2, $3)`,
		normalizedEmail,
		eventName,
		string(eventDataJSON),
	)
	if err != nil {
		log.Warn().Err(err).Str("event_name", eventName).Msg("Failed to store device auth telemetry event")
	}
}
