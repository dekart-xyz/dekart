package user

import (
	"context"
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

// WithSnapshotCredentials exposes stored Google credentials only to the dataset-source request that needs them.
func WithSnapshotCredentials(ctx context.Context) context.Context {
	claims := GetClaims(ctx)
	if claims == nil || claims.SnapshotToken == "" {
		return ctx
	}
	snapshotClaims, err := reportsnapshot.ParseAndValidateToken(claims.SnapshotToken)
	if err != nil || snapshotClaims.WorkspaceID != claims.WorkspaceID || snapshotClaims.ReportID != claims.ReportID {
		return ctx
	}
	requestClaims := *claims
	requestClaims.MCPGoogleAccessToken = snapshotClaims.MCPGoogleAccessToken
	return context.WithValue(ctx, ContextKey, &requestClaims)
}
