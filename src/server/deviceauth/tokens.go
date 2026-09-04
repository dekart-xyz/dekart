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

// GetTokenUpdate returns a monotonic marker for token list refresh decisions.
func GetTokenUpdate(ctx context.Context, db *sql.DB, workspaceID string, email string) (int64, error) {
	if workspaceID == "" || email == "" {
		return 0, nil
	}
	var update int64
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM device_auth_log WHERE workspace_id = $1 AND email = $2`, workspaceID, email).Scan(&update); err != nil {
		return 0, err
	}
	return update, nil
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
				expires_at,
				created_at,
				ROW_NUMBER() OVER (
					PARTITION BY device_id
					ORDER BY created_at DESC,
						CASE status WHEN 'revoked' THEN 4 WHEN 'expired' THEN 3 WHEN 'consumed' THEN 2 WHEN 'authorized' THEN 1 ELSE 0 END DESC
				) AS rn
			FROM device_auth_log
			WHERE workspace_id = $1 AND email = $2
		)
		SELECT device_id, device_name, created_at
		FROM latest
		WHERE rn = 1 AND ((status = $3 AND expires_at > CURRENT_TIMESTAMP) OR status = $4)
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
	result, err := db.ExecContext(
		ctx,
		`INSERT INTO device_auth_log (id, device_id, device_name, status, email, workspace_id, expires_at)
		 SELECT id || ':next', device_id, device_name, $1, email, workspace_id, expires_at
		 FROM device_auth_log
		 WHERE id = (
		   SELECT id
		   FROM device_auth_log
		   WHERE device_id = $2 AND workspace_id = $3 AND email = $4
		   ORDER BY created_at DESC,
		     CASE status WHEN 'revoked' THEN 4 WHEN 'expired' THEN 3 WHEN 'consumed' THEN 2 WHEN 'authorized' THEN 1 ELSE 0 END DESC
		   LIMIT 1
		 )
		   AND status IN ($5, $6)
		 ON CONFLICT (id) DO NOTHING`,
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
