package notifications

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

type workspaceDeleteEmailTransport struct {
	payloads *[]resendEmailPayload
	t        *testing.T
}

// RoundTrip captures email delivery without contacting Resend.
func (tr workspaceDeleteEmailTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	var payload resendEmailPayload
	require.NoError(tr.t, json.NewDecoder(req.Body).Decode(&payload))
	*tr.payloads = append(*tr.payloads, payload)
	return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{}`)), Header: make(http.Header)}, nil
}

// The delivered payload explains retained credentials and escapes user-provided names in HTML.
func TestWorkspaceDeleteEmail(t *testing.T) {
	for _, tc := range []struct {
		name        string
		objects     []string
		connections []string
	}{
		{"retained connections", nil, []string{"Source <connection> (connection-id)"}},
		{"failed objects", []string{"gs://bucket/<failed>&.csv"}, nil},
		{"both", []string{"gs://bucket/<failed>&.csv"}, []string{"Source <connection> (connection-id)"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			payloads := []resendEmailPayload{}
			service := resendService{
				fromEmail: "dekart@example.com",
				apiKey:    "test",
				httpClient: &http.Client{
					Transport: workspaceDeleteEmailTransport{payloads: &payloads, t: t},
				},
			}
			service.SendWorkspaceDeleteCleanupFailed(WorkspaceDeleteCleanupFailed{
				WorkspaceID:         "workspace-id",
				WorkspaceName:       "<Deleted workspace>",
				RecipientEmail:      "admin@example.com",
				ObjectURLs:          tc.objects,
				RetainedConnections: tc.connections,
			})
			require.Len(t, payloads, 1)
			payload := payloads[0]
			require.Equal(t, []string{"admin@example.com"}, payload.To)
			// Connection details appear only when credentials were retained.
			if len(tc.connections) > 0 {
				require.Contains(t, payload.Text, "Source <connection> (connection-id)")
				require.Contains(t, payload.Text, "credentials")
				require.Contains(t, payload.Text, "another workspace")
				require.Contains(t, payload.Html, "Source &lt;connection&gt; (connection-id)")
			} else {
				require.NotContains(t, payload.Text, "credentials")
			}
			require.Contains(t, payload.Html, "&lt;Deleted workspace&gt;")
			require.NotContains(t, payload.Html, "<Deleted workspace>")
			// Failed paths remain readable in text and cannot inject HTML.
			if len(tc.objects) > 0 {
				require.Contains(t, payload.Text, "gs://bucket/<failed>&.csv")
				require.Contains(t, payload.Html, "gs://bucket/&lt;failed&gt;&amp;.csv")
			} else {
				require.NotContains(t, payload.Text, "could not be deleted")
			}
		})
	}
}
