package dekart

import (
	"dekart/src/proto"
	"net/http"
)

// HandleCreateReport wraps CreateReport RPC with protojson HTTP endpoint.
func (s *Server) HandleCreateReport(w http.ResponseWriter, r *http.Request) {
	request := &proto.CreateReportRequest{}
	if err := readProtoJSON(r, request); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	response, err := s.CreateReport(r.Context(), request)
	if err != nil {
		writeGrpcErrorAsHTTP(w, err, "create report")
		return
	}
	writeProtoJSON(w, http.StatusOK, response)
}
