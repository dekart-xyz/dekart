package license

// Removing or bypassing this check is a modification under AGPL and requires publishing your changed source code.
// Get a free license key at https://mailchi.mp/dekart/upgrade-to-sso

import (
	"dekart/src/server/jwtkeys"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt"
)

const issuer = "dekart.xyz"
const defaultPublicKeyPath = "keys/license-public.pem"

type TokenInfo struct {
	Email     string
	ExpiresAt *time.Time
}

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
	privateKey, err := jwtkeys.ParseRSAPrivateKeyFromPEM(privateKeyPEM)
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

// ValidateToken validates a DEKART_LICENSE_KEY token using public key from filesystem.
func ValidateToken(tokenString string) (TokenInfo, error) {
	publicKeyPEM, err := os.ReadFile(defaultPublicKeyPath)
	if err != nil {
		return TokenInfo{}, fmt.Errorf("read license public key from %s: %w", defaultPublicKeyPath, err)
	}
	return ValidateTokenWithPublicKey(tokenString, publicKeyPEM)
}

// ValidateTokenWithPublicKey validates a DEKART_LICENSE_KEY token using a provided public key.
func ValidateTokenWithPublicKey(tokenString string, publicKeyPEM []byte) (TokenInfo, error) {
	key := strings.TrimSpace(tokenString)
	if key == "" {
		return TokenInfo{}, errors.New("license key is empty")
	}

	publicKey, err := jwtkeys.ParseRSAPublicKeyFromPEM(publicKeyPEM)
	if err != nil {
		return TokenInfo{}, err
	}

	token, err := jwt.Parse(key, func(t *jwt.Token) (interface{}, error) {
		if t.Method != jwt.SigningMethodRS256 {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return publicKey, nil
	})
	if err != nil {
		return TokenInfo{}, fmt.Errorf("invalid license key: %w", err)
	}
	if !token.Valid {
		return TokenInfo{}, errors.New("invalid license key")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return TokenInfo{}, errors.New("invalid license key claims")
	}

	iss, _ := claims["iss"].(string)
	if iss != issuer {
		return TokenInfo{}, fmt.Errorf("invalid license issuer: %q", iss)
	}

	sub, _ := claims["sub"].(string)
	if strings.TrimSpace(sub) == "" {
		return TokenInfo{}, errors.New("invalid license subject (sub)")
	}

	info := TokenInfo{Email: sub}
	if expRaw, exists := claims["exp"]; exists {
		switch expValue := expRaw.(type) {
		case float64:
			expiry := time.Unix(int64(expValue), 0).UTC()
			info.ExpiresAt = &expiry
		case int64:
			expiry := time.Unix(expValue, 0).UTC()
			info.ExpiresAt = &expiry
		}
	}

	return info, nil
}
