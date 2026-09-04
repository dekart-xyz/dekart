package reportsnapshot

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestIssueTokenDeletesExpiredCredentialState(t *testing.T) {
	token, _, err := issueToken(Claims{MCPGoogleAccessToken: "delegated-token"}, 10*time.Millisecond)
	require.NoError(t, err)
	t.Cleanup(func() { state.active.Delete(token) })
	require.Eventually(t, func() bool {
		_, ok := state.active.Load(token)
		return !ok
	}, time.Second, 10*time.Millisecond)
}
