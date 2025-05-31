package dekart

import (
	"database/sql"
	"dekart/src/server/snowflakeutils"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

var stage = os.Getenv("DEKART_SNOWFLAKE_STAGE")
var backupFrequencyStr = os.Getenv("DEKART_BACKUP_FREQUENCY_MIN")
var dbFilePath = os.Getenv("DEKART_SQLITE_DB_PATH")

func (s Server) startBackups() {
	if stage == "" {
		log.Warn().Msg("DEKART_SNOWFLAKE_STAGE environment variable is not set")
		return
	}

	// Get the backup frequency from the environment variable, default to 5 minutes
	backupFrequency, err := strconv.Atoi(backupFrequencyStr)
	if err != nil || backupFrequency <= 0 {
		backupFrequency = 5 // default to 5 minutes
	}

	log.Info().Int("frequency_min", backupFrequency).Msg("Starting backups")

	ticker := time.NewTicker(time.Duration(backupFrequency) * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		s.CreateBackup(true)
	}
}

func RestoreDbFile() {
	// Check if the stage is set
	if stage == "" {
		log.Warn().Msg("DEKART_SNOWFLAKE_STAGE environment variable is not set")
		return
	}

	// Check if the database file already exists
	if _, err := os.Stat(dbFilePath); err == nil {
		log.Info().Str("db_file_path", dbFilePath).Msg("Database file already exists, skipping restore")
		return
	} else if !os.IsNotExist(err) {
		log.Fatal().Err(err).Msg("Failed to check if database file exists")
	}

	// Download the latest backup from the stage
	connector := snowflakeutils.GetConnector(nil)
	db := sql.OpenDB(connector)
	defer db.Close()
	listCommand := fmt.Sprintf(`LIST @%s pattern = '.*backup'`, stage)
	rows, err := db.Query(listCommand)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to list files in Snowflake stage")
	}
	defer rows.Close()

	// Find the latest backup
	var latestBackup string
	var latestBackupTime time.Time
	for rows.Next() {
		var fileName string
		var size int64
		var lastModified string
		var md5 string
		if err := rows.Scan(&fileName, &size, &md5, &lastModified); err != nil {
			log.Error().Err(err).Msg("Failed to scan row")
			continue
		}

		// Extract the timestamp from the file name
		// Assuming the file name format is something like "backup_20060102_150405.backup"
		timestampStr := fileName[len(fileName)-22 : len(fileName)-7]
		fileTime, err := time.ParseInLocation("20060102_150405", timestampStr, time.UTC)
		if err != nil {
			log.Error().Err(err).Msg("Failed to parse timestamp from file name")
			continue
		}

		if fileTime.After(latestBackupTime) {
			fileNameParts := strings.Split(fileName, "/")
			latestBackup = fileNameParts[len(fileNameParts)-1]
			latestBackupTime = fileTime
		}
	}

	if latestBackup == "" {
		log.Warn().Msg("No backup found in Snowflake stage")
		return
	}

	// Extract directory from dbFilePath
	dbDir := filepath.Dir(dbFilePath)

	// Download the latest backup to the directory
	getCommand := fmt.Sprintf(`GET @%s/%s file://%s`, stage, latestBackup, dbDir)
	_, err = db.Exec(getCommand)
	if err != nil {
		log.Error().Err(err).Str("stage", stage).Str("getCommand", getCommand).Str("latestBackup", latestBackup).Msg("Failed to download backup from Snowflake stage")
		return
	}

	// Move the downloaded file to dbFilePath
	downloadedFilePath := filepath.Join(dbDir, filepath.Base(latestBackup))
	err = os.Rename(downloadedFilePath, dbFilePath)
	if err != nil {
		log.Fatal().Err(err).Str("downloadedFilePath", downloadedFilePath).Str("dbFilePath", dbFilePath).Msg("Failed to move downloaded file to dbFilePath")
	} else {
		log.Info().Str("backup_path", latestBackup).Str("db_file_path", dbFilePath).Msg("Database file restored successfully")
	}
}

// BackupLock struct with a mutex and a boolean flag
type BackupLock struct {
	mutex     sync.Mutex
	isRunning bool
}

var bl BackupLock = BackupLock{}

func (s Server) CreateBackup(deleteOld bool) {
	if stage == "" {
		log.Warn().Msg("DEKART_SNOWFLAKE_STAGE environment variable is not set")
		return
	}

	log.Info().Msg("Creating backup of SQLite database")

	// Lock the mutex
	bl.mutex.Lock()

	// Check if the function is already running
	if bl.isRunning {
		// Unlock the mutex and return immediately
		bl.mutex.Unlock()
		log.Info().Msg("Backup function is already running, skipping this invocation")
		return
	}

	// Set the flag to indicate the function is running
	bl.isRunning = true

	// Unlock the mutex before starting the backup logic
	bl.mutex.Unlock()

	defer func() {
		// Reset the flag and unlock the mutex at the end of the function
		bl.mutex.Lock()
		bl.isRunning = false
		bl.mutex.Unlock()
	}()

	// Construct the backup path with the timestamp
	timestamp := time.Now().UTC().Format("20060102_150405")
	backupPath := fmt.Sprintf("%s_%s.backup", dbFilePath, timestamp)

	_, err := s.db.Exec(
		`VACUUM INTO $1`,
		backupPath,
	)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create backup")
	}
	connector := snowflakeutils.GetConnector(nil)
	db := sql.OpenDB(connector)
	defer db.Close()
	putCommand := fmt.Sprintf(`PUT 'file://%s' @%s auto_compress=false`, backupPath, stage)
	_, err = db.Exec(putCommand)
	if err != nil {
		log.Error().Err(err).Msg("Failed to upload backup to Snowflake stage")
		return
	} else {
		log.Info().Str("backup_path", backupPath).Str("stage", stage).Msg("Backup uploaded to Snowflake stage successfully")
	}

	// Delete the backup file from the local filesystem
	err = os.Remove(backupPath)
	if err != nil {
		log.Error().Err(err).Str("backup_path", backupPath).Msg("Failed to delete backup file from local filesystem")
	}

	if deleteOld {
		deleteOldBackups(db, stage)
	}
}

func deleteOldBackups(db *sql.DB, stage string) {
	listCommand := fmt.Sprintf(`LIST @%s pattern = '.*backup'`, stage)
	rows, err := db.Query(listCommand)
	if err != nil {
		log.Error().Err(err).Msg("Failed to list files in Snowflake stage")
		return
	}
	defer rows.Close()

	maxAgeStr := os.Getenv("DEKART_MAX_BACKUPS_AGE_DAYS")
	maxAgeDays, err := strconv.Atoi(maxAgeStr)
	if err != nil || maxAgeDays <= 0 {
		maxAgeDays = 7 // default to 7 days
	}
	maxAge := time.Now().Add(-time.Duration(maxAgeDays) * 24 * time.Hour)

	for rows.Next() {
		var fileName string
		var size int64
		var lastModified string
		var md5 string
		if err := rows.Scan(&fileName, &size, &md5, &lastModified); err != nil {
			log.Error().Err(err).Msg("Failed to scan row")
			continue
		}

		// Extract the actual file name from the full path
		fileNameParts := strings.Split(fileName, "/")
		actualFileName := fileNameParts[len(fileNameParts)-1]

		// Extract the timestamp from the actual file name
		timestampStr := actualFileName[len(actualFileName)-22 : len(actualFileName)-7]
		fileTime, err := time.ParseInLocation("20060102_150405", timestampStr, time.UTC)
		if err != nil {
			log.Error().Err(err).Msg("Failed to parse timestamp from file name")
			continue
		}

		if fileTime.Before(maxAge) {
			log.Info().Str("file_name", actualFileName).Time("max_age", maxAge).Msg("Old backup found in Snowflake stage")
			removeCommand := fmt.Sprintf(`REMOVE @%s/%s`, stage, fileName)
			_, err := db.Exec(removeCommand)
			if err != nil {
				log.Fatal().Err(err).Msg("Failed to remove old backup from Snowflake stage")
			} else {
				log.Info().Str("file_name", fileName).Msg("Old backup removed from Snowflake stage")
			}
		}
	}
}
