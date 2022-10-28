import Upload from 'antd/lib/upload/Upload'
import styles from './File.module.css'
import { InboxOutlined, UploadOutlined } from '@ant-design/icons'
import Button from 'antd/es/button'

export default function File () {
  return (
    <div className={styles.file}>
      <div className={styles.info}>
        <div className={styles.upload}>
          <Upload onDrop={() => {}}>
            <div className={styles.uploadIcon}><InboxOutlined /></div>
            <div className={styles.uploadHeader}>Click or drag file to this area to upload</div>
            <div className={styles.uploadSubtitle}>Supported format: .csv, .geojson</div>
          </Upload>
        </div>
      </div>
      <div className={styles.status}>
        <Button icon={<UploadOutlined />} disabled>Upload</Button>
      </div>
    </div>
  )
}
