import Button from 'antd/es/button'
import Modal from 'antd/es/modal'
import { ExportOutlined, UsergroupAddOutlined, LinkOutlined, LockOutlined, FileSearchOutlined } from '@ant-design/icons'
import { useState } from 'react'
import styles from './ShareButton.module.css'
import { useDispatch, useSelector } from 'react-redux'
import Switch from 'antd/es/switch'
import { toggleModal } from '@dekart-xyz/kepler.gl/dist/actions/ui-state-actions'
import { EXPORT_DATA_ID, EXPORT_IMAGE_ID, EXPORT_MAP_ID } from '@dekart-xyz/kepler.gl/dist/constants'
import Dropdown from 'antd/es/dropdown'
import { copyUrlToClipboard } from './actions/clipboard'
import { setDiscoverable } from './actions/report'
import { PlanType } from '../proto/dekart_pb'

function CopyLinkButton () {
  const dispatch = useDispatch()
  const subscription = useSelector(state => state.organization.subscription)
  if (!subscription) {
    return null
  }
  return (
    <Button
      icon={<LinkOutlined />}
      disabled={subscription.planType === PlanType.TYPE_PERSONAL}
      title='Copy link to report'
      onClick={() => dispatch(copyUrlToClipboard(window.location.toString()))}
    >Copy Link
    </Button>
  )
}

function ModalContent ({ reportId, discoverable, canWrite }) {
  const dispatch = useDispatch()
  const [discoverableSwitch, setDiscoverableSwitch] = useState(discoverable)
  const subscription = useSelector(state => state.organization.subscription)

  if (!subscription) {
    return null
  }

  return (
    <>
      <div className={styles.reportStatus}>
        <div className={styles.reportStatusIcon}><LockOutlined /></div>
        {subscription.planType === PlanType.TYPE_PERSONAL
          ? (
            <div className={styles.reportStatusDetails}>
              <div className={styles.reportStatusDetailsText}> Only you can access this report</div>
              <div className={styles.manageSubscription}><a href='/subscription' target='_blank'>Manage subscription</a></div>
            </div>
            )
          : (
            <div className={styles.reportStatusDetails}>
              <div className={styles.reportStatusDetailsText}> Everyone with a link and access to <span className={styles.origin}>{window.location.hostname}</span> can view this report</div>
            </div>
            )}
      </div>
      {canWrite && subscription.planType !== PlanType.TYPE_PERSONAL
        ? (
          <div className={styles.discoverableStatus}>
            <div className={styles.discoverableStatusIcon}><FileSearchOutlined /></div>
            <div className={styles.discoverableStatusLabel}>Make report discoverable by all users of <span className={styles.origin}>{window.location.hostname}</span> in Shared Reports</div>
            <div className={styles.discoverableStatusControl}>
              <Switch
                checked={discoverable}
                onChange={(checked) => {
                  setDiscoverableSwitch(checked)
                  dispatch(setDiscoverable(reportId, checked))
                }}
                loading={discoverableSwitch !== discoverable}
              />
            </div>
          </div>
          )
        : null}
    </>
  )
}

function ExportDropdown ({ setModalOpen }) {
  const dispatch = useDispatch()
  const items = [
    {
      label: 'Map',
      onClick: () => {
        setModalOpen(false)
        dispatch(toggleModal(EXPORT_MAP_ID))
      }
    },
    {
      label: 'Data',
      onClick: () => {
        setModalOpen(false)
        dispatch(toggleModal(EXPORT_DATA_ID))
      }
    },
    {
      label: 'Image',
      onClick: () => {
        setModalOpen(false)
        dispatch(toggleModal(EXPORT_IMAGE_ID))
      }
    }
  ]
  return (
    <Dropdown menu={{ items }} placement='topLeft'>
      <Button
        icon={<ExportOutlined />}
      >Export
      </Button>
    </Dropdown>
  )
}

export default function ShareButton ({ reportId, discoverable, canWrite }) {
  const [modalOpen, setModalOpen] = useState(false)
  return (
    <>
      <Button
        icon={<UsergroupAddOutlined />}
        ghost
        type='text'
        title='Share and export'
        onClick={() => setModalOpen(true)}
      />
      <Modal
        title='Share report'
        visible={modalOpen}
        onOk={() => setModalOpen(false)}
        onCancel={() => setModalOpen(false)}
        bodyStyle={{ padding: '0px' }}
        footer={
          <div className={styles.modalFooter}>
            <ExportDropdown setModalOpen={setModalOpen} />
            <div className={styles.modalFooterSmallSpacer} />
            <CopyLinkButton />
            <div className={styles.modalFooterSpacer} />
            <Button type='primary' onClick={() => setModalOpen(false)}>
              Done
            </Button>
          </div>
      }
      >
        <ModalContent reportId={reportId} discoverable={discoverable} canWrite={canWrite} />
      </Modal>
    </>
  )
}
