package dekart

import (
	"context"
	"dekart/src/server/storage"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

type sqliteBackupTarget string

const (
	backupTargetDisabled       sqliteBackupTarget = "disabled"
	backupTargetSnowflakeStage sqliteBackupTarget = "snowflake_stage"
	backupTargetObjectStorage  sqliteBackupTarget = "object_storage"
	defaultBackupFrequencyMin                     = 5
	defaultMaxBackupsAgeDays                      = 7
)

func getBackupTarget() sqliteBackupTarget {
	bucket := strings.TrimSpace(os.Getenv("DEKART_CLOUD_STORAGE_BUCKET"))
	storageBackend := strings.ToUpper(strings.TrimSpace(os.Getenv("DEKART_STORAGE")))
	if bucket != "" && (storageBackend == "S3" || storageBackend == "GCS") {
		return backupTargetObjectStorage
	}
	if strings.TrimSpace(os.Getenv("DEKART_SNOWFLAKE_STAGE")) != "" {
		return backupTargetSnowflakeStage
	}
	return backupTargetDisabled
}

func sqliteBackupObjectPrefix() string {
	return "sqlite-backups/"
}

func sqliteBackupObjectName(ts time.Time) string {
	dbFileName := filepath.Base(os.Getenv("DEKART_SQLITE_DB_PATH"))
	return sqliteBackupObjectPrefix() + fmt.Sprintf("%s_%s.backup", dbFileName, ts.UTC().Format("20060102_150405"))
}

func parseBackupTimestamp(name string) (time.Time, bool) {
	base := filepath.Base(name)
	if !strings.HasSuffix(base, ".backup") {
		return time.Time{}, false
	}
	parts := strings.Split(strings.TrimSuffix(base, ".backup"), "_")
	if len(parts) < 3 {
		return time.Time{}, false
	}
	ts := parts[len(parts)-2] + "_" + parts[len(parts)-1]
	t, err := time.ParseInLocation("20060102_150405", ts, time.UTC)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}

func backupFrequencyMin() int {
	backupFrequencyStr := strings.TrimSpace(os.Getenv("DEKART_BACKUP_FREQUENCY_MIN"))
	backupFrequency, err := strconv.Atoi(backupFrequencyStr)
	if err != nil || backupFrequency <= 0 {
		return defaultBackupFrequencyMin
	}
	return backupFrequency
}

func maxBackupsAgeDays() int {
	maxAgeStr := strings.TrimSpace(os.Getenv("DEKART_MAX_BACKUPS_AGE_DAYS"))
	maxAgeDays, err := strconv.Atoi(maxAgeStr)
	if err != nil || maxAgeDays <= 0 {
		return defaultMaxBackupsAgeDays
	}
	return maxAgeDays
}

func sqliteDBFilePath() string {
	return strings.TrimSpace(os.Getenv("DEKART_SQLITE_DB_PATH"))
}

func isSQLiteEnabled() bool {
	return sqliteDBFilePath() != ""
}

func storageBackendName() string {
	return strings.ToUpper(strings.TrimSpace(os.Getenv("DEKART_STORAGE")))
}

func (s Server) startBackups() {
	if !isSQLiteEnabled() {
		return
	}
	target := getBackupTarget()
	if target == backupTargetDisabled {
		log.Warn().Msg("SQLite backup target disabled (no bucket/stage configured)")
		return
	}

	if target == backupTargetObjectStorage {
		log.Info().Str("mode", string(target)).Str("storage", strings.ToLower(storageBackendName())).Msg("SQLite backup target configured")
	} else {
		log.Info().Str("mode", string(target)).Str("stage", os.Getenv("DEKART_SNOWFLAKE_STAGE")).Msg("SQLite backup target configured")
	}

	frequency := backupFrequencyMin()
	log.Info().Int("frequency_min", frequency).Msg("Starting SQLite backups")

	ticker := time.NewTicker(time.Duration(frequency) * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		s.CreateBackup(true)
	}
}

func RestoreDbFile() {
	if !isSQLiteEnabled() {
		return
	}
	target := getBackupTarget()
	if target == backupTargetDisabled {
		return
	}

	dbFilePath := sqliteDBFilePath()

	if _, err := os.Stat(dbFilePath); err == nil {
		log.Info().Str("db_file_path", dbFilePath).Msg("Database file already exists, skipping restore")
		return
	} else if !os.IsNotExist(err) {
		log.Fatal().Err(err).Msg("Failed to check if database file exists")
	}

	st, location, ok := newBackupStorage(target)
	if !ok {
		log.Warn().Msg("SQLite restore skipped: backup storage is not configured")
		return
	}

	restoreFromStorage(dbFilePath, st, location)
}

// BackupLock struct with a mutex and a boolean flag
type BackupLock struct {
	mutex     sync.Mutex
	isRunning bool
}

var bl BackupLock = BackupLock{}

func (s Server) CreateBackup(deleteOld bool) {
	if !isSQLiteEnabled() {
		return
	}
	target := getBackupTarget()
	if target == backupTargetDisabled {
		log.Warn().Msg("SQLite backup skipped: no backup target configured")
		return
	}

	dbFilePath := sqliteDBFilePath()

	bl.mutex.Lock()
	if bl.isRunning {
		bl.mutex.Unlock()
		log.Info().Msg("Backup function is already running, skipping this invocation")
		return
	}
	bl.isRunning = true
	bl.mutex.Unlock()

	defer func() {
		bl.mutex.Lock()
		bl.isRunning = false
		bl.mutex.Unlock()
	}()

	ts := time.Now().UTC()
	backupPath := fmt.Sprintf("%s_%s.backup", dbFilePath, ts.Format("20060102_150405"))
	if _, err := s.db.Exec(`VACUUM INTO $1`, backupPath); err != nil {
		log.Fatal().Err(err).Msg("Failed to create backup")
	}

	switch target {
	case backupTargetObjectStorage:
		uploadBackupToStorage(backupPath, ts, deleteOld, target)
	case backupTargetSnowflakeStage:
		uploadBackupToStorage(backupPath, ts, deleteOld, target)
	}

	if err := os.Remove(backupPath); err != nil {
		log.Error().Err(err).Str("backup_path", backupPath).Msg("Failed to delete local backup file")
	}
}

func uploadBackupToStorage(backupPath string, ts time.Time, deleteOld bool, target sqliteBackupTarget) {
	ctx := context.Background()
	st, location, ok := newBackupStorage(target)
	if !ok {
		log.Warn().Msg("SQLite backup upload skipped: backup storage is not configured")
		return
	}

	objectName := sqliteBackupObjectName(ts)
	if err := uploadBackupFile(ctx, st, location, objectName, backupPath); err != nil {
		log.Error().Err(err).Str("location", location).Str("object", objectName).Msg("Failed to upload backup")
		return
	}
	log.Info().Str("backup_path", backupPath).Str("location", location).Str("object", objectName).Msg("Backup uploaded successfully")

	if deleteOld {
		pruneOldBackups(ctx, st, location)
	}
}

func pruneOldBackups(ctx context.Context, st storage.Storage, location string) {
	objects, err := st.ListObjectsByPrefix(ctx, location, sqliteBackupObjectPrefix())
	if err != nil {
		log.Error().Err(err).Str("location", location).Msg("Failed to list backup objects for prune")
		return
	}
	maxAge := time.Now().Add(-time.Duration(maxBackupsAgeDays()) * 24 * time.Hour)
	for _, obj := range objects {
		backupTS, ok := parseBackupTimestamp(obj.Name)
		if !ok {
			continue
		}
		if backupTS.Before(maxAge) {
			if err := st.GetObject(ctx, location, obj.Name).Delete(ctx); err != nil {
				log.Error().Err(err).Str("location", location).Str("object", obj.Name).Msg("Failed to delete old backup object")
			} else {
				log.Info().Str("location", location).Str("object", obj.Name).Msg("Old backup object deleted")
			}
		}
	}
}

func restoreFromStorage(dbFilePath string, st storage.Storage, location string) {
	ctx := context.Background()
	objects, err := st.ListObjectsByPrefix(ctx, location, sqliteBackupObjectPrefix())
	if err != nil {
		log.Error().Err(err).Str("location", location).Msg("Failed to list backup objects")
		return
	}
	if len(objects) == 0 {
		log.Warn().Str("location", location).Str("prefix", sqliteBackupObjectPrefix()).Msg("No SQLite backup found")
		return
	}

	// Prefer backup-name timestamps for deterministic restore ordering across storages.
	// Fall back to UpdatedAt only when one or both names are not parseable.
	sort.Slice(objects, func(i, j int) bool {
		its, iok := parseBackupTimestamp(objects[i].Name)
		jts, jok := parseBackupTimestamp(objects[j].Name)
		if iok && jok {
			return its.After(jts)
		}
		if iok != jok {
			return iok
		}
		return objects[i].UpdatedAt.After(objects[j].UpdatedAt)
	})
	latest := objects[0]

	dbDir := filepath.Dir(dbFilePath)
	tempPath := filepath.Join(dbDir, ".restore_tmp_"+filepath.Base(latest.Name))
	if err := downloadBackupObjectToFile(ctx, st, location, latest.Name, tempPath); err != nil {
		log.Error().Err(err).Str("location", location).Str("object", latest.Name).Msg("Failed to download SQLite backup")
		return
	}
	if err := os.Rename(tempPath, dbFilePath); err != nil {
		_ = os.Remove(tempPath)
		log.Fatal().Err(err).Str("temp_path", tempPath).Str("db_file_path", dbFilePath).Msg("Failed to move downloaded backup into SQLite path")
	}
	log.Info().Str("location", location).Str("object", latest.Name).Str("db_file_path", dbFilePath).Msg("Database file restored successfully")
}

func newBackupStorage(target sqliteBackupTarget) (storage.Storage, string, bool) {
	switch target {
	case backupTargetObjectStorage:
		if storageBackendName() == "GCS" {
			bucket := storage.GetDefaultBucketName()
			if bucket == "" {
				return nil, "", false
			}
			return storage.NewPublicStorage(), bucket, true
		}
		bucket := storage.GetDefaultBucketName()
		if bucket == "" {
			return nil, "", false
		}
		return storage.NewS3Storage(), bucket, true
	case backupTargetSnowflakeStage:
		stage := strings.TrimSpace(os.Getenv("DEKART_SNOWFLAKE_STAGE"))
		if stage == "" {
			return nil, "", false
		}
		return storage.NewSnowflakeStageStorage(), stage, true
	default:
		return nil, "", false
	}
}

func uploadBackupFile(ctx context.Context, st storage.Storage, location, objectName, localPath string) error {
	f, err := os.Open(localPath)
	if err != nil {
		return err
	}
	defer f.Close()
	w := st.GetObject(ctx, location, objectName).GetWriter(ctx)
	if _, err := io.Copy(w, f); err != nil {
		_ = w.Close()
		return err
	}
	return w.Close()
}

func downloadBackupObjectToFile(ctx context.Context, st storage.Storage, location, objectName, localPath string) error {
	r, err := st.GetObject(ctx, location, objectName).GetReader(ctx)
	if err != nil {
		return err
	}
	defer r.Close()
	out, err := os.Create(localPath)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err := io.Copy(out, r); err != nil {
		return err
	}
	return out.Sync()
}
