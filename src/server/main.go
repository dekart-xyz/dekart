package main

import (
	"context"
	"database/sql"
	"fmt"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"dekart/src/server/app"
	"dekart/src/server/athenajob"
	"dekart/src/server/bqjob"
	"dekart/src/server/dekart"
	"dekart/src/server/job"
	"dekart/src/server/snowflakejob"
	"dekart/src/server/storage"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	_ "github.com/lib/pq"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/rs/zerolog/pkgerrors"
)

func configureLogger() {
	rand.Seed(time.Now().UnixNano())
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	zerolog.ErrorStackFieldName = "stacktrace"
	zerolog.ErrorStackMarshaler = pkgerrors.MarshalStack

	pretty := os.Getenv("DEKART_LOG_PRETTY")
	if pretty != "" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339}).With().Caller().Logger()
	} else {
		log.Logger = log.Logger.With().Caller().Stack().Logger()
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
	url, ok := os.LookupEnv("DEKART_POSTGRES_URL")
	if !ok {
		url = fmt.Sprintf(
			"postgres://%s:%s@%s:%s/%s?sslmode=disable",
			os.Getenv("DEKART_POSTGRES_USER"),
			os.Getenv("DEKART_POSTGRES_PASSWORD"),
			os.Getenv("DEKART_POSTGRES_HOST"),
			os.Getenv("DEKART_POSTGRES_PORT"),
			os.Getenv("DEKART_POSTGRES_DB"),
		)
	}
	db, err := sql.Open("postgres", url)
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

func configureBucket() storage.Storage {
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
	return bucket
}

func configureJobStore(bucket storage.Storage) job.Store {
	var jobStore job.Store
	switch os.Getenv("DEKART_DATASOURCE") {
	case "SNOWFLAKE":
		log.Info().Msg("Using Snowflake Datasource backend")
		jobStore = snowflakejob.NewStore()
	case "ATHENA":
		log.Info().Msg("Using Athena Datasource backend")
		jobStore = athenajob.NewStore(bucket)
	case "BQ", "":
		log.Info().Msg("Using BigQuery Datasource backend")
		jobStore = bqjob.NewStore()
	default:
		log.Fatal().Str("DEKART_STORAGE", os.Getenv("DEKART_STORAGE")).Msg("Unknown storage backend")
	}

	return jobStore
}

func startHttpServer(httpServer *http.Server) {
	err := httpServer.ListenAndServe()
	if err != nil {
		if err == http.ErrServerClosed {
			log.Info().Msg("http server closed")
		} else {
			log.Fatal().Err(err).Send()
		}
	}
}

func waitForInterrupt() chan os.Signal {
	var s = make(chan os.Signal, 1)
	signal.Notify(s, syscall.SIGTERM)
	signal.Notify(s, syscall.SIGINT)
	return s
}

func main() {
	configureLogger()

	db := configureDb()
	defer db.Close()

	applyMigrations(db)

	bucket := configureBucket()
	jobStore := configureJobStore(bucket)

	dekartServer := dekart.NewServer(db, bucket, jobStore)
	httpServer := app.Configure(dekartServer)

	go startHttpServer(httpServer)

	sig := <-waitForInterrupt()

	// shutdown gracefully
	log.Info().Str("signal", sig.String()).Msg("shutdown signal received")
	var wg sync.WaitGroup
	wg.Add(2)

	shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	go func() {
		defer wg.Done()
		dekartServer.Shutdown(shutdownCtx)
		log.Debug().Msg("dekart server shutdown complete")
	}()

	go func() {
		defer wg.Done()
		httpServer.Shutdown(shutdownCtx)
		log.Debug().Msg("http server shutdown complete")
	}()

	shutdown := make(chan bool)

	go func() {
		wg.Wait()
		close(shutdown)
	}()

	select {
	case <-shutdown:
		log.Info().Msg("shutdown complete")
		return
	case <-waitForInterrupt():
		log.Warn().Msg("shutdown forced")
		return
	}
}
