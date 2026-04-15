import { del, post, put } from './api'

const uploadRetryCount = 3
const uploadRetryDelayMs = 500

// buildUploadParts returns deterministic part boundaries for one file and strict max part size.
export function buildUploadParts (fileSize, maxPartSize) {
  if (fileSize <= 0 || maxPartSize <= 0) {
    return []
  }
  const parts = []
  let offset = 0
  let partNumber = 1
  while (offset < fileSize) {
    const size = Math.min(maxPartSize, fileSize - offset)
    parts.push({
      partNumber,
      offset,
      size
    })
    offset += size
    partNumber += 1
  }
  return parts
}

// sliceFilePart returns a Blob for one upload part boundary.
export function sliceFilePart (file, offset, size) {
  return file.slice(offset, offset + size)
}

// runFileUploadSession orchestrates start, part upload, complete and best-effort abort on failure.
export async function runFileUploadSession ({
  fileId,
  file,
  token,
  dispatch,
  actions,
  track
}) {
  const uploadSession = await createFileUploadSession(fileId, file, token)
  const uploadSessionId = uploadSession.upload_session_id
  const maxPartSize = Number(uploadSession.max_part_size)
  if (!uploadSessionId || !Number.isFinite(maxPartSize) || maxPartSize <= 0) {
    throw new Error('invalid upload session response')
  }
  const parts = buildUploadParts(file.size, maxPartSize)

  dispatch(actions.uploadFilePhase(fileId, 'uploading', {
    uploadSessionId,
    partsTotal: parts.length
  }))
  track('FileUploadSessionStarted', { fileId, uploadSessionId, partsTotal: parts.length })

  const manifest = []
  let loaded = 0

  try {
    for (const part of parts) {
      const blob = sliceFilePart(file, part.offset, part.size)
      const uploadedPart = await withRetry(
        () => uploadPart(fileId, uploadSessionId, part.partNumber, part.size, blob, token),
        uploadRetryCount
      )
      manifest.push({
        part_number: uploadedPart.part_number || part.partNumber,
        etag: uploadedPart.etag || '',
        size: uploadedPart.size || part.size
      })
      loaded += part.size
      dispatch(actions.uploadFileProgress(fileId, loaded, file.size, part.partNumber, parts.length))
      track('FileUploadPartUploaded', {
        fileId,
        uploadSessionId,
        partNumber: part.partNumber,
        partSize: part.size
      })
    }

    dispatch(actions.uploadFilePhase(fileId, 'completing'))
    const completeResponse = await withRetry(
      () => completeFileUploadSession(fileId, uploadSessionId, manifest, file.size, token),
      uploadRetryCount
    )
    dispatch(actions.uploadFileDone(fileId, completeResponse))
    track('FileUploadSessionCompleted', { fileId, uploadSessionId, size: completeResponse?.size || file.size })
  } catch (error) {
    await abortFileUploadSession(fileId, uploadSessionId, token).catch(() => {})
    track('FileUploadSessionAborted', { fileId, uploadSessionId })
    throw error
  }
}

// uploadPart uploads one chunk to server and returns manifest metadata.
export async function uploadPart (fileId, uploadSessionId, partNumber, partSize, blob, token) {
  return put(
    `/file/${fileId}/upload-sessions/${uploadSessionId}/parts/${partNumber}?part_size=${partSize}`,
    blob,
    token,
    'application/octet-stream'
  )
}

// createFileUploadSession requests a new server-side upload session for one file.
async function createFileUploadSession (fileId, file, token) {
  return post(`/file/${fileId}/upload-sessions`, {
    name: file.name,
    mime_type: file.type,
    total_size: file.size
  }, token)
}

// completeFileUploadSession finalizes uploaded parts and promotes provider object to ready file.
async function completeFileUploadSession (fileId, uploadSessionId, parts, totalSize, token) {
  return post(`/file/${fileId}/upload-sessions/${uploadSessionId}/complete`, {
    parts,
    total_size: totalSize
  }, token)
}

// abortFileUploadSession aborts an in-progress upload session for cleanup.
async function abortFileUploadSession (fileId, uploadSessionId, token) {
  return del(`/file/${fileId}/upload-sessions/${uploadSessionId}`, token)
}

// withRetry retries transient upload operations with simple linear backoff.
async function withRetry (fn, retries) {
  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt === retries) {
        break
      }
      await sleep(uploadRetryDelayMs * (attempt + 1))
    }
  }
  throw lastError
}

// sleep pauses async flow for retry backoff.
function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
