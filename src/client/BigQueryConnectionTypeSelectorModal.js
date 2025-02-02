import Button from 'antd/es/button'
import Modal from 'antd/es/modal/Modal'
import styles from './BigQueryConnectionTypeSelectorModal.module.css'
import { newConnection } from './actions/connection'
import { ConnectionType } from '../proto/dekart_pb'
import { useDispatch } from 'react-redux'
import { useEffect } from 'react'
import { track } from './lib/tracking'

export default function BigQueryConnectionTypeSelectorModal ({ open, onClose }) {
  const dispatch = useDispatch()
  useEffect(() => {
    if (open) {
      track('OpenBigQueryConnectionTypeSelectorModal')
    }
  }, [open])

  return (
    <Modal
      title='Choose BigQuery Connection Method'
      open={open}
      onCancel={onClose}
      footer={null}
      width={800}
    >
      <div className={styles.connectionOptions}>
        <div className={styles.connectionOptionsItem}>
          <h2>
            Use your Google Account
          </h2>
          <p>
            Recommended if your account already has BigQuery access.
          </p>
          <p>
            No credentials stored in Dekart backend.
          </p>

          <p>
            <Button
              type='primary'
              onClick={() => {
                onClose()
                dispatch(newConnection(ConnectionType.CONNECTION_TYPE_BIGQUERY))
                track('ConnectWithGoogle')
              }}
            >Connect with Google
            </Button>
          </p>
          <p>
            → <a href='https://dekart.xyz/docs/usage/choose-bigquery-connection-nethod/#which-permissions-are-required'>Which permissions required?</a>
          </p>

        </div>
        <div className={styles.connectionOptionsItem}>
          <h2>
            Use Service Account
          </h2>
          <p>
            Connect to BigQuery with using Service Account Key in JSON format.
          </p>
          <p>Key will encrypted and stored in Dekart backend.</p>

          <p>
            <Button
              type='primary'
              onClick={() => {
                onClose()
                dispatch(newConnection(ConnectionType.CONNECTION_TYPE_BIGQUERY, true))
                track('ConnectWithServiceAccount')
              }}
            >Configure Service Account
            </Button>
          </p>
          <div>
            <div>→ <a href='https://dekart.xyz/docs/usage/choose-bigquery-connection-nethod/#how-to-get-a-service-account-key'>How to get the key?</a></div>
            <div>→ <a href='https://dekart.xyz/docs/usage/choose-bigquery-connection-nethod/#how-is-the-key-secured'>How key is secured?</a></div>
          </div>

        </div>
      </div>
    </Modal>
  )
}
