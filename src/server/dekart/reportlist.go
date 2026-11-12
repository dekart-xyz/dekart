package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/conn"
	"dekart/src/server/errtype"
	"dekart/src/server/user"
	"strconv"
	"time"

	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// sendReportList sends visible reports and their connection types together.
func (s Server) sendReportList(ctx context.Context, srv proto.Dekart_GetReportListStreamServer, sequence int64) error {
	claims := user.GetClaims(ctx)

	// Match getReport's sharing rule before adding email recipients to the list.
	sharable := `(
		select count(*) from connections as c
		join datasets as d on c.id=d.connection_id
		where d.report_id=r.id and c.cloud_storage_bucket is not null and (
			c.cloud_storage_bucket != '' or c.connection_type > 1
			or (c.bigquery_key_encrypted is not null and c.bigquery_key_encrypted != '')
		)
	) = (
		select count(*) from connections as c
		join datasets as d on c.id=d.connection_id
		where d.report_id=r.id
	)`
	// Server-configured connections use the instance-wide sharing setting instead.
	if !conn.IsUserDefined() {
		sharable = strconv.FormatBool(conn.CanShareReports())
	}
	// Reuse the filter so listed maps and their connection types cannot diverge.
	filter := `(r.author_email=$1
		or (r.discoverable=true and r.archived=false)
		or r.allow_edit=true
		or (r.archived=false and (r.is_public=true or (` + sharable + `)) and (
			select status from report_access_log
			where report_id=r.id and email=$2
			order by created_at desc limit 1
		) != 2)
	) and r.workspace_id=$3`

	args := []any{claims.Email, claims.Email, checkWorkspace(ctx).ID}
	// Playground lists contain only the caller's own maps.
	if checkWorkspace(ctx).ID == "" {
		filter = "r.author_email=$1 and r.is_playground=true"
		args = []any{claims.Email}
	}

	reportRows, err := s.db.QueryContext(ctx,
		`select
				r.id,
				case when r.title is null then 'Untitled' else r.title end as title,
				r.archived,
				(r.author_email = $1) or r.allow_edit as can_write,
				r.author_email = $1 as is_author,
				r.author_email,
				r.discoverable,
				r.allow_edit,
				r.updated_at,
				r.created_at,
				r.is_public,
				r.track_viewers,
				r.is_playground,
				exists (
					select 1
					from (
						select email, access_level, status,
							row_number() over (partition by email order by created_at desc) as rn
						from report_access_log
						where report_id = r.id
					) t
					where rn = 1 and status != 2
				) as has_direct_access,
				r.version_id,
				r.map_config,
				case when mp.report_id is not null then true else false end as has_map_preview
			from reports as r
			left join map_previews as mp on r.id = mp.report_id
			where `+filter+`
			order by r.updated_at desc`,
		args...,
	)
	if err != nil {
		return GRPCError("Cannot query report list", err)
	}
	defer reportRows.Close() // Ensure cleanup even on early return

	// Process report rows first and collect them
	reports := make([]*proto.Report, 0)
	for reportRows.Next() {
		report := proto.Report{}
		createdAt := time.Time{}
		updatedAt := time.Time{}
		var versionID sql.NullString
		var mapConfig sql.NullString
		err = reportRows.Scan(
			&report.Id,
			&report.Title,
			&report.Archived,
			&report.CanWrite,
			&report.IsAuthor,
			&report.AuthorEmail,
			&report.Discoverable,
			&report.AllowEdit,
			&updatedAt,
			&createdAt,
			&report.IsPublic,
			&report.TrackViewers,
			&report.IsPlayground,
			&report.HasDirectAccess,
			&versionID,
			&mapConfig,
			&report.HasMapPreview,
		)
		if err != nil {
			return GRPCError("Cannot scan report row", err)
		}
		report.CreatedAt = createdAt.Unix()
		report.UpdatedAt = updatedAt.Unix()
		report.VersionId = versionID.String
		report.MapConfig = mapConfig.String

		reports = append(reports, &report)
	}
	reportRows.Close() // Close reportRows before querying connectionTypeRows

	// Query connection types using the same WHERE conditions as reports
	var connectionTypesMap map[string]map[int32]bool
	connectionTypeRows, err := s.db.QueryContext(ctx,
		`select distinct d.report_id, c.connection_type
		from datasets as d
		left join connections as c on d.connection_id = c.id
		inner join reports as r on d.report_id = r.id
		where `+filter+` and c.connection_type is not null`,
		args...,
	)
	if err == nil {
		defer connectionTypeRows.Close()
		connectionTypesMap = make(map[string]map[int32]bool)
		for connectionTypeRows.Next() {
			var reportID string
			var connectionType sql.NullInt32
			if err := connectionTypeRows.Scan(&reportID, &connectionType); err == nil {
				if connectionTypesMap[reportID] == nil {
					connectionTypesMap[reportID] = make(map[int32]bool)
				}
				connectionTypesMap[reportID][connectionType.Int32] = true
			}
		}
	}

	// Assign connection types to reports
	for _, report := range reports {
		for ct := range connectionTypesMap[report.Id] {
			report.ConnectionTypes = append(report.ConnectionTypes, proto.ConnectionType(ct))
		}
	}

	res := proto.ReportListResponse{
		Reports: reports,
		StreamOptions: &proto.StreamOptions{
			Sequence: sequence,
		},
	}
	err = srv.Send(&res)
	if err != nil {
		if errtype.TransportClosingRe.MatchString(err.Error()) {
			log.Warn().Err(err).Msg("Client disconnected during stream")
			return nil // Client disconnected gracefully
		}
		log.Err(err).Send()
		return status.Error(codes.Internal, err.Error())
	}
	return nil
}
