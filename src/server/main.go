package main

import (
	"context"
	"database/sql"
	"dekart/src/server/reports"
	"fmt"
	"math/rand"
	"net/http"
	"os"
	"time"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/gorilla/mux"
	_ "github.com/lib/pq"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
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
	m.Up()
	if err != nil {
		log.Fatal().Err(err).Msg("Migrations Up")
	}
}

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	configureLogger()

	db := configureDb()
	defer db.Close()

	applyMigrations(db)

	reportsManager := reports.Manager{
		Db: db,
	}

	r := mux.NewRouter()
	api := r.PathPrefix("/api/v1").Subrouter()
	api.HandleFunc("/report", func(w http.ResponseWriter, r *http.Request) {
		reportsManager.CreateReportHandler(ctx, w, r)
	}).Methods("POST")

	port := os.Getenv("DEKART_PORT")
	log.Info().Msgf("Starting dekart at :%s", port)
	srv := &http.Server{
		Handler:      r,
		Addr:         ":" + port,
		WriteTimeout: 15 * time.Second,
		ReadTimeout:  15 * time.Second,
	}
	log.Fatal().Err(srv.ListenAndServe()).Send()

}
