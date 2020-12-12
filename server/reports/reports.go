package reports

import (
	"encoding/json"
	"net/http"

	"github.com/rs/zerolog/log"
)

// Manager lets you manipulate reports
type Manager struct{}

type createReportResponse struct{}

// CreateReportHandler for api endpoint
func (m *Manager) CreateReportHandler(w http.ResponseWriter, r *http.Request) {
	// w.WriteHeader(http.StatusAccepted)
	w.Header().Set("Content-Type", "application/json")
	err := json.NewEncoder(w).Encode(createReportResponse{})
	if err != nil {
		log.Err(err).Send()
	}
}
