package deviceauth

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// SessionStatusRevoked marks a token/session entry as revoked by workspace admin.
const SessionStatusRevoked SessionStatus = "revoked"

// WorkspaceDeviceToken represents one active device token visible in workspace settings.
type WorkspaceDeviceToken struct {
	ID           string
	DeviceName   string
	TokenPreview string
	CreatedAt    int64
}

// ListWorkspaceTokens returns active device tokens for one user in one workspace.
func ListWorkspaceTokens(ctx context.Context, db *sql.DB, workspaceID string, email string) ([]WorkspaceDeviceToken, error) {
	rows, err := db.QueryContext(
		ctx,
		`WITH latest AS (
			SELECT
				device_id,
				COALESCE(device_name, '') AS device_name,
				status,
				created_at,
				ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC) AS rn
			FROM device_auth_log
			WHERE workspace_id = $1 AND email = $2
		)
		SELECT device_id, device_name, created_at
		FROM latest
		WHERE rn = 1 AND status IN ($3, $4)
		ORDER BY created_at DESC`,
		workspaceID,
		email,
		SessionStatusAuthorized,
		SessionStatusConsumed,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tokens := make([]WorkspaceDeviceToken, 0)
	for rows.Next() {
		var deviceID string
		var deviceName string
		var createdAt time.Time
		if err := rows.Scan(&deviceID, &deviceName, &createdAt); err != nil {
			return nil, err
		}
		tokens = append(tokens, WorkspaceDeviceToken{
			ID:           deviceID,
			DeviceName:   deviceName,
			TokenPreview: buildTokenPreview(deviceID),
			CreatedAt:    createdAt.Unix(),
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return tokens, nil
}

// RevokeWorkspaceToken revokes one active device token in user/workspace scope.
func RevokeWorkspaceToken(ctx context.Context, db *sql.DB, workspaceID string, email string, tokenID string) (bool, error) {
	logID, err := newLogID()
	if err != nil {
		return false, err
	}
	result, err := db.ExecContext(
		ctx,
		`INSERT INTO device_auth_log (id, device_id, device_name, status, email, workspace_id, expires_at)
		 SELECT $1, device_id, device_name, $2, email, workspace_id, expires_at
		 FROM device_auth_log
		 WHERE id = (
		   SELECT id
		   FROM device_auth_log
		   WHERE device_id = $3 AND workspace_id = $4 AND email = $5
		   ORDER BY created_at DESC
		   LIMIT 1
		 )
		   AND status IN ($6, $7)`,
		logID,
		SessionStatusRevoked,
		tokenID,
		workspaceID,
		email,
		SessionStatusAuthorized,
		SessionStatusConsumed,
	)
	if err != nil {
		return false, err
	}
	affectedRows, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	return affectedRows > 0, nil
}

// buildTokenPreview creates a stable masked identifier for UI display.
func buildTokenPreview(deviceID string) string {
	cleaned := strings.ReplaceAll(strings.TrimSpace(deviceID), "-", "")
	if len(cleaned) < 12 {
		return fmt.Sprintf("dtk_%s", cleaned)
	}
	return fmt.Sprintf("dtk_%s...%s", cleaned[:8], cleaned[len(cleaned)-4:])
}
