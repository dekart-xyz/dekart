package user

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-jwt/jwt"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeBearerToken(t *testing.T) {
	token, ok := normalizeBearerToken("Bearer abc.def.ghi")
	require.True(t, ok)
	assert.Equal(t, "abc.def.ghi", token)

	token, ok = normalizeBearerToken("abc.def.ghi")
	require.True(t, ok)
	assert.Equal(t, "abc.def.ghi", token)

	_, ok = normalizeBearerToken("Bearer")
	assert.False(t, ok)
}

func TestOIDCHeaderAuthValidatesIssuerAudienceAndEmailClaim(t *testing.T) {
	privateKey, jwksURL, _ := startJWKSServer(t)
	claimsCheck := NewClaimsCheck(ClaimsCheckConfig{
		RequireOIDC:  true,
		OIDCJWKSURL:  jwksURL,
		OIDCIssuer:   "https://issuer.example.com",
		OIDCAudience: "dekart-client",
	}, nil)

	token := createOIDCToken(t, privateKey, map[string]interface{}{
		"iss":   "https://issuer.example.com",
		"aud":   "dekart-client",
		"email": "alice@example.com",
		"exp":   time.Now().Add(1 * time.Hour).Unix(),
	})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Forwarded-Access-Token", "Bearer "+token)

	ctx := claimsCheck.GetContext(req)
	claims := GetClaims(ctx)
	require.NotNil(t, claims)
	assert.Equal(t, "alice@example.com", claims.Email)
}

func TestOIDCHeaderAuthRejectsIssuerAudienceAndMissingClaim(t *testing.T) {
	privateKey, jwksURL, _ := startJWKSServer(t)
	claimsCheck := NewClaimsCheck(ClaimsCheckConfig{
		RequireOIDC:  true,
		OIDCJWKSURL:  jwksURL,
		OIDCIssuer:   "https://issuer.example.com",
		OIDCAudience: "dekart-client",
	}, nil)

	tests := []map[string]interface{}{
		{
			"iss":   "https://wrong-issuer.example.com",
			"aud":   "dekart-client",
			"email": "alice@example.com",
			"exp":   time.Now().Add(1 * time.Hour).Unix(),
		},
		{
			"iss":   "https://issuer.example.com",
			"aud":   "wrong-audience",
			"email": "alice@example.com",
			"exp":   time.Now().Add(1 * time.Hour).Unix(),
		},
		{
			"iss": "https://issuer.example.com",
			"aud": "dekart-client",
			"exp": time.Now().Add(1 * time.Hour).Unix(),
		},
	}

	for _, tokenClaims := range tests {
		token := createOIDCToken(t, privateKey, tokenClaims)
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("X-Forwarded-Access-Token", token)

		ctx := claimsCheck.GetContext(req)
		assert.Nil(t, GetClaims(ctx))
	}
}

func TestOIDCJWKSUsesCache(t *testing.T) {
	privateKey, jwksURL, requests := startJWKSServer(t)
	claimsCheck := NewClaimsCheck(ClaimsCheckConfig{
		RequireOIDC: true,
		OIDCJWKSURL: jwksURL,
	}, nil)

	token := createOIDCToken(t, privateKey, map[string]interface{}{
		"email": "alice@example.com",
		"exp":   time.Now().Add(1 * time.Hour).Unix(),
	})
	req1 := httptest.NewRequest(http.MethodGet, "/", nil)
	req1.Header.Set("X-Forwarded-Access-Token", token)
	ctx1 := claimsCheck.GetContext(req1)
	require.NotNil(t, GetClaims(ctx1))

	req2 := httptest.NewRequest(http.MethodGet, "/", nil)
	req2.Header.Set("X-Forwarded-Access-Token", token)
	ctx2 := claimsCheck.GetContext(req2)
	require.NotNil(t, GetClaims(ctx2))

	assert.Equal(t, int32(1), requests.Load())
}

func TestOIDCHeaderAuthRetriesOnUnknownKID(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	requests := &atomic.Int32{}

	emptyJWKS, err := json.Marshal(jwksResponse{Keys: []jsonWebKey{}})
	require.NoError(t, err)
	validJWKS, err := json.Marshal(jwksResponse{
		Keys: []jsonWebKey{
			{
				Kid: "test-kid",
				Kty: "RSA",
				Alg: "RS256",
				N:   base64.RawURLEncoding.EncodeToString(privateKey.PublicKey.N.Bytes()),
				E:   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(privateKey.PublicKey.E)).Bytes()),
			},
		},
	})
	require.NoError(t, err)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		call := requests.Add(1)
		w.Header().Set("Content-Type", "application/json")
		if call == 1 {
			_, _ = w.Write(emptyJWKS)
			return
		}
		_, _ = w.Write(validJWKS)
	}))
	t.Cleanup(server.Close)

	claimsCheck := NewClaimsCheck(ClaimsCheckConfig{
		RequireOIDC: true,
		OIDCJWKSURL: server.URL,
	}, nil)

	token := createOIDCToken(t, privateKey, map[string]interface{}{
		"email": "alice@example.com",
		"exp":   time.Now().Add(1 * time.Hour).Unix(),
	})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Forwarded-Access-Token", token)

	ctx := claimsCheck.GetContext(req)
	claims := GetClaims(ctx)
	require.NotNil(t, claims)
	assert.Equal(t, "alice@example.com", claims.Email)
	assert.Equal(t, int32(2), requests.Load())
}

func startJWKSServer(t *testing.T) (*rsa.PrivateKey, string, *atomic.Int32) {
	t.Helper()

	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	requests := &atomic.Int32{}

	jwksPayload, err := json.Marshal(jwksResponse{
		Keys: []jsonWebKey{
			{
				Kid: "test-kid",
				Kty: "RSA",
				Alg: "RS256",
				N:   base64.RawURLEncoding.EncodeToString(privateKey.PublicKey.N.Bytes()),
				E:   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(privateKey.PublicKey.E)).Bytes()),
			},
		},
	})
	require.NoError(t, err)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(jwksPayload)
	}))
	t.Cleanup(server.Close)

	return privateKey, server.URL, requests
}

func createOIDCToken(t *testing.T, privateKey *rsa.PrivateKey, claims map[string]interface{}) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims(claims))
	token.Header["kid"] = "test-kid"
	signed, err := token.SignedString(privateKey)
	require.NoError(t, err)
	return signed
}
