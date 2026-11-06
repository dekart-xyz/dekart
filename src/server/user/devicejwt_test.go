package user

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"database/sql"
	deviceauth "dekart/src/server/deviceauth"
	"dekart/src/server/jwtkeys"
	"encoding/base64"
	"encoding/pem"
	"github.com/stretchr/testify/require"
	"net/http"
	"testing"
	"time"

	"github.com/golang-jwt/jwt"
	_ "github.com/mattn/go-sqlite3"
)

func TestGetContextAcceptsDeviceToken(t *testing.T) {
	privateKey, publicKeyPEM := generateDeviceJWTKeyPair(t)
	t.Setenv(deviceAuthPublicKeyEnv, base64.StdEncoding.EncodeToString(publicKeyPEM))
	token := signDeviceToken(t, privateKey, "user@example.com", "workspace-1")
	db, err := sql.Open("sqlite3", ":memory:")
	require.NoError(t, err)
	defer db.Close()
	createDeviceSessionFixture(t, db)

	claimsCheck := NewClaimsCheck(ClaimsCheckConfig{
		RequireGoogleOAuth:  true,
		GoogleOAuthClientId: "test-client",
		GoogleOAuthSecret:   "test-secret",
	}, db)

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
	if claims.WorkspaceID != "workspace-1" {
		t.Fatalf("unexpected workspace scope in claims: %s", claims.WorkspaceID)
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

	claims := claimsCheck.validateDeviceAuthToken(context.Background(), "Bearer "+token)
	if claims != nil {
		t.Fatal("expected device token without workspace_id to be rejected")
	}
}

func TestGetContextAcceptsDeviceTokenWithBootstrapFallback(t *testing.T) {
	t.Setenv(deviceAuthPublicKeyEnv, "")
	t.Setenv("DEKART_DEVICE_AUTH_PRIVATE_KEY", "")

	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`
		create table instance_keys (
			id text primary key,
			key_name text not null unique,
			private_key_pem text not null,
			public_key_pem text not null,
			created_at datetime not null default current_timestamp
		);
	`)
	if err != nil {
		t.Fatalf("create schema: %v", err)
	}

	_, err = jwtkeys.EnsureBootstrapKeyInMemory(context.Background(), db)
	if err != nil {
		t.Fatalf("EnsureBootstrapKeyInMemory: %v", err)
	}
	createDeviceSessionFixture(t, db)
	issuer := deviceauth.NewJWTIssuer()
	token, _, err := issuer.Issue("user@example.com", "workspace-1", "device-1")
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	claimsCheck := NewClaimsCheck(ClaimsCheckConfig{
		RequireGoogleOAuth:  true,
		GoogleOAuthClientId: "test-client",
		GoogleOAuthSecret:   "test-secret",
	}, db)

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
	if claims.Email != "user@example.com" || claims.WorkspaceID != "workspace-1" {
		t.Fatalf("unexpected claims: %#v", claims)
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
		"device_id":    "device-1",
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

// Device credentials must be checked against their current session on every request.
func TestDeviceTokenCurrentSession(t *testing.T) {
	privateKey, publicKeyPEM := generateDeviceJWTKeyPair(t)
	t.Setenv(deviceAuthPublicKeyEnv, base64.StdEncoding.EncodeToString(publicKeyPEM))
	db, err := sql.Open("sqlite3", ":memory:")
	require.NoError(t, err)
	defer db.Close()
	createDeviceSessionFixture(t, db)
	check := NewClaimsCheck(ClaimsCheckConfig{RequireGoogleOAuth: true, GoogleOAuthClientId: "test-client", GoogleOAuthSecret: "test-secret"}, db)
	for _, scenario := range []struct {
		name, deviceID, email, workspace string
		expired, accepted                bool
	}{
		{name: "active", deviceID: "device-1", email: "user@example.com", workspace: "workspace-1", accepted: true},
		{name: "pre-fix", email: "user@example.com", workspace: "workspace-1"},
		{name: "unknown device", deviceID: "unknown", email: "user@example.com", workspace: "workspace-1"},
		{name: "wrong user", deviceID: "device-1", email: "other@example.com", workspace: "workspace-1"},
		{name: "wrong workspace", deviceID: "device-1", email: "user@example.com", workspace: "other"},
		{name: "expired", deviceID: "device-1", email: "user@example.com", workspace: "workspace-1", expired: true},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			expires := time.Now().Add(time.Hour).Unix()
			if scenario.expired {
				expires = time.Now().Add(-time.Hour).Unix()
			}
			tokenClaims := jwt.MapClaims{
				"iss": deviceAuthIssuer, "aud": deviceAuthAudience, "email": scenario.email,
				"workspace_id": scenario.workspace, "exp": expires,
			}
			if scenario.deviceID != "" {
				tokenClaims["device_id"] = scenario.deviceID
			}
			token, err := jwt.NewWithClaims(jwt.SigningMethodRS256, tokenClaims).SignedString(privateKey)
			require.NoError(t, err)
			req, err := http.NewRequest(http.MethodPost, "/api/v1/mcp/call", nil)
			require.NoError(t, err)
			req.Header.Set("Authorization", "Bearer "+token)
			require.Equal(t, scenario.accepted, GetClaims(check.GetContext(req)) != nil)
		})
	}
	token := signDeviceToken(t, privateKey, "user@example.com", "workspace-1")
	activeReq, err := http.NewRequest(http.MethodPost, "/api/v1/mcp/call", nil)
	require.NoError(t, err)
	activeReq.Header.Set("Authorization", "Bearer "+token)
	require.NotNil(t, GetClaims(check.GetContext(activeReq)))
	revoked, err := deviceauth.RevokeWorkspaceToken(context.Background(), db, "workspace-1", "user@example.com", "device-1")
	require.NoError(t, err)
	require.True(t, revoked)
	require.Nil(t, GetClaims(check.GetContext(activeReq)), "revocation must take effect on the next request")

	req, err := http.NewRequest(http.MethodPost, "/api/v1/mcp/call", nil)
	require.NoError(t, err)
	require.Nil(t, GetClaims(check.GetContext(req)), "missing bearer token")
}

// The consumed session remains active after the short browser authorization window expires.
func createDeviceSessionFixture(t *testing.T, db *sql.DB) {
	t.Helper()
	_, err := db.Exec(`CREATE TABLE device_auth_log (
 id TEXT PRIMARY KEY, device_id TEXT, device_name TEXT, status TEXT,
 email TEXT, workspace_id TEXT, expires_at TIMESTAMP,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
 INSERT INTO device_auth_log (id, device_id, status, email, workspace_id, expires_at)
 VALUES ('issued', 'device-1', 'consumed', 'user@example.com', 'workspace-1', '2020-01-01');`)
	require.NoError(t, err)

}
