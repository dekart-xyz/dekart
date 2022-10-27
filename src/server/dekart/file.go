package dekart

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/user"
	"fmt"
	"time"

	"github.com/lib/pq"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s Server) CreateFile(ctx context.Context, req *proto.CreateFileRequest) (*proto.CreateFileResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}

	reportID, err := s.getReportID(ctx, req.DatasetId, claims.Email)

	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	if reportID == nil {
		err := fmt.Errorf("dataset not found or permission not granted")
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}

	id := newUUID()

	_, err = s.db.ExecContext(ctx,
		`insert into files (id) values ($1)`,
		id,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	result, err := s.db.ExecContext(ctx,
		`update datasets set file_id=$1 where id=$2 and file_id is null`,
		id,
		req.DatasetId,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	affectedRows, err := result.RowsAffected()
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	if affectedRows == 0 {
		log.Warn().Str("report", *reportID).Str("dataset", req.DatasetId).Msg("dataset file was already created")
	}

	s.reportStreams.Ping(*reportID)

	return &proto.CreateFileResponse{}, nil
}

func (s Server) getFiles(ctx context.Context, datasets []*proto.Dataset) ([]*proto.File, error) {
	files := make([]*proto.File, 0)
	fileIds := make([]string, 0)
	for _, dataset := range datasets {
		if dataset.FileId != "" {
			fileIds = append(fileIds, dataset.FileId)
		}
	}

	if len(fileIds) > 0 {
		fileRows, err := s.db.QueryContext(ctx,
			`select
				id,
				created_at,
				updated_at
			from files where id = ANY($1) order by created_at asc`,
			pq.Array(fileIds),
		)
		if err != nil {
			log.Error().Err(err).Msg("select from files failed")
			return nil, err
		}
		defer fileRows.Close()
		for fileRows.Next() {
			file := proto.File{}
			var createdAt time.Time
			var updatedAt time.Time
			if err = fileRows.Scan(
				&file.Id,
				&createdAt,
				&updatedAt,
			); err != nil {
				log.Error().Err(err).Msg("scan file list failed")
				return nil, err
			}
			files = append(files, &file)
		}
	}

	return files, nil
}
