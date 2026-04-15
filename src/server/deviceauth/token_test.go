package deviceauth

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt"
)

func TestJWTIssuerIssueIncludesRequiredClaims(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	privateKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(privateKey),
	})
	publicKeyPKIX, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		t.Fatalf("MarshalPKIXPublicKey: %v", err)
	}
	publicKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: publicKeyPKIX,
	})

	issuer := &JWTIssuer{
		privateKeyPEM: privateKeyPEM,
		publicKeyPEM:  publicKeyPEM,
		ttl:           2 * time.Hour,
	}
	token, expiresAt, err := issuer.Issue("user@example.com", "workspace-1")
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if token == "" {
		t.Fatal("expected signed token")
	}

	parsed, err := jwt.Parse(token, func(parsedToken *jwt.Token) (interface{}, error) {
		return &privateKey.PublicKey, nil
	})
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if !parsed.Valid {
		t.Fatal("expected valid token")
	}
	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		t.Fatal("expected jwt.MapClaims")
	}

	if claims["iss"] != defaultIssuer {
		t.Fatalf("unexpected issuer: %v", claims["iss"])
	}
	if claims["aud"] != defaultAudience {
		t.Fatalf("unexpected audience: %v", claims["aud"])
	}
	if claims["email"] != "user@example.com" {
		t.Fatalf("unexpected email: %v", claims["email"])
	}
	if claims["workspace_id"] != "workspace-1" {
		t.Fatalf("unexpected workspace_id: %v", claims["workspace_id"])
	}
	exp, ok := claims["exp"].(float64)
	if !ok || int64(exp) != expiresAt.Unix() {
		t.Fatalf("unexpected exp claim: %v", claims["exp"])
	}
	if _, ok := claims["iat"].(float64); !ok {
		t.Fatalf("missing iat claim: %v", claims["iat"])
	}
	jti, ok := claims["jti"].(string)
	if !ok || !strings.HasPrefix(jti, "da_") {
		t.Fatalf("unexpected jti claim: %v", claims["jti"])
	}
}

func TestJWTIssuerIssueFailsWhenKeyPairMismatch(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	otherPrivateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	privateKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(privateKey),
	})
	publicKeyPKIX, err := x509.MarshalPKIXPublicKey(&otherPrivateKey.PublicKey)
	if err != nil {
		t.Fatalf("MarshalPKIXPublicKey: %v", err)
	}
	publicKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: publicKeyPKIX,
	})

	issuer := &JWTIssuer{
		privateKeyPEM: privateKeyPEM,
		publicKeyPEM:  publicKeyPEM,
		ttl:           2 * time.Hour,
	}
	if _, _, err := issuer.Issue("user@example.com", "workspace-1"); err == nil {
		t.Fatal("expected key pair mismatch error")
	}
}

func TestNewJWTIssuerFromEnvLoadsBase64PEM(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	privateKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(privateKey),
	})
	publicKeyPKIX, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		t.Fatalf("MarshalPKIXPublicKey: %v", err)
	}
	publicKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: publicKeyPKIX,
	})

	t.Setenv(deviceAuthPrivateKeyEnv, base64.StdEncoding.EncodeToString(privateKeyPEM))
	t.Setenv(deviceAuthPublicKeyEnv, base64.StdEncoding.EncodeToString(publicKeyPEM))
	t.Setenv("DEKART_DEVICE_AUTH_TOKEN_TTL_HOURS", "24")

	issuer := NewJWTIssuerFromEnv()
	if issuer.initErr != nil {
		t.Fatalf("unexpected init error: %v", issuer.initErr)
	}
	if len(issuer.privateKeyPEM) == 0 {
		t.Fatal("expected private key bytes")
	}
	if len(issuer.publicKeyPEM) == 0 {
		t.Fatal("expected public key bytes")
	}
	if issuer.ttl != 24*time.Hour {
		t.Fatalf("unexpected ttl: %s", issuer.ttl)
	}
}
