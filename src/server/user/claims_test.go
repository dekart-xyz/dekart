package user

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
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
