package http

import (
	"dekart/src/proto"
	"dekart/src/server/dekart"
	"dekart/src/server/user"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gorilla/mux"
	"github.com/improbable-eng/grpc-web/go/grpcweb"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
)

// ResponseWriter implementation which allows to oweride status code
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
		log.Warn().Int("statusCode", statusCode).Send()
		m.w.WriteHeader(statusCode)
	} else {
		m.w.WriteHeader(m.statusCode)
	}
}

type StaticFilesHandler struct {
	staticPath string
}

//ServeHTTP implementation for reading static files from build folder
func (h StaticFilesHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {

	path, err := filepath.Abs(r.URL.Path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	path = filepath.Join(h.staticPath, path)
	_, err = os.Stat(path)
	if os.IsNotExist(err) {
		h.ServeIndex(ResponseWriter{w: w, statusCode: http.StatusNotFound}, r)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	http.FileServer(http.Dir(h.staticPath)).ServeHTTP(w, r)
}

//ServeIndex serves index.html
func (h StaticFilesHandler) ServeIndex(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, filepath.Join(h.staticPath, "./index.html"))
}

func configureGRPC(dekartServer *dekart.Server) *grpcweb.WrappedGrpcServer {
	server := grpc.NewServer()
	proto.RegisterDekartServer(server, dekartServer)
	return grpcweb.WrapServer(
		server,
		grpcweb.WithOriginFunc(func(origin string) bool {
			//TODO check origin
			return true
		}),
	)
}

func configureHTTP(dekartServer *dekart.Server) *mux.Router {
	router := mux.NewRouter()
	api := router.PathPrefix("/api/v1/").Subrouter()
	api.Use(mux.CORSMethodMiddleware(router))
	api.HandleFunc("/job-results/{id}.csv", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method == http.MethodOptions {
			return
		}
		dekartServer.ServeQueryResult(w, r)
	}).Methods("GET", "OPTIONS")

	staticFilesHandler := StaticFilesHandler{
		staticPath: os.Getenv("DEKART_STATIC_FILES"),
	}

	router.HandleFunc("/", staticFilesHandler.ServeIndex)
	router.HandleFunc("/reports/{id}", staticFilesHandler.ServeIndex)
	router.HandleFunc("/reports/{id}/edit", staticFilesHandler.ServeIndex)
	router.HandleFunc("/400", func(w http.ResponseWriter, r *http.Request) {
		staticFilesHandler.ServeIndex(ResponseWriter{w: w, statusCode: http.StatusBadRequest}, r)
	})

	router.PathPrefix("/").Handler(staticFilesHandler)
	return router
}

// Configure HTTP server with http and grpc
func Configure(dekartServer *dekart.Server) *http.Server {
	grpcServer := configureGRPC(dekartServer)
	httpServer := configureHTTP(dekartServer)
	claimsCheck := user.NewClaimsCheck(
		os.Getenv("DEKART_IAP_JWT_AUD"),
		os.Getenv("DEKART_REQUIRE_IAP") == "1",
		os.Getenv("DEKART_DEV_CLAIMS_EMAIL"),
	)

	port := os.Getenv("DEKART_PORT")
	log.Info().Msgf("Starting dekart at :%s", port)
	return &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			reqWithClaims := r.WithContext(claimsCheck.GetContext(r))
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
