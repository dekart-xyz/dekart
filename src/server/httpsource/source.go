// Package httpsource resolves workspace-approved HTTPS URLs and streams bounded responses.
package httpsource

import (
	"fmt"
	"net"
	"net/url"
	"path"
	"strings"

	"golang.org/x/net/idna"
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
		prefix := base.Path
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
