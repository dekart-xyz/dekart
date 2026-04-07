package deviceauth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// SessionStatus defines lifecycle states for device authorization.
type SessionStatus string

const (
	SessionStatusPending    SessionStatus = "pending"
	SessionStatusAuthorized SessionStatus = "authorized"
	SessionStatusConsumed   SessionStatus = "consumed"
	SessionStatusExpired    SessionStatus = "expired"
)

const (
	deviceAuthStartEventName      = "DeviceAuthStart"
	deviceAuthAuthorizedEventName = "DeviceAuthAuthorized"
	deviceAuthTokenIssuedEvent    = "DeviceAuthTokenIssued"
	deviceAuthExpiredEvent        = "DeviceAuthExpired"
)

const (
	deviceSessionTTL  = 10 * time.Minute
	devicePollSeconds = 3 * time.Second
)

// StartDeviceResult is returned after creating a device authorization session.
type StartDeviceResult struct {
	DeviceID  string
	AuthURL   string
	ExpiresIn int64
	Interval  int64
}

// PollTokenResult describes the current token polling state.
type PollTokenResult struct {
	Status      SessionStatus
	Token       string
	Error       string
	ExpiresIn   int64
	Email       string
	WorkspaceID string
}

// SessionState returns a single session state used by authorize and token flows.
type SessionState struct {
	Status      SessionStatus
	ExpiresAt   time.Time
	Email       string
	WorkspaceID string
	DeviceName  string
	Found       bool
}

// TokenIssuer provides token issuing behavior for device authorization.
type TokenIssuer interface {
	Issue(email string, workspaceID string) (string, time.Time, error)
}

// StartDeviceSession creates a new pending session for browser authorization.
func StartDeviceSession(ctx context.Context, db *sql.DB, deviceID string, authURL string, deviceName string) error {
	_ = authURL
	logID, err := newLogID()
	if err != nil {
		return err
	}
	expiresAt := time.Now().UTC().Add(deviceSessionTTL)
	_, err = db.ExecContext(
		ctx,
		`INSERT INTO device_auth_log (id, device_id, status, expires_at, device_name)
		 VALUES ($1, $2, $3, $4, $5)`,
		logID,
		deviceID,
		SessionStatusPending,
		expiresAt,
		deviceName,
	)
	if err == nil {
		trackLifecycleEvent(ctx, db, deviceAuthStartEventName, deviceID, "", "")
	}
	return err
}

// BuildStartResult builds public payload for a created session.
func BuildStartResult(deviceID string, authURL string) StartDeviceResult {
	return StartDeviceResult{
		DeviceID:  deviceID,
		AuthURL:   authURL,
		ExpiresIn: int64(deviceSessionTTL.Seconds()),
		Interval:  int64(devicePollSeconds.Seconds()),
	}
}

// AuthorizeDeviceSession marks a pending session as authorized for a user and workspace.
func AuthorizeDeviceSession(ctx context.Context, db *sql.DB, deviceID string, email string, workspaceID string) (bool, error) {
	if email == "" || workspaceID == "" {
		// why: issued token must carry both subject email and workspace scope.
		return false, errors.New("email and workspace id are required")
	}
	logID, err := newLogID()
	if err != nil {
		return false, err
	}
	result, err := db.ExecContext(
		ctx,
		`INSERT INTO device_auth_log (id, device_id, device_name, status, email, workspace_id, expires_at)
		 SELECT $2, device_id, device_name, $3, $4, $5, expires_at
		 FROM device_auth_log
		 WHERE id = (
		   SELECT id
		   FROM device_auth_log
		   WHERE device_id = $1
		   ORDER BY created_at DESC
		   LIMIT 1
		 )
		   AND status = $6
		   AND expires_at > CURRENT_TIMESTAMP`,
		deviceID,
		logID,
		SessionStatusAuthorized,
		email,
		workspaceID,
		SessionStatusPending,
	)
	if err != nil {
		return false, err
	}
	affectedRows, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	if affectedRows > 0 {
		// why: emit authorization event only on state transition, not on no-op retries.
		trackLifecycleEvent(ctx, db, deviceAuthAuthorizedEventName, email, workspaceID, "")
	}
	return affectedRows > 0, nil
}

// GetSessionState fetches current state for a device authorization session.
func GetSessionState(ctx context.Context, db *sql.DB, deviceID string) (SessionState, error) {
	row := db.QueryRowContext(
		ctx,
		`SELECT status, expires_at, COALESCE(email, ''), COALESCE(workspace_id, ''), COALESCE(device_name, '')
		 FROM device_auth_log
		 WHERE device_id = $1
		 ORDER BY created_at DESC
		 LIMIT 1`,
		deviceID,
	)
	state := SessionState{}
	if err := row.Scan(&state.Status, &state.ExpiresAt, &state.Email, &state.WorkspaceID, &state.DeviceName); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			state.Found = false
			return state, nil
		}
		return state, err
	}
	state.Found = true
	return state, nil
}

// PollToken returns authorization state and JWT when session is authorized.
func PollToken(ctx context.Context, db *sql.DB, deviceID string) (PollTokenResult, error) {
	return pollToken(ctx, db, NewJWTIssuerFromEnv(), deviceID)
}

// pollToken returns polling result using provided token issuer.
func pollToken(ctx context.Context, db *sql.DB, issuer TokenIssuer, deviceID string) (PollTokenResult, error) {
	state, err := GetSessionState(ctx, db, deviceID)
	if err != nil {
		return PollTokenResult{}, err
	}
	if !state.Found {
		// why: hide existence details and treat unknown ids as expired for consistent client behavior.
		return PollTokenResult{Status: SessionStatusExpired, Error: "expired"}, nil
	}

	switch state.Status {
	case SessionStatusPending:
		return pollPendingSession(ctx, db, deviceID, state)
	case SessionStatusAuthorized:
		return pollAuthorizedSession(ctx, db, issuer, deviceID, state)
	default:
		// why: any non-pollable terminal status should collapse to a single expired response contract.
		return PollTokenResult{Status: SessionStatusExpired, Error: "expired"}, nil
	}
}

// expireSession marks a session as expired.
func expireSession(ctx context.Context, db *sql.DB, deviceID string) (bool, error) {
	logID, err := newLogID()
	if err != nil {
		return false, err
	}
	result, err := db.ExecContext(
		ctx,
		`INSERT INTO device_auth_log (id, device_id, device_name, status, email, workspace_id, expires_at)
		 SELECT $2, device_id, device_name, $3, email, workspace_id, expires_at
		 FROM device_auth_log
		 WHERE id = (
		   SELECT id
		   FROM device_auth_log
		   WHERE device_id = $1
		   ORDER BY created_at DESC
		   LIMIT 1
		 )
		   AND status = $4`,
		deviceID,
		logID,
		SessionStatusExpired,
		SessionStatusPending,
	)
	if err != nil {
		return false, err
	}
	affectedRows, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	return affectedRows > 0, nil
}

// consumedSession carries identity data copied from the consumed device auth row.
type consumedSession struct {
	Email       string
	WorkspaceID string
}

// consumeAuthorizedSessionTx atomically consumes one authorized session row in a transaction.
// why: polling is concurrent by design; this single INSERT...SELECT...RETURNING is the gate that
// guarantees exactly one poller can transition authorized -> consumed and proceed to token minting.
func consumeAuthorizedSessionTx(ctx context.Context, tx *sql.Tx, deviceID string) (consumedSession, bool, error) {
	logID, err := newLogID()
	if err != nil {
		return consumedSession{}, false, err
	}
	row := tx.QueryRowContext(
		ctx,
		`INSERT INTO device_auth_log (id, device_id, device_name, status, email, workspace_id, expires_at)
		 SELECT $2, device_id, device_name, $3, email, workspace_id, expires_at
		 FROM device_auth_log
		 WHERE id = (
		   SELECT id
		   FROM device_auth_log
		   WHERE device_id = $1
		   ORDER BY created_at DESC
		   LIMIT 1
		 )
		   AND status = $4
		 RETURNING COALESCE(email, ''), COALESCE(workspace_id, '')`,
		deviceID,
		logID,
		SessionStatusConsumed,
		SessionStatusAuthorized,
	)
	var consumed consumedSession
	if err := row.Scan(&consumed.Email, &consumed.WorkspaceID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return consumedSession{}, false, nil
		}
		return consumedSession{}, false, err
	}
	return consumed, true, nil
}

// newLogID creates a unique id for append-only device auth rows.
func newLogID() (string, error) {
	id, err := uuid.NewRandom()
	if err != nil {
		return "", err
	}
	return id.String(), nil
}

// pollPendingSession returns pending or expired state for a device waiting on browser authorization.
func pollPendingSession(ctx context.Context, db *sql.DB, deviceID string, state SessionState) (PollTokenResult, error) {
	if time.Now().UTC().After(state.ExpiresAt) {
		// why: keep lifecycle deterministic for clients and future cleanup.
		expired, err := expireSession(ctx, db, deviceID)
		if err != nil {
			return PollTokenResult{}, err
		}
		if expired {
			trackLifecycleEvent(ctx, db, deviceAuthExpiredEvent, deviceID, "", "expired")
		}
		return PollTokenResult{Status: SessionStatusExpired, Error: "expired"}, nil
	}
	return PollTokenResult{Status: SessionStatusPending, Error: "authorization_pending"}, nil
}

// pollAuthorizedSession issues token for authorized device and consumes one-time session.
// why: we consume first inside a transaction and mint before commit to enforce first-poller-wins.
// If minting fails, rollback keeps the session authorized so the client can retry without re-auth.
func pollAuthorizedSession(ctx context.Context, db *sql.DB, issuer TokenIssuer, deviceID string, state SessionState) (PollTokenResult, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return PollTokenResult{}, err
	}
	consumed, ok, err := consumeAuthorizedSessionTx(ctx, tx, deviceID)
	if err != nil {
		_ = tx.Rollback()
		return PollTokenResult{}, err
	}
	if !ok {
		_ = tx.Rollback()
		// why: another poll already consumed the one-time session, so this poll must not mint a token.
		return PollTokenResult{Status: SessionStatusExpired, Error: "expired"}, nil
	}

	email := consumed.Email
	if email == "" {
		email = state.Email
	}
	workspaceID := consumed.WorkspaceID
	if workspaceID == "" {
		workspaceID = state.WorkspaceID
	}
	token, tokenExpiresAt, err := issuer.Issue(email, workspaceID)
	if err != nil {
		// why: keep session re-pollable if signing fails, instead of burning authorization.
		_ = tx.Rollback()
		return PollTokenResult{}, err
	}
	if err := tx.Commit(); err != nil {
		// why: token is considered issued only if consume+mint transaction commits successfully.
		return PollTokenResult{}, fmt.Errorf("commit consumed session: %w", err)
	}
	trackLifecycleEvent(ctx, db, deviceAuthTokenIssuedEvent, email, workspaceID, "")
	return PollTokenResult{
		Status:      SessionStatusAuthorized,
		Token:       token,
		ExpiresIn:   int64(time.Until(tokenExpiresAt).Seconds()),
		Email:       email,
		WorkspaceID: workspaceID,
	}, nil
}
