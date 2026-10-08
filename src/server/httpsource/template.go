package httpsource

import (
	"fmt"
	"net/url"
	"strings"
)

type Template struct {
	SourceID, URL string
	Placeholders  int
}

// ParseTemplate permits substitutions only for complete query values.
func ParseTemplate(raw string, sources []Source) (Template, error) {
	// Templates follow the same no-glob rule as constant reader URLs.
	if strings.ContainsAny(strings.SplitN(raw, "?", 2)[0], "*[]") {
		return Template{}, fmt.Errorf("HTTP source URL templates cannot contain globs")
	}
	match, err := Resolve(raw, sources)
	if err != nil {
		return Template{}, err
	}
	u, err := normalize(raw)
	if err != nil {
		return Template{}, err
	}
	params, err := url.ParseQuery(u.RawQuery)
	if err != nil {
		return Template{}, err
	}
	count := 0
	for key, values := range params {
		if len(values) != 1 || strings.ContainsAny(key, "{}") {
			return Template{}, fmt.Errorf("HTTP source templates require unique query keys and complete value placeholders")
		}
		if values[0] == "{}" {
			count++
		} else if strings.ContainsAny(values[0], "{}") {
			return Template{}, fmt.Errorf("HTTP source placeholders must be complete query values")
		}
	}
	// Raw braces outside complete query values and encoded placeholders are unsupported.
	if count == 0 || strings.Count(raw, "{}") != count || strings.Count(raw, "{") != count || strings.Count(raw, "}") != count {
		return Template{}, fmt.Errorf("HTTP source placeholders must be complete query values")
	}
	normalized := strings.ReplaceAll(strings.ReplaceAll(match.URL, "%7B", "{"), "%7D", "}")
	return Template{SourceID: match.SourceID, URL: normalized, Placeholders: count}, nil
}

// Match confines resolved values to the recorded template's origin, path and query keys.
func (t Template) Match(raw string) (string, error) {
	expected, err := normalize(t.URL)
	if err != nil {
		return "", err
	}
	actual, err := normalize(raw)
	if err != nil {
		return "", err
	}
	if expected.Scheme != actual.Scheme || expected.Host != actual.Host || expected.Path != actual.Path {
		return "", fmt.Errorf("HTTP source URL differs from its template")
	}
	fixed, err := url.ParseQuery(expected.RawQuery)
	if err != nil {
		return "", err
	}
	values, err := url.ParseQuery(actual.RawQuery)
	if err != nil {
		return "", err
	}
	if len(fixed) != len(values) {
		return "", fmt.Errorf("HTTP source URL query keys differ from its template")
	}
	for key, want := range fixed {
		got := values[key]
		if len(got) != 1 || (want[0] != "{}" && got[0] != want[0]) {
			return "", fmt.Errorf("HTTP source URL query values differ from its template")
		}
	}
	return actual.String(), nil
}
