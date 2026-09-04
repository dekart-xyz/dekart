package user

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"

	"golang.org/x/oauth2"
	"google.golang.org/api/googleapi"
	googleOAuth "google.golang.org/api/oauth2/v2"
	"google.golang.org/api/option"
)

const (
	MCPGoogleAccessTokenHeader = "X-Dekart-Google-Access-Token"
	googleCloudPlatformScope   = "https://www.googleapis.com/auth/cloud-platform"
)

var (
	ErrMCPGoogleAccessTokenMissing         = errors.New("MCP Google access token is missing")
	ErrMCPGoogleAccessTokenInvalid         = errors.New("MCP Google access token is invalid")
	ErrMCPGoogleAccountMismatch            = errors.New("MCP Google account does not match Dekart account")
	ErrMCPGooglePrincipalUnsupported       = errors.New("MCP Google principal is unsupported")
	ErrMCPGoogleScopeInsufficient          = errors.New("MCP Google access token scope is insufficient")
	ErrMCPGoogleTokenValidationUnavailable = errors.New("MCP Google token validation is unavailable")
)

// WithMCPGoogleAccessTokenHeader adds one delegated credential to an MCP request context.
func WithMCPGoogleAccessTokenHeader(ctx context.Context, header string) context.Context {
	claims := GetClaims(ctx)
	if claims == nil {
		return ctx
	}
	requestClaims := *claims
	requestClaims.MCPGoogleAccessTokenHeader = strings.TrimSpace(header)
	requestClaims.MCPGoogleAccessToken = ""
	return context.WithValue(ctx, ContextKey, &requestClaims)
}

// ValidateMCPGoogleAccessToken validates and caches one delegated token in request claims.
func ValidateMCPGoogleAccessToken(ctx context.Context) error {
	return validateMCPGoogleAccessToken(ctx, fetchMCPGoogleTokenInfo)
}

// validateMCPGoogleAccessToken applies the delegated token identity and scope contract.
func validateMCPGoogleAccessToken(ctx context.Context, tokenInfo func(context.Context, string) (*googleOAuth.Tokeninfo, error)) error {
	claims := GetClaims(ctx)
	if claims == nil {
		return ErrMCPGoogleAccessTokenMissing
	}
	// A successful validation is reused by every BigQuery client in this request/job.
	if claims.MCPGoogleAccessToken != "" {
		return nil
	}
	if claims.MCPGoogleAccessTokenHeader == "" {
		return ErrMCPGoogleAccessTokenMissing
	}
	headerParts := strings.Fields(claims.MCPGoogleAccessTokenHeader)
	if len(headerParts) != 2 || !strings.EqualFold(headerParts[0], "Bearer") {
		return ErrMCPGoogleAccessTokenInvalid
	}
	accessToken := headerParts[1]
	info, err := tokenInfo(ctx, accessToken)
	if err != nil {
		var apiErr *googleapi.Error
		// Definite client-side rejection means the credential itself is invalid.
		if errors.As(err, &apiErr) && apiErr.Code >= 400 && apiErr.Code < 500 && apiErr.Code != http.StatusTooManyRequests {
			return ErrMCPGoogleAccessTokenInvalid
		}
		return ErrMCPGoogleTokenValidationUnavailable
	}
	if info == nil || strings.TrimSpace(info.Email) == "" {
		return ErrMCPGoogleAccessTokenInvalid
	}
	email := strings.ToLower(strings.TrimSpace(info.Email))
	if strings.HasSuffix(email, ".gserviceaccount.com") {
		return ErrMCPGooglePrincipalUnsupported
	}
	// Auth-disabled self-hosting has no Dekart identity to compare with Google.
	if claims.Email != UnknownEmail && !strings.EqualFold(strings.TrimSpace(claims.Email), email) {
		return ErrMCPGoogleAccountMismatch
	}
	if !slices.Contains(strings.Fields(info.Scope), googleCloudPlatformScope) {
		return ErrMCPGoogleScopeInsufficient
	}
	claims.MCPGoogleAccessToken = accessToken
	return nil
}

// fetchMCPGoogleTokenInfo asks Google to validate one opaque access token.
func fetchMCPGoogleTokenInfo(ctx context.Context, accessToken string) (*googleOAuth.Tokeninfo, error) {
	service, err := googleOAuth.NewService(ctx, option.WithTokenSource(oauth2.StaticTokenSource(&oauth2.Token{AccessToken: accessToken})))
	if err != nil {
		return nil, err
	}
	return service.Tokeninfo().AccessToken(accessToken).Do()
}

// GetMCPGoogleTokenSource returns only the validated delegated MCP credential.
func GetMCPGoogleTokenSource(ctx context.Context) oauth2.TokenSource {
	claims := GetClaims(ctx)
	if claims == nil || CheckWorkspaceCtx(ctx).IsPlayground {
		return nil
	}
	if claims.MCPGoogleAccessToken == "" {
		return nil
	}
	return oauth2.StaticTokenSource(&oauth2.Token{AccessToken: claims.MCPGoogleAccessToken})
}

// HasValidatedMCPGoogleAccessToken reports whether this request can use delegated BigQuery auth.
func HasValidatedMCPGoogleAccessToken(ctx context.Context) bool {
	claims := GetClaims(ctx)
	return claims != nil && claims.MCPGoogleAccessToken != ""
}
