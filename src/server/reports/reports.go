package reports

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// Manager lets you manipulate reports
type Manager struct {
	Db *sql.DB
}

// Report data struct
type Report struct {
	ID      string   `json:"id"`
	Queries *[]Query `json:"queries,omitempty"`
}

type Query struct {
	ID        string `json:"id"`
	ReportID  string `json:"report_id"`
	QueryText string `json:"query_text,omitempty"`
}

type createReportResponse struct {
	Report Report `json:"report"`
}

type getReportResponse struct {
	Report Report `json:"report"`
}

type createQueryRequest struct {
	Query Query `json:"query"`
}

type createQueryResponse struct {
	Query Query `json:"query"`
}

type errorResponse struct {
	ErrorMessage string `json:"errorMessage"`
}

func responceError(w http.ResponseWriter, r *http.Request, err error, statusCode int) {
	log.Err(err).Send()
	w.WriteHeader(http.StatusInternalServerError)
	jsonResponse(w, &errorResponse{
		ErrorMessage: err.Error(),
	})
}

// GetReportHandler updates report props
func (m *Manager) GetReportHandler(ctx context.Context, reportID string, w http.ResponseWriter, r *http.Request) {
	reportRows, err := m.Db.QueryContext(ctx,
		"select id from reports where id=$1 limit 1",
		reportID,
	)
	if err != nil {
		responceError(w, r, err, http.StatusInternalServerError)
		return
	}
	defer reportRows.Close()
	queries := make([]Query, 0)
	report := Report{
		Queries: &queries,
	}
	for reportRows.Next() {
		err = reportRows.Scan(&report.ID)
		if err != nil {
			responceError(w, r, err, http.StatusInternalServerError)
			return
		}
	}
	if report.ID == "" {
		responceError(w, r, fmt.Errorf("report not found"), http.StatusNotFound)
		return
	}
	queryRows, err := m.Db.QueryContext(ctx,
		`select id, query_text from queries where report_id=$1`,
		reportID,
	)
	if err != nil {
		responceError(w, r, err, http.StatusInternalServerError)
		return
	}
	defer queryRows.Close()
	for queryRows.Next() {
		query := Query{
			ReportID: reportID,
		}
		if err := queryRows.Scan(
			&query.ID,
			&query.QueryText,
		); err != nil {
			responceError(w, r, err, http.StatusInternalServerError)
			return
		}
		queries = append(queries, query)
	}

	jsonResponse(w, &getReportResponse{
		Report: report,
	})
}

func jsonResponse(w http.ResponseWriter, res interface{}) {
	w.Header().Set("Content-Type", "application/json")
	err := json.NewEncoder(w).Encode(res)
	if err != nil {
		log.Err(err).Send()
	}
}

// CreateQueryHandler updates report props
func (m *Manager) CreateQueryHandler(ctx context.Context, reportID string, w http.ResponseWriter, r *http.Request) {
	request := &createQueryRequest{}
	err := json.NewDecoder(r.Body).Decode(request)
	if err != nil {
		responceError(w, r, err, http.StatusBadRequest)
		return
	}
	u, err := uuid.NewRandom()
	if err != nil {
		responceError(w, r, err, http.StatusInternalServerError)
		return
	}
	_, err = m.Db.ExecContext(ctx,
		"INSERT INTO queries (id, report_id, query_text) VALUES ($1, $2, $3)",
		u.String(),
		reportID,
		request.Query.QueryText,
	)
	if err != nil {
		responceError(w, r, err, http.StatusBadRequest)
		return
	}

	jsonResponse(w, createQueryResponse{
		Query: Query{
			ReportID: reportID,
			ID:       u.String(),
		},
	})
	return
}

// func (m *Manager) GetReportHandler(ctx context.Context, w http.ResponseWriter, r *http.Request) {}

// CreateReportHandler for api endpoint
func (m *Manager) CreateReportHandler(ctx context.Context, w http.ResponseWriter, r *http.Request) {
	u, err := uuid.NewRandom()
	if err != nil {
		responceError(w, r, err, http.StatusInternalServerError)
		return
	}
	report := Report{
		ID: u.String(),
	}

	_, err = m.Db.ExecContext(ctx,
		"INSERT INTO reports (id) VALUES ($1)",
		u.String(),
	)
	if err != nil {
		responceError(w, r, err, http.StatusInternalServerError)
		return
	}
	// w.WriteHeader(http.StatusAccepted)
	jsonResponse(w, createReportResponse{
		Report: report,
	})
}
