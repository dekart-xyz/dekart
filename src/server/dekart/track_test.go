package dekart

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"dekart/src/proto"
	"dekart/src/server/user"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/stretchr/testify/require"
)

// Tracking records the selected workspace, including the default workspace, while onboarding has none.
func TestTrackEventStoresWorkspaceID(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "1")
	db, err := sql.Open("sqlite3", ":memory:")
	require.NoError(t, err)
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	files, err := filepath.Glob("../../../sqlite/migrations/*.up.sql")
	require.NoError(t, err)
	require.NotEmpty(t, files)
	for _, file := range files {
		execMigration(t, db, filepath.Join("sqlite/migrations", filepath.Base(file)))
	}
	server := Server{db: db}
	for _, tc := range []struct {
		name string
		id   string
	}{
		{name: "selected workspace", id: "8b532020-1838-4d13-bbea-54f8b1022ea5"},
		{name: "default workspace", id: user.GetDefaultWorkspaceID()},
		{name: "no workspace"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: "user@example.com"})
			ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{ID: tc.id})
			_, err := server.TrackEvent(ctx, &proto.TrackEventRequest{
				EventName: tc.name, EventDataJson: `{"source":"test"}`,
			})
			require.NoError(t, err)
			var workspaceID sql.NullString
			var email, payload string
			require.NoError(t, db.QueryRow(`SELECT workspace_id, email, event_data_json
				FROM track_events WHERE event_name = $1`, tc.name).Scan(&workspaceID, &email, &payload))
			require.Equal(t, sql.NullString{String: tc.id, Valid: tc.id != ""}, workspaceID)
			require.Equal(t, "user@example.com", email)
			require.JSONEq(t, `{"source":"test"}`, payload)
		})
	}
}

func TestNormalizeTelemetryID(t *testing.T) {
	tests := []struct {
		name         string
		value        string
		want         string
		wantExcluded bool
	}{
		{
			name:  "normalizes valid uuid4",
			value: "8B532020-1838-4D13-BBEA-54F8B1022EA5",
			want:  "8b532020-1838-4d13-bbea-54f8b1022ea5",
		},
		{
			name:  "discards malformed uuid",
			value: "not-a-uuid",
		},
		{
			name:  "discards non-v4 uuid",
			value: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
		},
		{
			name:         "excludes reserved ci uuid",
			value:        CITelemetryID,
			wantExcluded: true,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, excluded := normalizeTelemetryID(tc.value)
			if got != tc.want || excluded != tc.wantExcluded {
				t.Fatalf("normalizeTelemetryID(%q) = (%q, %t), want (%q, %t)", tc.value, got, excluded, tc.want, tc.wantExcluded)
			}
		})
	}
}

func TestLogClientError(t *testing.T) {
	tests := []struct {
		name      string
		eventName string
		eventData string
		want      map[string]any // nil means no log line
	}{
		{
			name:      "logs setError fields with truncated message",
			eventName: "setError",
			eventData: `{"message":"` + strings.Repeat("é", 2500) + `","message_length":2500,"report_id":"report-1","seid":"abc"}`,
			want:      map[string]any{"level": "error", "client_error": "setError", "client_message": strings.Repeat("é", 2000), "message_length": 2500.0, "report_id": "report-1", "seid": "abc", "workspace_id": "workspace-1"},
		},
		{
			name:      "logs setStreamError status",
			eventName: "setStreamError",
			eventData: `{"status":14,"message":"The server is currently unavailable."}`,
			want:      map[string]any{"client_error": "setStreamError", "status": 14.0},
		},
		{
			name:      "skips permission denied stream error",
			eventName: "setStreamError",
			eventData: `{"status":7,"message":"denied"}`,
		},
		{
			name:      "falls back to message rune length for old clients",
			eventName: "setError",
			eventData: `{"message":"héllo"}`,
			want:      map[string]any{"message_length": 5.0},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var logOutput bytes.Buffer
			originalLogger := log.Logger
			log.Logger = zerolog.New(&logOutput)
			t.Cleanup(func() { log.Logger = originalLogger })
			ctx := user.SetWorkspaceCtx(context.Background(), user.WorkspaceInfo{ID: "workspace-1"})

			logClientError(ctx, tc.eventName, tc.eventData)

			if tc.want == nil {
				require.Empty(t, logOutput.String())
				return
			}
			var entry map[string]any
			require.NoError(t, json.Unmarshal(logOutput.Bytes(), &entry))
			for key, value := range tc.want {
				require.Equal(t, value, entry[key], key)
			}
		})
	}
}
