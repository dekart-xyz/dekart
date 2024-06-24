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
	defer cancel()
	userCtx := user.CopyUserContext(reqCtx, ctx)
	datasets, err := s.getDatasets(userCtx, reportID)
	if err != nil {
		log.Err(err).Msg("Cannot retrieve datasets")
		return
	}

	// handling queries
	queries, err := s.getQueries(userCtx, datasets)
	if err != nil {
		log.Err(err).Msg("Cannot retrieve queries")
		return
	}

	objectsToDelete := []storage.StorageObject{}
	sourceIDsToDelete := []string{}

	for _, query := range queries {
		if query.JobResultId != "" { // else nothing to move
			connection, err := s.getConnectionFromQueryID(userCtx, query.Id)
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
			dwJobID, err := s.getDWJobIDFromResultID(userCtx, query.JobResultId)
			if err != nil {
				log.Err(err).Msg("Cannot retrieve job id")
				return
			}
			if dwJobID != "" { // query result is in temporary storage, we need just to remove from public storage
				publicStorage := storage.NewPublicStorage()
				obj := publicStorage.GetObject(ctx, publicStorage.GetDefaultBucketName(), fmt.Sprintf("%s.csv", query.JobResultId))
				objectsToDelete = append(objectsToDelete, obj)
				sourceIDsToDelete = append(sourceIDsToDelete, query.JobResultId)
			} else {
				// query result is in user storage bucket, we need to move it back
				publicStorage := storage.NewPublicStorage()
				srcObj := publicStorage.GetObject(ctx, publicStorage.GetDefaultBucketName(), fmt.Sprintf("%s.csv", query.JobResultId))
				if userBucketName != "" {
					dstObj := s.storage.GetObject(conCtx, userBucketName, fmt.Sprintf("%s.csv", query.JobResultId))
					err = srcObj.CopyTo(conCtx, dstObj.GetWriter(ctx))
					if err != nil {
						log.Err(err).Msg("Cannot copy query result to user storage")
						return
					}
				}
				objectsToDelete = append(objectsToDelete, srcObj)
				sourceIDsToDelete = append(sourceIDsToDelete, query.JobResultId)
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
			srcObj := publicStorage.GetObject(ctx, publicStorage.GetDefaultBucketName(), fmt.Sprintf("%s.%s", file.SourceId, getFileExtension(file.MimeType)))
			dstObj := s.storage.GetObject(conCtx, s.getBucketNameFromConnection(connection), fmt.Sprintf("%s.%s", file.SourceId, getFileExtension(file.MimeType)))
			err = srcObj.CopyTo(userCtx, dstObj.GetWriter(ctx))
			if err != nil {
				log.Err(err).Msg("Cannot copy file to public storage")
				return
			}
			objectsToDelete = append(objectsToDelete, srcObj)
			sourceIDsToDelete = append(sourceIDsToDelete, file.SourceId)
		}
	}

	// updating report
	_, err = s.db.ExecContext(userCtx,
		`update reports set is_public = false, updated_at = now() where id = $1`,
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
				or d.file_id in (select id from files where source_id = $1)
			)`, sourceID).Scan(&count)

		if err != nil {
			log.Err(err).Msg("Cannot query number of public reports with this sourceID")
			return
		}
		if count > 0 { // sourceID is used in other public reports, do not delete
			continue
		}
		err = obj.Delete(ctx)
		if err != nil {
			log.Err(err).Msg("Cannot delete object from public storage")
			return
		}
	}
}

func (s Server) publishReport(reqCtx context.Context, reportID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	userCtx := user.CopyUserContext(reqCtx, ctx)
	datasets, err := s.getDatasets(userCtx, reportID)
	if err != nil {
		log.Err(err).Msg("Cannot retrieve datasets")
		return
	}

	// handling queries
	queries, err := s.getQueries(userCtx, datasets)
	if err != nil {
		log.Err(err).Msg("Cannot retrieve queries")
		return
	}

	// moving query results to storage
	for _, query := range queries {
		if query.JobResultId != "" { // else nothing to move
			connection, err := s.getConnectionFromQueryID(userCtx, query.Id)
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

			// moving query text to database
			if query.QuerySource == proto.Query_QUERY_SOURCE_STORAGE {
				queryText, err := s.getQueryText(conCtx, query.QuerySourceId, userBucketName)
				if err != nil {
					log.Err(err).Msg("Cannot retrieve query text")
					return
				}
				err = s.storeQuerySync(conCtx, query.Id, queryText, query.QuerySourceId)
				if err != nil {
					log.Err(err).Msg("Cannot store query")
					return
				}
			}

			dwJobID, err := s.getDWJobIDFromResultID(userCtx, query.JobResultId)
			if err != nil {
				log.Err(err).Msg("Cannot retrieve job id")
				return
			}
			publicStorage := storage.NewPublicStorage()
			dstObj := publicStorage.GetObject(ctx, publicStorage.GetDefaultBucketName(), fmt.Sprintf("%s.csv", query.JobResultId))
			var srcObj storage.StorageObject
			if dwJobID != "" { // query result is in temporary storage
				srcObj = s.storage.GetObject(conCtx, "", dwJobID)
			} else { // query result is in user storage bucket
				srcObj = s.storage.GetObject(conCtx, userBucketName, fmt.Sprintf("%s.csv", query.JobResultId))
			}
			err = srcObj.CopyTo(userCtx, dstObj.GetWriter(ctx))
			if err != nil {
				log.Err(err).Msg("Cannot copy query result to public storage")
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
			dstObj := publicStorage.GetObject(ctx, publicStorage.GetDefaultBucketName(), fmt.Sprintf("%s.%s", file.SourceId, getFileExtension(file.MimeType)))
			srcObj := s.storage.GetObject(conCtx, s.getBucketNameFromConnection(connection), fmt.Sprintf("%s.%s", file.SourceId, getFileExtension(file.MimeType)))
			err = srcObj.CopyTo(userCtx, dstObj.GetWriter(ctx))
			if err != nil {
				log.Err(err).Msg("Cannot copy file to public storage")
				return
			}
		}
	}

	_, err = s.db.ExecContext(userCtx,
		`update reports set is_public = true, updated_at = now() where id = $1`,
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
		log.Debug().Err(Unauthenticated).Send()
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
		log.Warn().Err(err).Send()
		return nil, err
	}
	if !report.CanWrite {
		err := status.Errorf(codes.PermissionDenied, "no permission to publish report %s", req.ReportId)
		log.Warn().Err(err).Send()
		return nil, status.Errorf(codes.PermissionDenied, err.Error())
	}
	if req.Publish {
		go s.publishReport(ctx, req.ReportId)
	} else {
		go s.unpublishReport(ctx, req.ReportId)
	}
	return &proto.PublishReportResponse{}, nil
}
