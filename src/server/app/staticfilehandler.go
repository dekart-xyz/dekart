package app

import (
	"bytes"
	"context"
	"dekart/src/server/dekart"
	"embed"
	"fmt"
	"html/template"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/rs/zerolog/log"
)

// StaticFilesHandler implements http.Handler interface
type StaticFilesHandler struct {
	staticPath       string
	indexFileBuffer  []byte
	indexFileModTime time.Time
	dekartServer     *dekart.Server
}

var (
	customCodeRe = regexp.MustCompile(`<!--\s*%CUSTOM_CODE%\s*-->`)
	reportMetaRe = regexp.MustCompile(`<!--\s*%REPORT_META%\s*-->`)

	//go:embed templates/*
	templateFS embed.FS

	publicReportMetaTemplate = template.Must(
		template.New("public_report_meta.html").
			ParseFS(templateFS, "templates/public_report_meta.html"),
	)
)

type publicReportMetaData struct {
	Title            string
	URL              string
	ImageURL         string
	HasSocialPreview bool
}

// NewStaticFilesHandler creates a new StaticFilesHandler
func NewStaticFilesHandler(staticPath string, dekartServer *dekart.Server) StaticFilesHandler {
	fs := http.Dir(staticPath)
	indexFile, err := fs.Open("./index.html")
	if err != nil {
		log.Fatal().Str("DEKART_STATIC_FILES", staticPath).Err(err).Msg("Failed to open index.html file")
	}
	defer indexFile.Close()
	stat, err := indexFile.Stat()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to get index.html file info")
	}
	template := make([]byte, stat.Size())
	_, err = indexFile.Read(template)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to read index.html file")
	}
	indexFileBuffer := customCodeRe.ReplaceAll(template, []byte(os.Getenv("DEKART_HTML_CUSTOM_CODE")))

	staticFilesHandler := StaticFilesHandler{
		staticPath:       staticPath,
		indexFileBuffer:  indexFileBuffer,
		indexFileModTime: time.Now(),
		dekartServer:     dekartServer,
	}
	return staticFilesHandler
}

// ServeHTTP implementation for reading static files from build folder
func (h StaticFilesHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := filepath.Clean(r.URL.Path)
	path = filepath.Join(h.staticPath, path)
	_, err := os.Stat(path)
	if os.IsNotExist(err) {
		h.ServeIndex(ResponseWriter{w: w, statusCode: http.StatusNotFound}, r)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	http.FileServer(http.Dir(h.staticPath)).ServeHTTP(w, r)
}

// ServeIndex serves index.html
func (h StaticFilesHandler) ServeIndex(w http.ResponseWriter, r *http.Request) {
	// Set caching headers for index.html
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate") // Prevent caching
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	// Check if this is a public report route and inject meta tags
	htmlContent := h.indexFileBuffer
	vars := mux.Vars(r)
	if reportID, ok := vars["id"]; ok {
		// Validate it's a valid UUID
		if _, err := uuid.Parse(reportID); err == nil {
			enhancedHTML, err := h.injectPublicReportMetaTags(r.Context(), r, reportID)
			if err != nil {
				log.Err(err).Str("reportID", reportID).Msg("Failed to inject meta tags for public report")
				// On error, inject default title
				htmlContent = []byte(h.injectDefaultTitle(string(htmlContent)))
			} else if enhancedHTML != nil {
				htmlContent = enhancedHTML
			} else {
				// Not a public report, inject default title
				htmlContent = []byte(h.injectDefaultTitle(string(htmlContent)))
			}
		} else {
			// Invalid report ID, inject default title
			htmlContent = []byte(h.injectDefaultTitle(string(htmlContent)))
		}
	} else {
		// Not a report route, inject default title
		htmlContent = []byte(h.injectDefaultTitle(string(htmlContent)))
	}

	http.ServeContent(w, r, "index.html", h.indexFileModTime, bytes.NewReader(htmlContent))
}

// injectPublicReportMetaTags injects meta tags for public reports
func (h StaticFilesHandler) injectPublicReportMetaTags(ctx context.Context, r *http.Request, reportID string) ([]byte, error) {
	// Get public report metadata
	metadata, err := h.dekartServer.GetPublicReportMetadata(ctx, reportID)
	if err != nil {
		return nil, err
	}
	if metadata == nil {
		// Not a public report, return nil to use default HTML
		return nil, nil
	}

	// Always inject title, conditionally add social preview tags if DEKART_APP_URL is configured
	appURL := strings.TrimRight(os.Getenv("DEKART_APP_URL"), "/")
	hasSocialPreview := appURL != ""

	var mapPreviewURL, reportURL string
	if hasSocialPreview {
		// Use absolute paths for meta tags (required for Open Graph and Twitter Cards)
		mapPreviewURL = fmt.Sprintf("%s/map-preview/%s.png", appURL, reportID)
		reportURL = fmt.Sprintf("%s%s", appURL, r.URL.Path)
	}

	// Build meta tags using template
	templateData := publicReportMetaData{
		Title:            metadata.Title,
		URL:              reportURL,
		ImageURL:         mapPreviewURL,
		HasSocialPreview: hasSocialPreview,
	}
	var metaTagsBuffer bytes.Buffer
	if err := publicReportMetaTemplate.Execute(&metaTagsBuffer, templateData); err != nil {
		return nil, fmt.Errorf("render meta tags template: %w", err)
	}
	metaTags := metaTagsBuffer.String()

	// Replace the placeholder comment with meta tags (same approach as %CUSTOM_CODE%)
	htmlContent := string(h.indexFileBuffer)
	htmlContent = reportMetaRe.ReplaceAllString(htmlContent, metaTags)

	return []byte(htmlContent), nil
}

// injectDefaultTitle injects the default "Dekart" title for non-public reports
func (h StaticFilesHandler) injectDefaultTitle(htmlContent string) string {
	defaultTitle := `<title>Dekart</title>`
	return reportMetaRe.ReplaceAllString(htmlContent, defaultTitle)
}
