package dekart

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/user"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s Server) getReportAnalytics(ctx context.Context, report *proto.Report) (*proto.ReportAnalytics, error) {

	if !report.IsPublic {
		return nil, nil
	}

	var reportAnalytics proto.ReportAnalytics

	err := s.db.QueryRowContext(ctx,
		`select
			(select count(*) from report_analytics where report_id=$1) as viewers_total,
			(select count(*) from report_analytics where report_id=$1 and updated_at > now() - interval '7 days') as viewers_7d,
			(select count(*) from report_analytics where report_id=$1 and updated_at > now() - interval '1 day') as viewers_24h`,
		report.Id,
	).Scan(
		&reportAnalytics.ViewersTotal,
		&reportAnalytics.Viewers_7D,
		&reportAnalytics.Viewers_24H,
	)
	if err != nil {
		return nil, err
	}
	return &reportAnalytics, nil
}

// GetReportAnalytics returns report analytics
func (s Server) GetReportAnalytics(ctx context.Context, req *proto.GetReportAnalyticsRequest) (*proto.GetReportAnalyticsResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}

	_, err := uuid.Parse(req.ReportId)
	if err != nil {
		log.Err(err).Msg("invalid report id")
		return nil, status.Error(codes.InvalidArgument, "invalid report id")
	}

	report, err := s.getReport(ctx, req.ReportId)
	if err != nil {
		log.Err(err).Msg("failed to get report")
		return nil, status.Error(codes.Internal, "failed to get report")
	}
	if report == nil {
		return nil, status.Error(codes.NotFound, "report not found")
	}

	if !(report.CanWrite && report.IsPublic) {
		return nil, status.Error(codes.PermissionDenied, "report is not public")
	}

	reportAnalytics, err := s.getReportAnalytics(ctx, report)

	if err != nil {
		log.Err(err).Msg("failed to get report analytics")
		return nil, status.Error(codes.Internal, "failed to get report analytics")
	}

	return &proto.GetReportAnalyticsResponse{
		Analytics: reportAnalytics,
	}, nil

}

func (s Server) ServeReportAnalytics(w http.ResponseWriter, r *http.Request) {
	reportID := mux.Vars(r)["report"]
	ctx := r.Context()

	claims := user.GetClaims(ctx)
	if claims == nil {
		http.Error(w, Unauthenticated.Error(), http.StatusUnauthorized)
		return
	}

	workspaceInfo := checkWorkspace(ctx)
	if workspaceInfo.PlanType < proto.PlanType_TYPE_TEAM {
		http.Error(w, "not allowed", http.StatusForbidden)
		return
	}

	_, err := uuid.Parse(reportID)
	if err != nil {
		log.Err(err).Msg("invalid report id")
		http.Error(w, "invalid report id", http.StatusBadRequest)
		return
	}

	report, err := s.getReport(ctx, reportID)

	if err != nil {
		log.Err(err).Msg("failed to get report")
		http.Error(w, "failed to get report", http.StatusInternalServerError)
		return
	}
	if report == nil {
		http.Error(w, "report not found", http.StatusNotFound)
		return
	}

	if !(report.CanWrite && report.IsPublic) {
		http.Error(w, "report is not public", http.StatusForbidden)
		return
	}

	// query report data form  report_analytics

	res, err := s.db.QueryContext(ctx, "SELECT report_id, email, created_at, updated_at FROM report_analytics WHERE report_id = $1", reportID)
	if err != nil {
		log.Err(err).Msg("failed to get report analytics")
		http.Error(w, "failed to get report analytics", http.StatusInternalServerError)
		return
	}
	defer res.Close()

	// Write report data to response
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.WriteHeader(http.StatusOK)

	// write csv header
	w.Write([]byte("report_id,email,created_at,updated_at\n"))

	// write csv data
	for res.Next() {
		var reportID string
		var email string
		var createdAt string
		var updatedAt string
		err = res.Scan(&reportID, &email, &createdAt, &updatedAt)
		if err != nil {
			log.Err(err).Msg("failed to scan report analytics")
			http.Error(w, "failed to scan report analytics", http.StatusInternalServerError)
			return
		}
		w.Write([]byte(reportID + "," + email + "," + createdAt + "," + updatedAt + "\n"))
	}
}
