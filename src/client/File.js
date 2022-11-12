import Upload from 'antd/lib/upload/Upload'
import styles from './File.module.css'
import { InboxOutlined, UploadOutlined, CheckCircleTwoTone, ExclamationCircleTwoTone, ClockCircleTwoTone } from '@ant-design/icons'
import Button from 'antd/es/button'
import { useState } from 'react'
import prettyBites from 'pretty-bytes'
import { useSelector, useDispatch } from 'react-redux'
import { uploadFile } from './actions'

function FileIcon () {
  return (
    <div className={styles.fileIcon}>
      <div className={styles.fileIconBody} />
      <div className={styles.fileIconExtension}>CSV</div>
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
      storageName = 'Cloud Storage'
      break
    default:
      storageName = 'Unknown'
  }
  return storageName
}

function FileStatus ({ file, fileToUpload, fileUploadStatus, children }) {
  const env = useSelector(state => state.env)
  if (!env.loaded) {
    return null
  }
  let message = ''
  let icon = null
  let style = styles.info
  const errorMessage = ''
  if (file.fileStatus > 1) {
    if (file.fileStatus === 2) {
      if (file.uploadError) {
        icon = <ExclamationCircleTwoTone className={styles.icon} twoToneColor='#f5222d' />
        message = <span>Error uploading file: <span className={styles.errorStatus}>{file.uploadError}</span></span>
        style = styles.error
      } else {
        message = `Moving file to ${getStorageName(env)}...`
        icon = <ClockCircleTwoTone className={styles.icon} twoToneColor='#B8B8B8' />
      }
    } else if (file.fileStatus === 3) {
      icon = <CheckCircleTwoTone className={styles.icon} twoToneColor='#52c41a' />
      message = <span>Ready <span className={styles.processed}>({prettyBites(file.size)})</span></span>
      style = styles.success
    }
  } else if (fileToUpload) {
    if (fileUploadStatus) {
      if (fileUploadStatus.readyState === 4) {
        if (fileUploadStatus.status === 200) {
          message = `Moving file to ${getStorageName(env)}...`
          icon = <ClockCircleTwoTone className={styles.icon} twoToneColor='#B8B8B8' />
        } else {
          icon = <ExclamationCircleTwoTone className={styles.icon} twoToneColor='#f5222d' />
          message = <span>Error uploading file <span className={styles.errorStatus}>(status={fileUploadStatus.status})</span></span>
          style = styles.error
        }
      } else {
        icon = <ClockCircleTwoTone className={styles.icon} twoToneColor='#B8B8B8' />
        message = `Uploading ${prettyBites(fileUploadStatus.loaded)} of ${prettyBites(fileUploadStatus.total)}`
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
          {/* {action ? <div className={styles.action}>{action}</div> : null} */}
        </div>
        {errorMessage ? <div className={styles.errorMessage}>{errorMessage}</div> : null}
      </div>
      {children ? <div className={styles.button}>{children}</div> : null}
    </div>
  )
}

export default function File ({ file }) {
  const [fileToUpload, setFileToUpload] = useState(null)
  const fileUploadStatus = useSelector(state => state.fileUploadStatus[file.id])
  const dispatch = useDispatch()
  const uploadButtonDisabled = !fileToUpload || fileUploadStatus
  let fileInfo = null
  if (file.fileStatus > 1) {
    fileInfo = {
      name: file.name
    }
  } else if (fileToUpload) {
    fileInfo = {
      name: fileToUpload.name
    }
  }
  return (
    <div className={styles.file}>
      <div className={styles.fileInfo}>
        {fileInfo
          ? (
            <div className={styles.uploadFileInfo}>
              <FileIcon />
              <div className={styles.uploadFileName}>{fileInfo.name}</div>
            </div>
            )
          : (
            <div className={styles.upload}>
              <Upload
                maxCount={1}
                accept='.csv'
                fileList={[]}
                beforeUpload={(file) => {
                  setFileToUpload(file)
                  return false
                }}
              >
                <div className={styles.uploadIcon}><InboxOutlined /></div>
                <div className={styles.uploadHeader}>Click or drag file to this area to upload</div>
                <div className={styles.uploadSubtitle}>Supported format: .csv</div>
              </Upload>
            </div>
            )}
      </div>
      <FileStatus file={file} fileToUpload={fileToUpload} fileUploadStatus={fileUploadStatus}>
        <Button
          size='large'
          icon={<UploadOutlined />} disabled={uploadButtonDisabled} onClick={() => dispatch(uploadFile(file.id, fileToUpload))}
        >Upload
        </Button>
      </FileStatus>
    </div>
  )
}
