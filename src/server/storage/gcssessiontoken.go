package storage

import (
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
)

var (
	gcsMultipartSessions sync.Map
)

// createGCSSession stores upload session state in memory and returns opaque session id.
func createGCSSession(session gcsMultipartSession) string {
	sessionID := uuid.NewString()
	gcsMultipartSessions.Store(sessionID, session)
	return sessionID
}

// loadAndValidateGCSSession loads in-memory session state and validates scope and expiry.
func loadAndValidateGCSSession(sessionID, bucketName, objectName string) (*gcsMultipartSession, error) {
	if sessionID == "" {
		return nil, fmt.Errorf("provider_session_id is required")
	}
	value, exists := gcsMultipartSessions.Load(sessionID)
	if !exists {
		return nil, fmt.Errorf("invalid provider_session_id")
	}
	session, ok := value.(gcsMultipartSession)
	if !ok {
		gcsMultipartSessions.Delete(sessionID)
		return nil, fmt.Errorf("invalid provider_session_id")
	}
	if session.BucketName != bucketName || session.ObjectName != objectName {
		// why: bind session payload to request scope to prevent token reuse for different objects.
		return nil, fmt.Errorf("provider_session_id does not match upload target")
	}
	if time.Now().UTC().After(time.Unix(session.ExpiresUnix, 0)) {
		gcsMultipartSessions.Delete(sessionID)
		return nil, fmt.Errorf("upload session expired")
	}
	return &session, nil
}

// deleteGCSSession removes in-memory upload session state.
func deleteGCSSession(sessionID string) {
	if sessionID != "" {
		gcsMultipartSessions.Delete(sessionID)
	}
}
