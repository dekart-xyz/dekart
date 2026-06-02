package reportsnapshot

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestIsCaptureEnabled(t *testing.T) {
	t.Setenv("DEKART_BROWSERLESS_TOKEN", "")
	require.False(t, IsCaptureEnabled())

	t.Setenv("DEKART_BROWSERLESS_TOKEN", "token")
	require.True(t, IsCaptureEnabled())
}
