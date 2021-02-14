package user

import (
	"context"
	"net/http"

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
	audience       string
	requireIAP     bool
	devClaimsEmail string
}

// NewClaimsCheck creates Context
func NewClaimsCheck(audience string, requireIAP bool, devClaimsEmail string) ClaimsCheck {
	if !requireIAP {
		log.Info().Msgf("All users can read/write all entities")
	} else {
		log.Info().Msgf("Dekart configured to require IAP")
		if devClaimsEmail != "" {
			log.Warn().Msgf("Use DEKART_DEV_CLAIMS_EMAIL only in development environment")
		}
	}
	return ClaimsCheck{
		audience,
		requireIAP,
		devClaimsEmail,
	}
}

// UnknownEmail is set as claims email when auth is not required
const UnknownEmail = "UNKNOWN_EMAIL"

// GetContext Context with user claims
func (c ClaimsCheck) GetContext(r *http.Request) context.Context {
	ctx := r.Context()
	var claims *Claims
	if c.requireIAP {
		if c.devClaimsEmail != "" {
			claims = &Claims{
				Email: c.devClaimsEmail,
			}
		} else {
			claims = c.validateJWTFromAppEngine(ctx, r.Header.Get("X-Goog-IAP-JWT-Assertion"))
		}
	} else {
		claims = &Claims{
			Email: UnknownEmail,
		}
	}
	if claims == nil {
		log.Warn().Msgf("Unauthorized request")
	}
	userCtx := context.WithValue(ctx, contextKey, claims)
	return userCtx
}

//GetClaims from the context
func GetClaims(ctx context.Context) *Claims {
	return ctx.Value(contextKey).(*Claims)
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
