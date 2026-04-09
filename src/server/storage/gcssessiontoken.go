package storage

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"
)

const uploadSessionSigningKeyEnv = "DEKART_UPLOAD_SESSION_SIGNING_KEY"

// encodeGCSSession serializes and signs session payload for provider_session_id.
func encodeGCSSession(session gcsMultipartSession) (string, error) {
	payloadBytes, err := json.Marshal(session)
	if err != nil {
		return "", err
	}
	payload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	signature, err := signSessionPayload(payload)
	if err != nil {
		return "", err
	}
	return payload + "." + signature, nil
}

// decodeAndValidateGCSSession verifies signature, scope, and expiry for provider_session_id.
func decodeAndValidateGCSSession(sessionID, bucketName, objectName string) (*gcsMultipartSession, error) {
	if sessionID == "" {
		return nil, fmt.Errorf("provider_session_id is required")
	}
	parts := strings.Split(sessionID, ".")
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid provider_session_id")
	}
	if err := verifySessionPayload(parts[0], parts[1]); err != nil {
		return nil, fmt.Errorf("invalid provider_session_id")
	}
	rawPayload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("invalid provider_session_id")
	}

	var session gcsMultipartSession
	if err = json.Unmarshal(rawPayload, &session); err != nil {
		return nil, fmt.Errorf("invalid provider_session_id")
	}
	if session.BucketName != bucketName || session.ObjectName != objectName {
		// why: bind session payload to request scope to prevent token reuse for different objects.
		return nil, fmt.Errorf("provider_session_id does not match upload target")
	}
	if time.Now().UTC().After(time.Unix(session.ExpiresUnix, 0)) {
		return nil, fmt.Errorf("upload session expired")
	}
	return &session, nil
}

// signSessionPayload computes HMAC signature for payload.
func signSessionPayload(payload string) (string, error) {
	signingKey, err := getUploadSessionSigningKey()
	if err != nil {
		return "", err
	}
	h := hmac.New(sha256.New, signingKey)
	_, _ = h.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(h.Sum(nil)), nil
}

// verifySessionPayload checks provided signature against payload.
func verifySessionPayload(payload, providedSignature string) error {
	expectedSignature, err := signSessionPayload(payload)
	if err != nil {
		return err
	}
	if !hmac.Equal([]byte(expectedSignature), []byte(providedSignature)) {
		return fmt.Errorf("invalid signature")
	}
	return nil
}

// getUploadSessionSigningKey loads upload-session signing key from environment.
func getUploadSessionSigningKey() ([]byte, error) {
	raw := strings.TrimSpace(os.Getenv(uploadSessionSigningKeyEnv))
	if raw == "" {
		return nil, fmt.Errorf("%s is required", uploadSessionSigningKeyEnv)
	}
	decoded, err := base64.StdEncoding.DecodeString(raw)
	if err == nil && len(decoded) > 0 {
		return decoded, nil
	}
	return []byte(raw), nil
}
