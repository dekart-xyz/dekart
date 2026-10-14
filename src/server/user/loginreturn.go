package user

import (
	"net/http"
	"net/url"
	"os"
	"strings"
)

// allowedLoginReturnURL limits OAuth credential returns to the configured browser origins.
func allowedLoginReturnURL(target *url.URL, r *http.Request) bool {
	// Absolute HTTP URLs make the destination independent of the callback request.
	if (target.Scheme != "http" && target.Scheme != "https") || target.Host == "" || target.User != nil {
		return false
	}
	scheme := "http"
	// TLS and the reverse proxy's scheme describe the origin serving the app.
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	if target.Scheme == scheme && strings.EqualFold(target.Host, r.Host) {
		return true
	}
	for _, raw := range []string{os.Getenv("DEKART_APP_URL"), os.Getenv("DEKART_CORS_ORIGIN")} {
		allowed, err := url.Parse(strings.TrimSpace(raw))
		// CORS wildcards are unsuitable for redirects carrying credentials.
		if err == nil && !strings.Contains(allowed.Host, "*") && allowed.Scheme == target.Scheme && strings.EqualFold(allowed.Host, target.Host) {
			return true
		}
	}
	return false
}
