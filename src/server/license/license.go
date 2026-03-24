package license

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt"
)

const issuer = "dekart.xyz"

// IssueRequest contains data required for generating a license token.
// When ExpiresAt is nil, the token is perpetual.
type IssueRequest struct {
	Email     string
	IssuedAt  time.Time
	ExpiresAt *time.Time
}

func (r IssueRequest) validate() error {
	if r.Email == "" {
		return errors.New("email is required")
	}
	if r.IssuedAt.IsZero() {
		return errors.New("issued at is required")
	}
	if r.ExpiresAt != nil && r.ExpiresAt.Unix() <= r.IssuedAt.Unix() {
		return errors.New("expires at must be in the future")
	}
	return nil
}

// IssueToken signs a JWT license token with RS256.
// Token claims are intentionally minimal for now:
// - iss: dekart.xyz
// - sub: email
// - iat: issued-at unix timestamp
// - exp: optional, when ExpiresAt is set
func IssueToken(privateKeyPEM []byte, request IssueRequest) (string, error) {
	if err := request.validate(); err != nil {
		return "", err
	}
	privateKey, err := ParseRSAPrivateKeyFromPEM(privateKeyPEM)
	if err != nil {
		return "", err
	}

	claims := jwt.MapClaims{
		"iss": issuer,
		"sub": request.Email,
		"iat": request.IssuedAt.Unix(),
	}
	if request.ExpiresAt != nil {
		claims["exp"] = request.ExpiresAt.Unix()
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return token.SignedString(privateKey)
}

// ParseRSAPrivateKeyFromPEM parses RSA private keys in PKCS#1 or PKCS#8 format.
func ParseRSAPrivateKeyFromPEM(data []byte) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, errors.New("invalid PEM block")
	}

	if privateKey, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return privateKey, nil
	}

	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse private key: %w", err)
	}
	privateKey, ok := key.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("private key is not RSA")
	}
	return privateKey, nil
}
