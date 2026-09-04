package bqutils

import (
	"context"
	"testing"

	"dekart/src/proto"
	"dekart/src/server/user"

	"github.com/stretchr/testify/assert"
)

func TestGetTokenSourceScopesDelegatedTokenToPassthroughConnection(t *testing.T) {
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{
		AccessToken:          "browser-token",
		MCPGoogleAccessToken: "delegated-token",
	})
	ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{})

	namedToken, err := getTokenSource(ctx, &proto.Connection{
		Id:             "named-passthrough",
		ConnectionType: proto.ConnectionType_CONNECTION_TYPE_BIGQUERY,
	}).Token()
	assert.NoError(t, err)
	assert.Equal(t, "delegated-token", namedToken.AccessToken)

	systemToken, err := getTokenSource(ctx, &proto.Connection{
		Id:             "default",
		ConnectionType: proto.ConnectionType_CONNECTION_TYPE_BIGQUERY,
	}).Token()
	assert.NoError(t, err)
	assert.Equal(t, "browser-token", systemToken.AccessToken)

	t.Setenv("DEKART_CLOUD", "1")
	cloudSystemToken, err := getTokenSource(ctx, &proto.Connection{
		Id:             "default",
		ConnectionType: proto.ConnectionType_CONNECTION_TYPE_BIGQUERY,
	}).Token()
	assert.NoError(t, err)
	assert.Equal(t, "delegated-token", cloudSystemToken.AccessToken)

	postgresToken, err := getTokenSource(ctx, &proto.Connection{
		Id:             "named-postgres",
		ConnectionType: proto.ConnectionType_CONNECTION_TYPE_POSTGRES,
	}).Token()
	assert.NoError(t, err)
	assert.Equal(t, "browser-token", postgresToken.AccessToken)
}
