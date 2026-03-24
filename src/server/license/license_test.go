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

func TestIssueToken_Trial(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Unix(1774060800, 0).UTC()
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
