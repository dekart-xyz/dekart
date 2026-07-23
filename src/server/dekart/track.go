package dekart

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/errtype"
	"dekart/src/server/user"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// TrackEvent stores tracking event in database for Dekart Cloud when user is authorized
func (s Server) TrackEvent(ctx context.Context, req *proto.TrackEventRequest) (*proto.TrackEventResponse, error) {
	// Only work for Dekart Cloud
	if os.Getenv("DEKART_CLOUD") == "" {
		// Not cloud, just return without doing anything
		return &proto.TrackEventResponse{}, nil
	}

	// Check if user is authorized
	claims := user.GetClaims(ctx)
	if claims == nil {
		// Not authorized, just return without doing anything
		return &proto.TrackEventResponse{}, nil
	}

	if claims.Email == user.UnknownEmail {
		// Not authorized, just return without doing anything
		return &proto.TrackEventResponse{}, nil
	}

	if req.EventName == "" {
		return &proto.TrackEventResponse{}, nil
	}

	if len(req.EventName) > 255 {
		log.Error().Str("event_name", req.EventName).Msg("Event name too long")
		return &proto.TrackEventResponse{}, nil
	}

	if len(req.EventDataJson) > 10000 { // or appropriate limit
		log.Error().Str("event_name", req.EventName).Int("event_data_json", len(req.EventDataJson)).Msg("Event data too large")
		return &proto.TrackEventResponse{}, nil
	}

	// Store event in database
	_, err := s.db.ExecContext(
		ctx,
		`INSERT INTO track_events (email, event_name, event_data_json)
		VALUES ($1, $2, $3)`,
		claims.Email,
		req.EventName,
		req.EventDataJson,
	)

	if err != nil {
		errtype.LogError(err, "Failed to store track event")
		// Don't return error to client, just log it
		// We don't want tracking failures to break the UI
	}

	return &proto.TrackEventResponse{}, nil
}

const versionCheckEventName = "VersionCheck"
const cliVersionCheckEventName = "CLIVersionCheck"
const CITelemetryID = "00000000-0000-4000-8000-000000000001"

// normalizeTelemetryID returns a canonical UUIDv4 and flags CI events for exclusion.
func normalizeTelemetryID(value string) (string, bool) {
	parsed, err := uuid.Parse(strings.TrimSpace(value))
	// Malformed IDs are ignored while preserving the event's legacy dimensions.
	if err != nil {
		return "", false
	}
	normalized := parsed.String()
	// CI checks exercise transport but must never become installation events.
	if normalized == CITelemetryID {
		return "", true
	}
	// Product clients generate UUIDv4 identities; other UUID versions are discarded.
	if parsed.Version() != 4 {
		return "", false
	}
	return normalized, false
}

// trackAnonymousEvent stores one anonymous analytics event in track_events for cloud mode.
func (s Server) trackAnonymousEvent(ctx context.Context, identity, eventName string, payload map[string]string) {
	if os.Getenv("DEKART_CLOUD") == "" {
		return
	}
	if strings.TrimSpace(identity) == "" || strings.TrimSpace(eventName) == "" {
		return
	}

	email := strings.TrimSpace(identity)
	if len(email) > 255 {
		email = email[:255]
	}

	eventDataJSON, err := json.Marshal(payload)
	if err != nil {
		log.Warn().Err(err).Str("event_name", eventName).Msg("Failed to marshal anonymous tracking payload")
		return
	}

	_, err = s.db.ExecContext(
		ctx,
		`INSERT INTO track_events (email, event_name, event_data_json)
		VALUES ($1, $2, $3)`,
		email,
		eventName,
		string(eventDataJSON),
	)
	if err != nil {
		errtype.LogError(err, fmt.Sprintf("Failed to store %s event", eventName))
	}
}

// TrackVersionCheck stores anonymous version check pings for cloud analytics.
func (s Server) TrackVersionCheck(ctx context.Context, appDomain, instanceID, currentVersion, latestVersion, outcome string) {
	domain := strings.TrimSpace(strings.ToLower(appDomain))
	if domain == "" {
		return
	}
	normalizedInstanceID, excluded := normalizeTelemetryID(instanceID)
	// Reserved CI checks are excluded from ingestion, including legacy counts.
	if excluded {
		return
	}

	eventData := map[string]string{
		"app_domain":      domain,
		"current_version": strings.TrimSpace(currentVersion),
		"latest_version":  strings.TrimSpace(latestVersion),
		"outcome":         strings.TrimSpace(outcome),
	}
	// Older clients remain valid legacy events without an instance identity.
	if normalizedInstanceID != "" {
		eventData["instance_id"] = normalizedInstanceID
	}
	s.trackAnonymousEvent(ctx, domain, versionCheckEventName, eventData)
}

// TrackCLIVersionCheck stores anonymous CLI version check pings for cloud analytics.
func (s Server) TrackCLIVersionCheck(ctx context.Context, cliName, installationID, sourceIP, userAgent, outcome string) {
	name := strings.TrimSpace(strings.ToLower(cliName))
	if name == "" {
		return
	}
	normalizedInstallationID, excluded := normalizeTelemetryID(installationID)
	// Reserved CI checks are excluded from ingestion, including legacy counts.
	if excluded {
		return
	}
	if len(name) > 128 {
		name = name[:128]
	}
	ip := strings.TrimSpace(sourceIP)
	if len(ip) > 128 {
		ip = ip[:128]
	}
	ua := strings.TrimSpace(userAgent)
	if len(ua) > 512 {
		ua = ua[:512]
	}

	email := "cli:" + name
	if len(email) > 255 {
		email = email[:255]
	}

	eventData := map[string]string{
		"cli_name":   name,
		"source_ip":  ip,
		"user_agent": ua,
		"outcome":    strings.TrimSpace(outcome),
	}
	// Older clients remain valid legacy events without an installation identity.
	if normalizedInstallationID != "" {
		eventData["installation_id"] = normalizedInstallationID
	}
	s.trackAnonymousEvent(ctx, email, cliVersionCheckEventName, eventData)
}
