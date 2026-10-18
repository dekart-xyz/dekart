// REVIEW: Report retained connection names and failed object deletes without exposing credentials.
package notifications

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	htmltemplate "html/template"
	"net/http"
	"strings"

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
	textBody := fmt.Sprintf("Workspace %s (%s) was deleted.", n.WorkspaceName, n.WorkspaceID)
	// An email may contain failed storage deletes, retained connections, or both.
	if len(n.ObjectURLs) > 0 {
		textBody += "\n\nThese storage objects could not be deleted:\n" + strings.Join(n.ObjectURLs, "\n")
	}
	if len(n.RetainedConnections) > 0 {
		textBody += "\n\nThese connections and their stored credentials were retained because datasets or saved history in another workspace still reference them:\n" + strings.Join(n.RetainedConnections, "\n")
	}
	payload := resendEmailPayload{
		From:    s.fromEmail,
		To:      []string{n.RecipientEmail},
		Subject: "Workspace deletion: cleanup report",
		Text:    textBody,
		Html:    "<pre>" + htmltemplate.HTMLEscapeString(textBody) + "</pre>",
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
