package dekart

import (
	"context"
	"dekart/src/proto"
	device "dekart/src/server/deviceauth"
	"dekart/src/server/reportsnapshot"
	"dekart/src/server/user"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const defaultSnapshotWidth = 1600
const defaultSnapshotHeight = 900
const defaultSnapshotTimeoutSeconds = 120
const defaultSnapshotDeviceScale = 1.0

// CreateReportSnapshot returns a short-lived snapshot URL for one report snapshot render.
func (s *Server) CreateReportSnapshot(ctx context.Context, req *proto.CreateReportSnapshotRequest) (*proto.CreateReportSnapshotResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	if !reportsnapshot.IsEnabled() {
		return nil, status.Error(codes.FailedPrecondition, "snapshot feature is disabled")
	}
	if err := validateSnapshotRequest(req); err != nil {
		return nil, err
	}
	if err := s.ensureReportReadAccess(ctx, req.GetReportId()); err != nil {
		return nil, err
	}
	token, expiresAt, err := reportsnapshot.IssueToken(buildSnapshotClaims(ctx, claims.Email, req.GetReportId()))
	if err != nil {
		return nil, status.Error(codes.Internal, "cannot issue snapshot token")
	}
	return &proto.CreateReportSnapshotResponse{
		SnapshotUrl:       buildSnapshotImageURL(token),
		ExpiresIn:         int64(expiresAt.Sub(time.Now().UTC()).Seconds()),
		SnapshotRenderUrl: buildSnapshotRenderURL(nil, token, req.GetReportId()),
	}, nil
}

// HandleSnapshotReport validates short-lived token, captures screenshot via Browserless, and streams image bytes.
func (s *Server) HandleSnapshotReport(w http.ResponseWriter, r *http.Request) {
	if !reportsnapshot.IsEnabled() {
		http.Error(w, "snapshot feature is disabled", http.StatusNotFound)
		return
	}
	token := strings.TrimSpace(mux.Vars(r)["token"])
	if token == "" {
		http.Error(w, "token is required", http.StatusBadRequest)
		return
	}
	snapshotClaims, err := reportsnapshot.ParseAndValidateToken(token)
	if err != nil {
		http.Error(w, "invalid or expired token", http.StatusUnauthorized)
		return
	}
	defer reportsnapshot.DeleteToken(token)
	authorizedCtx := s.buildSnapshotClaimsContext(r.Context(), snapshotClaims)
	if !s.isSnapshotContextAuthorized(authorizedCtx, snapshotClaims) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	targetURL := buildSnapshotRenderURL(r, token, snapshotClaims.ReportID)
	err = reportsnapshot.StreamImage(
		authorizedCtx,
		targetURL,
		token,
		defaultSnapshotWidth,
		defaultSnapshotHeight,
		defaultSnapshotDeviceScale,
		defaultSnapshotTimeoutSeconds,
		w,
	)
	if err != nil {
		log.Error().Err(err).Str("reportId", snapshotClaims.ReportID).Msg("Snapshot capture failed")
		http.Error(w, "snapshot render failed", http.StatusBadGateway)
		return
	}
}

// validateSnapshotRequest validates required report snapshot request fields.
func validateSnapshotRequest(req *proto.CreateReportSnapshotRequest) error {
	if req.GetReportId() == "" {
		return status.Error(codes.InvalidArgument, "report_id is required")
	}
	return nil
}

// ensureReportReadAccess checks caller access to report before snapshot URL issuance.
func (s *Server) ensureReportReadAccess(ctx context.Context, reportID string) error {
	report, err := s.getReport(ctx, reportID)
	if err != nil {
		return status.Error(codes.Internal, "failed to resolve report access")
	}
	if report == nil {
		return status.Error(codes.NotFound, "report not found")
	}
	return nil
}

// buildSnapshotClaims builds compact token claims from authenticated context and request options.
func buildSnapshotClaims(ctx context.Context, email string, reportID string) reportsnapshot.Claims {
	workspaceID := checkWorkspace(ctx).ID
	return reportsnapshot.Claims{
		Email:       email,
		WorkspaceID: workspaceID,
		ReportID:    reportID,
	}
}

// buildSnapshotImageURL returns API snapshot URL served by backend capture endpoint.
func buildSnapshotImageURL(token string) string {
	path := fmt.Sprintf("/snapshot/report/%s.png", url.PathEscape(token))
	baseURL := strings.TrimSpace(device.RequestBaseURL(nil))
	if baseURL == "" {
		return path
	}
	return fmt.Sprintf("%s%s", strings.TrimRight(baseURL, "/"), path)
}

// buildSnapshotRenderURL returns frontend render URL consumed by Browserless renderer.
func buildSnapshotRenderURL(r *http.Request, token string, reportID string) string {
	baseURL := urlFromEnv("DEKART_SNAPSHOT_RENDER_BASE_URL")
	if baseURL == "" {
		baseURL = strings.TrimSpace(device.RequestBaseURL(r))
	}
	if baseURL == "" {
		baseURL = urlFromEnv("DEKART_APP_URL")
	}
	return fmt.Sprintf(
		"%s/reports/%s/snapshot?snapshot_token=%s",
		baseURL,
		url.PathEscape(reportID),
		url.QueryEscape(token),
	)
}

// buildSnapshotClaimsContext reconstructs scoped auth context from snapshot token claims.
func (s *Server) buildSnapshotClaimsContext(base context.Context, snapshotClaims reportsnapshot.Claims) context.Context {
	ctx := context.WithValue(base, user.ContextKey, &user.Claims{
		Email:       snapshotClaims.Email,
		WorkspaceID: snapshotClaims.WorkspaceID,
		ReportID:    snapshotClaims.ReportID,
	})
	return user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{ID: snapshotClaims.WorkspaceID})
}

// isSnapshotContextAuthorized validates token workspace/report scope against resolved context.
func (s *Server) isSnapshotContextAuthorized(ctx context.Context, snapshotClaims reportsnapshot.Claims) bool {
	if checkWorkspace(ctx).ID != snapshotClaims.WorkspaceID {
		return false
	}
	report, err := s.getReport(ctx, snapshotClaims.ReportID)
	return err == nil && report != nil
}

// urlFromEnv normalizes base URL env values for render target construction.
func urlFromEnv(name string) string {
	return strings.TrimRight(strings.TrimSpace(os.Getenv(name)), "/")
}
