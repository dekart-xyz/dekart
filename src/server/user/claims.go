package user

import (
	"context"
	"crypto/ecdsa"
	pb "dekart/src/proto"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
	"sync"

	"github.com/golang-jwt/jwt"
	"github.com/rs/zerolog/log"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/bigquery/v2"
	"google.golang.org/api/idtoken"
	googleOAuth "google.golang.org/api/oauth2/v2"
	"google.golang.org/protobuf/proto"
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
	Audience            string
	RequireIAP          bool
	RequireAmazonOIDC   bool
	RequireGoogleOAuth  bool
	GoogleOAuthClientId string
	GoogleOAuthSecret   string
	DevClaimsEmail      string
	Region              string
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
	} else if c.RequireGoogleOAuth {
		if c.GoogleOAuthClientId == "" {
			log.Fatal().Msgf("Dekart DEKART_GOOGLE_OAUTH_CLIENT_ID is required for Google OAuth")
		}
		if c.GoogleOAuthSecret == "" {
			log.Fatal().Msgf("Dekart DEKART_GOOGLE_OAUTH_SECRET is required for Google OAuth")
		}
	} else {
		log.Info().Msgf("All users can read/write all entities")
	}

	if c.DevClaimsEmail != "" {
		log.Warn().Msgf("Use DEKART_DEV_CLAIMS_EMAIL only in development environment")
	}

	// secretHash := sha256.Sum256([]byte(c.GoogleOAuthSecret))
	// secret := base64.StdEncoding.EncodeToString(secretHash[:])

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

// Authenticate redirects to Google OAuth
func (c ClaimsCheck) Authenticate(w http.ResponseWriter, r *http.Request) {
	stateBase64 := r.URL.Query().Get("state")
	log.Debug().Msgf("stateBase64: %s", stateBase64)
	stateBin, err := base64.StdEncoding.DecodeString(stateBase64)
	if err != nil {
		log.Error().Err(err).Msg("Error decoding state")
		http.Error(w, "Error decoding state", http.StatusBadRequest)
		return
	}

	if err != nil {
		log.Error().Err(err).Msg("Error decoding state")
		http.Error(w, "Error decoding state", http.StatusBadRequest)
		return
	}
	var state pb.AuthState
	err = proto.Unmarshal(stateBin, &state)
	if err != nil {
		log.Error().Err(err).Msg("Error unmarshalling state")
		http.Error(w, "Error unmarshalling state", http.StatusBadRequest)
		return
	}
	uiURL, err := url.Parse(state.UiUrl)
	if err != nil {
		log.Error().Err(err).Msg("Error parsing ui url")
		http.Error(w, "Error parsing ui url", http.StatusBadRequest)
		return
	}

	log.Debug().Msgf("state action: %s", state.Action)
	switch state.Action {
	case pb.AuthState_ACTION_REQUEST_CODE:
		state.Action = pb.AuthState_ACTION_REQUEST_TOKEN
		stateBin, err = proto.Marshal(&state)
		if err != nil {
			log.Error().Err(err).Msg("Error marshalling state")
			//TODO: return error to client
			http.Error(w, "Error marshalling state", http.StatusInternalServerError)
			return
		}
		stateBase64 = base64.StdEncoding.EncodeToString(stateBin)
		var auth = &oauth2.Config{
			ClientID:     c.GoogleOAuthClientId,
			ClientSecret: c.GoogleOAuthSecret,
			Scopes:       []string{bigquery.BigqueryScope, googleOAuth.UserinfoProfileScope, googleOAuth.UserinfoEmailScope},
			Endpoint:     google.Endpoint,
			RedirectURL:  state.AuthUrl,
		}
		url := auth.AuthCodeURL(stateBase64)
		http.Redirect(w, r, url, http.StatusFound)
	case pb.AuthState_ACTION_REQUEST_TOKEN:
		//TODO: validate state checksum
		code := r.URL.Query().Get("code")
		authErr := r.URL.Query().Get("error")
		if authErr != "" {
			log.Error().Str("authErr", authErr).Msg("Error authenticating")
			http.Error(w, "Error authenticating", http.StatusForbidden)
			return
		}
		var auth = &oauth2.Config{
			ClientID:     c.GoogleOAuthClientId,
			ClientSecret: c.GoogleOAuthSecret,
			Scopes:       []string{bigquery.BigqueryScope, googleOAuth.UserinfoProfileScope, googleOAuth.UserinfoEmailScope},
			Endpoint:     google.Endpoint,
			RedirectURL:  state.AuthUrl,
		}
		token, err := auth.Exchange(r.Context(), code)
		if err != nil {
			log.Error().Err(err).Msg("Error exchanging code for token")
			http.Error(w, "Error exchanging code for token", http.StatusForbidden)
			return
		}
		tokenBin, err := json.Marshal(*token)
		if err != nil {
			log.Error().Err(err).Msg("Error marshalling token")
			http.Error(w, "Error marshalling token", http.StatusInternalServerError)
			return
		}
		// log.Debug().Msgf("token: %v", token)

		redirectState := pb.RedirectState{
			TokenJson: string(tokenBin),
		}
		redirectStateBin, err := proto.Marshal(&redirectState)
		if err != nil {
			log.Error().Err(err).Msg("Error marshalling redirect state")
			http.Error(w, "Error marshalling redirect state", http.StatusInternalServerError)
			return
		}
		log.Debug().Msgf("redirectStateBin: %v", redirectStateBin)
		redirectStateBase64 := base64.StdEncoding.EncodeToString(redirectStateBin)
		query := uiURL.Query()
		query.Set("redirect_state", redirectStateBase64)
		uiURL.RawQuery = query.Encode()
		log.Debug().Msgf("redirecting to: %s", uiURL.String())
		http.Redirect(w, r, uiURL.String(), http.StatusFound)
		return
	default:
		log.Error().Msgf("Unknown action: %v", state.Action)
		http.Error(w, "Unknown action", http.StatusBadRequest)
	}
	// AuthState.Unmarshal(stateBin)
	// // oauth_error := r.URL.Query().Get("error")
	// oauth_code := r.URL.Query().Get("code")
	// if redirectUrl != "" {
	// 	var auth = &oauth2.Config{
	// 		ClientID:     c.GoogleOAuthClientId,
	// 		ClientSecret: c.GoogleOAuthSecret,
	// 		Scopes:       []string{bigquery.BigqueryScope, googleOAuth.UserinfoProfileScope, googleOAuth.UserinfoEmailScope},
	// 		Endpoint:     google.Endpoint,
	// 		RedirectURL:  r.URL.Query().Get("redirect_url"),
	// 	}
	// 	url := auth.AuthCodeURL("state", oauth2.AccessTypeOffline)
	// 	log.Debug().Msgf("Redirecting to %s", url)
	// 	http.Redirect(w, r, url, http.StatusFound)
	// }
	// if oauth_code != "" {
	// 	log.Debug().Msgf("code: %s", oauth_code)
	// 	// close request
	// 	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	// 	w.WriteHeader(http.StatusOK)
	// 	w.Write([]byte("<html><body>Authenticated</body></html>"))

	// 	var auth = &oauth2.Config{
	// 		ClientID:     c.GoogleOAuthClientId,
	// 		ClientSecret: c.GoogleOAuthSecret,
	// 		Scopes:       []string{bigquery.BigqueryScope, googleOAuth.UserinfoProfileScope, googleOAuth.UserinfoEmailScope},
	// 		Endpoint:     google.Endpoint,
	// 		RedirectURL:  redirectUrl,
	// 	}
	// 	token, err := auth.Exchange(r.Context(), oauth_code)
	// 	if err != nil {
	// 		log.Error().Err(err).Msg("Error exchanging code for token")
	// 		http.Error(w, "Error exchanging code for token", http.StatusInternalServerError)
	// 		return
	// 	}
	// 	log.Debug().Interface("token", token).Msg("token")
	// 	// client := auth.Client(r.Context(), token)
	// 	// svc, err := googleOAuth.New(client)
	// 	// if err != nil {
	// 	// 	log.Error().Err(err).Msg("Error creating oauth2 service")
	// 	// 	http.Error(w, "Error creating oauth2 service", http.StatusInternalServerError)
	// 	// 	return
	// 	// }
	// 	// userinfo, err := svc.Userinfo.Get().Do()
	// 	// if err != nil {
	// 	// 	log.Error().Err(err).Msg("Error getting userinfo")
	// 	// 	http.Error(w, "Error getting userinfo", http.StatusInternalServerError)
	// 	// 	return
	// 	// }
	// 	// log.Debug().Interface("userinfo", userinfo).Msg("userinfo")
	// 	// http.Redirect(w, r, redirectUrl, http.StatusFound)
	// }
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
