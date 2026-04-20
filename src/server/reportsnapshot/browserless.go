package reportsnapshot

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"strings"
	"time"
)

const defaultBrowserlessURL = "https://production-sfo.browserless.io/screenshot"

// IsEnabled returns true when snapshot feature has required Browserless auth token configured.
func IsEnabled() bool {
	return strings.TrimSpace(os.Getenv("DEKART_BROWSERLESS_TOKEN")) != ""
}

type screenshotRequest struct {
	URL      string `json:"url"`
	Viewport struct {
		Width             int32   `json:"width"`
		Height            int32   `json:"height"`
		DeviceScaleFactor float64 `json:"deviceScaleFactor"`
	} `json:"viewport"`
	WaitForFunction struct {
		Fn      string `json:"fn"`
		Timeout int32  `json:"timeout"`
	} `json:"waitForFunction"`
	Options struct {
		FullPage bool `json:"fullPage"`
	} `json:"options"`
}

// StreamImage requests a screenshot from Browserless and streams response bytes to HTTP response writer.
func StreamImage(ctx context.Context, targetURL string, snapshotToken string, width, height int32, deviceScaleFactor float64, timeoutSeconds int32, w http.ResponseWriter) error {
	if !IsEnabled() {
		return fmt.Errorf("snapshot feature is disabled: DEKART_BROWSERLESS_TOKEN is not configured")
	}
	browserlessURL, err := resolveBrowserlessURL()
	if err != nil {
		return err
	}
	request := screenshotRequest{
		URL: targetURL,
	}
	request.Options.FullPage = false
	request.Viewport.Width = width
	request.Viewport.Height = height
	request.Viewport.DeviceScaleFactor = deviceScaleFactor
	request.WaitForFunction.Fn = snapshotReadyFunction(snapshotToken)
	request.WaitForFunction.Timeout = timeoutMillis(timeoutSeconds)
	payload, err := json.Marshal(request)
	if err != nil {
		return err
	}
	deadline := 30 * time.Second
	if timeoutSeconds > 0 {
		deadline = time.Duration(timeoutSeconds) * time.Second
	}
	callCtx, cancel := context.WithTimeout(ctx, deadline)
	defer cancel()
	httpRequest, err := http.NewRequestWithContext(callCtx, http.MethodPost, browserlessURL, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	response, err := http.DefaultClient.Do(httpRequest)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 1024))
		return fmt.Errorf("browserless failed status=%d body=%s", response.StatusCode, strings.TrimSpace(string(body)))
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	if _, err := io.Copy(w, response.Body); err != nil {
		return err
	}
	return nil
}

// snapshotReadyFunction returns Browserless wait expression for token-scoped snapshot readiness.
func snapshotReadyFunction(snapshotToken string) string {
	return fmt.Sprintf("window.__dekartSnapshotReadyToken === '%s'", snapshotToken)
}

// timeoutMillis converts capture timeout seconds to milliseconds for Browserless wait options.
func timeoutMillis(timeoutSeconds int32) int32 {
	if timeoutSeconds <= 0 {
		return 30000
	}
	return timeoutSeconds * 1000
}

// resolveBrowserlessURL returns configured Browserless endpoint or sane local default.
func resolveBrowserlessURL() (string, error) {
	baseURL := strings.TrimSpace(os.Getenv("DEKART_BROWSERLESS_URL"))
	if baseURL == "" {
		baseURL = defaultBrowserlessURL
	}
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("invalid browserless url")
	}
	if parsed.Path == "" || parsed.Path == "/" {
		parsed.Path = path.Join(parsed.Path, "screenshot")
	}
	if token := strings.TrimSpace(os.Getenv("DEKART_BROWSERLESS_TOKEN")); token != "" {
		query := parsed.Query()
		query.Set("token", token)
		parsed.RawQuery = query.Encode()
	}
	return parsed.String(), nil
}
