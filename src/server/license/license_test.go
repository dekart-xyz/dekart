package license

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"testing"
	"time"

	"github.com/golang-jwt/jwt"
)

func encodePrivateKeyPEM(t *testing.T, key *rsa.PrivateKey) []byte {
	t.Helper()
	return pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	})
}

func encodePublicKeyPEM(t *testing.T, key *rsa.PublicKey) []byte {
	t.Helper()
	bytes, err := x509.MarshalPKIXPublicKey(key)
	if err != nil {
		t.Fatal(err)
	}
	return pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: bytes,
	})
}

func TestIssueToken_Trial(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	exp := now.Add(14 * 24 * time.Hour)

	tokenString, err := IssueToken(encodePrivateKeyPEM(t, privateKey), IssueRequest{
		Email:     "admin@example.com",
		IssuedAt:  now,
		ExpiresAt: &exp,
	})
	if err != nil {
		t.Fatal(err)
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return &privateKey.PublicKey, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	claims := token.Claims.(jwt.MapClaims)
	if claims["iss"] != "dekart.xyz" {
		t.Fatalf("unexpected issuer: %v", claims["iss"])
	}
	if claims["sub"] != "admin@example.com" {
		t.Fatalf("unexpected subject: %v", claims["sub"])
	}
	if claims["exp"] == nil {
		t.Fatalf("expected exp claim")
	}
}

func TestIssueToken_Perpetual(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Unix(1774060800, 0).UTC()

	tokenString, err := IssueToken(encodePrivateKeyPEM(t, privateKey), IssueRequest{
		Email:    "admin@example.com",
		IssuedAt: now,
	})
	if err != nil {
		t.Fatal(err)
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return &privateKey.PublicKey, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	claims := token.Claims.(jwt.MapClaims)
	if claims["exp"] != nil {
		t.Fatalf("did not expect exp claim, got: %v", claims["exp"])
	}
}

func TestIssueToken_ValidationErrors(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	past := now.Add(-time.Hour)

	_, err = IssueToken(encodePrivateKeyPEM(t, privateKey), IssueRequest{
		Email:    "",
		IssuedAt: now,
	})
	if err == nil {
		t.Fatal("expected error for empty email")
	}

	_, err = IssueToken(encodePrivateKeyPEM(t, privateKey), IssueRequest{
		Email:     "admin@example.com",
		IssuedAt:  now,
		ExpiresAt: &past,
	})
	if err == nil {
		t.Fatal("expected error for past expiry")
	}
}

func TestValidateTokenWithPublicKey_ValidTrial(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	exp := now.Add(14 * 24 * time.Hour)

	tokenString, err := IssueToken(encodePrivateKeyPEM(t, privateKey), IssueRequest{
		Email:     "admin@example.com",
		IssuedAt:  now,
		ExpiresAt: &exp,
	})
	if err != nil {
		t.Fatal(err)
	}

	info, err := ValidateTokenWithPublicKey(tokenString, encodePublicKeyPEM(t, &privateKey.PublicKey))
	if err != nil {
		t.Fatal(err)
	}
	if info.Email != "admin@example.com" {
		t.Fatalf("unexpected email: %q", info.Email)
	}
	if info.ExpiresAt == nil {
		t.Fatal("expected expiry")
	}
}

func TestValidateTokenWithPublicKey_ValidPerpetual(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()

	tokenString, err := IssueToken(encodePrivateKeyPEM(t, privateKey), IssueRequest{
		Email:    "admin@example.com",
		IssuedAt: now,
	})
	if err != nil {
		t.Fatal(err)
	}

	info, err := ValidateTokenWithPublicKey(tokenString, encodePublicKeyPEM(t, &privateKey.PublicKey))
	if err != nil {
		t.Fatal(err)
	}
	if info.ExpiresAt != nil {
		t.Fatalf("did not expect expiry: %v", info.ExpiresAt)
	}
}

func TestValidateTokenWithPublicKey_Expired(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	exp := now.Add(-1 * time.Hour)

	tokenString, err := IssueToken(encodePrivateKeyPEM(t, privateKey), IssueRequest{
		Email:     "admin@example.com",
		IssuedAt:  now.Add(-24 * time.Hour),
		ExpiresAt: &exp,
	})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := ValidateTokenWithPublicKey(tokenString, encodePublicKeyPEM(t, &privateKey.PublicKey)); err == nil {
		t.Fatal("expected expired token validation error")
	}
}

func TestValidateTokenWithPublicKey_InvalidIssuer(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss": "wrong-issuer",
		"sub": "admin@example.com",
		"iat": time.Now().UTC().Unix(),
		"exp": time.Now().UTC().Add(24 * time.Hour).Unix(),
	})
	tokenString, err := token.SignedString(privateKey)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := ValidateTokenWithPublicKey(tokenString, encodePublicKeyPEM(t, &privateKey.PublicKey)); err == nil {
		t.Fatal("expected invalid issuer validation error")
	}
}

func TestValidateTokenWithPublicKey_InvalidSignature(t *testing.T) {
	privateKeyA, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	privateKeyB, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}

	tokenString, err := IssueToken(encodePrivateKeyPEM(t, privateKeyA), IssueRequest{
		Email:    "admin@example.com",
		IssuedAt: time.Now().UTC(),
	})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := ValidateTokenWithPublicKey(tokenString, encodePublicKeyPEM(t, &privateKeyB.PublicKey)); err == nil {
		t.Fatal("expected invalid signature validation error")
	}
}
