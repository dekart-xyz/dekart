import Upload from 'antd/lib/upload/Upload'
import styles from './File.module.css'
import { InboxOutlined, UploadOutlined } from '@ant-design/icons'
import Button from 'antd/es/button'
import { useState } from 'react'
import prettyBites from 'pretty-bytes'

function FileIcon () {
  return (
    <div className={styles.fileIcon}>
      <div className={styles.fileIconBody} />
      <div className={styles.fileIconExtension}>CSV</div>
    </div>
  )
}

export default function File () {
  const [fileToUpload, setFileToUpload] = useState(null)
  return (
    <div className={styles.file}>
      <div className={styles.info}>
        {fileToUpload
          ? (
            <div className={styles.uploadFileInfo}>
              <FileIcon file={fileToUpload} />
              <div className={styles.uploadFileName}>{fileToUpload.name}</div>
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
      <div className={styles.status}>
        <div className={styles.uploadFileProgress}>
          {fileToUpload ? `${prettyBites(fileToUpload.size)} to be uploaded` : ''}
        </div>
        <Button icon={<UploadOutlined />} disabled={!fileToUpload}>Upload</Button>
      </div>
    </div>
  )
}
