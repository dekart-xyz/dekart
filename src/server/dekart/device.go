package dekart

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"dekart/src/proto"
	device "dekart/src/server/deviceauth"
	"dekart/src/server/user"

	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const maxDeviceNameLength = 120

// HandleDeviceStart creates a device session and returns auth metadata for polling.
func (s *Server) HandleDeviceStart(w http.ResponseWriter, r *http.Request) {
	request := &proto.DeviceStartRequest{}
	if err := readProtoJSON(r, request); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	deviceID := device.NewDeviceID()
	authURL := fmt.Sprintf("%s/device/authorize?device_id=%s", device.RequestFrontendBaseURL(r), url.QueryEscape(deviceID))
	if err := device.StartDeviceSession(r.Context(), s.db, deviceID, authURL, normalizeDeviceName(request.GetDeviceName())); err != nil {
		log.Error().Err(err).Msg("Failed to start device auth session")
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	result := device.BuildStartResult(deviceID, authURL)
	writeProtoJSON(w, http.StatusOK, &proto.DeviceStartResponse{
		DeviceId:  result.DeviceID,
		AuthUrl:   result.AuthURL,
		ExpiresIn: result.ExpiresIn,
		Interval:  result.Interval,
	})
}

// HandleDeviceToken polls auth state and returns a signed JWT once session is authorized.
func (s *Server) HandleDeviceToken(w http.ResponseWriter, r *http.Request) {
	request := &proto.DeviceTokenRequest{}
	if err := readProtoJSON(r, request); err != nil {
		writeProtoJSON(w, http.StatusBadRequest, &proto.DeviceTokenResponse{Status: "expired", Error: "invalid_request"})
		return
	}
	deviceID := strings.TrimSpace(request.GetDeviceId())
	if deviceID == "" {
		writeProtoJSON(w, http.StatusBadRequest, &proto.DeviceTokenResponse{Status: "expired", Error: "invalid_request"})
		return
	}

	result, err := device.PollToken(r.Context(), s.db, deviceID)
	if err != nil {
		log.Error().Err(err).Str("device_id", deviceID).Msg("Device token polling failed")
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	writeProtoJSON(w, http.StatusOK, &proto.DeviceTokenResponse{
		Status:      string(result.Status),
		Token:       result.Token,
		Error:       result.Error,
		ExpiresIn:   result.ExpiresIn,
		Email:       result.Email,
		WorkspaceId: result.WorkspaceID,
	})
}

// AuthorizeDevice confirms pending device session for the authenticated user/workspace.
func (s Server) AuthorizeDevice(ctx context.Context, req *proto.AuthorizeDeviceRequest) (*proto.AuthorizeDeviceResponse, error) {
	deviceID := strings.TrimSpace(req.GetDeviceId())
	if deviceID == "" {
		return nil, status.Error(codes.InvalidArgument, "device_id is required")
	}
	claims, workspaceID, err := requireDeviceAuthorizeContext(ctx)
	if err != nil {
		return nil, err
	}
	state, err := device.GetSessionState(ctx, s.db, deviceID)
	if err != nil {
		log.Error().Err(err).Str("device_id", deviceID).Msg("Failed reading device session state")
		return nil, status.Error(codes.Internal, "failed to read device session")
	}
	if err := validateAuthorizableState(state); err != nil {
		return nil, err
	}

	updated, err := device.AuthorizeDeviceSession(ctx, s.db, deviceID, claims.Email, workspaceID)
	if err != nil {
		log.Error().Err(err).Str("device_id", deviceID).Str("email", claims.Email).Msg("Failed to authorize device session")
		return nil, status.Error(codes.Internal, "failed to authorize device")
	}
	if !updated {
		// why: pending sessions can expire between initial state check and update attempt.
		return nil, status.Error(codes.FailedPrecondition, "device session expired")
	}

	return &proto.AuthorizeDeviceResponse{Status: "authorized"}, nil
}

// normalizeDeviceName keeps stored device labels small and safe for logs/UI.
func normalizeDeviceName(raw string) string {
	name := strings.TrimSpace(raw)
	if len(name) > maxDeviceNameLength {
		return name[:maxDeviceNameLength]
	}
	return name
}

// requireDeviceAuthorizeContext validates authenticated actor and workspace for device authorization.
func requireDeviceAuthorizeContext(ctx context.Context) (*user.Claims, string, error) {
	claims := user.GetClaims(ctx)
	if claims == nil || claims.Email == user.UnknownEmail {
		return nil, "", status.Error(codes.Unauthenticated, "login required")
	}
	workspace := user.CheckWorkspaceCtx(ctx)
	if workspace.ID == "" {
		return nil, "", status.Error(codes.FailedPrecondition, "workspace required")
	}
	return claims, workspace.ID, nil
}

// validateAuthorizableState ensures that only pending sessions can be authorized.
func validateAuthorizableState(state device.SessionState) error {
	if !state.Found {
		return status.Error(codes.NotFound, "device session not found")
	}
	if state.Status == device.SessionStatusPending {
		return nil
	}
	if state.Status == device.SessionStatusAuthorized {
		return nil
	}
	// why: consumed/expired sessions are terminal and must not be re-authorized.
	return status.Error(codes.FailedPrecondition, "device session expired")
}
