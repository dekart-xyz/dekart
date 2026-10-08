// Package httpsource resolves workspace-approved HTTPS URLs and streams bounded responses.
package httpsource

import (
	"context"
	"errors"
	"fmt"
	"golang.org/x/net/idna"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"path"
	"strings"
	"time"
)

type Source struct {
	ID, BaseURL string
	HeaderNames []string
}
type Match struct{ SourceID, URL string }
type NoSourceError struct{ Host string }

func (e *NoSourceError) Error() string {
	return fmt.Sprintf("No HTTP source for %s. Create one in Connections, or use a host from an existing HTTP source.", e.Host)
}

type HeaderParamError struct{ Param, SourceID string }

func (e *HeaderParamError) Error() string {
	return fmt.Sprintf("Query parameter %q has the same name as a header of HTTP source %q. Remove it from the URL.", e.Param, e.SourceID)
}

type StatusError struct {
	Status        int
	Host, Excerpt string
}

func (e *StatusError) Error() string {
	return fmt.Sprintf("%d from %s (%s). %s", e.Status, e.Host, http.StatusText(e.Status), e.Excerpt)
}

var ErrRedirect = errors.New("redirects are not followed")
var ErrPrivateAddress = errors.New("resolves to a private address")
var ErrTimeout = errors.New("HTTP source timed out")
var ErrTooLarge = errors.New("HTTP sources are limited to 100 MB per file")

// normalize rejects credentials and canonicalizes origins and paths before matching.
func normalize(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.Fragment != "" {
		return nil, fmt.Errorf("HTTP sources require an HTTPS URL without userinfo or fragment")
	}
	host, err := idna.Lookup.ToASCII(strings.ToLower(u.Hostname()))
	if err != nil {
		return nil, err
	}
	port := u.Port()
	if port == "443" {
		port = ""
	}
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	u.Host = host
	if port != "" {
		u.Host = net.JoinHostPort(strings.Trim(host, "[]"), port)
	}
	// Decode before cleaning so encoded traversal cannot escape the configured base.
	trailingSlash := strings.HasSuffix(u.Path, "/")
	u.Path = path.Clean("/" + strings.TrimPrefix(u.Path, "/"))
	if trailingSlash && u.Path != "/" {
		u.Path += "/"
	}
	u.RawPath = ""
	return u, nil
}

// Resolve chooses the longest base at a path segment boundary and rejects header parameters.
func Resolve(rawURL string, sources []Source) (Match, error) {
	u, err := normalize(rawURL)
	if err != nil {
		return Match{}, err
	}
	bases := map[string]bool{}
	var selected *Source
	longest := -1
	for i := range sources {
		base, err := normalize(sources[i].BaseURL)
		if err != nil {
			return Match{}, err
		}
		base.Path = strings.TrimSuffix(base.Path, "/")
		key := base.String()
		if bases[key] {
			return Match{}, fmt.Errorf("Two HTTP sources have the same base URL")
		}
		bases[key] = true
		prefix := strings.TrimSuffix(base.Path, "/")
		if u.Host == base.Host && (u.Path == prefix || strings.HasPrefix(u.Path, prefix+"/")) && len(prefix) > longest {
			selected = &sources[i]
			longest = len(prefix)
		}
	}
	if selected == nil {
		return Match{}, &NoSourceError{Host: u.Hostname()}
	}
	params, err := url.ParseQuery(u.RawQuery)
	if err != nil {
		return Match{}, fmt.Errorf("HTTP source URL has invalid query parameters")
	}
	for param := range params {
		for _, header := range selected.HeaderNames {
			if strings.EqualFold(param, header) {
				return Match{}, &HeaderParamError{Param: param, SourceID: selected.ID}
			}
		}
	}
	return Match{SourceID: selected.ID, URL: u.String()}, nil
}

type Policy struct {
	MaxBytes     int64
	Timeout      time.Duration
	AllowAddress func(netip.Addr) bool
}
type Fetched struct {
	Body               io.ReadCloser
	ETag, LastModified string
}

// publicAddress excludes loopback, private, link-local and non-unicast destinations.
func publicAddress(addr netip.Addr) bool {
	addr = addr.Unmap()
	return addr.IsGlobalUnicast() && !addr.IsPrivate() && !addr.IsLoopback() && !addr.IsLinkLocalUnicast() && !netip.MustParsePrefix("100.64.0.0/10").Contains(addr)
}

// Fetch validates every dial address and applies the timeout through body consumption.
func Fetch(ctx context.Context, policy Policy, rawURL string, headers map[string]string) (*Fetched, error) {
	u, err := normalize(rawURL)
	if err != nil {
		return nil, err
	}
	allow := policy.AllowAddress
	if allow == nil {
		allow = publicAddress
	}
	ctx, cancel := context.WithTimeout(ctx, policy.Timeout)
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.DisableCompression = true
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		addresses, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
		if err != nil {
			return nil, err
		}
		for _, addr := range addresses {
			if !allow(addr) {
				return nil, ErrPrivateAddress
			}
		}
		var dialErr error
		for _, addr := range addresses {
			conn, err := (&net.Dialer{}).DialContext(ctx, network, net.JoinHostPort(addr.String(), port))
			if err == nil {
				return conn, nil
			}
			dialErr = err
		}
		return nil, dialErr
	}
	client := &http.Client{Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return ErrRedirect }}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		cancel()
		return nil, err
	}
	req.Header.Set("User-Agent", "")
	for name, value := range headers {
		req.Header.Set(name, value)
	}
	req.Header.Set("Accept-Encoding", "identity")
	response, err := client.Do(req)
	if err != nil {
		cancel()
		transport.CloseIdleConnections()
		if errors.Is(err, context.DeadlineExceeded) {
			return nil, ErrTimeout
		}
		return nil, err
	}
	closeResponse := func() { response.Body.Close(); cancel(); transport.CloseIdleConnections() }
	if response.StatusCode >= 300 && response.StatusCode < 400 {
		closeResponse()
		return nil, ErrRedirect
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		data, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		closeResponse()
		excerpt := scrubExcerpt(string(data), headers)
		return nil, &StatusError{Status: response.StatusCode, Host: u.Hostname(), Excerpt: excerpt}
	}
	if response.ContentLength > policy.MaxBytes {
		closeResponse()
		return nil, ErrTooLarge
	}
	return &Fetched{Body: &boundedBody{body: response.Body, remaining: policy.MaxBytes, cancel: cancel, transport: transport}, ETag: response.Header.Get("ETag"), LastModified: response.Header.Get("Last-Modified")}, nil
}

type boundedBody struct {
	body      io.ReadCloser
	remaining int64
	cancel    context.CancelFunc
	transport *http.Transport
}

// Read probes one byte beyond the cap without returning excess data to the caller.
func (b *boundedBody) Read(p []byte) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}
	if b.remaining == 0 {
		var probe [1]byte
		n, err := b.body.Read(probe[:])
		if n > 0 {
			return 0, ErrTooLarge
		}
		if errors.Is(err, context.DeadlineExceeded) {
			err = ErrTimeout
		}
		return 0, err
	}
	if int64(len(p)) > b.remaining {
		p = p[:b.remaining]
	}
	n, err := b.body.Read(p)
	b.remaining -= int64(n)
	if errors.Is(err, context.DeadlineExceeded) {
		err = ErrTimeout
	}
	return n, err
}
func (b *boundedBody) Close() error {
	err := b.body.Close()
	b.cancel()
	b.transport.CloseIdleConnections()
	return err
}

// scrubExcerpt masks overlapping values and secret prefixes cut by the bounded body read.
func scrubExcerpt(body string, headers map[string]string) string {
	masked := make([]bool, len(body))
	for _, value := range headers {
		// Empty values are valid headers and have no credential bytes to remove.
		if value == "" {
			continue
		}
		for start := 0; start < len(body); {
			offset := strings.Index(body[start:], value)
			if offset < 0 {
				break
			}
			begin := start + offset
			for i := begin; i < begin+len(value); i++ {
				masked[i] = true
			}
			start = begin + 1
		}
		// A bounded read can end within a value, leaving only its prefix in the response.
		for begin := max(0, len(body)-len(value)+1); begin < len(body); begin++ {
			if strings.HasPrefix(value, body[begin:]) {
				for i := begin; i < len(body); i++ {
					masked[i] = true
				}
			}
		}
	}
	var excerpt strings.Builder
	for i := 0; i < len(body); {
		if masked[i] {
			excerpt.WriteString("[redacted]")
			for i < len(body) && masked[i] {
				i++
			}
		} else {
			excerpt.WriteByte(body[i])
			i++
		}
	}
	runes := []rune(excerpt.String())
	return string(runes[:min(len(runes), 119)])
}
