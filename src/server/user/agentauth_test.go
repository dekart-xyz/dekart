package user

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	pb "dekart/src/proto"
	"encoding/base64"
	"github.com/golang-jwt/jwt"
	"google.golang.org/protobuf/proto"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"testing"
	"time"
)

// TestAgentDeviceBearerModes exercises device authentication without proxy identity headers.
func TestAgentDeviceBearerModes(t *testing.T) {
	key, public := generateDeviceJWTKeyPair(t)
	t.Setenv(deviceAuthPublicKeyEnv, base64.StdEncoding.EncodeToString(public))
	token := signDeviceToken(t, key, "editor@example.com", "workspace-1")
	for name, config := range map[string]ClaimsCheckConfig{
		"google": {RequireGoogleOAuth: true}, "oidc": {RequireOIDC: true},
		"iap": {RequireIAP: true}, "alb": {RequireAmazonOIDC: true},
	} {
		t.Run(name, func(t *testing.T) {
			check := ClaimsCheck{ClaimsCheckConfig: config}
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				claims := GetClaims(check.GetContext(r))
				if claims == nil || claims.Email != "editor@example.com" || claims.WorkspaceID != "workspace-1" || claims.DeviceToken != token {
					http.Error(w, "device identity lost", 401)
				}
			}))
			defer server.Close()
			req, _ := http.NewRequest("POST", server.URL, nil)
			req.Header.Set("Authorization", "Bearer "+token)
			resp, err := server.Client().Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != 200 {
				t.Fatalf("device bearer status = %d", resp.StatusCode)
			}
		})
	}
}

// TestGoogleLoginReturnOrigin prevents credentials returning to an untrusted origin.
func TestGoogleLoginReturnOrigin(t *testing.T) {
	t.Setenv("DEKART_APP_URL", "https://dekart.example/base")
	t.Setenv("DEKART_CORS_ORIGIN", "https://chat.example")
	for _, target := range []struct {
		url     string
		allowed bool
	}{
		{"https://dekart.example/reports", true}, {"https://chat.example/chat", true},
		{"https://evil.example", false}, {"https://chat.example.evil.test", false},
		{"//chat.example/path", false}, {"javascript:alert(1)", false},
		{"https://chat.example@evil.example", false},
	} {
		t.Run(target.url, func(t *testing.T) {
			state, err := proto.Marshal(&pb.AuthState{UiUrl: target.url, AuthUrl: "https://dekart.example/api/v1/authenticate", Action: pb.AuthState_ACTION_REQUEST_TOKEN})
			if err != nil {
				t.Fatal(err)
			}
			req := httptest.NewRequest("GET", "https://dekart.example/api/v1/authenticate?error=access_denied&state="+url.QueryEscape(base64.StdEncoding.EncodeToString(state)), nil)
			recorder := httptest.NewRecorder()
			ClaimsCheck{}.Authenticate(recorder, req)
			if target.allowed {
				if recorder.Code != 302 {
					t.Fatalf("status = %d: %s", recorder.Code, recorder.Body.String())
				}
				location, _ := url.Parse(recorder.Header().Get("Location"))
				expected, _ := url.Parse(target.url)
				if location.Scheme != expected.Scheme || location.Host != expected.Host {
					t.Fatal("return origin changed")
				}
			} else if recorder.Code != 400 {
				t.Fatalf("untrusted return accepted: status %d", recorder.Code)
			}
		})
	}
}

// TestAgentOIDCBearer validates the configured IdP signature without proxy headers.
func TestAgentOIDCBearer(t *testing.T) {
	key, jwksURL, _ := startJWKSServer(t)
	check := NewClaimsCheck(ClaimsCheckConfig{RequireOIDC: true, OIDCJWKSURL: jwksURL, OIDCIssuer: "https://issuer.example", OIDCAudience: "dekart"}, nil)
	token := createOIDCToken(t, key, map[string]interface{}{"iss": "https://issuer.example", "aud": "dekart", "email": "editor@example.com", "exp": time.Now().Add(time.Hour).Unix()})
	req := httptest.NewRequest("POST", "/api/v1/agent/chat", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	claims := GetClaims(check.GetContext(req))
	if claims == nil || claims.Email != "editor@example.com" {
		t.Fatal("IdP bearer rejected")
	}
}

// TestAgentRejectsInvalidDeviceBearer prevents an invalid device token falling back to proxy identity.
func TestAgentRejectsInvalidDeviceBearer(t *testing.T) {
	_, public := generateDeviceJWTKeyPair(t)
	t.Setenv(deviceAuthPublicKeyEnv, base64.StdEncoding.EncodeToString(public))
	other, _ := generateDeviceJWTKeyPair(t)
	token := signDeviceToken(t, other, "editor@example.com", "workspace")
	check := ClaimsCheck{ClaimsCheckConfig: ClaimsCheckConfig{DevClaims: false, RequireOIDC: true}}
	req := httptest.NewRequest("POST", "/api/v1/agent/chat", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	if GetClaims(check.GetContext(req)) != nil {
		t.Fatal("invalid device signature accepted")
	}
}

// TestAgentALBRejectsUntrustedBearer keeps caller tokens outside the ALB proxy trust boundary.
func TestAgentALBRejectsUntrustedBearer(t *testing.T) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	token := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims{"email": "editor@example.com", "exp": time.Now().Add(time.Hour).Unix()})
	token.Header["kid"] = "agent-alb"
	signed, err := token.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	check := ClaimsCheck{ClaimsCheckConfig: ClaimsCheckConfig{RequireAmazonOIDC: true}, publicKeys: &sync.Map{}}
	check.publicKeys.Store("agent-alb", &key.PublicKey)
	req := httptest.NewRequest("POST", "/api/v1/agent/chat", nil)
	req.Header.Set("Authorization", "Bearer "+signed)
	claims := GetClaims(check.GetContext(req))
	if claims != nil {
		t.Fatal("untrusted ALB bearer accepted without proxy identity")
	}
}

type agentIAPTransport struct {
	url       string
	transport http.RoundTripper
}

// RoundTrip serves the real validator's signing-key request from the local JWKS server.
func (transport agentIAPTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	request := r.Clone(r.Context())
	request.URL, _ = url.Parse(transport.url)
	return transport.transport.RoundTrip(request)
}

// TestAgentIAPBearer verifies the Google-signed bearer with local signing keys.
func TestAgentIAPBearer(t *testing.T) {
	key, jwksURL, _ := startJWKSServer(t)
	original := http.DefaultClient.Transport
	transport := original
	if transport == nil {
		transport = http.DefaultTransport
	}
	http.DefaultClient.Transport = agentIAPTransport{url: jwksURL, transport: transport}
	t.Cleanup(func() { http.DefaultClient.Transport = original })
	token := createOIDCToken(t, key, map[string]interface{}{"iss": "https://cloud.google.com/iap", "aud": "agent-iap", "email": "editor@example.com", "exp": time.Now().Add(time.Hour).Unix()})
	check := ClaimsCheck{ClaimsCheckConfig: ClaimsCheckConfig{RequireIAP: true, Audience: "agent-iap"}}
	req := httptest.NewRequest("POST", "/api/v1/agent/chat", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	claims := GetClaims(check.GetContext(req))
	if claims == nil || claims.Email != "editor@example.com" {
		t.Fatal("IAP bearer rejected")
	}
}

// TestGoogleLoginSameOrigin keeps existing deployments working without explicit URL settings.
func TestGoogleLoginSameOrigin(t *testing.T) {
	for _, cors := range []string{"", "*"} {
		t.Run(cors, func(t *testing.T) {
			t.Setenv("DEKART_APP_URL", "")
			t.Setenv("DEKART_CORS_ORIGIN", cors)
			for _, origin := range []string{"https://dekart.example", "https://evil.example"} {
				state, _ := proto.Marshal(&pb.AuthState{UiUrl: origin + "/reports", Action: pb.AuthState_ACTION_REQUEST_TOKEN})
				req := httptest.NewRequest("GET", "https://dekart.example/api/v1/authenticate?error=access_denied&state="+url.QueryEscape(base64.StdEncoding.EncodeToString(state)), nil)
				recorder := httptest.NewRecorder()
				ClaimsCheck{}.Authenticate(recorder, req)
				expected := 400
				if origin == "https://dekart.example" {
					expected = 302
				}
				if recorder.Code != expected {
					t.Fatalf("origin=%s status=%d", origin, recorder.Code)
				}
			}
		})
	}
}
