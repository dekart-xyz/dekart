package dekart

import (
	"dekart/src/proto"
	"dekart/src/server/conn"
	"dekart/src/server/errtype"
	"dekart/src/server/storage"
	"fmt"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"github.com/rs/zerolog/log"
)

const defaultMaxUploadPartSize = 24 * 1000 * 1000 // 24 MB

// HandleStartFileUploadSession creates upload session and reserves file metadata for direct multipart upload.
func (s Server) HandleStartFileUploadSession(w http.ResponseWriter, r *http.Request) {
	if !isFileUploadEnabled() {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	fileID := mux.Vars(r)["id"]
	request := &proto.CreateFileUploadSessionRequest{}
	if err := readProtoJSON(r, request); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(request.GetName()) == "" || strings.TrimSpace(request.GetMimeType()) == "" || request.GetTotalSize() <= 0 {
		http.Error(w, "name, mime_type and total_size are required", http.StatusBadRequest)
		return
	}

	ctxData, err := s.requireFileUploadSessionContext(r.Context(), fileID)
	if err != nil {
		handleFileUploadSessionError(w, err)
		return
	}

	maxFileSize := getMaxFileUploadSize()
	if request.GetTotalSize() > maxFileSize {
		http.Error(w, "file size exceeds maximum allowed size", http.StatusRequestEntityTooLarge)
		return
	}

	fileExtension := getFileExtensionFromMime(request.GetMimeType())
	if fileExtension == "" {
		http.Error(w, "unsupported file type", http.StatusBadRequest)
		return
	}

	fileSourceID := newUUID()
	if err := s.markFileUploadStarted(r.Context(), fileID, fileSourceID, request); err != nil {
		errtype.LogError(err, "mark file upload started failed")
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	maxPartSize := defaultMaxUploadPartSize
	if request.GetTotalSize() < int64(maxPartSize) {
		maxPartSize = int(request.GetTotalSize())
	}
	objectName := fmt.Sprintf("%s.%s", fileSourceID, fileExtension)
	uploadOutput, err := s.storage.StartUploadSession(
		conn.GetCtx(r.Context(), ctxData.connection),
		storage.StartUploadSessionInput{
			BucketName:  ctxData.bucketName,
			ObjectName:  objectName,
			TotalSize:   request.GetTotalSize(),
			MaxPartSize: int64(maxPartSize),
		},
	)
	if err != nil {
		log.Error().Err(err).Str("file_id", fileID).Msg("start upload session failed")
		http.Error(w, "failed to start upload session", http.StatusBadRequest)
		return
	}

	response := &proto.CreateFileUploadSessionResponse{
		UploadSessionId:    uploadOutput.ProviderSessionID,
		MaxPartSize:        uploadOutput.MaxPartSize,
		UploadPartEndpoint: fmt.Sprintf("/api/v1/file/%s/upload-sessions/%s/parts/{part_number}", fileID, uploadOutput.ProviderSessionID),
		RequiredHeaders:    convertUploadHeadersToProto(uploadOutput.RequiredHeaders),
		ExpiresIn:          maxInt64(0, int64(uploadOutput.ExpiresAt.Sub(nowUTC()).Seconds())),
	}
	writeProtoJSON(w, http.StatusOK, response)
	s.reportStreams.Ping(ctxData.reportID)
}

// HandleUploadFilePart stores one upload chunk through Dekart server and returns part manifest metadata.
func (s Server) HandleUploadFilePart(w http.ResponseWriter, r *http.Request) {
	if !isFileUploadEnabled() {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	fileID := mux.Vars(r)["id"]
	sessionID := mux.Vars(r)["session_id"]
	partNumber, err := parsePositiveInt64(mux.Vars(r)["part_number"])
	if err != nil {
		http.Error(w, "invalid part_number", http.StatusBadRequest)
		return
	}
	partSize, err := parsePositiveInt64(r.URL.Query().Get("part_size"))
	if err != nil {
		http.Error(w, "invalid part_size", http.StatusBadRequest)
		return
	}
	if partSize > defaultMaxUploadPartSize {
		http.Error(w, "part_size exceeds max_part_size", http.StatusBadRequest)
		return
	}
	if r.ContentLength > 0 && r.ContentLength != partSize {
		http.Error(w, "content-length does not match part_size", http.StatusBadRequest)
		return
	}

	ctxData, err := s.requireFileUploadSessionContext(r.Context(), fileID)
	if err != nil {
		handleFileUploadSessionError(w, err)
		return
	}
	objectName, err := buildFileObjectName(ctxData.fileSourceID, ctxData.mimeType)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	partOutput, err := s.storage.UploadPart(
		conn.GetCtx(r.Context(), ctxData.connection),
		storage.UploadPartInput{
			BucketName:        ctxData.bucketName,
			ObjectName:        objectName,
			ProviderSessionID: sessionID,
			PartNumber:        partNumber,
			PartSize:          partSize,
			Body:              r.Body,
		},
	)
	if err != nil {
		log.Error().Err(err).Str("file_id", fileID).Int64("part_number", partNumber).Msg("upload part failed")
		http.Error(w, "failed to upload part", http.StatusBadRequest)
		return
	}

	writeProtoJSON(w, http.StatusOK, &proto.FileUploadPartManifestItem{
		PartNumber: partNumber,
		Etag:       partOutput.ETag,
		Size:       partOutput.Size,
	})
}

// HandleCompleteFileUploadSession finalizes provider upload and marks file as stored.
func (s Server) HandleCompleteFileUploadSession(w http.ResponseWriter, r *http.Request) {
	if !isFileUploadEnabled() {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	fileID := mux.Vars(r)["id"]
	sessionID := mux.Vars(r)["session_id"]
	request := &proto.CompleteFileUploadSessionRequest{}
	if err := readProtoJSON(r, request); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if request.GetTotalSize() <= 0 || len(request.GetParts()) == 0 {
		http.Error(w, "parts and total_size are required", http.StatusBadRequest)
		return
	}

	ctxData, err := s.requireFileUploadSessionContext(r.Context(), fileID)
	if err != nil {
		handleFileUploadSessionError(w, err)
		return
	}

	fileStatus, fileSize, err := s.getFileStatusAndSize(r.Context(), fileID)
	if err != nil {
		errtype.LogError(err, "get file status failed")
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if fileSize <= 0 {
		http.Error(w, "upload session is not initialized", http.StatusBadRequest)
		return
	}
	if request.GetTotalSize() != fileSize {
		http.Error(w, "total_size does not match started upload session", http.StatusBadRequest)
		return
	}
	if fileSize > getMaxFileUploadSize() {
		http.Error(w, "file size exceeds maximum allowed size", http.StatusRequestEntityTooLarge)
		return
	}
	if fileStatus == int64(proto.File_STATUS_STORED) {
		// why: complete must be idempotent for client retries after success.
		writeProtoJSON(w, http.StatusOK, &proto.CompleteFileUploadSessionResponse{
			Status:   "completed",
			FileId:   fileID,
			SourceId: ctxData.fileSourceID,
			Size:     fileSize,
		})
		return
	}

	objectName, err := buildFileObjectName(ctxData.fileSourceID, ctxData.mimeType)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	parts := make([]storage.CompleteUploadPart, 0, len(request.GetParts()))
	for _, part := range request.GetParts() {
		parts = append(parts, storage.CompleteUploadPart{
			PartNumber: part.GetPartNumber(),
			ETag:       part.GetEtag(),
			Size:       part.GetSize(),
		})
	}
	completeOutput, err := s.storage.CompleteUploadSession(
		conn.GetCtx(r.Context(), ctxData.connection),
		storage.CompleteUploadSessionInput{
			BucketName:        ctxData.bucketName,
			ObjectName:        objectName,
			ProviderSessionID: sessionID,
			Parts:             parts,
			TotalSize:         fileSize,
		},
	)
	if err != nil {
		log.Error().Err(err).Str("file_id", fileID).Msg("complete upload session failed")
		http.Error(w, "failed to complete upload session", http.StatusBadRequest)
		return
	}

	if err = s.markFileUploadCompleted(r.Context(), fileID, completeOutput.Size); err != nil {
		errtype.LogError(err, "mark file upload completed failed")
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if err = s.storage.AbortUploadSession(
		conn.GetCtx(r.Context(), ctxData.connection),
		storage.AbortUploadSessionInput{
			BucketName:        ctxData.bucketName,
			ObjectName:        objectName,
			ProviderSessionID: sessionID,
		},
	); err != nil {
		// why: cleanup is best-effort after durable DB state is committed.
		log.Warn().Err(err).Str("file_id", fileID).Msg("failed to cleanup upload session after completion")
	}
	writeProtoJSON(w, http.StatusOK, &proto.CompleteFileUploadSessionResponse{
		Status:   "completed",
		FileId:   fileID,
		SourceId: ctxData.fileSourceID,
		Size:     completeOutput.Size,
	})
	s.reportStreams.Ping(ctxData.reportID)
}

// HandleAbortFileUploadSession aborts provider upload state for file upload session.
func (s Server) HandleAbortFileUploadSession(w http.ResponseWriter, r *http.Request) {
	if !isFileUploadEnabled() {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	fileID := mux.Vars(r)["id"]
	sessionID := mux.Vars(r)["session_id"]
	ctxData, err := s.requireFileUploadSessionContext(r.Context(), fileID)
	if err != nil {
		handleFileUploadSessionError(w, err)
		return
	}
	objectName, err := buildFileObjectName(ctxData.fileSourceID, ctxData.mimeType)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	err = s.storage.AbortUploadSession(
		conn.GetCtx(r.Context(), ctxData.connection),
		storage.AbortUploadSessionInput{
			BucketName:        ctxData.bucketName,
			ObjectName:        objectName,
			ProviderSessionID: sessionID,
		},
	)
	if err != nil {
		log.Error().Err(err).Str("file_id", fileID).Msg("abort upload session failed")
		http.Error(w, "failed to abort upload session", http.StatusBadRequest)
		return
	}
	writeProtoJSON(w, http.StatusOK, &proto.AbortFileUploadSessionResponse{Status: "aborted"})
}
