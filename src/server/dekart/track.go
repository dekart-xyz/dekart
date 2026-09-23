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
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
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

	// Mirror user-facing client errors to error logs so production alerts fire.
	if clientErrorEvents[req.EventName] {
		logClientError(ctx, req.EventName, req.EventDataJson)
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

// clientErrorEvents are client track events that show an error to the user.
var clientErrorEvents = map[string]bool{"setError": true, "setStreamError": true}

const maxClientErrorMessageRunes = 2000

type clientErrorEventData struct {
	Message       string `json:"message"`
	MessageLength int    `json:"message_length"`
	Status        int    `json:"status"`
	ReportID      string `json:"report_id"`
	Seid          string `json:"seid"`
}

// logClientError writes one error log line for a user-facing client error event.
func logClientError(ctx context.Context, eventName, eventDataJSON string) {
	var data clientErrorEventData
	// Malformed payloads still alert, with an empty message.
	_ = json.Unmarshal([]byte(eventDataJSON), &data)
	// Permission denied streams are expected navigation, kept analytics-only.
	if eventName == "setStreamError" && data.Status == int(codes.PermissionDenied) {
		return
	}
	// Old client bundles do not send message_length.
	if data.MessageLength == 0 {
		data.MessageLength = utf8.RuneCountInString(data.Message)
	}
	log.Error().
		Str("client_error", eventName).
		Str("client_message", truncateRunes(data.Message, maxClientErrorMessageRunes)).
		Int("message_length", data.MessageLength).
		Int("status", data.Status).
		Str("report_id", data.ReportID).
		Str("seid", data.Seid).
		Str("workspace_id", user.WorkspaceIDForLogs(ctx)).
		Int("payload_bytes", len(eventDataJSON)).
		Msg("Client error shown to user")
}

// truncateRunes cuts s to at most n runes without splitting a UTF-8 sequence.
func truncateRunes(s string, n int) string {
	count := 0
	for i := range s {
		if count == n {
			return s[:i]
		}
		count++
	}
	return s
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
