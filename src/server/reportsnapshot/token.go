package reportsnapshot

import (
	"fmt"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
)

const defaultTTL = 5 * time.Minute

var state = newTokenState()

type tokenState struct {
	active sync.Map
}

type tokenEntry struct {
	claims    Claims
	expiresAt time.Time
}

// Claims carries short-lived snapshot authorization scope stored in memory for URL token validation.
type Claims struct {
	Email       string
	WorkspaceID string
	ReportID    string
}

// IssueToken creates opaque UUID token and stores claims in memory with default TTL.
func IssueToken(claims Claims) (string, time.Time, error) {
	expiresAt := time.Now().UTC().Add(readTokenTTL())
	token, err := uuid.NewRandom()
	if err != nil {
		return "", time.Time{}, err
	}
	state.active.Store(token.String(), tokenEntry{
		claims:    claims,
		expiresAt: expiresAt,
	})
	return token.String(), expiresAt, nil
}

// ParseAndValidateToken loads in-memory token entry and validates expiry.
func ParseAndValidateToken(token string) (Claims, error) {
	if token == "" {
		return Claims{}, fmt.Errorf("token is required")
	}
	rawEntry, ok := state.active.Load(token)
	if !ok {
		return Claims{}, fmt.Errorf("token is not active")
	}
	entry, ok := rawEntry.(tokenEntry)
	if !ok {
		state.active.Delete(token)
		return Claims{}, fmt.Errorf("invalid token entry")
	}
	if time.Now().UTC().After(entry.expiresAt) {
		state.active.Delete(token)
		return Claims{}, fmt.Errorf("token is expired")
	}
	return entry.claims, nil
}

// DeleteToken removes one token from active in-memory store.
func DeleteToken(token string) {
	state.active.Delete(token)
}

func newTokenState() *tokenState {
	return &tokenState{}
}

// readTokenTTL reads optional snapshot token TTL env var in minutes.
func readTokenTTL() time.Duration {
	raw := os.Getenv("DEKART_SNAPSHOT_TOKEN_TTL_MINUTES")
	if raw == "" {
		return defaultTTL
	}
	minutes, err := strconv.Atoi(raw)
	if err != nil || minutes <= 0 {
		return defaultTTL
	}
	return time.Duration(minutes) * time.Minute
}
