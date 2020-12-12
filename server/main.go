package main

import (
	"database/sql"
	"dekart/server/reports"
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

func main() {
	rand.Seed(time.Now().UnixNano())
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix

	debug := os.Getenv("DEKART_LOG_DEBUG")
	if debug != "" {
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	}
	log.Info().Msgf("Log level: %s", zerolog.GlobalLevel().String())

	port := os.Getenv("DEKART_PORT")
	log.Info().Msgf("Port: %s", port)

	pretty := os.Getenv("DEKART_LOG_PRETTY")
	if pretty != "" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stdout})
	}

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
	defer db.Close()
	db.SetConnMaxLifetime(0)
	db.SetMaxIdleConns(3)
	db.SetMaxOpenConns(3)

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
		log.Fatal().Err(err).Msg("m.Up")
	}
	if err != nil {
		log.Fatal().Err(err).Send()
	}

	reportsManager := reports.Manager{}

	r := mux.NewRouter()
	api := r.PathPrefix("/api/v1").Subrouter()
	api.HandleFunc("/report", reportsManager.CreateReportHandler).Methods("POST")
	// r.HandleFunc("/webhook", messenger.VerifyWebhook).Methods("GET")

	log.Info().Msgf("Starting dekart at :%s", port)
	srv := &http.Server{
		Handler:      r,
		Addr:         ":" + port,
		WriteTimeout: 15 * time.Second,
		ReadTimeout:  15 * time.Second,
	}
	log.Fatal().Err(srv.ListenAndServe()).Send()

}
