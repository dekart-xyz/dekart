package storage

import (
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
)

var (
	s3MultipartSessions sync.Map
)

// createS3Session stores upload session state in memory and returns opaque session id.
func createS3Session(session s3MultipartSession) string {
	sessionID := uuid.NewString()
	s3MultipartSessions.Store(sessionID, session)
	return sessionID
}

// loadAndValidateS3Session loads in-memory session state and validates scope and expiry.
func loadAndValidateS3Session(sessionID, bucketName, objectName string) (*s3MultipartSession, error) {
	if sessionID == "" {
		return nil, fmt.Errorf("provider_session_id is required")
	}
	value, exists := s3MultipartSessions.Load(sessionID)
	if !exists {
		return nil, fmt.Errorf("invalid provider_session_id")
	}
	session, ok := value.(s3MultipartSession)
	if !ok {
		s3MultipartSessions.Delete(sessionID)
		return nil, fmt.Errorf("invalid provider_session_id")
	}
	if session.BucketName != bucketName || session.ObjectName != objectName {
		// why: bind session payload to request scope to prevent token reuse for different objects.
		return nil, fmt.Errorf("provider_session_id does not match upload target")
	}
	if time.Now().UTC().After(time.Unix(session.ExpiresUnix, 0)) {
		s3MultipartSessions.Delete(sessionID)
		return nil, fmt.Errorf("upload session expired")
	}
	return &session, nil
}

// deleteS3Session removes in-memory upload session state.
func deleteS3Session(sessionID string) {
	if sessionID != "" {
		s3MultipartSessions.Delete(sessionID)
	}
}
