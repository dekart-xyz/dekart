package main

import (
	"database/sql"
	"fmt"
	"math/rand"
	"net/http"
	"os"
	"time"

	"dekart/src/proto"
	"dekart/src/server/dekart"
	"dekart/src/server/report"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/gorilla/mux"
	"github.com/improbable-eng/grpc-web/go/grpcweb"
	_ "github.com/lib/pq"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
)

func configureLogger() {
	rand.Seed(time.Now().UnixNano())
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix

	pretty := os.Getenv("DEKART_LOG_PRETTY")
	if pretty != "" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stdout})
	}

	debug := os.Getenv("DEKART_LOG_DEBUG")
	if debug != "" {
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	}
	log.Info().Msgf("Log level: %s", zerolog.GlobalLevel().String())

}

func configureDb() *sql.DB {
	db, err := sql.Open("postgres", fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=disable",
		os.Getenv("DEKART_POSTGRES_USER"),
		os.Getenv("DEKART_POSTGRES_PASSWORD"),
		os.Getenv("DEKART_POSTGRES_HOST"),
		os.Getenv("DEKART_POSTGRES_PORT"),
		os.Getenv("DEKART_POSTGRES_DB"),
	))
	if err != nil {
		log.Fatal().Err(err).Send()
	}
	db.SetConnMaxLifetime(0)
	db.SetMaxIdleConns(3)
	db.SetMaxOpenConns(3)
	return db
}

func applyMigrations(db *sql.DB) {
	driver, err := postgres.WithInstance(db, &postgres.Config{})
	if err != nil {
		log.Fatal().Err(err).Msg("WithInstance")
	}
	m, err := migrate.NewWithDatabaseInstance(
		"file://migrations",
		"postgres", driver)
	if err != nil {
		log.Fatal().Err(err).Msg("NewWithDatabaseInstance")
	}
	err = m.Up()
	if err != nil {
		if err == migrate.ErrNoChange {
			return
		}
		log.Fatal().Err(err).Msg("Migrations Up")
	}
}

func configureGrpcServer(db *sql.DB) *grpcweb.WrappedGrpcServer {
	dekartServer := dekart.Server{
		Db:            db,
		ReportStreams: report.NewStreams(),
	}
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

func configureHttpServer() *mux.Router {
	fileServer := http.StripPrefix("/api/v1/job-results/", http.FileServer(http.Dir(os.Getenv("DEKART_QUERY_RESULTS"))))
	router := mux.NewRouter()
	api := router.PathPrefix("/api/v1/").Subrouter()
	api.Use(mux.CORSMethodMiddleware(router))
	api.HandleFunc("/job-results/{id}.csv", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method == http.MethodOptions {
			return
		}
		fileServer.ServeHTTP(w, r)
	}).Methods("GET", "OPTIONS")
	return router
}

func main() {
	// ctx, cancel := context.WithCancel(context.Background())
	// defer cancel()
	configureLogger()

	db := configureDb()
	defer db.Close()

	applyMigrations(db)

	grpcServer := configureGrpcServer(db)
	httpServer := configureHttpServer()

	port := os.Getenv("DEKART_PORT")
	log.Info().Msgf("Starting dekart at :%s", port)
	server := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if grpcServer.IsAcceptableGrpcCorsRequest(r) || grpcServer.IsGrpcWebRequest(r) {
				grpcServer.ServeHTTP(w, r)
			} else {
				httpServer.ServeHTTP(w, r)
			}
		}),
		Addr:         ":" + port,
		WriteTimeout: 60 * time.Second,
		ReadTimeout:  60 * time.Second,
	}
	log.Fatal().Err(server.ListenAndServe()).Send()

}
