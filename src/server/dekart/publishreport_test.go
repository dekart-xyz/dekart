package dekart

import (
	"testing"
	"time"
)

func TestCheckPresignedURLExpiration(t *testing.T) {
	// Create a minimal server instance (the function doesn't use any server fields)
	s := Server{}

	// Date from file: Thu Nov 13 07:57:44 CET 2025
	// CET is UTC+1, so this is Nov 13, 2025 06:57:44 UTC
	testTime := time.Date(2025, 11, 13, 6, 57, 44, 0, time.UTC)

	tests := []struct {
		name            string
		url             string
		expectedExpired bool
		expectError     bool
	}{
		{
			name:            "expired URL from Nov 6, 2025",
			url:             "https://example.com/file.parquet?X-Amz-Date=20251106T162158Z&X-Amz-Expires=14400",
			expectedExpired: true,
			expectError:     false,
		},
		{
			name:            "valid URL from Nov 13, 2025 (not expired yet)",
			url:             "https://example.com/file.parquet?X-Amz-Date=20251113T064640Z&X-Amz-Expires=14400",
			expectedExpired: false,
			expectError:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			expired, err := s.checkPresignedURLExpiration(tt.url, testTime)

			if tt.expectError {
				if err == nil {
					t.Errorf("expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}

			if expired != tt.expectedExpired {
				t.Errorf("expected expired=%v, got expired=%v", tt.expectedExpired, expired)
			}
		})
	}
}
