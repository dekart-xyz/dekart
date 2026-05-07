package app

import (
	"net/http/httptest"
	"testing"
)

func TestGetSourceIP(t *testing.T) {
	tests := []struct {
		name       string
		remoteAddr string
		headers    map[string]string
		want       string
	}{
		{
			name:       "prefers x forwarded for first ip",
			remoteAddr: "10.0.0.1:1234",
			headers: map[string]string{
				"X-Forwarded-For": "203.0.113.10, 10.0.0.1",
			},
			want: "203.0.113.10",
		},
		{
			name:       "falls back to appengine ip",
			remoteAddr: "10.0.0.1:1234",
			headers: map[string]string{
				"X-Appengine-User-Ip": "198.51.100.7",
			},
			want: "198.51.100.7",
		},
		{
			name:       "falls back to remote addr host",
			remoteAddr: "192.0.2.3:8080",
			headers:    map[string]string{},
			want:       "192.0.2.3",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/v1/version/dekart-cli", nil)
			req.RemoteAddr = tc.remoteAddr
			for key, value := range tc.headers {
				req.Header.Set(key, value)
			}
			if got := getSourceIP(req); got != tc.want {
				t.Fatalf("getSourceIP() = %q, want %q", got, tc.want)
			}
		})
	}
}

