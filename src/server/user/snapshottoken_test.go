package user

import (
	"context"
	"testing"

	"dekart/src/server/reportsnapshot"
	"github.com/stretchr/testify/require"
)

func TestWithSnapshotCredentialsRestoresDelegatedCredential(t *testing.T) {
	token, _, err := reportsnapshot.IssueToken(reportsnapshot.Claims{
		Email:                "user@example.com",
		WorkspaceID:          "workspace-1",
		ReportID:             "report-1",
		MCPGoogleAccessToken: "delegated-token",
	})
	require.NoError(t, err)
	t.Cleanup(func() { reportsnapshot.DeleteToken(token) })

	claims := validateSnapshotToken(token)
	require.Empty(t, claims.AccessToken)
	require.Empty(t, claims.MCPGoogleAccessToken)

	ctx := context.WithValue(context.Background(), ContextKey, claims)
	claims = GetClaims(WithSnapshotCredentials(ctx))

	require.Empty(t, claims.AccessToken)
	require.Equal(t, "delegated-token", claims.MCPGoogleAccessToken)
}
