package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/httpsource"
	"dekart/src/server/secrets"
	"dekart/src/server/user"
	"encoding/json"
	"net/url"
	"regexp"
	"strings"

	"golang.org/x/net/http/httpguts"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var httpHeaderName = regexp.MustCompile("^[!#$%&'*+.^_`|~0-9A-Za-z-]+$")

// validateHTTPConnection normalizes the base and validates decrypted headers before storage.
func validateHTTPConnection(ctx context.Context, connection *proto.Connection) error {
	// Existing connections may change metadata, but saved header maps are immutable.
	if connection.Id != "" && connection.HttpHeadersJson != nil {
		return status.Error(codes.InvalidArgument, "HTTP source headers cannot be edited after saving")
	}
	match, err := httpsource.Resolve(connection.HttpBaseUrl, []httpsource.Source{{ID: connection.Id, BaseURL: connection.HttpBaseUrl}})
	if err != nil {
		return status.Error(codes.InvalidArgument, err.Error())
	}
	base, _ := url.Parse(match.URL)
	// A base is an origin/path prefix; query strings cannot constrain source matching.
	if base.RawQuery != "" {
		return status.Error(codes.InvalidArgument, "HTTP source base URL cannot contain query parameters")
	}
	connection.HttpBaseUrl = match.URL
	if connection.HttpDocsUrl != "" {
		docs, err := url.Parse(connection.HttpDocsUrl)
		if err != nil || (docs.Scheme != "https" && docs.Scheme != "http") || docs.Host == "" {
			return status.Error(codes.InvalidArgument, "HTTP source docs URL must be an HTTP or HTTPS URL")
		}
	}
	// An omitted secret preserves the saved map on update.
	if connection.HttpHeadersJson == nil {
		return nil
	}
	raw := secrets.SecretToString(connection.HttpHeadersJson, user.GetClaims(ctx))
	var headers map[string]string
	if json.Unmarshal([]byte(raw), &headers) != nil || headers == nil {
		return status.Error(codes.InvalidArgument, "HTTP source headers must be a JSON object of header names and values")
	}
	seen := map[string]bool{}
	for name, value := range headers {
		lower := strings.ToLower(name)
		if !httpHeaderName.MatchString(name) || !httpguts.ValidHeaderFieldValue(value) || seen[lower] || lower == "host" || lower == "content-length" || lower == "accept-encoding" {
			return status.Error(codes.InvalidArgument, "HTTP source headers contain an invalid, duplicate or reserved name or value")
		}
		seen[lower] = true
	}
	return nil
}

// loadHTTPConnection reads the encrypted map only for HTTP connections.
func (s Server) loadHTTPConnection(ctx context.Context, connection *proto.Connection, client bool) error {
	var encrypted string
	err := s.db.QueryRowContext(ctx, `select http_base_url,http_docs_url,http_headers_json_encrypted from connections where id=$1`, connection.Id).Scan(&connection.HttpBaseUrl, &connection.HttpDocsUrl, &encrypted)
	if err != nil {
		return err
	}
	if client {
		connection.HttpHeadersJson = nil
	} else {
		connection.HttpHeadersJson = &proto.Secret{ServerEncrypted: encrypted}
	}
	return nil
}

// loadHTTPSourcesTx reads a report workspace's approved bases once for compilation.
func loadHTTPSourcesTx(ctx context.Context, tx *sql.Tx, reportID string) ([]httpsource.Source, map[string]string, error) {
	rows, err := tx.QueryContext(ctx, `select c.id,c.http_base_url,c.http_headers_json_encrypted,c.connection_name from connections c
 join reports r on r.workspace_id=c.workspace_id where r.id=$1 and c.archived=false and c.connection_type=$2 order by c.id`, reportID, proto.ConnectionType_CONNECTION_TYPE_HTTP)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	var sources []httpsource.Source
	names := map[string]string{}
	for rows.Next() {
		var source httpsource.Source
		var encrypted, name string
		if err := rows.Scan(&source.ID, &source.BaseURL, &encrypted, &name); err != nil {
			return nil, nil, err
		}
		if encrypted != "" {
			raw, err := secrets.ServerDecrypt(encrypted)
			if err != nil {
				return nil, nil, err
			}
			var headers map[string]string
			if err := json.Unmarshal([]byte(raw), &headers); err != nil {
				return nil, nil, err
			}
			for name := range headers {
				source.HeaderNames = append(source.HeaderNames, name)
			}
		}
		names[source.ID] = name
		sources = append(sources, source)
	}
	return sources, names, rows.Err()
}
