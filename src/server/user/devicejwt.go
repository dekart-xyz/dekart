package user

import (
	"context"
	"dekart/src/server/jwtkeys"
	"encoding/base64"
	"fmt"
	"os"
	"strings"

	"github.com/golang-jwt/jwt"
	"github.com/rs/zerolog/log"
)

const (
	deviceAuthPublicKeyEnv = "DEKART_DEVICE_AUTH_PUBLIC_KEY"
	deviceAuthIssuer       = "dekart.xyz"
	deviceAuthAudience     = "dekart-device-auth"
)

// validateGoogleOrDeviceAuthToken deterministically routes bearer tokens to device or Google validation.
func (c ClaimsCheck) validateGoogleOrDeviceAuthToken(ctx context.Context, header string) (*Claims, string) {
	tokenString, ok := normalizeBearerToken(header)
	if !ok {
		return nil, ""
	}
	if shouldValidateAsDeviceToken(tokenString) {
		// why: device-shaped JWT must never fallback to Google auth validation.
		return c.validateDeviceAuthToken(ctx, "Bearer "+tokenString)
	}
	return c.validateAuthToken(ctx, header), ""
}

// validateDeviceAuthToken validates signed workspace-scoped device token and returns claims when active.
func (c ClaimsCheck) validateDeviceAuthToken(ctx context.Context, header string) (*Claims, string) {
	_ = ctx
	tokenString, ok := normalizeBearerToken(header)
	if !ok || !looksLikeJWT(tokenString) {
		return nil, ""
	}
	publicKey, err := readDeviceAuthPublicKey()
	if err != nil {
		return nil, ""
	}

	parsedToken, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if token.Method.Alg() != jwt.SigningMethodRS256.Alg() {
			return nil, fmt.Errorf("invalid signing method: %s", token.Method.Alg())
		}
		return publicKey, nil
	})
	if err != nil || !parsedToken.Valid {
		log.Warn().Err(err).Msg("Device auth token verification failed")
		return nil, ""
	}

	claimsMap, ok := parsedToken.Claims.(jwt.MapClaims)
	if !ok {
		return nil, ""
	}
	if !claimsMap.VerifyIssuer(deviceAuthIssuer, true) || !claimsMap.VerifyAudience(deviceAuthAudience, true) {
		return nil, ""
	}

	email, _ := claimsMap["email"].(string)
	workspaceID, _ := claimsMap["workspace_id"].(string)
	if email == "" || workspaceID == "" {
		return nil, ""
	}

	return &Claims{
		Email: email,
	}, workspaceID
}

// readDeviceAuthPublicKey parses base64-encoded PEM public key from env.
func readDeviceAuthPublicKey() (interface{}, error) {
	raw := strings.TrimSpace(os.Getenv(deviceAuthPublicKeyEnv))
	if raw == "" {
		return nil, fmt.Errorf("device auth public key is empty")
	}
	raw = strings.ReplaceAll(raw, "\n", "")
	raw = strings.ReplaceAll(raw, "\r", "")
	raw = strings.ReplaceAll(raw, " ", "")
	pemBytes, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return nil, err
	}
	return jwtkeys.ParseRSAPublicKeyFromPEM(pemBytes)
}

// looksLikeJWT checks compact JWT token shape and avoids unnecessary device-token parsing work.
func looksLikeJWT(token string) bool {
	return strings.Count(token, ".") == 2
}

// shouldValidateAsDeviceToken checks JWT claims shape and routes token to device auth verifier.
func shouldValidateAsDeviceToken(token string) bool {
	if !looksLikeJWT(token) {
		return false
	}
	claims := jwt.MapClaims{}
	parser := jwt.Parser{}
	if _, _, err := parser.ParseUnverified(token, claims); err != nil {
		return false
	}
	issuer, _ := claims["iss"].(string)
	if issuer != deviceAuthIssuer {
		return false
	}
	return claimHasAudience(claims["aud"], deviceAuthAudience)
}
