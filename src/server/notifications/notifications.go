package notifications

import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"text/template"
	"time"

	htmltemplate "html/template"

	"dekart/src/proto"

	"github.com/Masterminds/sprig/v3"
	"github.com/rs/zerolog/log"
)

// WorkspaceInvite represents metadata required to notify a user about a workspace invite.
type WorkspaceInvite struct {
	InviteID      string
	WorkspaceID   string
	WorkspaceName string
	InviteeEmail  string
	InviterEmail  string
	Role          proto.UserRole
}

// ReportAccessGranted represents metadata for notifying report sharing events.
type ReportAccessGranted struct {
	ReportID       string
	ReportTitle    string
	RecipientEmail string
	GrantedByEmail string
	AccessLevel    int
}

// Service defines supported notification hooks.
type Service interface {
	SendWorkspaceInvite(WorkspaceInvite)
	SendReportAccessGranted(ReportAccessGranted)
}

type noopService struct{}

// NewNoop returns a Service implementation that drops all notifications.
func NewNoop() Service {
	return noopService{}
}

func (noopService) SendWorkspaceInvite(WorkspaceInvite) {}

func (noopService) SendReportAccessGranted(ReportAccessGranted) {}

// NewFromEnv builds a Service backed by Resend when all required env vars are set;
// otherwise a noop implementation is returned.
func NewFromEnv() Service {
	apiKey := os.Getenv("DEKART_RESEND_API_KEY")
	from := os.Getenv("DEKART_RESEND_FROM_EMAIL")
	appURL := os.Getenv("DEKART_APP_URL")
	if apiKey == "" || from == "" || appURL == "" {
		log.Warn().
			Bool("hasResendAPIKey", apiKey != "").
			Bool("hasResendFromEmail", from != "").
			Bool("hasAppURL", appURL != "").
			Msg("Workspace invite emails are disabled; Resend is not fully configured")
		return NewNoop()
	}
	return &resendService{
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		apiKey:    apiKey,
		fromEmail: from,
		appURL:    strings.TrimRight(appURL, "/"),
	}
}

type resendService struct {
	httpClient *http.Client
	apiKey     string
	fromEmail  string
	appURL     string
}

type resendEmailPayload struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	Html    string   `json:"html"`
	Text    string   `json:"text"`
}

type workspaceInviteTemplateData struct {
	WorkspaceInvite
	InviteURL string
}

type reportAccessGrantedTemplateData struct {
	ReportAccessGranted
	ReportURL string
}

// errInvalidRecipientEmail indicates Resend rejected the payload because of an invalid recipient address.
var errInvalidRecipientEmail = errors.New("invalid recipient email format")

type resendErrorResponse struct {
	StatusCode int    `json:"statusCode"`
	Name       string `json:"name"`
	Message    string `json:"message"`
}

var (
	//go:embed templates/*
	templateFS embed.FS

	htmlWorkspaceInviteTemplate = htmltemplate.Must(
		htmltemplate.New("workspace_invite.html").
			Funcs(htmltemplate.FuncMap(templateFuncMap())).
			ParseFS(templateFS, "templates/workspace_invite.html"),
	)
	textWorkspaceInviteTemplate = template.Must(
		template.New("workspace_invite.txt").
			Funcs(template.FuncMap(templateFuncMap())).
			ParseFS(templateFS, "templates/workspace_invite.txt"),
	)

	htmlReportAccessGrantedTemplate = htmltemplate.Must(
		htmltemplate.New("report_access_granted.html").
			Funcs(htmltemplate.FuncMap(templateFuncMap())).
			ParseFS(templateFS, "templates/report_access_granted.html"),
	)
	textReportAccessGrantedTemplate = template.Must(
		template.New("report_access_granted.txt").
			Funcs(template.FuncMap(templateFuncMap())).
			ParseFS(templateFS, "templates/report_access_granted.txt"),
	)
)

func templateFuncMap() map[string]any {
	funcs := sprig.FuncMap()
	funcs["roleLabel"] = workspaceRoleLabel
	funcs["reportAccessLevelLabel"] = reportAccessLevelLabel
	return funcs
}

func (s *resendService) SendWorkspaceInvite(invite WorkspaceInvite) {
	if strings.TrimSpace(invite.InviteeEmail) == "" {
		log.Warn().
			Str("inviteId", invite.InviteID).
			Str("workspaceId", invite.WorkspaceID).
			Msg("Skipping workspace invite email; invitee email is empty")
		return
	}
	if err := s.dispatchWorkspaceInvite(invite); err != nil {
		if errors.Is(err, errInvalidRecipientEmail) {
			log.Warn().
				Err(err).
				Str("inviteId", invite.InviteID).
				Str("workspaceId", invite.WorkspaceID).
				Str("email", invite.InviteeEmail).
				Msg("Skipping workspace invite email; invalid recipient email format")
			return
		}
		log.Err(err).
			Str("inviteId", invite.InviteID).
			Str("workspaceId", invite.WorkspaceID).
			Str("email", invite.InviteeEmail).
			Msg("Failed to send workspace invite email via Resend")
	}
}

func (s *resendService) dispatchWorkspaceInvite(invite WorkspaceInvite) error {
	inviteURL := fmt.Sprintf("%s/workspace/invite/%s", s.appURL, invite.InviteID)
	subject := fmt.Sprintf("%s invited you to %s on Dekart", invite.InviterEmail, invite.WorkspaceName)
	templateData := workspaceInviteTemplateData{
		WorkspaceInvite: invite,
		InviteURL:       inviteURL,
	}
	var htmlBody bytes.Buffer
	if err := htmlWorkspaceInviteTemplate.Execute(&htmlBody, templateData); err != nil {
		return fmt.Errorf("render workspace invite html template: %w", err)
	}
	var textBody bytes.Buffer
	if err := textWorkspaceInviteTemplate.Execute(&textBody, templateData); err != nil {
		return fmt.Errorf("render workspace invite text template: %w", err)
	}

	payload := resendEmailPayload{
		From:    s.fromEmail,
		To:      []string{invite.InviteeEmail},
		Subject: subject,
		Html:    htmlBody.String(),
		Text:    textBody.String(),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal resend payload: %w", err)
	}
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create resend request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("send resend request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4*1024))
		if isInvalidRecipientEmail(resp.StatusCode, respBody) {
			return errInvalidRecipientEmail
		}
		return fmt.Errorf("resend responded with %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	return nil
}

func workspaceRoleLabel(role proto.UserRole) string {
	switch role {
	case proto.UserRole_ROLE_ADMIN:
		return "Admin"
	case proto.UserRole_ROLE_EDITOR:
		return "Editor"
	case proto.UserRole_ROLE_VIEWER:
		return "Viewer"
	default:
		return "Member"
	}
}

func (s *resendService) SendReportAccessGranted(notification ReportAccessGranted) {
	if strings.TrimSpace(notification.RecipientEmail) == "" {
		log.Warn().
			Str("reportId", notification.ReportID).
			Msg("Skipping report access notification; recipient email is empty")
		return
	}
	if err := s.dispatchReportAccessGranted(notification); err != nil {
		if errors.Is(err, errInvalidRecipientEmail) {
			log.Warn().
				Err(err).
				Str("reportId", notification.ReportID).
				Str("email", notification.RecipientEmail).
				Msg("Skipping report access notification; invalid recipient email format")
			return
		}
		log.Err(err).
			Str("reportId", notification.ReportID).
			Str("email", notification.RecipientEmail).
			Msg("Failed to send report access notification via Resend")
	}
}

func (s *resendService) dispatchReportAccessGranted(notification ReportAccessGranted) error {
	reportURL := fmt.Sprintf("%s/reports/%s", s.appURL, notification.ReportID)
	subject := fmt.Sprintf("%s shared a report with you", notification.GrantedByEmail)
	templateData := reportAccessGrantedTemplateData{
		ReportAccessGranted: notification,
		ReportURL:           reportURL,
	}
	var htmlBody bytes.Buffer
	if err := htmlReportAccessGrantedTemplate.Execute(&htmlBody, templateData); err != nil {
		return fmt.Errorf("render report access granted html template: %w", err)
	}
	var textBody bytes.Buffer
	if err := textReportAccessGrantedTemplate.Execute(&textBody, templateData); err != nil {
		return fmt.Errorf("render report access granted text template: %w", err)
	}
	payload := resendEmailPayload{
		From:    s.fromEmail,
		To:      []string{notification.RecipientEmail},
		Subject: subject,
		Html:    htmlBody.String(),
		Text:    textBody.String(),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal resend payload: %w", err)
	}
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create resend request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("send resend request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4*1024))
		if isInvalidRecipientEmail(resp.StatusCode, respBody) {
			return errInvalidRecipientEmail
		}
		return fmt.Errorf("resend responded with %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	return nil
}

func isInvalidRecipientEmail(statusCode int, body []byte) bool {
	if statusCode != http.StatusUnprocessableEntity {
		return false
	}
	var resendErr resendErrorResponse
	if err := json.Unmarshal(body, &resendErr); err != nil {
		return false
	}
	message := strings.ToLower(resendErr.Message)
	return strings.Contains(message, "invalid `to` field") || strings.Contains(message, "invalid 'to' field")
}

func reportAccessLevelLabel(level int) string {
	switch level {
	case 1:
		return "Viewer"
	case 2:
		return "Editor"
	default:
		return "Collaborator"
	}
}
