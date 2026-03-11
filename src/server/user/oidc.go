package user

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt"
	"github.com/rs/zerolog/log"
)

const (
	defaultOIDCTokenHeader     = "X-Forwarded-Access-Token"
	defaultOIDCEmailClaim      = "email"
	defaultOIDCJWKSCacheTTLSec = 3600
)

type oidcJWTVerifier struct {
	jwksURL  string
	issuer   string
	audience string
	cacheTTL time.Duration
	client   *http.Client

	mu        sync.RWMutex
	keys      map[string]interface{}
	expiresAt time.Time
}

func newOIDCJWTVerifier(c ClaimsCheckConfig) *oidcJWTVerifier {
	return &oidcJWTVerifier{
		jwksURL:  c.OIDCJWKSURL,
		issuer:   c.OIDCIssuer,
		audience: c.OIDCAudience,
		cacheTTL: time.Duration(defaultOIDCJWKSCacheTTLSec) * time.Second,
		client:   &http.Client{Timeout: 10 * time.Second},
		keys:     map[string]interface{}{},
	}
}

func normalizeBearerToken(value string) (string, bool) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", false
	}
	parts := strings.Fields(trimmed)
	if len(parts) == 1 {
		if strings.EqualFold(parts[0], "Bearer") {
			return "", false
		}
		return parts[0], true
	}
	if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
		return parts[1], true
	}
	return "", false
}

func (c ClaimsCheck) validateJWTFromOIDCHeader(r *http.Request) *Claims {
	tokenValue := r.Header.Get(defaultOIDCTokenHeader)
	if tokenValue == "" {
		log.Warn().Str("tokenHeader", defaultOIDCTokenHeader).Msg("OIDC token header is missing")
		return nil
	}
	tokenString, ok := normalizeBearerToken(tokenValue)
	if !ok {
		log.Warn().Msg("Invalid OIDC token header format")
		return nil
	}

	token, err := jwt.Parse(tokenString, c.oidcJWT.getPublicKey)
	if err != nil {
		// Retry once when JWKS fetch did not provide the key yet (rotation/eventual consistency).
		if strings.Contains(err.Error(), "OIDC key not found for kid") || strings.Contains(err.Error(), "no valid keys in JWKS response") {
			token, err = jwt.Parse(tokenString, c.oidcJWT.getPublicKey)
		}
	}
	if err != nil {
		log.Warn().Err(err).Msg("OIDC token verification failed")
		return nil
	}
	if !token.Valid {
		log.Warn().Msg("OIDC token is invalid")
		return nil
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		log.Warn().Msg("OIDC token claims have unexpected type")
		return nil
	}
	if err := c.oidcJWT.validateClaims(claims); err != nil {
		log.Warn().Err(err).Msg("OIDC token claims validation failed")
		return nil
	}
	email, ok := claims[defaultOIDCEmailClaim].(string)
	if !ok || email == "" {
		log.Warn().Str("emailClaim", defaultOIDCEmailClaim).Msg("Expected OIDC email claim is missing")
		return nil
	}
	return &Claims{
		Email: email,
	}
}

var allowedOIDCAlgs = map[string]bool{
	"RS256": true,
	"RS384": true,
	"RS512": true,
	"ES256": true,
	"ES384": true,
	"ES512": true,
}

func (v *oidcJWTVerifier) getPublicKey(token *jwt.Token) (interface{}, error) {
	if !allowedOIDCAlgs[token.Method.Alg()] {
		return nil, fmt.Errorf("unsupported JWT alg: %s", token.Method.Alg())
	}
	kid, _ := token.Header["kid"].(string)
	if kid == "" {
		return nil, fmt.Errorf("JWT kid is missing")
	}
	now := time.Now()

	v.mu.RLock()
	key, found := v.keys[kid]
	expired := now.After(v.expiresAt)
	v.mu.RUnlock()
	if found && !expired {
		return key, nil
	}

	if err := v.refreshKeys(); err != nil {
		// Keep serving with stale key if present.
		if found {
			log.Warn().Err(err).Str("kid", kid).Msg("Using stale OIDC JWKS cache key after refresh failure")
			return key, nil
		}
		return nil, err
	}
	v.mu.RLock()
	defer v.mu.RUnlock()
	if key, ok := v.keys[kid]; ok {
		return key, nil
	}
	return nil, fmt.Errorf("OIDC key not found for kid %q", kid)
}

func (v *oidcJWTVerifier) validateClaims(claims jwt.MapClaims) error {
	if v.issuer != "" {
		iss, _ := claims["iss"].(string)
		if iss != v.issuer {
			return fmt.Errorf("issuer mismatch")
		}
	}
	if v.audience != "" {
		if !claimHasAudience(claims["aud"], v.audience) {
			return fmt.Errorf("audience mismatch")
		}
	}
	return nil
}

func claimHasAudience(audClaim interface{}, expected string) bool {
	switch aud := audClaim.(type) {
	case string:
		return aud == expected
	case []interface{}:
		for _, item := range aud {
			if value, ok := item.(string); ok && value == expected {
				return true
			}
		}
	}
	return false
}

type jwksResponse struct {
	Keys []jsonWebKey `json:"keys"`
}

type jsonWebKey struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	Alg string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
	Crv string `json:"crv"`
	X   string `json:"x"`
	Y   string `json:"y"`
}

func (v *oidcJWTVerifier) refreshKeys() error {
	req, err := http.NewRequest(http.MethodGet, v.jwksURL, nil)
	if err != nil {
		return err
	}
	resp, err := v.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to fetch JWKS: status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	var jwks jwksResponse
	if err := json.Unmarshal(body, &jwks); err != nil {
		return err
	}
	keys := make(map[string]interface{}, len(jwks.Keys))
	for _, key := range jwks.Keys {
		parsed, err := parseJWKPublicKey(key)
		if err != nil {
			log.Warn().Err(err).Str("kid", key.Kid).Msg("Skipping invalid JWK key")
			continue
		}
		keys[key.Kid] = parsed
	}
	if len(keys) == 0 {
		return fmt.Errorf("no valid keys in JWKS response")
	}

	v.mu.Lock()
	v.keys = keys
	v.expiresAt = time.Now().Add(v.cacheTTL)
	v.mu.Unlock()
	return nil
}

func parseJWKPublicKey(key jsonWebKey) (interface{}, error) {
	switch key.Kty {
	case "RSA":
		n, err := decodeBase64URLBigInt(key.N)
		if err != nil {
			return nil, err
		}
		e, err := decodeBase64URLBigInt(key.E)
		if err != nil {
			return nil, err
		}
		if !e.IsInt64() {
			return nil, fmt.Errorf("invalid RSA exponent")
		}
		return &rsa.PublicKey{
			N: n,
			E: int(e.Int64()),
		}, nil
	case "EC":
		curve, err := parseNamedCurve(key.Crv)
		if err != nil {
			return nil, err
		}
		x, err := decodeBase64URLBigInt(key.X)
		if err != nil {
			return nil, err
		}
		y, err := decodeBase64URLBigInt(key.Y)
		if err != nil {
			return nil, err
		}
		return &ecdsa.PublicKey{
			Curve: curve,
			X:     x,
			Y:     y,
		}, nil
	default:
		return nil, fmt.Errorf("unsupported JWK kty: %s", key.Kty)
	}
}

func decodeBase64URLBigInt(value string) (*big.Int, error) {
	bin, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return nil, err
	}
	n := new(big.Int).SetBytes(bin)
	return n, nil
}

func parseNamedCurve(name string) (elliptic.Curve, error) {
	switch name {
	case "P-256":
		return elliptic.P256(), nil
	case "P-384":
		return elliptic.P384(), nil
	case "P-521":
		return elliptic.P521(), nil
	default:
		return nil, fmt.Errorf("unsupported EC curve: %s", name)
	}
}
