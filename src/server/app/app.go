package app

import (
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/dekart"
	"dekart/src/server/user"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/improbable-eng/grpc-web/go/grpcweb"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
)

// ResponseWriter implementation which allows to override status code
type ResponseWriter struct {
	w          http.ResponseWriter
	statusCode int
}

// Header implementation
func (m ResponseWriter) Header() http.Header {
	return m.w.Header()
}

// Write implementation
func (m ResponseWriter) Write(b []byte) (int, error) {
	return m.w.Write(b)
}

// WriteHeader overrides statusOk with configured header
func (m ResponseWriter) WriteHeader(statusCode int) {
	if statusCode != http.StatusOK {
		log.Warn().Int("statusCode", statusCode).Msg("Status code is not OK")
		m.w.WriteHeader(statusCode)
	} else {
		m.w.WriteHeader(m.statusCode)
	}
}

var allowedOrigin string = os.Getenv("DEKART_CORS_ORIGIN")

func getAllowedOrigin(origin string) string {
	if matchOrigin(origin) {
		return origin
	}
	return "null"
}

func matchOrigin(origin string) bool {
	if allowedOrigin == "" || allowedOrigin == "*" {
		log.Warn().Msg("DEKART_CORS_ORIGIN is empty or *")
		return true
	}
	//check if allowedOrigin contains wildcard using strings.Contains
	if strings.Contains(allowedOrigin, "*") {
		regexPattern := strings.ReplaceAll(allowedOrigin, "*", ".*")
		match, err := regexp.MatchString(regexPattern, origin)
		if err != nil {
			log.Error().Err(err).Msg("failed to match origin")
			return false
		}
		return match
	}

	result := origin == allowedOrigin
	if !result {
		log.Warn().Str("origin", origin).Str("allowedOrigin", allowedOrigin).Msg("Origin is not allowed")
	}
	return result
}

func configureGRPC(dekartServer *dekart.Server) *grpcweb.WrappedGrpcServer {
	server := grpc.NewServer()
	proto.RegisterDekartServer(server, dekartServer)
	if allowedOrigin == "" || allowedOrigin == "null" {
		log.Info().Msg("CORS is disabled")
		return grpcweb.WrapServer(server)
	}
	return grpcweb.WrapServer(
		server,
		grpcweb.WithOriginFunc(func(origin string) bool {
			return matchOrigin(origin)
		}),
	)
}

func setOriginHeader(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", getAllowedOrigin(r.Header.Get("Origin")))
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, X-Dekart-Playground, X-Dekart-Claim-Email, X-Dekart-Report-Id, X-Dekart-Logged-In, X-Dekart-Workspace-Id")
	w.Header().Set("Access-Control-Allow-Credentials", "true")
}

func configureHTTP(dekartServer *dekart.Server, claimsCheck user.ClaimsCheck) *mux.Router {
	router := mux.NewRouter()
	api := router.PathPrefix("/api/v1/").Subrouter()
	api.HandleFunc("/dataset-source/{dataset}/{source}.{extension:csv|geojson|parquet}", func(w http.ResponseWriter, r *http.Request) {
		setOriginHeader(w, r)
		if r.Method == http.MethodOptions {
			return
		}
		dekartServer.ServeDatasetSource(w, r)
	}).Methods("GET", "OPTIONS")

	api.HandleFunc("/report/{report}/analytics.csv", func(w http.ResponseWriter, r *http.Request) {
		setOriginHeader(w, r)
		if r.Method == http.MethodOptions {
			return
		}
		dekartServer.ServeReportAnalytics(w, r)
	}).Methods("GET", "OPTIONS")

	api.HandleFunc("/query-source/{query}/{source}.sql", func(w http.ResponseWriter, r *http.Request) {
		setOriginHeader(w, r)
		if r.Method == http.MethodOptions {
			return
		}
		dekartServer.ServeQuerySource(w, r)
	}).Methods("GET", "OPTIONS")

	api.HandleFunc("/file/{id}/upload-sessions", func(w http.ResponseWriter, r *http.Request) {
		setOriginHeader(w, r)
		if r.Method == http.MethodOptions {
			return
		}
		dekartServer.HandleStartFileUploadSession(w, r)
	}).Methods("POST", "OPTIONS")
	api.HandleFunc("/file/{id}/upload-sessions/{session_id}/parts/{part_number}", func(w http.ResponseWriter, r *http.Request) {
		setOriginHeader(w, r)
		if r.Method == http.MethodOptions {
			return
		}
		dekartServer.HandleGetFileUploadPart(w, r)
	}).Methods("POST", "OPTIONS")
	api.HandleFunc("/file/{id}/upload-sessions/{session_id}/complete", func(w http.ResponseWriter, r *http.Request) {
		setOriginHeader(w, r)
		if r.Method == http.MethodOptions {
			return
		}
		dekartServer.HandleCompleteFileUploadSession(w, r)
	}).Methods("POST", "OPTIONS")
	api.HandleFunc("/file/{id}/upload-sessions/{session_id}", func(w http.ResponseWriter, r *http.Request) {
		setOriginHeader(w, r)
		if r.Method == http.MethodOptions {
			return
		}
		dekartServer.HandleAbortFileUploadSession(w, r)
	}).Methods("DELETE", "OPTIONS")
	api.HandleFunc("/version", func(w http.ResponseWriter, r *http.Request) {
		handleVersionCheck(dekartServer, w, r)
	}).Methods("GET", "OPTIONS")
	api.HandleFunc("/device", func(w http.ResponseWriter, r *http.Request) {
		setOriginHeaderIfExists(w, r)
		if r.Method == http.MethodOptions {
			return
		}
		dekartServer.HandleDeviceStart(w, r)
	}).Methods("POST", "OPTIONS")
	api.HandleFunc("/device/token", func(w http.ResponseWriter, r *http.Request) {
		setOriginHeaderIfExists(w, r)
		if r.Method == http.MethodOptions {
			return
		}
		dekartServer.HandleDeviceToken(w, r)
	}).Methods("POST", "OPTIONS")

	if claimsCheck.RequireGoogleOAuth {
		api.HandleFunc("/authenticate", func(w http.ResponseWriter, r *http.Request) {
			setOriginHeader(w, r)
			if r.Method == http.MethodOptions {
				return
			}
			claimsCheck.Authenticate(w, r)
		}).Methods("GET", "OPTIONS")
	}
	api.Use(mux.CORSMethodMiddleware(router))

	// Health check
	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}).Methods("GET")

	// Serve map preview
	router.HandleFunc("/map-preview/{report}.png", func(w http.ResponseWriter, r *http.Request) {
		setOriginHeader(w, r)
		if r.Method == http.MethodOptions {
			return
		}
		dekartServer.ServeMapPreview(w, r)
	}).Methods("GET", "OPTIONS")
	// Serve static files
	staticPath := os.Getenv("DEKART_STATIC_FILES")
	if staticPath != "" {
		staticFilesHandler := NewStaticFilesHandler(staticPath, dekartServer)

		router.HandleFunc("/", staticFilesHandler.ServeIndex)
		router.HandleFunc("/shared", staticFilesHandler.ServeIndex)
		router.HandleFunc("/connections", staticFilesHandler.ServeIndex)
		router.HandleFunc("/reports/{id}", staticFilesHandler.ServeIndex)
		router.HandleFunc("/reports/{id}/edit", staticFilesHandler.ServeIndex) // deprecated
		router.HandleFunc("/reports/{id}/source", staticFilesHandler.ServeIndex)
		router.HandleFunc("/workspace", staticFilesHandler.ServeIndex)
		router.HandleFunc("/workspace/create", staticFilesHandler.ServeIndex)
		router.HandleFunc("/workspace/join", staticFilesHandler.ServeIndex)
		router.HandleFunc("/workspace/plan", staticFilesHandler.ServeIndex)
		router.HandleFunc("/workspace/members", staticFilesHandler.ServeIndex)
		router.HandleFunc("/workspace/invite/{id}", staticFilesHandler.ServeIndex)
		router.HandleFunc("/device/authorize", staticFilesHandler.ServeIndex)
		router.HandleFunc("/playground", staticFilesHandler.ServeIndex)
		router.HandleFunc("/grant-scopes", staticFilesHandler.ServeIndex)
		router.HandleFunc("/400", func(w http.ResponseWriter, r *http.Request) {
			staticFilesHandler.ServeIndex(ResponseWriter{w: w, statusCode: http.StatusBadRequest}, r)
		})
		router.PathPrefix("/").Handler(staticFilesHandler)
	} else {
		log.Warn().Msg("DEKART_STATIC_FILES is empty; UI will not be served")
	}

	return router
}

// Configure HTTP server with http and grpc
func Configure(dekartServer *dekart.Server, db *sql.DB) *http.Server {
	claimsCheck := user.NewClaimsCheck(user.ClaimsCheckConfig{
		Audience:                os.Getenv("DEKART_IAP_JWT_AUD"),
		RequireIAP:              os.Getenv("DEKART_REQUIRE_IAP") == "1",
		RequireSnowflakeContext: os.Getenv("DEKART_REQUIRE_SNOWFLAKE_CONTEXT") == "1",
		RequireAmazonOIDC:       os.Getenv("DEKART_REQUIRE_AMAZON_OIDC") == "1",
		RequireOIDC:             os.Getenv("DEKART_REQUIRE_OIDC") == "1",
		RequireGoogleOAuth:      os.Getenv("DEKART_REQUIRE_GOOGLE_OAUTH") == "1",
		Region:                  os.Getenv("AWS_REGION"),
		DevClaimsEmail:          os.Getenv("DEKART_DEV_CLAIMS_EMAIL"),
		DevRefreshToken:         os.Getenv("DEKART_DEV_REFRESH_TOKEN"),
		GoogleOAuthClientId:     os.Getenv("DEKART_GOOGLE_OAUTH_CLIENT_ID"),
		GoogleOAuthSecret:       os.Getenv("DEKART_GOOGLE_OAUTH_SECRET"),
		OIDCJWKSURL:             os.Getenv("DEKART_OIDC_JWKS_URL"),
		OIDCIssuer:              os.Getenv("DEKART_OIDC_ISSUER"),
		OIDCAudience:            os.Getenv("DEKART_OIDC_AUDIENCE"),
	}, db)

	grpcServer := configureGRPC(dekartServer)
	httpServer := configureHTTP(dekartServer, claimsCheck)

	port := os.Getenv("DEKART_PORT")
	log.Info().Msgf("Starting dekart at :%s", port)
	return &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			reqWithClaims := r
			if r.Method != http.MethodOptions {
				reqWithClaims = r.WithContext(dekartServer.SetWorkspaceContext(claimsCheck.GetContext(r), r))
			}
			if grpcServer.IsAcceptableGrpcCorsRequest(r) || grpcServer.IsGrpcWebRequest(r) {
				grpcServer.ServeHTTP(w, reqWithClaims)
			} else {
				httpServer.ServeHTTP(w, reqWithClaims)
			}
		}),
		Addr:         ":" + port,
		WriteTimeout: 60 * time.Second,
		ReadTimeout:  60 * time.Second,
	}
}

// setOriginHeaderIfExists avoids CORS-origin warnings for clients that do not send Origin header.
func setOriginHeaderIfExists(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Origin") == "" {
		return
	}
	setOriginHeader(w, r)
}
