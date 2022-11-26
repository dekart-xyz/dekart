import Button from 'antd/es/button'
import Modal from 'antd/es/modal'
import { UsergroupAddOutlined, LinkOutlined } from '@ant-design/icons'
import { useState } from 'react'
import styles from './ShareButton.module.css'
import { copyUrlToClipboard } from './actions'
import { useDispatch } from 'react-redux'

function CopyLinkButton () {
  const dispatch = useDispatch()
  return (
    <Button
      icon={<LinkOutlined />}
      title='Copy link to report'
      onClick={() => dispatch(copyUrlToClipboard(window.location.toString()))}
    >Copy Link
    </Button>
  )
}

export default function ShareButton () {
  const [modalOpen, setModalOpen] = useState(false)
  return (
    <>
      <Button
        type='primary'
        icon={<UsergroupAddOutlined />}
        onClick={() => setModalOpen(true)}
      >Share
      </Button>
      <Modal
        title='Share report'
        visible={modalOpen}
        onOk={() => setModalOpen(false)}
        onCancel={() => setModalOpen(false)}
        footer={
          <div className={styles.modalFooter}>
            <CopyLinkButton />
            <Button type='primary' onClick={() => setModalOpen(false)}>
              Done
            </Button>
          </div>
      }
      />
    </>
  )
}
