package httpsource

import (
	"context"
	"errors"
	"github.com/stretchr/testify/require"
	"io"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
	"time"
)

func TestResolve(t *testing.T) {
	sources := []Source{{ID: "root", BaseURL: "https://EXAMPLE.com:443/api", HeaderNames: []string{"Authorization"}}, {ID: "nested", BaseURL: "https://example.com/api/v2"}}
	for _, tc := range []struct{ url, id, normalized string }{
		{"https://example.com/api/data?x=1", "root", "https://example.com/api/data?x=1"},
		{"https://example.com:443/api/v2/data", "nested", "https://example.com/api/v2/data"},
		{"https://example.com/api/", "root", "https://example.com/api/"},
	} {
		t.Run(tc.url, func(t *testing.T) {
			m, err := Resolve(tc.url, sources)
			require.NoError(t, err)
			require.Equal(t, tc.id, m.SourceID)
			require.Equal(t, tc.normalized, m.URL)
		})
	}
	for _, u := range []string{"http://example.com/api", "https://example.com:444/api", "https://example.com/apix", "https://example.com.evil/api", "https://user:pass@example.com/api", "https://example.com/api/%2e%2e/private", "https://example.com/api?Authorization=%zz"} {
		t.Run(u, func(t *testing.T) { _, err := Resolve(u, sources); require.Error(t, err) })
	}
	_, err := Resolve("https://example.com/api?authorization=secret", sources)
	var param *HeaderParamError
	require.ErrorAs(t, err, &param)
	require.Equal(t, "authorization", param.Param)
	_, err = Resolve("https://example.com/api", append(sources, Source{ID: "duplicate", BaseURL: "https://example.com/api/"}))
	require.Error(t, err)
	m, err := Resolve("https://bücher.example/data", []Source{{ID: "unicode", BaseURL: "https://xn--bcher-kva.example"}})
	require.NoError(t, err)
	require.Equal(t, "https://xn--bcher-kva.example/data", m.URL)
}

func TestFetch(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/headers":
			require.Equal(t, "secret", r.Header.Get("Authorization"))
			require.Equal(t, "app", r.Header.Get("X-Application-Id"))
			require.Equal(t, "identity", r.Header.Get("Accept-Encoding"))
			require.Empty(t, r.Header.Get("User-Agent"))
			w.Header().Set("ETag", "etag")
			w.Header().Set("Last-Modified", "date")
			w.Header().Set("Set-Cookie", "private")
			io.WriteString(w, "abc")
		case "/redirect":
			http.Redirect(w, r, "/headers", 302)
		case "/large":
			w.Header().Set("Content-Length", "100")
			io.WriteString(w, strings.Repeat("a", 100))
		case "/stream":
			w.(http.Flusher).Flush()
			io.WriteString(w, "123456789")
		case "/slow":
			time.Sleep(100 * time.Millisecond)
			io.WriteString(w, "a")
		default:
			w.WriteHeader(401)
			io.WriteString(w, "bad secret "+strings.Repeat("x", 200))
		}
	}))
	defer srv.Close()
	// Fetch uses normal TLS validation, so the test installs this server's certificate trust.
	old := http.DefaultTransport
	http.DefaultTransport = srv.Client().Transport
	defer func() { http.DefaultTransport = old }()
	policy := Policy{MaxBytes: 5, Timeout: time.Second, AllowAddress: func(netip.Addr) bool { return true }}
	f, err := Fetch(context.Background(), policy, srv.URL+"/headers", map[string]string{"Authorization": "secret", "X-Application-Id": "app"})
	require.NoError(t, err)
	b, err := io.ReadAll(f.Body)
	require.NoError(t, err)
	require.Equal(t, "abc", string(b))
	f.Body.Close()
	require.Equal(t, "etag", f.ETag)
	require.Equal(t, "date", f.LastModified)
	for _, tc := range []struct {
		path string
		want error
	}{{"/redirect", ErrRedirect}, {"/large", ErrTooLarge}} {
		_, err := Fetch(context.Background(), policy, srv.URL+tc.path, nil)
		require.ErrorIs(t, err, tc.want)
	}
	f, err = Fetch(context.Background(), policy, srv.URL+"/stream", nil)
	require.NoError(t, err)
	b, err = io.ReadAll(f.Body)
	require.ErrorIs(t, err, ErrTooLarge)
	require.Len(t, b, 5)
	f.Body.Close()
	policy.Timeout = 10 * time.Millisecond
	_, err = Fetch(context.Background(), policy, srv.URL+"/slow", nil)
	require.ErrorIs(t, err, ErrTimeout)
	policy.Timeout = time.Second
	_, err = Fetch(context.Background(), policy, srv.URL+"/error", map[string]string{"Authorization": "secret"})
	var status *StatusError
	require.True(t, errors.As(err, &status))
	require.Equal(t, 401, status.Status)
	require.NotContains(t, status.Excerpt, "secret")
	require.Less(t, len(status.Excerpt), 120)
	policy.AllowAddress = nil
	_, err = Fetch(context.Background(), policy, srv.URL+"/headers", nil)
	require.ErrorIs(t, err, ErrPrivateAddress)
}

func TestFetchScrubsLongAndOverlappingHeaderValues(t *testing.T) {
	longSecret := strings.Repeat("long-credential-", 600)
	cases := []struct {
		headers         map[string]string
		body, forbidden string
	}{
		{map[string]string{"Authorization": longSecret}, longSecret, "long-credential"},
		{map[string]string{"Authorization": "alpha-beta-gamma", "X-Api-Key": "beta-gamma"}, "alpha-beta-gamma", "alpha"},
		{map[string]string{"Authorization": "abc", "X-Api-Key": "bcdef"}, "abcdef", "def"},
	}
	for _, tc := range cases {
		t.Run(tc.forbidden, func(t *testing.T) {
			srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(401); io.WriteString(w, tc.body) }))
			defer srv.Close()
			old := http.DefaultTransport
			http.DefaultTransport = srv.Client().Transport
			defer func() { http.DefaultTransport = old }()
			_, err := Fetch(context.Background(), Policy{MaxBytes: 100000, Timeout: time.Second, AllowAddress: func(netip.Addr) bool { return true }}, srv.URL, tc.headers)
			var status *StatusError
			require.ErrorAs(t, err, &status)
			require.NotContains(t, status.Excerpt, tc.forbidden)
			require.Equal(t, "[redacted]", status.Excerpt)
			require.Less(t, len([]rune(status.Excerpt)), 120)
		})
	}
}

func TestTemplate(t *testing.T) {
	sources := []Source{{ID: "api", BaseURL: "https://example.com/api", HeaderNames: []string{"Authorization"}}}
	template, err := ParseTemplate("https://example.com/api/data?station={}&fixed=a%20b", sources)
	require.NoError(t, err)
	require.Equal(t, 1, template.Placeholders)
	require.Equal(t, "api", template.SourceID)
	resolved, err := template.Match("https://EXAMPLE.com:443/api/data?fixed=a+b&station=x%26y%3Dz")
	require.NoError(t, err)
	require.Contains(t, resolved, "station=x%26y%3Dz")
	for _, raw := range []string{
		"https://example.com/api/data?station={}&station={}", "https://example.com/api/{}?a=x",
		"https://{}.com/api?a=x", "https://example.com/api?{}=x", "https://example.com/api?a=x{}",
		"https://example.com/api?Authorization={}", "https://unknown.com/api?a={}", "{}://example.com/api?a=x",
		"https://example.com/api?a=%7B%7D", "https://example.com/api?a={{}}", "https://example.com/api/*.csv?a={}",
	} {
		_, err := ParseTemplate(raw, sources)
		require.Error(t, err, raw)
	}
	for _, raw := range []string{
		"http://example.com/api/data?station=x&fixed=a+b", "https://other.com/api/data?station=x&fixed=a+b",
		"https://example.com:444/api/data?station=x&fixed=a+b", "https://example.com/api/other?station=x&fixed=a+b",
		"https://example.com/api/data?other=x&fixed=a+b", "https://example.com/api/data?station=x&fixed=c",
		"https://example.com/api/data?station=x&station=y&fixed=a+b", "https://example.com/api/data?station=x&fixed=a+b#fragment",
		"https://user@example.com/api/data?station=x&fixed=a+b",
	} {
		_, err := template.Match(raw)
		require.Error(t, err, raw)
	}
}
