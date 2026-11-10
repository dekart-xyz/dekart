package user

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"fmt"
	"net/http/httptest"
	"time"

	"dekart/src/server/reportsnapshot"
	"github.com/stretchr/testify/require"
	"net/http"
	"sync"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/golang-jwt/jwt"
	"github.com/stretchr/testify/assert"
)

func TestValidateJWTFromAmazonOIDC(t *testing.T) {
	// Create a new mock database
	db, _, err := sqlmock.New()
	if err != nil {
		t.Fatalf("an error '%s' was not expected when opening a stub database connection", err)
	}
	defer db.Close()

	// Generate a new private key
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}

	token := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims{
		"email": "test@example.com",
	})
	token.Header["kid"] = "testKid"
	tokenString, err := token.SignedString(privateKey)
	if err != nil {
		t.Fatal(err)
	}

	claimsCheck := ClaimsCheck{
		ClaimsCheckConfig: ClaimsCheckConfig{
			Audience:          "test-audience",
			RequireIAP:        false,
			RequireAmazonOIDC: true,
			Region:            "us-east-1",
		},
		publicKeys: &sync.Map{},
		db:         db,
	}

	// Store the public key
	claimsCheck.publicKeys.Store("testKid", &privateKey.PublicKey)

	// Mock the http request
	req, err := http.NewRequest("GET", "/", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("x-amzn-oidc-data", tokenString)

	ctx := context.Background()
	claims := claimsCheck.validateJWTFromAmazonOIDC(ctx, req.Header.Get("x-amzn-oidc-data"))

	assert.NotNil(t, claims)
	assert.Equal(t, "test@example.com", claims.Email)
}

func TestGetContextUsesDevClaimHeaderOnlyWhenEnabled(t *testing.T) {
	claimsCheck := NewClaimsCheck(ClaimsCheckConfig{
		DevClaims: true,
	}, nil)
	req, err := http.NewRequest("GET", "/", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("X-Dekart-Claim-Email", "dev@example.com")

	claims := GetClaims(claimsCheck.GetContext(req))

	assert.NotNil(t, claims)
	assert.Equal(t, "dev@example.com", claims.Email)
}

func TestGetContextIgnoresDevClaimHeaderWhenDisabled(t *testing.T) {
	claimsCheck := NewClaimsCheck(ClaimsCheckConfig{}, nil)
	req, err := http.NewRequest("GET", "/", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("X-Dekart-Claim-Email", "dev@example.com")

	claims := GetClaims(claimsCheck.GetContext(req))

	assert.NotNil(t, claims)
	assert.Equal(t, UnknownEmail, claims.Email)
}

func TestGetContextFallsThroughWhenDevClaimsEnabledWithoutHeader(t *testing.T) {
	claimsCheck := NewClaimsCheck(ClaimsCheckConfig{
		DevClaims:         true,
		RequireAmazonOIDC: true,
		Region:            "us-east-1",
	}, nil)
	req, err := http.NewRequest("GET", "/", nil)
	if err != nil {
		t.Fatal(err)
	}

	claims := GetClaims(claimsCheck.GetContext(req))

	assert.Nil(t, claims)
}

// Amazon login headers take precedence; only Dekart bearer credentials work without them.
func TestGetContextAmazonOIDC(t *testing.T) {
	privateKey, publicKeyPEM := generateDeviceJWTKeyPair(t)
	t.Setenv(deviceAuthPublicKeyEnv, base64.StdEncoding.EncodeToString(publicKeyPEM))
	deviceToken := signDeviceToken(t, privateKey, "user@example.com", "workspace-1")
	amazonKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	amazonToken := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims{"email": "amazon@example.com"})
	amazonToken.Header["kid"] = "testKid"
	amazonToken.Header["signer"] = "arn:aws:elasticloadbalancing:eu-central-1:123:loadbalancer/app/dekart/456"
	amazonToken.Header["exp"] = time.Now().Add(time.Hour).Unix()
	validHeader, err := amazonToken.SignedString(amazonKey)
	require.NoError(t, err)
	amazonToken.Header["exp"] = time.Now().Add(-time.Hour).Unix()
	expiredHeader, err := amazonToken.SignedString(amazonKey)
	require.NoError(t, err)
	snapshotToken, _, err := reportsnapshot.IssueToken(reportsnapshot.Claims{
		Email: "snapshot@example.com", WorkspaceID: "workspace-1", ReportID: "report-1",
	})
	require.NoError(t, err)
	t.Cleanup(func() { reportsnapshot.DeleteToken(snapshotToken) })

	// Fail immediately if any identity path attempts Google or Amazon network access.
	previousClient := http.DefaultClient
	http.DefaultClient = &http.Client{Transport: amazonIdentityTransport{t: t}}
	t.Cleanup(func() { http.DefaultClient = previousClient })

	for _, scenario := range []struct {
		name, header, authorization, reportID, signer, email string
		revoked                                              bool
	}{
		{name: "valid header", header: validHeader, email: "amazon@example.com"},
		{name: "header wins", header: validHeader, authorization: "Bearer " + deviceToken, email: "amazon@example.com"},
		{name: "invalid header blocks bearer", header: "invalid", authorization: "Bearer " + deviceToken},
		{name: "device only", authorization: "Bearer " + deviceToken, email: "user@example.com"},
		{name: "revoked device", authorization: "Bearer " + deviceToken, revoked: true},
		{name: "snapshot only", authorization: "Bearer " + snapshotToken, email: "snapshot@example.com"},
		{name: "snapshot report mismatch", authorization: "Bearer " + snapshotToken, reportID: "another-report"},
		{name: "non Dekart bearer", authorization: "Bearer google-access-token"},
		{name: "whitespace header", header: " \t ", authorization: "Bearer " + deviceToken, email: "user@example.com"},
		{name: "expired header", header: expiredHeader},
		{name: "signer differs", header: validHeader, signer: "another-alb"},
		{name: "signer matches", header: validHeader, signer: amazonToken.Header["signer"].(string), email: "amazon@example.com"},
		{name: "signer unset", header: validHeader, email: "amazon@example.com"},
		{name: "missing token"},
		{name: "malformed authorization", authorization: "Basic " + deviceToken},
		{name: "tampered device", authorization: "Bearer " + deviceToken[:len(deviceToken)-8] + "abcdefgh"},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			t.Setenv("DEKART_AMAZON_OIDC_ALB_ARN", scenario.signer)
			db, err := sql.Open("sqlite3", ":memory:")
			require.NoError(t, err)
			defer db.Close()
			createDeviceSessionFixture(t, db)
			if scenario.revoked {
				_, err = db.Exec("UPDATE device_auth_log SET status = 'revoked'")
				require.NoError(t, err)
			}
			check := NewClaimsCheck(ClaimsCheckConfig{RequireAmazonOIDC: true, Region: "eu-central-1"}, db)
			check.publicKeys.Store("testKid", &amazonKey.PublicKey)
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.Header.Set("x-amzn-oidc-data", scenario.header)
			req.Header.Set("Authorization", scenario.authorization)
			req.Header.Set("X-Dekart-Report-Id", scenario.reportID)
			claims := GetClaims(check.GetContext(req))
			if scenario.email == "" {
				require.Nil(t, claims)
				return
			}
			require.NotNil(t, claims)
			require.Equal(t, scenario.email, claims.Email)
			if scenario.email == "user@example.com" {
				require.Equal(t, "workspace-1", claims.WorkspaceID)
				require.Equal(t, deviceToken, claims.DeviceToken)
			}
			if scenario.email == "snapshot@example.com" {
				require.Equal(t, "workspace-1", claims.WorkspaceID)
				require.Equal(t, "report-1", claims.ReportID)
				require.Equal(t, snapshotToken, claims.SnapshotToken)
			}
		})
	}
}

type amazonIdentityTransport struct{ t *testing.T }

// Network-free identity fixtures must never fall through to an external validator.
func (transport amazonIdentityTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	transport.t.Errorf("unexpected identity network request: %s", request.URL)
	return nil, fmt.Errorf("identity network access disabled")
}
