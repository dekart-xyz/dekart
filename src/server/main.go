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
	chjob "dekart/src/server/clickhousejob"
	"dekart/src/server/dekart"
	"dekart/src/server/errtype"
	"dekart/src/server/job"
	"dekart/src/server/pgjob"
	"dekart/src/server/secrets"
	"dekart/src/server/snowflakejob"
	"dekart/src/server/snowflakeutils"
	"dekart/src/server/storage"
	"dekart/src/server/userjob"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/database/sqlite3"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	_ "github.com/lib/pq"
	_ "github.com/mattn/go-sqlite3"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func configureLogger() {
	rand.Seed(time.Now().UnixNano())
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	zerolog.ErrorStackFieldName = "stacktrace"
	zerolog.ErrorStackMarshaler = dekart.MarshalStackSimple

	pretty := os.Getenv("DEKART_LOG_PRETTY")
	if pretty != "" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339}).With().Stack().Logger()
	} else {
		log.Logger = log.Logger.With().Stack().Caller().Logger().Output(&errtype.LogWriter{Writer: os.Stderr})
	}

	debug := os.Getenv("DEKART_LOG_DEBUG")
	if debug != "" {
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	} else {
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
	}
	log.Info().Msgf("Log level: %s", zerolog.GlobalLevel().String())
	snowflakeutils.ConfigureSnowflakeLogger(&log.Logger)
}

func configureDb() *sql.DB {
	sqlitePath, sqliteOk := os.LookupEnv("DEKART_SQLITE_DB_PATH")
	if sqliteOk {
		// Use SQLite
		log.Info().Msg("Using SQLite database")
		log.Info().Msg("Restoring SQLite database from backup")
		dekart.RestoreDbFile()
		db, err := sql.Open("sqlite3", sqlitePath)
		if err != nil {
			log.Fatal().Err(err).Send()
		}
		return db
	}

	log.Info().Msg("Using Postgres database")
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
		log.Fatal().Err(err).Msg("sql.Open failed")
	}
	db.SetConnMaxLifetime(0)
	db.SetMaxIdleConns(3)
	db.SetMaxOpenConns(3)
	return db
}

func applyMigrations(db *sql.DB) {
	_, sqliteOk := os.LookupEnv("DEKART_SQLITE_DB_PATH")
	if sqliteOk {
		// Use SQLite migration driver
		driver, err := sqlite3.WithInstance(db, &sqlite3.Config{})
		if err != nil {
			log.Fatal().Err(err).Msg("WithInstance")
		}
		m, err := migrate.NewWithDatabaseInstance(
			"file://sqlite/migrations",
			"sqlite3", driver)
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
	} else {
		// Use PostgreSQL migration driver
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
		version, dirty, err := m.Version()
		if err != nil {
			if err == migrate.ErrNilVersion {
				log.Info().Msg("No migrations applied yet")
			} else {
				log.Fatal().Err(err).Msg("Version")
			}
		} else {
			log.Info().Int("version", int(version)).Bool("dirty", dirty).Msg("Current migration version")
		}

		err = m.Up()
		if err != nil {
			if err == migrate.ErrNoChange {
				log.Info().Msg("No new migrations to apply")
				return
			}
			log.Fatal().Err(err).Msg("Migrations Up")
		}
		version, dirty, err = m.Version()
		if err != nil {
			log.Fatal().Err(err).Msg("Version")
		} else {
			log.Info().Int("version", int(version)).Bool("dirty", dirty).Msg("Migrations applied")
		}
	}
}

func configureBucket() storage.Storage {
	var bucket storage.Storage
	switch os.Getenv("DEKART_STORAGE") {
	case "S3":
		log.Info().Msg("Using S3 storage backend")
		bucket = storage.NewS3Storage()
	case "GCS":
		log.Info().Msg("Using GCS storage backend")
		bucket = storage.NewGoogleCloudStorage()
	case "SNOWFLAKE":
		log.Info().Msg("Using SNOWFLAKE query result cache")
		bucket = storage.NewSnowflakeStorage()
	case "USER":
		log.Info().Msg("Using USER defined storage backend, based on connection dialog")
		bucket = storage.NewUserStorage()
	default:
		log.Fatal().Str("DEKART_STORAGE", os.Getenv("DEKART_STORAGE")).Msg("Unknown storage backend")
	}
	return bucket
}

func configureJobStore(bucket storage.Storage) job.Store {
	var jobStore job.Store
	switch os.Getenv("DEKART_DATASOURCE") {
	case "USER":
		log.Info().Msg("Using USER defined job store backend")
		jobStore = userjob.NewStore()
	case "SNOWFLAKE":
		log.Info().Msg("Using Snowflake Datasource backend")
		jobStore = snowflakejob.NewStore()
	case "ATHENA":
		log.Info().Msg("Using Athena Datasource backend")
		jobStore = athenajob.NewStore(bucket)
	case "PG":
		log.Info().Msg("Using Postgres LIKE Datasource backend")
		jobStore = pgjob.NewStore()
	case "BQ", "":
		log.Info().Msg("Using BigQuery Datasource backend")
		jobStore = bqjob.NewStore()
	case "CH":
		log.Info().Msg("Using Clickhouse Datasource backend")
		jobStore = chjob.NewStore()
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
			log.Fatal().Err(err).Msg("http server failed")
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

	secrets.Init()

	db := configureDb()
	defer db.Close()

	applyMigrations(db)

	bucket := configureBucket()
	jobStore := configureJobStore(bucket)

	dekartServer := dekart.NewServer(db, bucket, jobStore)
	httpServer := app.Configure(dekartServer, db)

	go startHttpServer(httpServer)

	log.Info().Msg("dekart server started")

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
		log.Info().Msg("dekart server shutdown complete")
	}()

	go func() {
		defer wg.Done()
		httpServer.Shutdown(shutdownCtx)
		log.Info().Msg("http server shutdown complete")
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
