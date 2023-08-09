package user

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"io/ioutil"
	"net/http"
	"sync"

	"github.com/golang-jwt/jwt"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/idtoken"
)

// Claims stores user detail received from request
type Claims struct {
	Email string
}

// ContextKey type
type ContextKey string

const contextKey ContextKey = "userDetails"

// ClaimsCheckConfig config for ClaimsCheck
type ClaimsCheckConfig struct {
	Audience           string
	RequireIAP         bool
	RequireAmazonOIDC  bool
	RequireGoogleOAuth bool
	DevClaimsEmail     string
	Region             string
}

// ClaimsCheck factory to add user claims to context
type ClaimsCheck struct {
	ClaimsCheckConfig
	publicKeys *sync.Map
}

var b2i = map[bool]int{false: 0, true: 1}

// NewClaimsCheck creates Context
func NewClaimsCheck(c ClaimsCheckConfig) ClaimsCheck {
	if b2i[c.RequireIAP]+b2i[c.RequireAmazonOIDC]+b2i[c.RequireGoogleOAuth] > 1 {
		log.Fatal().Msg("DEKART_REQUIRE_IAP and DEKART_REQUIRE_AMAZON_OIDC and DEKART_REQUIRE_GOOGLE_OAUTH are mutually exclusive")
	} else if c.RequireIAP {
		log.Info().Msgf("Dekart configured to require IAP")
	} else if c.RequireAmazonOIDC {
		log.Info().Msgf("Dekart configured to require Amazon OIDC")
		if c.Region == "" {
			log.Fatal().Msgf("Dekart AWS_REGION is required for OIDC")
		}
	} else {
		log.Info().Msgf("All users can read/write all entities")
	}

	if c.DevClaimsEmail != "" {
		log.Warn().Msgf("Use DEKART_DEV_CLAIMS_EMAIL only in development environment")
	}

	return ClaimsCheck{
		c,
		&sync.Map{},
	}
}

// UnknownEmail is set as claims email when auth is not required
const UnknownEmail = "UNKNOWN_EMAIL"

// GetContext Context with user claims
func (c ClaimsCheck) GetContext(r *http.Request) context.Context {
	ctx := r.Context()
	var claims *Claims
	if c.DevClaimsEmail != "" {
		claims = &Claims{
			Email: c.DevClaimsEmail,
		}
	} else if c.RequireIAP {
		claims = c.validateJWTFromAppEngine(ctx, r.Header.Get("X-Goog-IAP-JWT-Assertion"))
	} else if c.RequireAmazonOIDC {
		claims = c.validateJWTFromAmazonOIDC(ctx, r.Header.Get("x-amzn-oidc-data"))
	} else if c.RequireGoogleOAuth {
		claims = nil
	} else {
		claims = &Claims{
			Email: UnknownEmail,
		}
	}
	userCtx := context.WithValue(ctx, contextKey, claims)
	return userCtx
}

// GetClaims from the context
func GetClaims(ctx context.Context) *Claims {
	value, isExist := ctx.Value(contextKey).(*Claims)
	if isExist {
		return value
	}

	return nil
}

func (c ClaimsCheck) getPublicKeyFromAmazon(token *jwt.Token) (interface{}, error) {
	kid := token.Header["kid"]
	var publicKey *ecdsa.PublicKey
	publicKeyValue, ok := c.publicKeys.Load(kid)
	if ok {
		publicKey = publicKeyValue.(*ecdsa.PublicKey)
	} else {
		log.Debug().Interface("kid", kid).Msg("load public key")
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
		publicKey, err = jwt.ParseECPublicKeyFromPEM(pem)
		if err != nil {
			log.Error().Err(err).Msg("error parsing public key")
			return nil, err
		} else {
			c.publicKeys.Store(kid, publicKey)
		}
	}
	return publicKey, nil
}

// validateJWTFromAmazonOIDC parses and validates token from x-amzn-oidc-data
// see https://docs.aws.amazon.com/elasticloadbalancing/latest/application/listener-authenticate-users.html
func (c ClaimsCheck) validateJWTFromAmazonOIDC(ctx context.Context, header string) *Claims {
	if header == "" {
		return nil
	}
	// claims := make(jwt.MapClaims)
	token, err := jwt.Parse(header, c.getPublicKeyFromAmazon)
	if err != nil {
		log.Error().Err(err).Send()
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

// validateJWTFromAppEngine validates a JWT found in the
// "x-goog-iap-jwt-assertion" header.
func (c ClaimsCheck) validateJWTFromAppEngine(ctx context.Context, iapJWT string) *Claims {
	payload, err := idtoken.Validate(ctx, iapJWT, c.Audience)
	if err != nil {
		log.Warn().Err(err).Msg("Error validating IAP JWT")
		return nil
	}
	if email, ok := payload.Claims["email"]; ok {
		return &Claims{
			Email: email.(string),
		}
	}
	log.Warn().Msg("No email in Claims")
	return nil
}
