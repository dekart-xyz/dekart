package deviceauth

import (
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/google/uuid"
)

// RequestBaseURL returns backend base URL from environment configuration.
func RequestBaseURL(_ *http.Request) string {
	if appURL := normalizeBaseURL(os.Getenv("DEKART_APP_URL")); appURL != "" {
		return appURL
	}
	return normalizeBaseURL(os.Getenv("DEKART_CORS_ORIGIN"))
}

// RequestFrontendBaseURL returns frontend base URL (CORS origin or backend URL fallback).
func RequestFrontendBaseURL(r *http.Request) string {
	if frontendURL := normalizeBaseURL(os.Getenv("DEKART_CORS_ORIGIN")); frontendURL != "" {
		return frontendURL
	}
	// why: when frontend URL is not configured, frontend is assumed to be served from backend origin.
	return RequestBaseURL(r)
}

// normalizeBaseURL validates and normalizes env URL values for base URL usage.
func normalizeBaseURL(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" || value == "null" || value == "*" || strings.Contains(value, "*") {
		return ""
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return ""
	}
	return strings.TrimRight(parsed.String(), "/")
}

// NewDeviceID returns a random device identifier.
func NewDeviceID() string {
	id, err := uuid.NewRandom()
	if err != nil {
		panic(err)
	}
	return id.String()
}
