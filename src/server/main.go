package main

import (
	"database/sql"
	"dekart/src/blobstorage"
	"dekart/src/server/dekart"
	"dekart/src/server/http"
	"dekart/src/server/job"
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

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
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

func configureBucket() *blobstorage.Storage {
	bucket := os.Getenv("DEKART_CLOUD_STORAGE_BUCKET")

	conf := aws.NewConfig().
		WithMaxRetries(3).
		WithS3ForcePathStyle(true)

	ses := session.Must(session.NewSession(conf))

	return blobstorage.New(bucket, s3.New(ses))

	// ctx := context.Background()
	// client, err := storage.NewClient(ctx)
	// if err != nil {
	// 	log.Fatal().Err(err).Send()
	// }
	// return client.Bucket(os.Getenv("DEKART_CLOUD_STORAGE_BUCKET"))
	// return nil
}

func main() {
	configureLogger()

	db := configureDb()
	defer db.Close()

	applyMigrations(db)

	bucket := configureBucket()
	jobs := job.NewStore()

	dekartServer := dekart.NewServer(db, bucket, jobs)

	httpServer := http.Configure(dekartServer)
	log.Fatal().Err(httpServer.ListenAndServe()).Send()

}
