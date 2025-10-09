package dekart

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/conn"
	"dekart/src/server/storage"
	"dekart/src/server/user"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s Server) unpublishReport(reqCtx context.Context, reportID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defConnCtx := conn.GetCtx(ctx, &proto.Connection{})
	defer cancel()
	userCtx := user.CopyUserContext(reqCtx, ctx)
	datasets, err := s.getDatasets(userCtx, reportID)
	if err != nil {
		log.Err(err).Msg("Cannot retrieve datasets")
		return
	}

	// handling queryJobs
	queryJobs, err := s.getDatasetsQueryJobs(userCtx, datasets)
	if err != nil {
		log.Err(err).Msg("Cannot retrieve query jobs")
		return
	}

	objectsToDelete := []storage.StorageObject{}
	sourceIDsToDelete := []string{}

	for _, queryJob := range queryJobs {
		if queryJob.JobResultId != "" { // else nothing to move
			connection, err := s.getConnectionFromQueryID(userCtx, queryJob.QueryId)
			conCtx := conn.GetCtx(userCtx, connection)
			if err != nil {
				log.Err(err).Msg("Cannot retrieve connection while publishing report")
				return
			}
			if connection == nil {
				log.Error().Msg("Connection not found while publishing report")
				return
			}
			userBucketName := s.getBucketNameFromConnection(connection)
			dwJobID, err := s.getDWJobIDFromResultID(userCtx, queryJob.JobResultId)
			if err != nil {
				log.Err(err).Msg("Cannot retrieve job id")
				return
			}
			resultURI, err := s.getResultURI(userCtx, queryJob.JobResultId)
			if err != nil {
				log.Error().Err(err).Msg("Error getting result URI")
				return
			}

			if resultURI != "" { // query result is in presigned storage, we need just to remove from public storage
				publicStorage := storage.NewPublicStorage()
				extension := "csv"
				if connection.ConnectionType == proto.ConnectionType_CONNECTION_TYPE_WHEROBOTS {
					extension = "parquet"
				}
				obj := publicStorage.GetObject(ctx, publicStorage.GetDefaultBucketName(), fmt.Sprintf("%s.%s", queryJob.JobResultId, extension))
				objectsToDelete = append(objectsToDelete, obj)
				sourceIDsToDelete = append(sourceIDsToDelete, queryJob.JobResultId)
			} else if dwJobID != "" { // query result is in temporary storage, we need just to remove from public storage
				publicStorage := storage.NewPublicStorage()
				obj := publicStorage.GetObject(ctx, publicStorage.GetDefaultBucketName(), fmt.Sprintf("%s.csv", queryJob.JobResultId))
				objectsToDelete = append(objectsToDelete, obj)
				sourceIDsToDelete = append(sourceIDsToDelete, queryJob.JobResultId)
			} else {
				// query result is in user storage bucket, we need to move it back
				publicStorage := storage.NewPublicStorage()
				if userBucketName != publicStorage.GetDefaultBucketName() {
					srcObj := publicStorage.GetObject(ctx, publicStorage.GetDefaultBucketName(), fmt.Sprintf("%s.csv", queryJob.JobResultId))
					if userBucketName != "" {
						dstObj := s.storage.GetObject(conCtx, userBucketName, fmt.Sprintf("%s.csv", queryJob.JobResultId))
						err = srcObj.CopyTo(defConnCtx, dstObj.GetWriter(conCtx))
						if err != nil {
							log.Err(err).Msg("Cannot copy query result to user storage")
							return
						}
					}
					objectsToDelete = append(objectsToDelete, srcObj)
					sourceIDsToDelete = append(sourceIDsToDelete, queryJob.JobResultId)
				}
			}
		}
	}

	// handling files
	files, err := s.getFiles(userCtx, datasets)

	if err != nil {
		log.Err(err).Msg("Cannot retrieve files")
		return
	}

	for _, file := range files {
		if file.SourceId != "" {
			connection, err := s.getConnectionFromFileID(userCtx, file.Id)
			if err != nil {
				log.Err(err).Msg("Cannot retrieve connection from file while publishing report")
				return
			}
			if connection == nil {
				log.Error().Msg("Connection not found while publishing report")
				return
			}
			conCtx := conn.GetCtx(userCtx, connection)
			publicStorage := storage.NewPublicStorage()
			if connection.CloudStorageBucket != publicStorage.GetDefaultBucketName() {
				// delete only of they are on the different buckets
				srcObj := publicStorage.GetObject(ctx, publicStorage.GetDefaultBucketName(), fmt.Sprintf("%s.%s", file.SourceId, getFileExtensionFromMime(file.MimeType)))
				dstObj := s.storage.GetObject(conCtx, s.getBucketNameFromConnection(connection), fmt.Sprintf("%s.%s", file.SourceId, getFileExtensionFromMime(file.MimeType)))
				err = srcObj.CopyTo(conCtx, dstObj.GetWriter(conCtx))
				if err != nil {
					log.Err(err).Msg("Cannot copy file to public storage")
					return
				}
				objectsToDelete = append(objectsToDelete, srcObj)
				sourceIDsToDelete = append(sourceIDsToDelete, file.SourceId)
			}
		}
	}

	// updating report
	_, err = s.db.ExecContext(userCtx,
		`update reports set is_public = false, updated_at = CURRENT_TIMESTAMP where id = $1`,
		reportID,
	)
	if err != nil {
		log.Err(err).Msg("Cannot update report while unpublishing report")
		return
	}
	s.reportStreams.Ping(reportID)

	// deleting objects from public storage only after all objects are copied and db update is successful
	for i, obj := range objectsToDelete {
		sourceID := sourceIDsToDelete[i]
		//query number of public reports with this sourceID
		var count int
		err = s.db.QueryRowContext(userCtx, `select
				count(*)
			from datasets d
			join reports r on r.id = d.report_id
			where r.is_public = true and (
				d.query_id in (select id from queries where job_result_id = $1)
				or d.file_id in (select id from files where file_source_id = $1)
			)`, sourceID).Scan(&count)

		if err != nil {
			log.Err(err).Msg("Cannot query number of public reports with this sourceID")
			return
		}
		if count > 0 { // sourceID is used in other public reports, do not delete
			continue
		}
		err = obj.Delete(defConnCtx)
		if err != nil {
			log.Err(err).Msg("Cannot delete object from public storage")
			return
		}
	}
}

func (s Server) publishReport(reqCtx context.Context, reportID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defConnCtx := conn.GetCtx(ctx, &proto.Connection{})
	defer cancel()
	userCtx := user.CopyUserContext(reqCtx, ctx)
	datasets, err := s.getDatasets(userCtx, reportID)
	if err != nil {
		log.Err(err).Msg("Cannot retrieve datasets")
		return
	}

	// handling queryJobs
	queryJobs, err := s.getDatasetsQueryJobs(userCtx, datasets)
	if err != nil {
		log.Err(err).Msg("Cannot retrieve queries")
		return
	}

	// moving query results to storage
	for _, queryJob := range queryJobs {
		if queryJob.JobResultId != "" { // else nothing to move
			connection, err := s.getConnectionFromQueryID(userCtx, queryJob.QueryId)
			conCtx := conn.GetCtx(userCtx, connection)
			if err != nil {
				log.Err(err).Msg("Cannot retrieve connection while publishing report")
				return
			}
			if connection == nil {
				log.Error().Msg("Connection not found while publishing report")
				return
			}
			userBucketName := s.getBucketNameFromConnection(connection)

			dwJobID, err := s.getDWJobIDFromResultID(userCtx, queryJob.JobResultId)

			if err != nil {
				log.Err(err).Msg("Cannot retrieve job id")
				return
			}

			resultURI, err := s.getResultURI(userCtx, queryJob.JobResultId)
			if err != nil {
				log.Error().Err(err).Msg("Error getting result URI")
				return
			}

			publicStorage := storage.NewPublicStorage()
			extension := "csv"
			if connection.ConnectionType == proto.ConnectionType_CONNECTION_TYPE_WHEROBOTS {
				extension = "parquet"
			}
			dstObj := publicStorage.GetObject(ctx, publicStorage.GetDefaultBucketName(), fmt.Sprintf("%s.%s", queryJob.JobResultId, extension))
			var srcObj storage.StorageObject
			if resultURI != "" {
				srcObj = storage.NewPresignedS3Storage().GetObject(conCtx, "", resultURI)
			} else if dwJobID != "" { // query result is in temporary storage
				srcObj = s.storage.GetObject(conCtx, "", dwJobID)
			} else { // query result is in user storage bucket
				srcObj = s.storage.GetObject(conCtx, userBucketName, fmt.Sprintf("%s.csv", queryJob.JobResultId))
			}
			err = srcObj.CopyTo(conCtx, dstObj.GetWriter(defConnCtx))
			if err != nil {
				log.Err(err).
					Str("resultURI", resultURI).
					Str("dwJobID", dwJobID).
					Msg("Cannot copy query result to public storage")
				return
			}
		}
	}

	// handling files
	files, err := s.getFiles(userCtx, datasets)

	if err != nil {
		log.Err(err).Msg("Cannot retrieve files")
		return
	}

	for _, file := range files {
		if file.SourceId != "" {
			connection, err := s.getConnectionFromFileID(userCtx, file.Id)
			if err != nil {
				log.Err(err).Msg("Cannot retrieve connection from file while publishing report")
				return
			}
			if connection == nil {
				log.Error().Msg("Connection not found while publishing report")
				return
			}
			conCtx := conn.GetCtx(userCtx, connection)
			publicStorage := storage.NewPublicStorage()
			dstObj := publicStorage.GetObject(ctx, publicStorage.GetDefaultBucketName(), fmt.Sprintf("%s.%s", file.SourceId, getFileExtensionFromMime(file.MimeType)))
			srcObj := s.storage.GetObject(conCtx, s.getBucketNameFromConnection(connection), fmt.Sprintf("%s.%s", file.SourceId, getFileExtensionFromMime(file.MimeType)))
			err = srcObj.CopyTo(conCtx, dstObj.GetWriter(conCtx))
			if err != nil {
				log.Err(err).Msg("Cannot copy file to public storage")
				return
			}
		}
	}

	_, err = s.db.ExecContext(userCtx,
		`update reports set is_public = true, updated_at = CURRENT_TIMESTAMP where id = $1`,
		reportID,
	)
	if err != nil {
		log.Err(err).Msg("Cannot update report while publishing report")
		return
	}

	s.reportStreams.Ping(reportID)
}

// PublishReport
func (s Server) PublishReport(ctx context.Context, req *proto.PublishReportRequest) (*proto.PublishReportResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		log.Warn().Err(Unauthenticated).Msg("Claims are required")
		return nil, Unauthenticated
	}
	_, err := uuid.Parse(req.ReportId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, err.Error())
	}
	report, err := s.getReport(ctx, req.ReportId)
	if err != nil {
		log.Err(err).Msg("Cannot retrieve report")
		return nil, status.Errorf(codes.Internal, err.Error())
	}
	if report == nil {
		err := status.Errorf(codes.NotFound, "report %s not found", req.ReportId)
		log.Warn().Err(err).Msg("Report not found while publishing report")
		return nil, err
	}
	if !report.CanWrite {
		err := status.Errorf(codes.PermissionDenied, "no permission to publish report %s", req.ReportId)
		log.Warn().Err(err).Msg("No permission to publish report")
		return nil, status.Errorf(codes.PermissionDenied, err.Error())
	}

	// Check if user is trying to publish and if they have a freemium plan
	if req.Publish {
		workspaceInfo := user.CheckWorkspaceCtx(ctx)

		// Check if user has freemium plan (TYPE_PERSONAL) and limit to 1 public map
		if workspaceInfo.PlanType == proto.PlanType_TYPE_PERSONAL {
			// Count existing public reports for this workspace
			var publicReportsCount int
			err = s.db.QueryRowContext(ctx,
				`SELECT COUNT(*) FROM reports WHERE workspace_id = $1 AND is_public = true AND NOT archived`,
				workspaceInfo.ID,
			).Scan(&publicReportsCount)
			if err != nil {
				log.Err(err).Msg("Cannot count public reports")
				return nil, status.Errorf(codes.Internal, err.Error())
			}

			// If user already has 1 public report and this report is not already public, block publishing
			if publicReportsCount >= 1 && !report.IsPublic {
				return &proto.PublishReportResponse{
					PublicMapsLimitReached: true,
				}, nil
			}
		}

		go s.publishReport(ctx, req.ReportId)
	} else {
		go s.unpublishReport(ctx, req.ReportId)
	}
	return &proto.PublishReportResponse{}, nil
}
