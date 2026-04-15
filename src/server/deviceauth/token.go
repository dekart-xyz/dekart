package deviceauth

import (
	"crypto/rand"
	"crypto/rsa"
	"dekart/src/server/jwtkeys"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt"
)

const (
	deviceAuthPrivateKeyEnv = "DEKART_DEVICE_AUTH_PRIVATE_KEY"
	deviceAuthPublicKeyEnv  = "DEKART_DEVICE_AUTH_PUBLIC_KEY"
	defaultIssuer           = "dekart.xyz"
	defaultAudience         = "dekart-device-auth"
	defaultTokenTTL         = 30 * 24 * time.Hour
)

// JWTIssuer signs device auth JWT tokens used by external tools.
type JWTIssuer struct {
	privateKeyPEM []byte
	publicKeyPEM  []byte
	ttl           time.Duration
	initErr       error
}

// NewJWTIssuerFromEnv creates issuer with runtime-configurable base64-encoded key material and TTL.
func NewJWTIssuerFromEnv() *JWTIssuer {
	privateKeyPEM, err := decodeRequiredBase64PEM(deviceAuthPrivateKeyEnv)
	if err != nil {
		return &JWTIssuer{ttl: readTokenTTL(), initErr: err}
	}
	publicKeyPEM, err := decodeRequiredBase64PEM(deviceAuthPublicKeyEnv)
	if err != nil {
		return &JWTIssuer{ttl: readTokenTTL(), initErr: err}
	}

	return &JWTIssuer{
		privateKeyPEM: privateKeyPEM,
		publicKeyPEM:  publicKeyPEM,
		ttl:           readTokenTTL(),
	}
}

// Issue creates a signed JWT with device auth audience and workspace-scoped claims.
func (i *JWTIssuer) Issue(email string, workspaceID string) (string, time.Time, error) {
	if i.initErr != nil {
		return "", time.Time{}, i.initErr
	}
	if email == "" {
		return "", time.Time{}, errors.New("email is required")
	}
	if workspaceID == "" {
		return "", time.Time{}, errors.New("workspace id is required")
	}
	privateKey, err := jwtkeys.ParseRSAPrivateKeyFromPEM(i.privateKeyPEM)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("parse private key: %w", err)
	}
	if err := validateIssuerKeyPair(privateKey, i.publicKeyPEM); err != nil {
		return "", time.Time{}, err
	}

	now := time.Now().UTC()
	expiresAt := now.Add(i.ttl)
	jti, err := randomTokenID()
	if err != nil {
		return "", time.Time{}, fmt.Errorf("generate jti: %w", err)
	}

	claims := jwt.MapClaims{
		"iss":          defaultIssuer,
		"aud":          defaultAudience,
		"email":        email,
		"workspace_id": workspaceID,
		"iat":          now.Unix(),
		"exp":          expiresAt.Unix(),
		"jti":          jti,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	signed, err := token.SignedString(privateKey)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign token: %w", err)
	}
	return signed, expiresAt, nil
}

// decodeRequiredBase64PEM reads required base64-encoded PEM value from env.
func decodeRequiredBase64PEM(envName string) ([]byte, error) {
	value := strings.TrimSpace(os.Getenv(envName))
	if value == "" {
		return nil, fmt.Errorf("%s is required", envName)
	}
	value = strings.ReplaceAll(value, "\n", "")
	value = strings.ReplaceAll(value, "\r", "")
	value = strings.ReplaceAll(value, " ", "")
	decoded, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return nil, fmt.Errorf("invalid base64 in %s: %w", envName, err)
	}
	return decoded, nil
}

// readTokenTTL reads optional token TTL env var and returns safe default when unset/invalid.
func readTokenTTL() time.Duration {
	raw := os.Getenv("DEKART_DEVICE_AUTH_TOKEN_TTL_HOURS")
	if raw == "" {
		return defaultTokenTTL
	}
	hours, err := strconv.Atoi(raw)
	if err != nil || hours <= 0 {
		return defaultTokenTTL
	}
	return time.Duration(hours) * time.Hour
}

// randomTokenID generates token id for replay/audit traces.
func randomTokenID() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return fmt.Sprintf("da_%x", buf), nil
}

// validateIssuerKeyPair verifies configured public key matches private signing key.
func validateIssuerKeyPair(privateKey *rsa.PrivateKey, publicKeyPEM []byte) error {
	publicKey, err := jwtkeys.ParseRSAPublicKeyFromPEM(publicKeyPEM)
	if err != nil {
		return err
	}
	if privateKey.PublicKey.N.Cmp(publicKey.N) != 0 || privateKey.PublicKey.E != publicKey.E {
		return errors.New("device auth key pair mismatch")
	}
	return nil
}
