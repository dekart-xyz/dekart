import Upload from 'antd/es/upload/Upload'
import styles from './File.module.css'
import { InboxOutlined, UploadOutlined, CheckCircleTwoTone, ExclamationCircleTwoTone, ClockCircleTwoTone } from '@ant-design/icons'
import Button from 'antd/es/button'
import { useState, useEffect } from 'react'
import prettyBites from 'pretty-bytes'
import { useSelector, useDispatch } from 'react-redux'
import { uploadFile, uploadFileReset } from './actions/file'
import { extensionFromMime, inferMimeFromName } from './lib/mime'
import { track } from './lib/tracking'

function getFileExtensionName (type) {
  switch (type) {
    case 'application/geo+json':
    case 'text/csv':
    case 'application/vnd.apache.parquet':
    case 'application/octet-stream':
      return extensionFromMime(type) || '???'
    default:
      return '???'
  }
}

function FileIcon ({ fileInfo: { type } }) {
  return (
    <div className={styles.fileIcon}>
      <div className={styles.fileIconBody} />
      <div className={styles.fileIconExtension}>{getFileExtensionName(type)}</div>
    </div>
  )
}

function getStorageName (env) {
  let storageName = ''
  switch (env.variables.STORAGE) {
    case 'S3':
      storageName = 'S3'
      break
    case 'GCS':
    case 'USER': // only GCS is supported for user storage
      storageName = 'Cloud Storage'
      break
    default:
      storageName = 'Unknown'
  }
  return storageName
}

// resolveFileSize picks first finite non-negative value and normalizes protojson int64 strings to number.
function resolveFileSize (...values) {
  for (const value of values) {
    const size = Number(value)
    if (Number.isFinite(size) && size >= 0) {
      return size
    }
  }
  return 0
}

function FileStatus ({ file, fileToUpload, fileUploadStatus, fileSizeError, children }) {
  const env = useSelector(state => state.env)

  // Track file size errors
  useEffect(() => {
    if (fileSizeError) {
      track('FileSizeError', { uerror: fileSizeError }) // User error - file too large
    }
  }, [fileSizeError])

  // Track file upload errors
  useEffect(() => {
    if (file.fileStatus === 2 && file.uploadError) {
      track('FileUploadError', { message: file.uploadError, fileId: file.id }) // System error
    }
  }, [file.fileStatus, file.uploadError, file.id])

  if (!env.loaded) {
    return null
  }
  const uploadPhase = fileUploadStatus?.phase
  const uploadCompleted = fileUploadStatus?.phase === 'done'
  let message = ''
  let icon = null
  let style = styles.info
  const errorMessage = ''

  // Check for file size error
  if (fileSizeError) {
    icon = <ExclamationCircleTwoTone className={styles.icon} twoToneColor='#f5222d' />
    message = <span>Error uploading file: <span className={styles.errorStatus}>{fileSizeError}</span></span>
    style = styles.error
  } else if (file.fileStatus > 1) {
    // file uploaded by user
    if (file.fileStatus === 2) {
      // file in temporary storage
      if (uploadPhase === 'error') {
        icon = <ExclamationCircleTwoTone className={styles.icon} twoToneColor='#f5222d' />
        message = <span>Error uploading file: <span className={styles.errorStatus}>{fileUploadStatus.error || 'Upload failed'}</span></span>
        style = styles.error
      } else if (uploadCompleted) {
        icon = <CheckCircleTwoTone className={styles.icon} twoToneColor='#52c41a' />
        message = <span>Ready <span className={styles.processed}>({prettyBites(resolveFileSize(fileUploadStatus.result?.size, file.size, fileToUpload?.size))})</span></span>
        style = styles.success
      } else if (file.uploadError) {
        icon = <ExclamationCircleTwoTone className={styles.icon} twoToneColor='#f5222d' />
        message = <span>Error uploading file: <span className={styles.errorStatus}>{file.uploadError}</span></span>
        style = styles.error
      } else {
        message = `Moving file to ${getStorageName(env)}...`
        icon = <ClockCircleTwoTone className={styles.icon} twoToneColor='#B8B8B8' />
      }
    } else if (file.fileStatus === 3) {
      // file stored in permanent storage
      icon = <CheckCircleTwoTone className={styles.icon} twoToneColor='#52c41a' />
      message = <span>Ready <span className={styles.processed}>({prettyBites(file.size)})</span></span>
      style = styles.success
    }
  } else if (fileToUpload) {
    // file to upload selected by user
    if (fileUploadStatus) {
      if (fileUploadStatus.phase === 'uploading' || fileUploadStatus.phase === 'completing' || fileUploadStatus.phase === 'starting') {
        icon = <ClockCircleTwoTone className={styles.icon} twoToneColor='#B8B8B8' />
        if (fileUploadStatus.phase === 'completing') {
          message = `Moving file to ${getStorageName(env)}...`
        } else {
          message = `Uploading ${prettyBites(fileUploadStatus.loaded)} of ${prettyBites(fileUploadStatus.total)}`
        }
      } else if (fileUploadStatus.phase === 'error') {
        icon = <ExclamationCircleTwoTone className={styles.icon} twoToneColor='#f5222d' />
        message = <span>Error uploading file: <span className={styles.errorStatus}>{fileUploadStatus.error || 'Upload failed'}</span></span>
        style = styles.error
      } else if (fileUploadStatus.phase === 'done') {
        icon = <CheckCircleTwoTone className={styles.icon} twoToneColor='#52c41a' />
        message = <span>Ready <span className={styles.processed}>({prettyBites(resolveFileSize(fileUploadStatus.result?.size, fileToUpload?.size))})</span></span>
        style = styles.success
      }
    } else {
      message = `${prettyBites(fileToUpload.size)} to be uploaded`
    }
  }
  return (
    <div className={[styles.fileStatus, style].join(' ')}>
      <div className={styles.status}>
        <div className={styles.statusHead}>
          {icon}
          <div className={styles.message}>{message}</div>
        </div>
        {errorMessage ? <div className={styles.errorMessage}>{errorMessage}</div> : null}
      </div>
      {children ? <div className={styles.button}>{children}</div> : null}
    </div>
  )
}

export default function File ({ file }) {
  const [fileToUpload, setFileToUpload] = useState(null)
  const [fileSizeError, setFileSizeError] = useState(null)
  const report = useSelector(state => state.report)
  const { canWrite } = report
  const edit = useSelector(state => state.reportStatus.edit)
  const env = useSelector(state => state.env)

  const fileUploadStatus = useSelector(state => state.fileUploadStatus[file.id])
  const dispatch = useDispatch()

  if (!env.loaded) {
    return null
  }

  // Get max file upload size from environment (in bytes)
  const maxFileSize = parseInt(env.variables.MAX_FILE_UPLOAD_SIZE || '32000000', 10)

  const uploadButtonDisabled = !fileToUpload || file.fileStatus === 2 || (fileUploadStatus && ['starting', 'uploading', 'completing', 'done'].includes(fileUploadStatus.phase)) || !(canWrite && edit) || fileSizeError !== null
  let fileInfo = null
  if (file.fileStatus > 1) {
    fileInfo = {
      name: file.name,
      type: file.mimeType
    }
  } else if (fileToUpload) {
    fileInfo = {
      name: fileToUpload.name,
      type: fileToUpload.type || inferMimeFromName(fileToUpload.name)
    }
  }
  return (
    <div className={styles.file}>
      <div className={styles.fileInfo}>
        {fileInfo && !fileSizeError
          ? (
            <div className={styles.uploadFileInfo}>
              <FileIcon fileInfo={fileInfo} />
              <div className={styles.uploadFileName}>{fileInfo.name}</div>
            </div>
            )
          : (
            <div className={styles.upload}>
              <Upload
                maxCount={1}
                disabled={!(canWrite && edit)}
                accept='.csv,.geojson,.parquet'
                fileList={[]}
                beforeUpload={(selectedFile) => {
                  track('FileSelected', {
                    fileSize: selectedFile.size,
                    fileType: selectedFile.type || inferMimeFromName(selectedFile.name)
                  })
                  // Validate file size
                  if (selectedFile.size > maxFileSize) {
                    setFileSizeError(`File size (${prettyBites(selectedFile.size)}) exceeds maximum allowed size of ${prettyBites(maxFileSize)}`)
                    setFileToUpload(selectedFile)
                  } else {
                    setFileSizeError(null)
                    setFileToUpload(selectedFile)
                  }
                  dispatch(uploadFileReset(file.id))
                  return false
                }}
              >
                <div className={styles.uploadIcon}><InboxOutlined /></div>
                <div className={styles.uploadHeader}>Click or drag file to this area to upload</div>
                <div className={styles.uploadSubtitle}>Supported format: .csv .geojson .parquet</div>
                <div className={styles.uploadLimit}>{prettyBites(maxFileSize)} limit</div>
              </Upload>
            </div>
            )}
      </div>
      <FileStatus file={file} fileToUpload={fileToUpload} fileUploadStatus={fileUploadStatus} fileSizeError={fileSizeError}>
        <Button
          size='large'
          icon={<UploadOutlined />}
          disabled={uploadButtonDisabled}
          onClick={() => {
            track('ClickUploadFile', { fileId: file.id })
            dispatch(uploadFile(file.id, fileToUpload))
          }}
        >Upload
        </Button>
      </FileStatus>
    </div>
  )
}
