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

// ClaimsCheck factory to add user claims to context
type ClaimsCheck struct {
	audience          string
	requireIAP        bool
	requireAmazonOIDC bool
	devClaimsEmail    string
	region            string
	publicKeys        *sync.Map
}

// NewClaimsCheck creates Context
func NewClaimsCheck(audience string, requireIAP bool, requireAmazonOIDC bool, region string, devClaimsEmail string) ClaimsCheck {
	if requireIAP && requireAmazonOIDC {
		log.Fatal().Msg("DEKART_REQUIRE_IAP and DEKART_REQUIRE_AMAZON_OIDC are mutually exclusive")
	} else if requireIAP {
		log.Info().Msgf("Dekart configured to require IAP")
	} else if requireAmazonOIDC {
		log.Info().Msgf("Dekart configured to require Amazon OIDC")
		if region == "" {
			log.Fatal().Msgf("Dekart AWS_REGION is required for OIDC")
		}
	} else {
		log.Info().Msgf("All users can read/write all entities")
	}

	if devClaimsEmail != "" {
		log.Warn().Msgf("Use DEKART_DEV_CLAIMS_EMAIL only in development environment")
	}

	return ClaimsCheck{
		audience,
		requireIAP,
		requireAmazonOIDC,
		devClaimsEmail,
		region,
		&sync.Map{},
	}
}

// UnknownEmail is set as claims email when auth is not required
const UnknownEmail = "UNKNOWN_EMAIL"

// GetContext Context with user claims
func (c ClaimsCheck) GetContext(r *http.Request) context.Context {
	ctx := r.Context()
	var claims *Claims
	if c.devClaimsEmail != "" {
		claims = &Claims{
			Email: c.devClaimsEmail,
		}
	} else if c.requireIAP {
		claims = c.validateJWTFromAppEngine(ctx, r.Header.Get("X-Goog-IAP-JWT-Assertion"))
	} else if c.requireAmazonOIDC {
		claims = c.validateJWTFromAmazonOIDC(ctx, r.Header.Get("x-amzn-oidc-data"))
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
		url := fmt.Sprintf("https://public-keys.auth.elb.%s.amazonaws.com/%s", c.region, kid)
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
	payload, err := idtoken.Validate(ctx, iapJWT, c.audience)
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
