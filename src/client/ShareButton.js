import Button from 'antd/es/button'
import Modal from 'antd/es/modal'
import { GlobalOutlined, LockOutlined, TeamOutlined, LinkOutlined, UserAddOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import styles from './ShareButton.module.css'
import { useDispatch, useSelector } from 'react-redux'
import Switch from 'antd/es/switch'
import { copyUrlToClipboard } from './actions/clipboard'
import { publishReport, setDiscoverable } from './actions/report'
import Select from 'antd/es/select'

function CopyLinkButton () {
  const dispatch = useDispatch()
  const playgroundReport = useSelector(state => state.report.isPlayground)
  const isPublic = useSelector(state => state.report.isPublic)
  const discoverable = useSelector(state => state.report.discoverable)
  return (
    <Button
      icon={<LinkOutlined />}
      disabled={!playgroundReport && !isPublic && !discoverable}
      title='Copy link to report'
      onClick={() => dispatch(copyUrlToClipboard(window.location.toString(), 'Report URL copied to clipboard'))}
    >Copy Link
    </Button>
  )
}

function PublishSwitchDescription () {
  const { isPublic, isPlayground, canWrite } = useSelector(state => state.report)
  switch (true) {
    case isPlayground:
      return <>Playground reports are always public</>
    case isPublic && canWrite:
      return <>This report is public. Anyone with the link can access it in read-only mode.</>
    case isPublic:
      return <>This report is public. Anyone with the link can access it in read-only mode. Only the author can change this setting.</>
    default:
      return <>This report is private. Toggling this switch will make the report, uploaded files, and query results accessible to anyone with the link in read-only mode.</>
  }
}

function PublishSwitch () {
  const { isPublic, id, isPlayground, canWrite } = useSelector(state => state.report)
  const [switchState, setSwitchState] = useState(isPublic || isPlayground)
  const dispatch = useDispatch()
  useEffect(() => {
    setSwitchState(isPublic || isPlayground)
  }, [isPublic, isPlayground])
  if (
    !canWrite || // show for authors and editors
    isPlayground // don't show for playground reports as can't change
  ) {
    return null
  }
  return (
    <Switch
      checked={switchState}
      onChange={(checked) => {
        setSwitchState(checked)
        dispatch(publishReport(id, checked))
      }}
      loading={isPlayground ? false : switchState !== isPublic}
    />
  )
}

function PublicPermissions () {
  const { isPublic, isPlayground, canWrite } = useSelector(state => state.report)

  if (
    !canWrite && // show for authors and editors
    !isPublic && !isPlayground // show for public reports
  ) {
    return null
  }
  return (
    <div className={styles.boolStatus}>
      <div className={styles.boolStatusIcon}><GlobalOutlined /></div>
      <div className={styles.boolStatusLabel}>
        <div className={styles.statusLabelTitle}>Anyone on the internet with the link can view</div>
        <div className={styles.statusLabelDescription}><PublishSwitchDescription /></div>
      </div>
      <div className={styles.boolStatusControl}>
        <PublishSwitch />
      </div>
    </div>
  )
}

function WorkspacePermissionsDescription () {
  const { isPlayground, isSharable, discoverable, allowEdit } = useSelector(state => state.report)
  switch (true) {
    case isPlayground:
      return <>Workspace permissions are disabled in Playground Mode</>
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
  const { isPlayground, isSharable } = useSelector(state => state.report)
  if (isPlayground || !isSharable) {
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
  const { isPublic, id, isPlayground, isAuthor, allowEdit, discoverable, isSharable } = useSelector(state => state.report)
  const dispatch = useDispatch()
  const value = permissionValueFromReportProps({ discoverable, allowEdit })
  const [selectValue, setSelectValue] = useState(value)

  useEffect(() => {
    setSelectValue(value)
  }, [value])

  if (isPlayground) {
    return <Button href='/workspace'>Manage workspace</Button>
  } else if (!isSharable) {
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
  const env = useSelector(state => state.env)
  const { loaded: envLoaded } = env

  if (!envLoaded) {
    return null
  }

  return (
    <>
      <PublicPermissions />
      <WorkspacePermissions />
    </>
  )
}

export default function ShareButton () {
  const [modalOpen, setModalOpen] = useState(false)
  const workspaceId = useSelector(state => state.user.stream?.workspaceId)
  const { isPublic, isPlayground, discoverable } = useSelector(state => state.report)
  let icon = <LockOutlined />
  if (isPublic || isPlayground) {
    icon = <GlobalOutlined />
  } else if (discoverable) {
    icon = <TeamOutlined />
  }
  return (
    <>
      <Button
        icon={icon}
        ghost
        type='text'
        title='Share report'
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
            {workspaceId ? <Button icon={<UserAddOutlined />} href='/workspace'>Add users to workspace</Button> : null}
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
