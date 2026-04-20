package user

import (
	"dekart/src/server/reportsnapshot"
	"strings"
)

// validateSnapshotToken validates short-lived snapshot bearer token and returns scoped user claims.
func validateSnapshotToken(token string) *Claims {
	snapshotToken := strings.TrimSpace(token)
	if snapshotToken == "" {
		return nil
	}
	snapshotClaims, err := reportsnapshot.ParseAndValidateToken(snapshotToken)
	if err != nil {
		return nil
	}
	if snapshotClaims.Email == "" || snapshotClaims.WorkspaceID == "" || snapshotClaims.ReportID == "" {
		return nil
	}
	return &Claims{
		Email:         snapshotClaims.Email,
		SnapshotToken: snapshotToken,
		WorkspaceID:   snapshotClaims.WorkspaceID,
		ReportID:      snapshotClaims.ReportID,
	}
}
