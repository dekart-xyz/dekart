package notifications

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"

	"github.com/rs/zerolog/log"
)

// WorkspaceDeleteCleanupFailed lists failed object deletes and connections kept for surviving workspaces.
type WorkspaceDeleteCleanupFailed struct {
	WorkspaceID         string
	WorkspaceName       string
	RecipientEmail      string
	ObjectURLs          []string
	RetainedConnections []string // Connection names and IDs only; never credential values.
}

func (noopService) SendWorkspaceDeleteCleanupFailed(WorkspaceDeleteCleanupFailed) {}

// SendWorkspaceDeleteCleanupFailed reports incomplete storage cleanup and connections retained for other workspaces.
func (s *resendService) SendWorkspaceDeleteCleanupFailed(n WorkspaceDeleteCleanupFailed) {
	var htmlBody bytes.Buffer
	if err := htmlWorkspaceDeleteCleanupFailedTemplate.Execute(&htmlBody, n); err != nil {
		log.Error().Err(err).Msg("Could not render workspace cleanup html template")
		return
	}
	var textBody bytes.Buffer
	if err := textWorkspaceDeleteCleanupFailedTemplate.Execute(&textBody, n); err != nil {
		log.Error().Err(err).Msg("Could not render workspace cleanup text template")
		return
	}
	payload := resendEmailPayload{
		From:    s.fromEmail,
		To:      []string{n.RecipientEmail},
		Subject: "Workspace deletion: cleanup report",
		Text:    textBody.String(),
		Html:    htmlBody.String(),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		log.Error().Err(err).Msg("Could not encode workspace cleanup notification")
		return
	}
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(body))
	if err != nil {
		log.Error().Err(err).Msg("Could not create workspace cleanup notification")
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		log.Error().Err(err).Msg("Could not send workspace cleanup notification")
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		log.Error().Int("status", resp.StatusCode).Msg("Resend rejected workspace cleanup notification")
	}
}
