package main

import (
	"database/sql"
	"dekart/src/server/bqjob"
	"dekart/src/server/dekart"
	"dekart/src/server/http"
	"dekart/src/server/storage"
	"fmt"
	"math/rand"
	"os"
	"time"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	_ "github.com/lib/pq"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func configureLogger() {
	rand.Seed(time.Now().UnixNano())
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix

	pretty := os.Getenv("DEKART_LOG_PRETTY")
	if pretty != "" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339}).With().Caller().Logger()
	}

	debug := os.Getenv("DEKART_LOG_DEBUG")
	if debug != "" {
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	} else {
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
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

func main() {
	configureLogger()

	db := configureDb()
	defer db.Close()

	applyMigrations(db)

	var bucket storage.Storage
	switch os.Getenv("DEKART_STORAGE") {
	case "S3":
		log.Info().Msg("Using S3 storage backend")
		bucket = storage.NewS3Storage()
	case "GCS", "":
		log.Info().Msg("Using GCS storage backend")
		bucket = storage.NewGoogleCloudStorage()
	default:
		log.Fatal().Str("DEKART_STORAGE", os.Getenv("DEKART_STORAGE")).Msg("Unknown storage backend")
	}

	jobStore := bqjob.NewStore()

	dekartServer := dekart.NewServer(db, bucket, jobStore)

	httpServer := http.Configure(dekartServer)
	log.Fatal().Err(httpServer.ListenAndServe()).Send()

}
