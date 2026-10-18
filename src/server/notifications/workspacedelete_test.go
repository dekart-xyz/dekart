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

func TestWorkspaceDeleteEmailIncludesRetainedConnections(t *testing.T) {
	for _, objects := range [][]string{nil, {"gs://bucket/failed.csv"}} {
		t.Run(strings.Join(objects, ","), func(t *testing.T) {
			payloads := []resendEmailPayload{}
			service := resendService{fromEmail: "dekart@example.com", apiKey: "test", httpClient: &http.Client{Transport: workspaceDeleteEmailTransport{payloads: &payloads, t: t}}}
			service.SendWorkspaceDeleteCleanupFailed(WorkspaceDeleteCleanupFailed{WorkspaceID: "workspace-id", WorkspaceName: "<Deleted workspace>", RecipientEmail: "admin@example.com", ObjectURLs: objects, RetainedConnections: []string{"Source <connection> (connection-id)"}})
			require.Len(t, payloads, 1)
			payload := payloads[0]
			require.Equal(t, []string{"admin@example.com"}, payload.To)
			require.Contains(t, payload.Text, "Source <connection> (connection-id)")
			require.Contains(t, payload.Text, "credentials")
			require.Contains(t, payload.Text, "another workspace")
			require.Contains(t, payload.Html, "Source &lt;connection&gt; (connection-id)")
			require.NotContains(t, payload.Html, "<Deleted workspace>")
			for _, url := range objects {
				require.Contains(t, payload.Text, url)
			}
		})
	}
}
