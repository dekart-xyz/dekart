// REVIEW: Inspect current and historical bindings before deleting storage shared by surviving reports.
package dekart

import (
	gcsstorage "cloud.google.com/go/storage"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"

	"dekart/src/proto"
	"dekart/src/server/conn"
	"dekart/src/server/storage"
	"github.com/rs/zerolog/log"
)

type workspaceDeleteObject struct {
	bucket string
	name   string
	object storage.StorageObject
}

type workspaceDeleteContent struct {
	objects  []workspaceDeleteObject
	fileIDs  []string
	queryIDs []string
}

// collectWorkspaceDeleteObjects includes historical bindings and excludes storage shared with surviving reports.
func (s Server) collectWorkspaceDeleteObjects(ctx context.Context, tx *sql.Tx, id string, publicStorage storage.Storage) (workspaceDeleteContent, error) {
	content := workspaceDeleteContent{}
	publicBucket := os.Getenv("DEKART_CLOUD_PUBLIC_STORAGE_BUCKET")
	if publicBucket == "" {
		publicBucket = storage.GetDefaultBucketName()
	}
	defaultBucket := storage.GetDefaultBucketName()
	defaultCtx := conn.GetCtx(ctx, &proto.Connection{CloudStorageBucket: defaultBucket})
	seen := map[string]bool{}
	add := func(bucket, name string, backend storage.Storage) {
		key := bucket + "/" + name
		if bucket != "" && !seen[key] {
			seen[key] = true
			content.objects = append(content.objects, workspaceDeleteObject{bucket: bucket, name: name, object: backend.GetObject(defaultCtx, bucket, name)})
		}
	}
	queryRows, err := tx.QueryContext(ctx, `SELECT DISTINCT q.id FROM queries q LEFT JOIN datasets d ON d.query_id=q.id LEFT JOIN dataset_snapshots ds ON ds.query_id=q.id
 WHERE q.report_id IN (SELECT id FROM reports WHERE workspace_id=$1)
 OR d.report_id IN (SELECT id FROM reports WHERE workspace_id=$1)
 OR ds.report_id IN (SELECT id FROM reports WHERE workspace_id=$1)`, id)
	if err != nil {
		return content, err
	}
	for queryRows.Next() {
		var queryID string
		if err = queryRows.Scan(&queryID); err != nil {
			queryRows.Close()
			return content, err
		}
		content.queryIDs = append(content.queryIDs, queryID)
	}
	err = queryRows.Err()
	queryRows.Close()
	if err != nil {
		return content, err
	}
	rows, err := tx.QueryContext(ctx, `WITH bindings AS (
 SELECT d.report_id,d.file_id,d.connection_id FROM datasets d
 UNION ALL SELECT ds.report_id,ds.file_id,ds.connection_id FROM dataset_snapshots ds
 )
 SELECT DISTINCT f.id,f.file_source_id,COALESCE(f.mime_type,''),COALESCE(CAST(b.connection_id AS TEXT),''),COALESCE(r.is_public,false),
 EXISTS (SELECT 1 FROM bindings other JOIN reports surviving ON surviving.id=other.report_id
 JOIN files shared ON shared.id=other.file_id
 WHERE (surviving.workspace_id<>$1 OR surviving.workspace_id IS NULL) AND shared.file_source_id=f.file_source_id),
 EXISTS (SELECT 1 FROM bindings other JOIN reports surviving ON surviving.id=other.report_id
 WHERE (surviving.workspace_id<>$1 OR surviving.workspace_id IS NULL) AND other.file_id=f.id)
 FROM files f JOIN bindings b ON b.file_id=f.id JOIN reports r ON r.id=b.report_id
 WHERE r.workspace_id=$1`, id)
	if err != nil {
		return content, err
	}
	for rows.Next() {
		var fileID, mimeType, connectionID string
		var sourceID sql.NullString
		var public, sharedObject, sharedRow bool
		if err = rows.Scan(&fileID, &sourceID, &mimeType, &connectionID, &public, &sharedObject, &sharedRow); err != nil {
			rows.Close()
			return content, err
		}
		// Forks copy file rows but share object names; preserve only rows still bound outside this workspace.
		if !sharedRow {
			content.fileIDs = append(content.fileIDs, fileID)
		}
		// Unfinished uploads have no storage object; shared objects belong to surviving reports.
		if sharedObject || !sourceID.Valid {
			continue
		}
		name := sourceID.String + "." + getFileExtensionFromMime(mimeType)
		// User connections own their private objects; only system storage is managed here.
		if conn.IsSystemConnectionID(connectionID) {
			add(defaultBucket, name, s.storage)
		}
		if public {
			add(publicBucket, name, publicStorage)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return content, err
	}
	rows, err = tx.QueryContext(ctx, `WITH bindings AS (
 SELECT report_id,query_id,connection_id FROM datasets
 UNION ALL SELECT report_id,query_id,connection_id FROM dataset_snapshots
 )
 SELECT DISTINCT j.job_result_id,COALESCE(CAST(b.connection_id AS TEXT),''),COALESCE(c.connection_type,1),r.is_public,COALESCE(j.dw_job_id,'')
 FROM query_jobs j JOIN queries q ON q.id=j.query_id
 LEFT JOIN bindings b ON b.query_id=q.id
 JOIN reports r ON r.id=COALESCE(b.report_id,q.report_id)
 LEFT JOIN connections c ON c.id=b.connection_id
 WHERE r.workspace_id=$1 AND j.job_result_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM query_jobs shared JOIN queries sq ON sq.id=shared.query_id
 LEFT JOIN bindings sb ON sb.query_id=sq.id JOIN reports sr ON sr.id=COALESCE(sb.report_id,sq.report_id)
 WHERE (sr.workspace_id<>$1 OR sr.workspace_id IS NULL) AND shared.job_result_id=j.job_result_id)`, id)
	if err != nil {
		return content, err
	}
	for rows.Next() {
		var resultID, connectionID, dwJobID string
		var connectionType int
		var public bool
		if err = rows.Scan(&resultID, &connectionID, &connectionType, &public, &dwJobID); err != nil {
			rows.Close()
			return content, err
		}
		// Warehouse-managed temporary results are not objects in Dekart's bucket.
		if conn.IsSystemConnectionID(connectionID) && dwJobID == "" {
			add(defaultBucket, resultID+".csv", s.storage)
		}
		if public {
			extension := "csv"
			if proto.ConnectionType(connectionType) == proto.ConnectionType_CONNECTION_TYPE_WHEROBOTS {
				extension = "parquet"
			}
			add(publicBucket, resultID+"."+extension, publicStorage)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return content, err
	}
	rows, err = tx.QueryContext(ctx, `SELECT resource_id FROM map_previews WHERE report_id IN (SELECT id FROM reports WHERE workspace_id=$1)
 AND NOT EXISTS (SELECT 1 FROM map_previews other JOIN reports r ON r.id=other.report_id WHERE r.workspace_id<>$1 AND other.resource_id=map_previews.resource_id)`, id)
	if err != nil {
		return content, err
	}
	for rows.Next() {
		var resourceID string
		if err = rows.Scan(&resourceID); err != nil {
			rows.Close()
			return content, err
		}
		if os.Getenv("DEKART_STORAGE") == "S3" {
			add(defaultBucket, resourceID+".png", s.storage)
		} else {
			add(publicBucket, resourceID+".png", publicStorage)
		}
	}
	err = rows.Err()
	rows.Close()
	return content, err
}

// deleteWorkspaceObjects runs after commit so failed SQL cannot remove live workspace data.
func (s Server) deleteWorkspaceObjects(ctx context.Context, content workspaceDeleteContent) []string {
	failed := []string{}
	for _, o := range content.objects {
		if err := o.object.Delete(conn.GetCtx(ctx, &proto.Connection{CloudStorageBucket: o.bucket})); err != nil && !errors.Is(err, gcsstorage.ErrObjectNotExist) {
			url := fmt.Sprintf("gs://%s/%s", o.bucket, o.name)
			log.Error().Err(err).Str("object", url).Msg("Workspace storage cleanup failed")
			failed = append(failed, url)
		}
	}
	return failed
}
