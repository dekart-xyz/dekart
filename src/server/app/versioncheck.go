package app

import (
	"dekart/src/server/dekart"
	"encoding/json"
	"io"
	"net/http"
	"net/netip"
	"strings"
	"time"

	"github.com/Masterminds/semver/v3"
	"github.com/gorilla/mux"
	"github.com/rs/zerolog/log"
)

type githubRelease struct {
	TagName    string `json:"tag_name"`
	HTMLURL    string `json:"html_url"`
	Draft      bool   `json:"draft"`
	Prerelease bool   `json:"prerelease"`
}

func parseVersion(version string) (*semver.Version, bool) {
	v := strings.TrimSpace(version)
	v = strings.TrimPrefix(v, "v")
	parsed, err := semver.StrictNewVersion(v)
	if err != nil {
		return nil, false
	}
	return parsed, true
}

func latestCompatibleRelease(currentVersion string) (*githubRelease, error) {
	current, ok := parseVersion(currentVersion)
	if !ok {
		current = semver.MustParse("0.0.0")
	}

	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequest("GET", "https://api.github.com/repos/dekart-xyz/dekart/releases", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, nil
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var releases []githubRelease
	if err := json.Unmarshal(body, &releases); err != nil {
		return nil, err
	}

	for i := range releases {
		release := releases[i]
		if release.Draft || release.Prerelease {
			continue
		}
		releaseVersion, ok := parseVersion(release.TagName)
		if !ok {
			continue
		}
		if releaseVersion.GreaterThan(current) {
			return &release, nil
		}
	}
	return nil, nil
}

func setVersionCheckHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")
}

func handleVersionCheck(dekartServer *dekart.Server, w http.ResponseWriter, r *http.Request) {
	setVersionCheckHeaders(w)
	if r.Method == http.MethodOptions {
		return
	}
	currentVersion := strings.TrimSpace(r.URL.Query().Get("current_version"))
	appDomain := strings.TrimSpace(r.URL.Query().Get("app_domain"))
	latestVersion := ""
	outcome := "no_update"
	defer func() {
		if dekartServer != nil {
			dekartServer.TrackVersionCheck(
				r.Context(),
				appDomain,
				r.URL.Query().Get("instance_id"),
				currentVersion,
				latestVersion,
				outcome,
			)
		}
	}()

	release, err := latestCompatibleRelease(currentVersion)
	if err != nil {
		// Silent failure for client: don't surface as UI error.
		log.Warn().Err(err).Str("app_domain", appDomain).Str("current_version", currentVersion).Msg("Version check failed")
		outcome = "error"
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if release == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	latestVersion = release.TagName
	outcome = "update_available"
	if err := json.NewEncoder(w).Encode(release); err != nil {
		log.Warn().Err(err).Str("app_domain", appDomain).Msg("Failed to encode version response")
		outcome = "encode_error"
		w.WriteHeader(http.StatusNoContent)
	}
}

// getSourceIP extracts best-effort source IP from proxy headers or remote address.
func getSourceIP(r *http.Request) string {
	forwardedFor := strings.TrimSpace(r.Header.Get("X-Forwarded-For"))
	if forwardedFor != "" {
		first := strings.TrimSpace(strings.Split(forwardedFor, ",")[0])
		if first != "" {
			return first
		}
	}
	if appEngineIP := strings.TrimSpace(r.Header.Get("X-Appengine-User-Ip")); appEngineIP != "" {
		return appEngineIP
	}
	if realIP := strings.TrimSpace(r.Header.Get("X-Real-Ip")); realIP != "" {
		return realIP
	}
	remote := strings.TrimSpace(r.RemoteAddr)
	if remote == "" {
		return ""
	}
	if addr, err := netip.ParseAddrPort(remote); err == nil {
		return addr.Addr().String()
	}
	if addr, err := netip.ParseAddr(remote); err == nil {
		return addr.String()
	}
	return remote
}

func handleCLIVersionCheck(dekartServer *dekart.Server, w http.ResponseWriter, r *http.Request) {
	setVersionCheckHeaders(w)
	if r.Method == http.MethodOptions {
		return
	}
	cliName := strings.TrimSpace(mux.Vars(r)["cli_name"])
	outcome := "ok"
	defer func() {
		if dekartServer != nil {
			dekartServer.TrackCLIVersionCheck(
				r.Context(),
				cliName,
				r.URL.Query().Get("installation_id"),
				getSourceIP(r),
				strings.TrimSpace(r.UserAgent()),
				outcome,
			)
		}
	}()
	if cliName == "" {
		outcome = "invalid_cli_name"
		http.Error(w, "cli_name is required", http.StatusBadRequest)
		return
	}
	if err := json.NewEncoder(w).Encode(map[string]bool{"ok": true}); err != nil {
		outcome = "encode_error"
		w.WriteHeader(http.StatusNoContent)
	}
}
