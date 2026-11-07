package dekart

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/deviceauth"
	"dekart/src/server/jwtkeys"
	"dekart/src/server/user"
	"github.com/golang-jwt/jwt"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"net/http"
	"testing"
	"time"
)

// Settings tokens belong to the current user/workspace and cannot be polled for a second JWT.
func TestCreateDeviceToken(t *testing.T) {
	t.Setenv("DEKART_DEVICE_AUTH_PRIVATE_KEY", "")
	t.Setenv("DEKART_DEVICE_AUTH_PUBLIC_KEY", "")
	t.Setenv("DEKART_DEVICE_AUTH_TOKEN_TTL_HOURS", "2")
	db := workspaceDeleteDatabase(t)
	_, err := jwtkeys.EnsureBootstrapKeyInMemory(context.Background(), db)
	require.NoError(t, err)
	server := Server{db: db, userStreams: user.NewStreams()}
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: "owner@example.com"})
	ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{ID: "workspace-1", UserRole: proto.UserRole_ROLE_EDITOR})
	result, err := server.CreateDeviceToken(ctx, &proto.CreateDeviceTokenRequest{DeviceName: "GeoSQL MCP"})
	require.NoError(t, err)
	require.NotEmpty(t, result.Token)
	require.InDelta(t, 7200, result.ExpiresIn, 2)
	claims := jwt.MapClaims{}
	_, _, err = new(jwt.Parser).ParseUnverified(result.Token, claims)
	require.NoError(t, err)
	require.Equal(t, result.DeviceToken.Id, claims["device_id"])
	require.Equal(t, "owner@example.com", claims["email"])
	require.Equal(t, "workspace-1", claims["workspace_id"])
	require.InDelta(t, time.Now().Add(2*time.Hour).Unix(), claims["exp"], 2)
	state, err := deviceauth.GetSessionState(ctx, db, result.DeviceToken.Id)
	require.NoError(t, err)
	require.Equal(t, deviceauth.SessionStatusConsumed, state.Status)
	polled, err := deviceauth.PollToken(ctx, db, result.DeviceToken.Id)
	require.NoError(t, err)
	require.Empty(t, polled.Token)
	require.Equal(t, deviceauth.SessionStatusExpired, polled.Status)
	check := user.NewClaimsCheck(user.ClaimsCheckConfig{
		RequireGoogleOAuth: true, GoogleOAuthClientId: "test-client", GoogleOAuthSecret: "test-secret",
	}, db)
	request, err := http.NewRequest(http.MethodPost, "/api/v1/mcp/call", nil)
	require.NoError(t, err)
	request.Header.Set("Authorization", "Bearer "+result.Token)
	require.NotNil(t, user.GetClaims(check.GetContext(request)), "created token must authenticate")
	require.Equal(t, result.DeviceToken.Id, user.GetClaims(check.GetContext(request)).DeviceID)

	listed, err := server.ListDeviceTokens(ctx, &proto.ListDeviceTokensRequest{})
	require.NoError(t, err)
	require.Len(t, listed.Tokens, 1)
	require.Equal(t, result.DeviceToken, listed.Tokens[0])
	other := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: "other@example.com"})
	other = user.SetWorkspaceCtx(other, user.WorkspaceInfo{ID: "workspace-1"})
	listed, err = server.ListDeviceTokens(other, &proto.ListDeviceTokensRequest{})
	require.NoError(t, err)
	require.Empty(t, listed.Tokens)
	otherWorkspace := user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{ID: "workspace-2"})
	listed, err = server.ListDeviceTokens(otherWorkspace, &proto.ListDeviceTokensRequest{})
	require.NoError(t, err)
	require.Empty(t, listed.Tokens)
	_, err = server.RevokeDeviceToken(ctx, &proto.RevokeDeviceTokenRequest{TokenId: result.DeviceToken.Id})
	require.NoError(t, err)
	require.Nil(t, user.GetClaims(check.GetContext(request)), "created token must stop authenticating after revocation")

	_, err = server.CreateDeviceToken(context.Background(), &proto.CreateDeviceTokenRequest{})
	require.Equal(t, codes.Unauthenticated, status.Code(err))
	noWorkspace := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: "owner@example.com"})
	_, err = server.CreateDeviceToken(noWorkspace, &proto.CreateDeviceTokenRequest{})
	require.Equal(t, codes.FailedPrecondition, status.Code(err))
}
