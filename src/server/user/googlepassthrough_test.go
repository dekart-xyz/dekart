package user

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"golang.org/x/oauth2"
	"google.golang.org/api/googleapi"
	googleOAuth "google.golang.org/api/oauth2/v2"
)

func TestWithMCPGoogleAccessTokenHeaderCopiesClaims(t *testing.T) {
	original := &Claims{Email: "user@example.com", AccessToken: "browser-token"}
	ctx := context.WithValue(context.Background(), ContextKey, original)

	mcpClaims := GetClaims(WithMCPGoogleAccessTokenHeader(ctx, " Bearer google-token "))

	assert.Equal(t, "Bearer google-token", mcpClaims.MCPGoogleAccessTokenHeader)
	assert.Equal(t, "browser-token", mcpClaims.AccessToken)
	assert.Empty(t, original.MCPGoogleAccessTokenHeader)
}

func TestValidateMCPGoogleAccessToken(t *testing.T) {
	tests := []struct {
		name      string
		claims    *Claims
		tokenInfo *googleOAuth.Tokeninfo
		infoErr   error
		wantErr   error
	}{
		{
			name:   "accepts matching user with cloud platform scope",
			claims: &Claims{Email: "User@Example.com", MCPGoogleAccessTokenHeader: "Bearer google-token"},
			tokenInfo: &googleOAuth.Tokeninfo{
				Email: "user@example.com",
				Scope: googleCloudPlatformScope,
			},
		},
		{
			name:   "accepts user in auth disabled mode",
			claims: &Claims{Email: UnknownEmail, MCPGoogleAccessTokenHeader: "Bearer google-token"},
			tokenInfo: &googleOAuth.Tokeninfo{
				Email: "user@example.com",
				Scope: googleCloudPlatformScope,
			},
		},
		{
			name:    "rejects missing header",
			claims:  &Claims{Email: "user@example.com"},
			wantErr: ErrMCPGoogleAccessTokenMissing,
		},
		{
			name:   "rejects malformed header",
			claims: &Claims{Email: "user@example.com", MCPGoogleAccessTokenHeader: "google-token"},
			tokenInfo: &googleOAuth.Tokeninfo{
				Email: "user@example.com",
				Scope: googleCloudPlatformScope,
			},
			wantErr: ErrMCPGoogleAccessTokenInvalid,
		},
		{
			name:   "rejects account mismatch",
			claims: &Claims{Email: "user@example.com", MCPGoogleAccessTokenHeader: "Bearer google-token"},
			tokenInfo: &googleOAuth.Tokeninfo{
				Email: "other@example.com",
				Scope: googleCloudPlatformScope,
			},
			wantErr: ErrMCPGoogleAccountMismatch,
		},
		{
			name:   "rejects service account",
			claims: &Claims{Email: UnknownEmail, MCPGoogleAccessTokenHeader: "Bearer google-token"},
			tokenInfo: &googleOAuth.Tokeninfo{
				Email: "service@project.iam.gserviceaccount.com",
				Scope: googleCloudPlatformScope,
			},
			wantErr: ErrMCPGooglePrincipalUnsupported,
		},
		{
			name:   "requires exact cloud platform scope",
			claims: &Claims{Email: "user@example.com", MCPGoogleAccessTokenHeader: "Bearer google-token"},
			tokenInfo: &googleOAuth.Tokeninfo{
				Email: "user@example.com",
				Scope: googleCloudPlatformScope + ".read-only",
			},
			wantErr: ErrMCPGoogleScopeInsufficient,
		},
		{
			name:    "classifies rejected token as invalid",
			claims:  &Claims{Email: "user@example.com", MCPGoogleAccessTokenHeader: "Bearer google-token"},
			infoErr: &googleapi.Error{Code: 400},
			wantErr: ErrMCPGoogleAccessTokenInvalid,
		},
		{
			name:    "classifies token info outage as unavailable",
			claims:  &Claims{Email: "user@example.com", MCPGoogleAccessTokenHeader: "Bearer google-token"},
			infoErr: &googleapi.Error{Code: 503},
			wantErr: ErrMCPGoogleTokenValidationUnavailable,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.WithValue(context.Background(), ContextKey, tt.claims)
			err := validateMCPGoogleAccessToken(ctx, func(context.Context, string) (*googleOAuth.Tokeninfo, error) {
				return tt.tokenInfo, tt.infoErr
			})
			assert.ErrorIs(t, err, tt.wantErr)
			if tt.wantErr == nil {
				assert.Equal(t, "google-token", tt.claims.MCPGoogleAccessToken)
			} else {
				assert.Empty(t, tt.claims.MCPGoogleAccessToken)
			}
		})
	}
}

func TestGetMCPGoogleTokenSource(t *testing.T) {
	tests := []struct {
		name       string
		claims     *Claims
		playground bool
		wantToken  string
	}{
		{
			name:      "returns validated mcp token",
			claims:    &Claims{AccessToken: "browser-token", MCPGoogleAccessToken: "mcp-token"},
			wantToken: "mcp-token",
		},
		{
			name:   "does not return browser token",
			claims: &Claims{AccessToken: "browser-token"},
		},
		{
			name:       "preserves playground guard",
			claims:     &Claims{AccessToken: "browser-token", MCPGoogleAccessToken: "mcp-token"},
			playground: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.WithValue(context.Background(), ContextKey, tt.claims)
			ctx = SetWorkspaceCtx(ctx, WorkspaceInfo{IsPlayground: tt.playground})
			tokenSource := GetMCPGoogleTokenSource(ctx)
			if tt.wantToken == "" {
				assert.Nil(t, tokenSource)
				return
			}
			token, err := tokenSource.Token()
			assert.NoError(t, err)
			assert.Equal(t, &oauth2.Token{AccessToken: tt.wantToken}, token)
		})
	}
}

func TestValidateMCPGoogleAccessTokenReturnsCachedSuccess(t *testing.T) {
	claims := &Claims{Email: "user@example.com", MCPGoogleAccessToken: "validated-token"}
	ctx := context.WithValue(context.Background(), ContextKey, claims)
	called := false

	err := validateMCPGoogleAccessToken(ctx, func(context.Context, string) (*googleOAuth.Tokeninfo, error) {
		called = true
		return nil, errors.New("must not be called")
	})

	assert.NoError(t, err)
	assert.False(t, called)
}
