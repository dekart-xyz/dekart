import Button from 'antd/es/button'
import Modal from 'antd/es/modal'
import { LockOutlined, TeamOutlined, LinkOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import styles from './ShareButton.module.css'
import { useDispatch, useSelector } from 'react-redux'
import { copyUrlToClipboard } from './actions/clipboard'
import { setDiscoverable } from './actions/report'
import Select from 'antd/es/select'

function CopyLinkButton () {
  const dispatch = useDispatch()
  const discoverable = useSelector(state => state.report.discoverable)
  return (
    <Button
      icon={<LinkOutlined />}
      disabled={!discoverable}
      title='Copy link to report'
      onClick={() => dispatch(copyUrlToClipboard(window.location.toString(), 'Report URL copied to clipboard'))}
    >Copy Link
    </Button>
  )
}

function WorkspacePermissionsDescription () {
  const { isSharable, discoverable, allowEdit } = useSelector(state => state.report)
  switch (true) {
    case !isSharable:
      return <>⚠️ This report cannot be shared between workspace users.<br />💡 Create a connection with a storage bucket and generate a new report from it.</>
    case allowEdit:
      return <>Everyone with access to this workspace can view and edit this report</>
    case discoverable:
      return <>Everyone with access to this workspace can discover and refresh this report</>
    default:
      return <>This report is private. Only the author can see it</>
  }
}

const workspacePermissions = {
  CANNOT_VIEW: 'CANNOT_VIEW',
  VIEW: 'VIEW',
  EDIT: 'EDIT'
}

const workspacePermissionsLabels = {
  [workspacePermissions.CANNOT_VIEW]: 'Cannot view',
  [workspacePermissions.VIEW]: 'View',
  [workspacePermissions.EDIT]: 'Edit'
}

function WorkspacePermissionsTitle () {
  const { isSharable } = useSelector(state => state.report)
  if (!isSharable) {
    return <div className={styles.statusLabelTitle}>Workspace Sharing</div>
  }
  return <div className={styles.statusLabelTitle}>Anyone in workspace</div>
}

function permissionValueFromReportProps ({ discoverable, allowEdit }) {
  switch (true) {
    case discoverable && allowEdit:
      return workspacePermissions.EDIT
    case discoverable:
      return workspacePermissions.VIEW
    default:
      return workspacePermissions.CANNOT_VIEW
  }
}

function reportPropsFromPermissionValue (value) {
  switch (value) {
    case workspacePermissions.CANNOT_VIEW:
      return { discoverable: false, allowEdit: false }
    case workspacePermissions.VIEW:
      return { discoverable: true, allowEdit: false }
    case workspacePermissions.EDIT:
      return { discoverable: true, allowEdit: true }
    default:
      throw new Error(`Unknown permission value: ${value}`)
  }
}

function WorkspacePermissionsSelect () {
  const { isPublic, id, isAuthor, allowEdit, discoverable, isSharable } = useSelector(state => state.report)
  const dispatch = useDispatch()
  const value = permissionValueFromReportProps({ discoverable, allowEdit })
  const [selectValue, setSelectValue] = useState(value)

  useEffect(() => {
    setSelectValue(value)
  }, [value])

  if (!isSharable) {
    return <Button href='/connections'>Manage connections</Button>
  }
  const disabled = !isAuthor
  return (
    <Select
      defaultValue={value}
      value={selectValue}
      disabled={disabled}
      className={styles.workspaceStatusSelect}
      loading={selectValue !== value}
      onChange={(newValue) => {
        setSelectValue(newValue)
        const { discoverable, allowEdit } = reportPropsFromPermissionValue(newValue)
        dispatch(setDiscoverable(id, discoverable, allowEdit))
      }}
      options={[
        { value: workspacePermissions.CANNOT_VIEW, label: isPublic ? 'View' : workspacePermissionsLabels[workspacePermissions.CANNOT_VIEW] },
        { value: workspacePermissions.VIEW, label: isPublic ? 'Refresh' : workspacePermissionsLabels[workspacePermissions.VIEW] },
        { value: workspacePermissions.EDIT, label: workspacePermissionsLabels[workspacePermissions.EDIT] }
      ]}
    />
  )
}
function WorkspacePermissions () {
  const { canWrite, discoverable } = useSelector(state => state.report)
  if (!canWrite && !discoverable) { // show only for discoverable workspace reports
    return null
  }
  return (
    <>
      <div className={styles.workspaceStatus}>
        <div className={styles.workspaceStatusIcon}><TeamOutlined /></div>
        <div className={styles.workspaceStatusLabel}>
          <WorkspacePermissionsTitle />
          <div className={styles.statusLabelDescription}><WorkspacePermissionsDescription /></div>
        </div>
        <div className={styles.workspaceStatusControl}>
          <WorkspacePermissionsSelect />
        </div>
      </div>
    </>
  )
}

function ModalContent () {
  return (
    <>
      <WorkspacePermissions />
    </>
  )
}

export default function ShareButton () {
  const [modalOpen, setModalOpen] = useState(false)
  const { discoverable } = useSelector(state => state.report)
  const { authEnabled } = useSelector(state => state.env)
  if (!authEnabled) {
    return null
  }
  let icon = <LockOutlined />
  if (discoverable) {
    icon = <TeamOutlined />
  }
  return (
    <>
      <Button
        icon={icon}
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
            <CopyLinkButton />
            <div className={styles.modalFooterSpacer} />
            <Button type='primary' onClick={() => setModalOpen(false)}>
              Done
            </Button>
          </div>
        }
      >
        <ModalContent />
      </Modal>
    </>
  )
}
