package user

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestValidateJWTFromAmazonOIDC(t *testing.T) {
	// Generate a new private key
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}

	// Create a header
	header := map[string]string{
		"alg": "ES256",
		"kid": "testKid",
	}
	headerBytes, err := json.Marshal(header)
	if err != nil {
		t.Fatal(err)
	}

	// Create a payload with an email claim
	payload := map[string]string{
		"email": "test@example.com",
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}

	// Base64 encode the header and payload using old JWT spec, new spec uses base64.RawURLEncoding.EncodeToString
	encodedHeader := base64.StdEncoding.EncodeToString(headerBytes)
	encodedPayload := base64.StdEncoding.EncodeToString(payloadBytes)

	// Concatenate the encoded header and payload with a period separator
	message := encodedHeader + "." + encodedPayload

	// Sign the message with the private key
	hash := sha256.Sum256([]byte(message))
	r, s, err := ecdsa.Sign(rand.Reader, privateKey, hash[:])
	if err != nil {
		t.Fatal(err)
	}

	// Base64 encode the signature
	signature := r.Bytes()
	signature = append(signature, s.Bytes()...)
	encodedSignature := base64.RawURLEncoding.EncodeToString(signature)

	// Concatenate the signature with the message with a period separator
	tokenString := message + "." + encodedSignature

	claimsCheck := ClaimsCheck{
		ClaimsCheckConfig{
			Audience:          "test-audience",
			RequireIAP:        false,
			RequireAmazonOIDC: true,
			DevClaimsEmail:    "",
			Region:            "us-east-1",
		},
		&sync.Map{},
	}

	// Store the public key
	claimsCheck.publicKeys.Store(header["kid"], &privateKey.PublicKey)

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
