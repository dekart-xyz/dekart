package user

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"net/http"
	"testing"
	"time"

	"github.com/golang-jwt/jwt"
)

func TestGetContextAcceptsDeviceToken(t *testing.T) {
	privateKey, publicKeyPEM := generateDeviceJWTKeyPair(t)
	t.Setenv(deviceAuthPublicKeyEnv, base64.StdEncoding.EncodeToString(publicKeyPEM))
	token := signDeviceToken(t, privateKey, "user@example.com", "workspace-1")

	claimsCheck := NewClaimsCheck(ClaimsCheckConfig{
		RequireGoogleOAuth:  true,
		GoogleOAuthClientId: "test-client",
		GoogleOAuthSecret:   "test-secret",
	}, nil)

	req, err := http.NewRequest(http.MethodPost, "/api/v1/reports", nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	ctx := claimsCheck.GetContext(req)
	claims := GetClaims(ctx)
	if claims == nil {
		t.Fatal("expected device claims")
	}
	if claims.Email != "user@example.com" {
		t.Fatalf("unexpected email: %s", claims.Email)
	}
	if GetTokenWorkspaceScopeCtx(ctx) != "workspace-1" {
		t.Fatalf("unexpected token workspace scope: %s", GetTokenWorkspaceScopeCtx(ctx))
	}
}

func TestValidateDeviceAuthTokenRequiresWorkspaceClaim(t *testing.T) {
	privateKey, publicKeyPEM := generateDeviceJWTKeyPair(t)
	t.Setenv(deviceAuthPublicKeyEnv, base64.StdEncoding.EncodeToString(publicKeyPEM))
	token := signDeviceTokenWithoutWorkspace(t, privateKey, "user@example.com")

	claimsCheck := NewClaimsCheck(ClaimsCheckConfig{
		RequireGoogleOAuth:  true,
		GoogleOAuthClientId: "test-client",
		GoogleOAuthSecret:   "test-secret",
	}, nil)

	claims, _ := claimsCheck.validateDeviceAuthToken(context.Background(), "Bearer "+token)
	if claims != nil {
		t.Fatal("expected device token without workspace_id to be rejected")
	}
}

func TestShouldValidateAsDeviceToken(t *testing.T) {
	privateKey, _ := generateDeviceJWTKeyPair(t)
	deviceToken := signDeviceToken(t, privateKey, "user@example.com", "workspace-1")
	if !shouldValidateAsDeviceToken(deviceToken) {
		t.Fatal("expected device token to be routed to device auth validator")
	}
}

func TestShouldValidateAsDeviceTokenFalseForGoogleJWT(t *testing.T) {
	privateKey, _ := generateDeviceJWTKeyPair(t)
	now := time.Now().UTC()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss":   "https://accounts.google.com",
		"aud":   "google-client-id",
		"email": "user@example.com",
		"iat":   now.Unix(),
		"exp":   now.Add(time.Hour).Unix(),
	})
	signed, err := token.SignedString(privateKey)
	if err != nil {
		t.Fatalf("SignedString: %v", err)
	}
	if shouldValidateAsDeviceToken(signed) {
		t.Fatal("expected non-device JWT to skip device auth validator")
	}
}

func generateDeviceJWTKeyPair(t *testing.T) (*rsa.PrivateKey, []byte) {
	t.Helper()
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	publicKeyPKIX, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		t.Fatalf("MarshalPKIXPublicKey: %v", err)
	}
	publicKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: publicKeyPKIX,
	})
	return privateKey, publicKeyPEM
}

func signDeviceToken(t *testing.T, privateKey *rsa.PrivateKey, email, workspaceID string) string {
	t.Helper()
	now := time.Now().UTC()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss":          deviceAuthIssuer,
		"aud":          deviceAuthAudience,
		"email":        email,
		"workspace_id": workspaceID,
		"iat":          now.Unix(),
		"exp":          now.Add(time.Hour).Unix(),
	})
	signed, err := token.SignedString(privateKey)
	if err != nil {
		t.Fatalf("SignedString: %v", err)
	}
	return signed
}

func signDeviceTokenWithoutWorkspace(t *testing.T, privateKey *rsa.PrivateKey, email string) string {
	t.Helper()
	now := time.Now().UTC()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss":   deviceAuthIssuer,
		"aud":   deviceAuthAudience,
		"email": email,
		"iat":   now.Unix(),
		"exp":   now.Add(time.Hour).Unix(),
	})
	signed, err := token.SignedString(privateKey)
	if err != nil {
		t.Fatalf("SignedString: %v", err)
	}
	return signed
}
