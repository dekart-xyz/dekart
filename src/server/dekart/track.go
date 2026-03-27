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

// TrackVersionCheck stores anonymous version check pings for cloud analytics.
func (s Server) TrackVersionCheck(ctx context.Context, appDomain, currentVersion, latestVersion, outcome string) {
	if os.Getenv("DEKART_CLOUD") == "" {
		return
	}

	domain := strings.TrimSpace(strings.ToLower(appDomain))
	if domain == "" {
		return
	}

	email := domain
	if len(email) > 255 {
		email = email[:255]
	}

	eventData := map[string]string{
		"app_domain":      domain,
		"current_version": strings.TrimSpace(currentVersion),
		"latest_version":  strings.TrimSpace(latestVersion),
		"outcome":         strings.TrimSpace(outcome),
	}
	eventDataJSON, err := json.Marshal(eventData)
	if err != nil {
		log.Warn().Err(err).Str("app_domain", domain).Msg("Failed to marshal version check tracking payload")
		return
	}

	_, err = s.db.ExecContext(
		ctx,
		`INSERT INTO track_events (email, event_name, event_data_json)
		VALUES ($1, $2, $3)`,
		email,
		versionCheckEventName,
		string(eventDataJSON),
	)
	if err != nil {
		errtype.LogError(err, fmt.Sprintf("Failed to store %s event", versionCheckEventName))
	}
}
