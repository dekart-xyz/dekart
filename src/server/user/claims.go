package user

import (
	"context"
	"crypto/ecdsa"
	"database/sql"
	pb "dekart/src/proto"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"

	"github.com/golang-jwt/jwt"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/idtoken"
	googleOAuth "google.golang.org/api/oauth2/v2"
	"google.golang.org/api/option"
	"google.golang.org/protobuf/proto"
)

// Claims stores user detail received from request
type Claims struct {
	Email                  string
	AccessToken            string
	SensitiveScopesGranted bool
}

// ContextKey type
type ContextKey string

const contextKey ContextKey = "userDetails"

// ClaimsCheckConfig config for ClaimsCheck
type ClaimsCheckConfig struct {
	Audience                string
	RequireIAP              bool
	RequireAmazonOIDC       bool
	RequireGoogleOAuth      bool
	RequireSnowflakeContext bool
	GoogleOAuthClientId     string
	GoogleOAuthSecret       string
	DevClaimsEmail          string
	DevRefreshToken         string
	Region                  string
}

// ClaimsCheck factory to add user claims to context
type ClaimsCheck struct {
	ClaimsCheckConfig
	publicKeys *sync.Map
	db         *sql.DB
}

var b2i = map[bool]int{false: 0, true: 1}

func validateConfig(c ClaimsCheckConfig) {
	if b2i[c.RequireIAP]+b2i[c.RequireAmazonOIDC]+b2i[c.RequireGoogleOAuth]+b2i[c.RequireSnowflakeContext] > 1 {
		log.Fatal().Msg("DEKART_REQUIRE_IAP and DEKART_REQUIRE_AMAZON_OIDC and DEKART_REQUIRE_GOOGLE_OAUTH are mutually exclusive")
	}
	switch {
	case c.RequireSnowflakeContext:
		log.Info().Msgf("Dekart configured to require Snowflake context")
	case c.RequireIAP:
		log.Info().Msgf("Dekart configured to require IAP")
	case c.RequireAmazonOIDC:
		log.Info().Msgf("Dekart configured to require Amazon OIDC")
		if c.Region == "" {
			log.Fatal().Msgf("Dekart AWS_REGION is required for OIDC")
		}
	case c.RequireGoogleOAuth:
		if c.DevClaimsEmail != "" {
			log.Warn().Msgf("DEKART_DEV_CLAIMS_EMAIL is ignored when DEKART_REQUIRE_GOOGLE_OAUTH is set")
		}
		if c.DevRefreshToken == "" {
			if c.GoogleOAuthClientId == "" {
				log.Fatal().Msgf("Dekart DEKART_GOOGLE_OAUTH_CLIENT_ID is required for Google OAuth")
			}
			if c.GoogleOAuthSecret == "" {
				log.Fatal().Msgf("Dekart DEKART_GOOGLE_OAUTH_SECRET is required for Google OAuth")
			}
		} else {
			log.Warn().Msgf("Use DEKART_DEV_REFRESH_TOKEN only in development environment")
		}
		log.Info().Msgf("Dekart configured to require Google OAuth")
	default:
		log.Info().Msgf("All users can read/write all entities")
	}

	if c.DevClaimsEmail != "" {
		log.Warn().Msgf("Use DEKART_DEV_CLAIMS_EMAIL only in development environment")
	}
}

func NewClaimsCheck(c ClaimsCheckConfig, db *sql.DB) ClaimsCheck {
	validateConfig(c)
	return ClaimsCheck{
		c,
		&sync.Map{},
		db,
	}
}

// UnknownEmail is set as claims email when auth is not required
const UnknownEmail = "UNKNOWN_EMAIL"

// validateAuthToken receives Bearer token and fetches user details
func (c ClaimsCheck) validateAuthToken(ctx context.Context, header string) *Claims {
	if header == "" {
		return nil
	}

	authHeaderParts := strings.Split(header, " ")
	if len(authHeaderParts) != 2 || strings.ToLower(authHeaderParts[0]) != "bearer" {
		log.Warn().Msg("Invalid Authorization header format")
		return nil
	}

	accessToken := authHeaderParts[1]

	tokenInfo, err := c.getTokenInfo(ctx, &oauth2.Token{
		AccessToken: accessToken,
	})

	if err != nil {
		log.Warn().Err(err).Int("accessTokenLen", len(accessToken)).Msg("Error getting token info")
		return nil
	}
	missingSensitiveScope := checkMissingScope(sensitiveScope, tokenInfo.Scope)

	return &Claims{
		Email:                  tokenInfo.Email,
		AccessToken:            accessToken,
		SensitiveScopesGranted: missingSensitiveScope == "",
	}
}

func copyClaims(sourceCtx, destCtx context.Context) context.Context {
	claims := GetClaims(sourceCtx)
	if claims == nil {
		return destCtx
	}
	return context.WithValue(destCtx, contextKey, claims)
}

// CopyUserContext from one context to another
func CopyUserContext(sourceCtx, destCtx context.Context) context.Context {
	ctx := copyClaims(sourceCtx, destCtx)
	return copyWorkspace(sourceCtx, ctx)
}

// GetTokenSource returns oauth2.TokenSource from context, returns nil if not found
func GetTokenSource(ctx context.Context) oauth2.TokenSource {
	claims := GetClaims(ctx)
	if claims == nil || claims.AccessToken == "" {
		return nil
	}
	if CheckWorkspaceCtx(ctx).IsPlayground {
		return nil
	}
	return oauth2.StaticTokenSource(&oauth2.Token{
		AccessToken: claims.AccessToken,
	})
}

// GetContext Context with user claims
func (c ClaimsCheck) GetContext(r *http.Request) context.Context {
	ctx := r.Context()
	var claims *Claims

	if c.DevClaimsEmail != "" {
		email := r.Header.Get("X-Dekart-Claim-Email")
		if email == "" {
			email = c.DevClaimsEmail
		}
		claims = &Claims{
			Email: email,
		}
	} else if c.RequireIAP {
		claims = c.validateJWTFromAppEngine(ctx, r.Header.Get("X-Goog-IAP-JWT-Assertion"))
	} else if c.RequireAmazonOIDC {
		claims = c.validateJWTFromAmazonOIDC(ctx, r.Header.Get("x-amzn-oidc-data"))
	} else if c.RequireGoogleOAuth {
		reportID := r.Header.Get("X-Dekart-Report-Id")
		loggedIn := r.Header.Get("X-Dekart-Logged-In")
		isPublicReportRequest := c.isPublicReportRequest(ctx, reportID)
		if loggedIn != "true" && isPublicReportRequest {
			claims = &Claims{
				Email: UnknownEmail,
			}
		} else {
			claims = c.validateAuthToken(ctx, r.Header.Get("Authorization"))
		}
	} else if c.RequireSnowflakeContext {
		claims = c.getSnowflakeContext(r.Header.Get("Sf-Context-Current-User"))
	} else {
		claims = &Claims{
			Email: UnknownEmail,
		}
	}
	userCtx := context.WithValue(ctx, contextKey, claims)
	return userCtx
}

func GetBigQueryAuthScopes() []string {
	scopes := []string{"https://www.googleapis.com/auth/bigquery"}
	extraScopesRaw := os.Getenv("DEKART_GCP_EXTRA_OAUTH_SCOPES")
	if extraScopesRaw != "" {
		extraScopes := strings.Split(extraScopesRaw, ",")
		scopes = append(scopes, extraScopes...)
	}
	return scopes

}

var infoScope = []string{googleOAuth.UserinfoProfileScope, googleOAuth.UserinfoEmailScope}
var sensitiveScope = append(
	[]string{googleOAuth.UserinfoProfileScope, googleOAuth.UserinfoEmailScope, "https://www.googleapis.com/auth/devstorage.read_write"},
	GetBigQueryAuthScopes()..., // includes extra configured scopes
)

func (c ClaimsCheck) isPublicReportRequest(ctx context.Context, reportID string) bool {
	if reportID == "" {
		return false
	}

	// UUID format validation
	_, err := uuid.Parse(reportID)
	if err != nil {
		return false
	}

	// check if report is public and tracking is disabled
	res, err := c.db.QueryContext(ctx, "SELECT is_public, track_viewers FROM reports WHERE id = $1", reportID)
	if err != nil {
		log.Error().Err(err).Msg("Error checking if report is public")
		return false
	}
	// Ensure rows are closed to avoid leaking connections
	defer res.Close()
	// scan result
	var isPublic bool
	var trackViewers bool
	if res.Next() {
		err = res.Scan(&isPublic, &trackViewers)
		if err != nil {
			log.Error().Err(err).Msg("Error scanning report")
			return false
		}
	}
	return isPublic && !trackViewers
}

func (c ClaimsCheck) getSnowflakeContext(user string) *Claims {
	if c.DevClaimsEmail != "" {
		return &Claims{
			Email: c.DevClaimsEmail,
		}
	}
	if user == "" {
		return &Claims{
			Email: UnknownEmail,
		}
	}
	email := fmt.Sprintf("%s@%s", user, os.Getenv("SNOWFLAKE_ACCOUNT"))
	return &Claims{
		Email: email,
	}
}

func (c ClaimsCheck) getAuthConfig(state *pb.AuthState) *oauth2.Config {
	authUrl := ""
	scope := infoScope
	if state != nil {
		authUrl = state.AuthUrl
		if state.SensitiveScope {
			scope = sensitiveScope
		}
	}
	return &oauth2.Config{
		ClientID:     c.GoogleOAuthClientId,
		ClientSecret: c.GoogleOAuthSecret,
		Scopes:       scope,
		Endpoint:     google.Endpoint,
		RedirectURL:  authUrl,
	}
}

func checkMissingScope(targetScopes []string, grantedScopes string) string {
	for _, targetScope := range targetScopes {
		if !strings.Contains(grantedScopes, targetScope) {
			return targetScope
		}
	}
	return ""
}

type Token struct {
	Token *oauth2.Token          `json:"token"`
	Info  *googleOAuth.Tokeninfo `json:"info"`
}

func (c ClaimsCheck) getTokenInfo(ctx context.Context, token *oauth2.Token) (*googleOAuth.Tokeninfo, error) {
	var auth = c.getAuthConfig(nil)
	client := auth.Client(ctx, token)
	service, err := googleOAuth.NewService(ctx, option.WithHTTPClient(client))
	if err != nil {
		log.Error().Err(err).Msg("Error creating Google OAuth service")
		return nil, err
	}
	tokenInfo, err := service.Tokeninfo().AccessToken(token.AccessToken).Do()
	return tokenInfo, err
}

func HasAllSensitiveScopes(scope string) bool {
	missingSensitiveScope := checkMissingScope(sensitiveScope, scope)
	return missingSensitiveScope == ""
}

func (c ClaimsCheck) requestToken(state *pb.AuthState, r *http.Request) *pb.RedirectState {
	code := r.URL.Query().Get("code")
	authErr := r.URL.Query().Get("error")
	redirectState := &pb.RedirectState{}
	ctx := r.Context()
	if authErr != "" {
		redirectState.Error = authErr
		if authErr == "access_denied" {
			log.Warn().Str("authErr", authErr).Msg("User denied access with Google OAuth")
		} else {
			log.Error().Str("authErr", authErr).Msg("Error authenticating")
		}
		return redirectState
	}
	var auth = c.getAuthConfig(state)
	token, err := auth.Exchange(ctx, code)
	if err != nil {
		log.Error().Err(err).Msg("Error exchanging code for token")
		redirectState.Error = "Error exchanging code for token"
		return redirectState
	}
	tokenInfo, err := c.getTokenInfo(ctx, token)
	if err != nil {
		log.Error().Err(err).Msg("Error getting token info")
		redirectState.Error = "Error getting token info"
		return redirectState
	}

	// check if required scopes are granted by the user
	missingScope := checkMissingScope(auth.Scopes, tokenInfo.Scope)
	if missingScope != "" {
		log.Warn().Str("missingScope", missingScope).Msg("Scope missing")
		redirectState.Error = fmt.Sprintf("Scope %s missing", missingScope)
		return redirectState
	}

	// update user sensitive scope requested to not show the scope onboarding again
	missingSensitiveScope := checkMissingScope(sensitiveScope, tokenInfo.Scope)
	if missingSensitiveScope == "" { // if all sensitive scopes are granted
		_, err = c.db.ExecContext(
			ctx,
			"INSERT INTO users (email, sensitive_scope) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET sensitive_scope = $2 , updated_at = CURRENT_TIMESTAMP",
			tokenInfo.Email,
			tokenInfo.Scope,
		)
		if err != nil {
			log.Error().Err(err).Msg("Error updating user sensitive scope")
			redirectState.Error = "Error updating user sensitive scope"
			return redirectState
		}
	} else {
		// create or update user, do not update sensitive scope
		_, err = c.db.ExecContext(
			ctx,
			"INSERT INTO users (email, sensitive_scope) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET updated_at = CURRENT_TIMESTAMP",
			tokenInfo.Email,
			tokenInfo.Scope,
		)
		if err != nil {
			log.Error().Err(err).Msg("Error updating user")
			redirectState.Error = "Error updating user"
			return redirectState
		}
	}

	tokenBin, err := json.Marshal(*token)
	if err != nil {
		log.Fatal().Err(err).Msg("Error marshalling token")
	}
	redirectState.TokenJson = string(tokenBin)
	redirectState.SensitiveScopesGranted = missingSensitiveScope == ""
	return redirectState
}

const tokenRevokeURL = "https://oauth2.googleapis.com/revoke"

// requestDevToken returns a token from DEKART_DEV_REFRESH_TOKEN
func (c ClaimsCheck) requestDevToken(state *pb.AuthState, r *http.Request) *pb.RedirectState {
	redirectState := &pb.RedirectState{}
	ctx := r.Context()
	auth := c.getAuthConfig(state)

	// Create a token source
	tokenSource := auth.TokenSource(ctx, &oauth2.Token{
		RefreshToken: c.DevRefreshToken,
	})

	// Get a new token
	token, err := tokenSource.Token()
	if err != nil {
		log.Error().Err(err).Msg("Error exchanging code for token")
		redirectState.Error = "Error exchanging code for token"
		return redirectState
	}

	tokenInfo, err := c.getTokenInfo(ctx, token)
	if err != nil {
		log.Error().Err(err).Msg("Error getting token info")
		redirectState.Error = "Error getting token info"
		return redirectState
	}

	// check if required scopes are granted by the user
	missingScope := checkMissingScope(auth.Scopes, tokenInfo.Scope)
	if missingScope != "" {
		log.Warn().Str("missingScope", missingScope).Msg("Scope missing")
		redirectState.Error = fmt.Sprintf("Scope %s missing", missingScope)
		return redirectState
	}

	// update user sensitive scope requested to not show the scope onboarding again
	missingSensitiveScope := checkMissingScope(sensitiveScope, tokenInfo.Scope)

	tokenBin, err := json.Marshal(*token)
	if err != nil {
		log.Fatal().Err(err).Msg("Error marshalling token")
	}
	redirectState.TokenJson = string(tokenBin)
	redirectState.SensitiveScopesGranted = missingSensitiveScope == ""
	return redirectState
}

// Authenticate redirects to Google OAuth
func (c ClaimsCheck) Authenticate(w http.ResponseWriter, r *http.Request) {
	stateBase64 := r.URL.Query().Get("state")
	stateBin, err := base64.StdEncoding.DecodeString(stateBase64)
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

	if c.DevRefreshToken != "" && state.Action == pb.AuthState_ACTION_REQUEST_CODE {
		//skip request code from google
		state.Action = pb.AuthState_ACTION_REQUEST_TOKEN
		log.Info().Msg("Skip request code from google, use dev token")
	}

	switch state.Action {
	case pb.AuthState_ACTION_REQUEST_CODE: // request code from google
		state.Action = pb.AuthState_ACTION_REQUEST_TOKEN
		stateBin, err = proto.Marshal(&state)
		if err != nil {
			log.Fatal().Err(err).Msg("Error marshalling state")
		}
		stateBase64 = base64.StdEncoding.EncodeToString(stateBin)
		var auth = c.getAuthConfig(&state)
		var url string
		if state.GetSwitchAccount() {
			url = auth.AuthCodeURL(stateBase64, oauth2.SetAuthURLParam("prompt", "select_account"))
		} else if state.LoginHint != "" {
			url = auth.AuthCodeURL(stateBase64, oauth2.SetAuthURLParam("login_hint", state.LoginHint))
		} else {
			url = auth.AuthCodeURL(stateBase64)
		}
		http.Redirect(w, r, url, http.StatusFound)
	case pb.AuthState_ACTION_REQUEST_TOKEN: // exchange code for token and redirect to ui
		var redirectState *pb.RedirectState
		if c.DevRefreshToken != "" {
			redirectState = c.requestDevToken(&state, r)
		} else {
			redirectState = c.requestToken(&state, r)
		}
		redirectStateBin, err := proto.Marshal(redirectState)
		if err != nil {
			log.Fatal().Err(err).Msg("Error marshalling token")
		}
		redirectStateBase64 := base64.StdEncoding.EncodeToString(redirectStateBin)
		query := uiURL.Query()
		query.Set("redirect_state", redirectStateBase64)
		uiURL.RawQuery = query.Encode()
		http.Redirect(w, r, uiURL.String(), http.StatusFound)
		return
	case pb.AuthState_ACTION_REVOKE:
		response, err := http.PostForm(tokenRevokeURL, url.Values{"token": {state.AccessTokenToRevoke}})
		if err != nil {
			log.Error().Err(err).Msg("Error revoking token")
			http.Error(w, "Error revoking token", http.StatusBadRequest)
			return
		}
		defer response.Body.Close()
		http.Redirect(w, r, uiURL.String(), http.StatusFound)
		return
	default:
		log.Error().Msgf("Unknown action: %v", state.Action)
		http.Error(w, "Unknown action", http.StatusBadRequest)
	}
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
