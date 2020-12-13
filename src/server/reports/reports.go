package reports

import (
	"context"
	"database/sql"
	"encoding/json"
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
	ID string `json:"id"`
}

type createReportResponse struct {
	Report Report `json:"report"`
}
type errorResponse struct {
	ErrorMessage string `json:"errorMessage"`
}

func internalServerError(w http.ResponseWriter, r *http.Request, err error) {
	log.Err(err).Send()
	w.WriteHeader(http.StatusInternalServerError)
	err = json.NewEncoder(w).Encode(errorResponse{
		ErrorMessage: err.Error(),
	})
	if err != nil {
		log.Err(err).Send()
	}
}

// CreateReportHandler for api endpoint
func (m *Manager) CreateReportHandler(ctx context.Context, w http.ResponseWriter, r *http.Request) {
	u, err := uuid.NewRandom()
	if err != nil {
		internalServerError(w, r, err)
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
		internalServerError(w, r, err)
		return
	}
	// w.WriteHeader(http.StatusAccepted)
	w.Header().Set("Content-Type", "application/json")
	err = json.NewEncoder(w).Encode(createReportResponse{
		Report: report,
	})
	if err != nil {
		log.Err(err).Send()
	}
}
