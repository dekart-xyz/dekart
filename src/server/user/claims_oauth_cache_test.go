package user

import (
	pb "dekart/src/proto"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestOAuthCodeExchangeCacheStoresAndReturnsCopy(t *testing.T) {
	cache := newOAuthCodeExchangeCache(time.Minute)
	key := oauthCodeExchangeKey("code123", &pb.AuthState{UiUrl: "https://app.dekart.xyz"})
	original := &pb.RedirectState{
		TokenJson:              `{"access_token":"abc"}`,
		Error:                  "",
		SensitiveScopesGranted: true,
	}

	cache.set(key, original)
	cached, ok := cache.get(key)

	assert.True(t, ok)
	assert.NotNil(t, cached)
	assert.Equal(t, original.TokenJson, cached.TokenJson)
	assert.Equal(t, original.SensitiveScopesGranted, cached.SensitiveScopesGranted)

	cached.TokenJson = "changed"
	cachedAgain, ok := cache.get(key)
	assert.True(t, ok)
	assert.Equal(t, original.TokenJson, cachedAgain.TokenJson)
}

func TestOAuthCodeExchangeCacheExpiresEntries(t *testing.T) {
	cache := newOAuthCodeExchangeCache(time.Millisecond)
	key := oauthCodeExchangeKey("code456", &pb.AuthState{UiUrl: "https://app.dekart.xyz"})
	cache.set(key, &pb.RedirectState{TokenJson: "x"})

	time.Sleep(10 * time.Millisecond)
	_, ok := cache.get(key)
	assert.False(t, ok)
}
