// REVIEW: Amazon login headers take precedence over bearer credentials, and bearer credentials never contact Google in this path.
package user

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"strings"
	"time"

	"dekart/src/server/errtype"

	"github.com/golang-jwt/jwt"
	"github.com/rs/zerolog/log"
)

// amazonOIDCClaims preserves Amazon header precedence over Dekart bearer credentials.
func (c ClaimsCheck) amazonOIDCClaims(r *http.Request) *Claims {
	ctx := r.Context()
	header := strings.TrimSpace(r.Header.Get("x-amzn-oidc-data"))
	// A supplied Amazon identity must never be overridden by a bearer token.
	if header != "" {
		return c.validateJWTFromAmazonOIDC(ctx, header)
	}
	authHeader := r.Header.Get("Authorization")
	token, ok := normalizeBearerToken(authHeader)
	// Amazon mode accepts only Dekart bearer credentials without a login header.
	if !ok {
		return nil
	}
	// Snapshot credentials take precedence over device credentials.
	if claims := validateSnapshotToken(token); claims != nil {
		return claims
	}
	return c.validateDeviceAuthToken(ctx, authHeader)
}

func (c ClaimsCheck) getPublicKeyFromAmazon(token *jwt.Token) (interface{}, error) {
	kid := token.Header["kid"]
	publicKeyValue, ok := c.publicKeys.Load(kid)
	// Reuse keys already fetched for this signer.
	if ok {
		return publicKeyValue.(*ecdsa.PublicKey), nil
	}
	url := fmt.Sprintf("https://public-keys.auth.elb.%s.amazonaws.com/%s", c.Region, kid)
	resp, err := http.Get(url)
	if err != nil {
		log.Error().Err(err).Send()
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		err := fmt.Errorf("error fetch %s, status %d", url, resp.StatusCode)
		log.Error().Err(err).Send()
		return nil, err
	}
	pem, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		log.Error().Err(err).Msgf("error fetching reading response body %s", url)
		return nil, err
	}
	publicKey, err := jwt.ParseECPublicKeyFromPEM(pem)
	if err != nil {
		errtype.LogError(err, "error parsing public key")
		return nil, err
	}
	c.publicKeys.Store(kid, publicKey)
	return publicKey, nil
}

// validateJWTFromAmazonOIDC parses and validates token from x-amzn-oidc-data
// see https://docs.aws.amazon.com/elasticloadbalancing/latest/application/listener-authenticate-users.html
func (c ClaimsCheck) validateJWTFromAmazonOIDC(ctx context.Context, header string) *Claims {
	if header == "" {
		return nil
	}
	token, err := jwt.Parse(header, c.getPublicKeyFromAmazon)
	if err != nil {
		log.Error().Err(err).Send()
		return nil
	}
	// ALB puts expiry in the JWT header, outside the library's claims validation.
	if !jwt.MapClaims(token.Header).VerifyExpiresAt(time.Now().Unix(), false) {
		return nil
	}
	// Regional keys are shared across load balancers; pin the signer when configured.
	if signer := os.Getenv("DEKART_AMAZON_OIDC_ALB_ARN"); signer != "" && token.Header["signer"] != signer {
		return nil
	}
	mapClaims := token.Claims.(jwt.MapClaims)
	if email, ok := mapClaims["email"]; ok {
		return &Claims{
			Email: email.(string),
		}
	}
	log.Error().Msg("No email in Claims")
	return nil
}
