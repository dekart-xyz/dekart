package dekart

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/conn"
	"dekart/src/server/errtype"
	"dekart/src/server/storage"
	"dekart/src/server/user"
	"fmt"
	"net/url"
	"strconv"
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
		errtype.LogError(err, "Cannot retrieve datasets")
		return
	}

	// handling queryJobs
	queryJobs, err := s.getDatasetsQueryJobs(userCtx, datasets)
	if err != nil {
		errtype.LogError(err, "Cannot retrieve query jobs")
		return
	}

	objectsToDelete := []storage.StorageObject{}
	sourceIDsToDelete := []string{}

	for _, queryJob := range queryJobs {
		if queryJob.JobResultId != "" { // else nothing to move
			connection, err := s.getConnectionFromQueryID(userCtx, queryJob.QueryId)
			conCtx := conn.GetCtx(userCtx, connection)
			if err != nil {
				errtype.LogError(err, "Cannot retrieve connection while publishing report")
				return
			}
			if connection == nil {
				log.Error().Msg("Connection not found while publishing report")
				return
			}
			userBucketName := s.getBucketNameFromConnection(connection)
			dwJobID, err := s.getDWJobIDFromResultID(userCtx, queryJob.JobResultId)
			if err != nil {
				errtype.LogError(err, "Cannot retrieve job id")
				return
			}
			resultURI, err := s.getResultURI(userCtx, queryJob.JobResultId)
			if err != nil {
				errtype.LogError(err, "Error getting result URI")
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
							errtype.LogError(err, "Cannot copy query result to user storage")
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
		errtype.LogError(err, "Cannot retrieve files")
		return
	}

	for _, file := range files {
		if file.SourceId != "" {
			connection, err := s.getConnectionFromFileID(userCtx, file.Id)
			if err != nil {
				errtype.LogError(err, "Cannot retrieve connection from file while publishing report")
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
					errtype.LogError(err, "Cannot copy file to public storage")
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
		errtype.LogError(err, "Cannot update report while unpublishing report")
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
			errtype.LogError(err, "Cannot query number of public reports with this sourceID")
			return
		}
		if count > 0 { // sourceID is used in other public reports, do not delete
			continue
		}
		err = obj.Delete(defConnCtx)
		if err != nil {
			errtype.LogError(err, "Cannot delete object from public storage")
			return
		}
	}
}

func (s Server) checkExpiredQueryResult(ctx context.Context, reportID string) (bool, error) {
	datasets, err := s.getDatasets(ctx, reportID)
	if err != nil {
		return false, fmt.Errorf("cannot retrieve datasets: %w", err)
	}

	queryJobs, err := s.getDatasetsQueryJobs(ctx, datasets)
	if err != nil {
		return false, fmt.Errorf("cannot retrieve query jobs: %w", err)
	}

	for _, queryJob := range queryJobs {
		if queryJob.JobResultId == "" {
			continue
		}

		dwJobID, err := s.getDWJobIDFromResultID(ctx, queryJob.JobResultId)
		if err != nil {
			return false, fmt.Errorf("cannot retrieve job id: %w", err)
		}

		resultURI, err := s.getResultURI(ctx, queryJob.JobResultId)
		if err != nil {
			return false, fmt.Errorf("error getting result URI: %w", err)
		}

		if dwJobID != "" {
			// if dwJobID use checkJobExpiration
			expired, _, err := s.checkJobExpiration(ctx, queryJob.JobResultId)
			if err != nil {
				return false, fmt.Errorf("error checking job expiration: %w", err)
			}
			if expired {
				return true, nil
			}
		} else if resultURI != "" {
			// if resultURI parse presigned url and check expiration
			expired, err := s.checkPresignedURLExpiration(resultURI, time.Time{})
			if err != nil {
				return false, fmt.Errorf("error checking presigned URL expiration: %w", err)
			}
			if expired {
				return true, nil
			}
		}
	}

	return false, nil
}

// checkPresignedURLExpiration parses a presigned S3 URL and checks if it has expired
// If now is zero time, it uses time.Now() for the current time check
func (s Server) checkPresignedURLExpiration(resultURI string, now time.Time) (bool, error) {
	parsedURL, err := url.Parse(resultURI)
	if err != nil {
		return false, fmt.Errorf("failed to parse presigned URL: %w", err)
	}

	queryParams := parsedURL.Query()

	// Get X-Amz-Date (timestamp when URL was signed)
	amzDateStr := queryParams.Get("X-Amz-Date")
	if amzDateStr == "" {
		log.Error().Str("resultURI", resultURI).Msg("No X-Amz-Date in presigned URL")
		// If no X-Amz-Date, we can't determine expiration, assume not expired
		return true, nil
	}

	// Parse X-Amz-Date (format: YYYYMMDDTHHMMSSZ)
	amzDate, err := time.Parse("20060102T150405Z", amzDateStr)
	if err != nil {
		return true, err
	}

	// Get X-Amz-Expires (seconds until expiration)
	amzExpiresStr := queryParams.Get("X-Amz-Expires")
	if amzExpiresStr == "" {
		log.Error().Str("resultURI", resultURI).Msg("No X-Amz-Expires in presigned URL")
		return true, nil
	}

	amzExpires, err := strconv.ParseInt(amzExpiresStr, 10, 64)
	if err != nil {
		return true, err
	}

	// Calculate expiration time
	expirationTime := amzDate.Add(time.Duration(amzExpires) * time.Second)

	// Use provided time or current time
	currentTime := now
	if currentTime.IsZero() {
		currentTime = time.Now()
	}

	// Check if expired
	return currentTime.After(expirationTime), nil
}

func (s Server) publishReport(reqCtx context.Context, reportID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defConnCtx := conn.GetCtx(ctx, &proto.Connection{})
	defer cancel()
	userCtx := user.CopyUserContext(reqCtx, ctx)
	datasets, err := s.getDatasets(userCtx, reportID)
	if err != nil {
		errtype.LogError(err, "Cannot retrieve datasets")
		return
	}

	// handling queryJobs
	queryJobs, err := s.getDatasetsQueryJobs(userCtx, datasets)
	if err != nil {
		errtype.LogError(err, "Cannot retrieve queries")
		return
	}

	// moving query results to storage
	for _, queryJob := range queryJobs {
		if queryJob.JobResultId != "" { // else nothing to move
			connection, err := s.getConnectionFromQueryID(userCtx, queryJob.QueryId)
			conCtx := conn.GetCtx(userCtx, connection)
			if err != nil {
				errtype.LogError(err, "Cannot retrieve connection while publishing report")
				return
			}
			if connection == nil {
				log.Error().Msg("Connection not found while publishing report")
				return
			}
			userBucketName := s.getBucketNameFromConnection(connection)

			dwJobID, err := s.getDWJobIDFromResultID(userCtx, queryJob.JobResultId)

			if err != nil {
				errtype.LogError(err, "Cannot retrieve job id")
				return
			}

			resultURI, err := s.getResultURI(userCtx, queryJob.JobResultId)
			if err != nil {
				errtype.LogError(err, "Error getting result URI")
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
		errtype.LogError(err, "Cannot retrieve files")
		return
	}

	for _, file := range files {
		if file.SourceId != "" {
			connection, err := s.getConnectionFromFileID(userCtx, file.Id)
			if err != nil {
				errtype.LogError(err, "Cannot retrieve connection from file while publishing report")
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
		errtype.LogError(err, "Cannot update report while publishing report")
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
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	report, err := s.getReport(ctx, req.ReportId)
	if err != nil {
		errtype.LogError(err, "Cannot retrieve report")
		return nil, status.Error(codes.Internal, err.Error())
	}
	if report == nil {
		err := status.Errorf(codes.NotFound, "report %s not found", req.ReportId)
		log.Warn().Err(err).Msg("Report not found while publishing report")
		return nil, err
	}
	if !report.CanWrite {
		err := status.Errorf(codes.PermissionDenied, "no permission to publish report %s", req.ReportId)
		log.Warn().Err(err).Msg("No permission to publish report")
		return nil, status.Error(codes.PermissionDenied, err.Error())
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
				errtype.LogError(err, "Cannot count public reports")
				return nil, status.Error(codes.Internal, err.Error())
			}

			// If user already has 1 public report and this report is not already public, block publishing
			if publicReportsCount >= 1 && !report.IsPublic {
				return &proto.PublishReportResponse{
					PublicMapsLimitReached: true,
				}, nil
			}
		}

		// Check if query results are expired
		expired, err := s.checkExpiredQueryResult(ctx, req.ReportId)
		if err != nil {
			return nil, status.Error(codes.Internal, err.Error())
		}
		if expired {
			return nil, status.Error(codes.Aborted, "Query results are expired before publishing. Please refresh the page.")
		}
		go s.publishReport(ctx, req.ReportId)
	} else {
		go s.unpublishReport(ctx, req.ReportId)
	}
	return &proto.PublishReportResponse{}, nil
}
