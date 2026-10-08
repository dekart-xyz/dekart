package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/httpsource"
	"dekart/src/server/secrets"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/gorilla/mux"
	"io"
	"net/http"
	"net/url"
	"time"
)

// findHTTPSource limits download identities to jobs owned by the requested dataset.
func (s Server) findHTTPSource(ctx context.Context, datasetID, sourceID string) (*proto.HTTPSourceRevision, error) {
	rows, err := s.db.QueryContext(ctx, `select qj.http_sources from query_jobs qj join datasets d on d.query_id=qj.query_id where d.id=$1`, datasetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var sources []*proto.HTTPSourceRevision
		if err := json.Unmarshal([]byte(raw), &sources); err != nil {
			return nil, err
		}
		for _, source := range sources {
			if source.SourceId == sourceID {
				return source, nil
			}
		}
	}
	return nil, rows.Err()
}

// serveHTTPSource decrypts credentials only after the report and job ownership checks.
func (s Server) serveHTTPSource(w http.ResponseWriter, r *http.Request, source *proto.HTTPSourceRevision, extension string) {
	if extension != source.Extension {
		http.Error(w, "source not found", http.StatusNotFound)
		return
	}
	var name, encrypted, baseURL string
	err := s.db.QueryRowContext(r.Context(), `select c.connection_name,c.http_headers_json_encrypted,c.http_base_url from connections c
 join reports report on report.workspace_id=c.workspace_id join datasets d on d.report_id=report.id
 where d.id=$1 and c.id=$2 and c.connection_type=$3 and c.archived=false`, mux.Vars(r)["dataset"], source.ConnectionId, proto.ConnectionType_CONNECTION_TYPE_HTTP).Scan(&name, &encrypted, &baseURL)
	if err == sql.ErrNoRows {
		http.Error(w, "source not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "HTTP source could not be loaded", http.StatusInternalServerError)
		return
	}
	headers := map[string]string{}
	if encrypted != "" {
		raw, err := secrets.ServerDecrypt(encrypted)
		if err != nil || json.Unmarshal([]byte(raw), &headers) != nil {
			http.Error(w, "HTTP source headers could not be read", http.StatusInternalServerError)
			return
		}
	}
	headerNames := make([]string, 0, len(headers))
	for name := range headers {
		headerNames = append(headerNames, name)
	}
	// A saved job may predate a base or credential change; never send new headers to its old API.
	sources := []httpsource.Source{{ID: source.ConnectionId, BaseURL: baseURL, HeaderNames: headerNames}}
	params, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		http.Error(w, "source not found", http.StatusNotFound)
		return
	}
	submitted, hasURL := params["url"]
	fetchURL := source.Url
	// Only computed sources accept exactly one resolved URL.
	if source.UrlSql != "" {
		if !hasURL || len(submitted) != 1 {
			http.Error(w, "source not found", http.StatusNotFound)
			return
		}
		template, templateErr := httpsource.ParseTemplate(source.UrlTemplate, sources)
		if templateErr != nil {
			http.Error(w, "source not found", http.StatusNotFound)
			return
		}
		fetchURL, err = template.Match(submitted[0])
	} else {
		if hasURL {
			http.Error(w, "source not found", http.StatusNotFound)
			return
		}
		var match httpsource.Match
		match, err = httpsource.Resolve(source.Url, sources)
		fetchURL = match.URL
	}
	if err != nil {
		http.Error(w, "source not found", http.StatusNotFound)
		return
	}
	fetched, err := httpsource.Fetch(r.Context(), httpsource.Policy{MaxBytes: 100 * 1024 * 1024, Timeout: 60 * time.Second}, fetchURL, headers)
	if err != nil {
		http.Error(w, httpSourceError(name, fetchURL, err), http.StatusBadGateway)
		return
	}
	defer fetched.Body.Close()
	w.Header().Set("Cache-Control", "private, max-age=3600")
	if fetched.ETag != "" {
		w.Header().Set("ETag", fetched.ETag)
	}
	if fetched.LastModified != "" {
		w.Header().Set("Last-Modified", fetched.LastModified)
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	if _, err := io.Copy(w, fetched.Body); err != nil {
		// Abort the response so a partial upstream file cannot look like a successful download.
		panic(http.ErrAbortHandler)
	}
}

// httpSourceError includes source context without exposing transport details or credentials.
func httpSourceError(name, rawURL string, err error) string {
	u, _ := url.Parse(rawURL)
	host := u.Hostname()
	prefix := fmt.Sprintf("HTTP source %q: %s", name, host)
	var status *httpsource.StatusError
	switch {
	case errors.As(err, &status):
		return fmt.Sprintf("HTTP source %q: %s", name, status.Error())
	case errors.Is(err, httpsource.ErrRedirect):
		return prefix + " redirected; redirects are not followed."
	case errors.Is(err, httpsource.ErrPrivateAddress):
		return prefix + " resolves to a private address."
	case errors.Is(err, httpsource.ErrTimeout):
		return prefix + " timed out after 60 s."
	case errors.Is(err, httpsource.ErrTooLarge):
		return host + u.Path + " exceeds the limit; HTTP sources are limited to 100 MB per file."
	default:
		return prefix + " could not be fetched."
	}
}
