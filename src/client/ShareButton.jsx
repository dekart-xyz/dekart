import Button from 'antd/es/button'
import Modal from 'antd/es/modal'
import { BarChartOutlined, GlobalOutlined, LockOutlined, TeamOutlined, LinkOutlined, UserAddOutlined, DownloadOutlined, WarningOutlined } from '@ant-design/icons'
import { useEffect, useState, useRef, useCallback } from 'react'
import styles from './ShareButton.module.css'
import { useDispatch, useSelector } from 'react-redux'
import Switch from 'antd/es/switch'
import { copyUrlToClipboard } from './actions/clipboard'
import { addReportDirectAccess, allowExportDatasets, publishReport, setDiscoverable, setTrackViewers } from './actions/report'
import Select from 'antd/es/select'
import { setAnalyticsModalOpen } from './actions/analytics'
import { track } from './lib/tracking'
import AnalyticsModal from './AnalyticsModal'
import { PlanType } from 'dekart-proto/dekart_pb'
import Tooltip from 'antd/es/tooltip'
import classNames from 'classnames'
import { useHistory } from 'react-router-dom/cjs/react-router-dom'

function CopyLinkButton ({ ghost }) {
  const dispatch = useDispatch()
  const playgroundReport = useSelector(state => state.report.isPlayground)
  const isPublic = useSelector(state => state.report.isPublic)
  const discoverable = useSelector(state => state.report.discoverable)
  const hasDirectAccess = useSelector(state => state.report.hasDirectAccess)
  return (
    <Button
      icon={<LinkOutlined />}
      ghost={ghost}
      disabled={!playgroundReport && !isPublic && !discoverable && !hasDirectAccess}
      title='Copy link to report'
      onClick={() => {
        track('CopyMapLink')
        dispatch(copyUrlToClipboard(window.location.toString(), 'Map URL copied to clipboard'))
      }}
    >Copy Link
    </Button>
  )
}

function PublishSwitchDescription () {
  const { isPublic, isPlayground } = useSelector(state => state.report)
  switch (true) {
    case isPlayground:
      return <>Playground maps are always public.</>
    case isPublic:
      return <>This map is public. Anyone with the link can view.</>
    default:
      return <>This map is private.</>
  }
}

function PublishSwitch () {
  const { isPublic, id, isPlayground, canWrite } = useSelector(state => state.report)
  const [switchState, setSwitchState] = useState(isPublic || isPlayground)
  const dispatch = useDispatch()
  const cancelPublish = useCallback(() => {
    setSwitchState(false)
  }, [])
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
      id='dekart-publish-report'
      onChange={(checked) => {
        track('PublishReportChanged')
        setSwitchState(checked)
        dispatch(publishReport(id, checked, cancelPublish))
      }}
      loading={isPlayground ? false : switchState !== isPublic}
    />
  )
}

function TrackViewersSwitch () {
  const { trackViewers, id, canWrite } = useSelector(state => state.report)
  const [switchState, setSwitchState] = useState(trackViewers)
  const dispatch = useDispatch()

  useEffect(() => {
    setSwitchState(trackViewers)
  }, [trackViewers])

  if (!canWrite) {
    return null
  }

  return (
    <Switch
      checked={switchState}
      id='dekart-track-viewers'
      onChange={(checked) => {
        track('TrackViewersChanged')
        setSwitchState(checked)
        dispatch(setTrackViewers(id, checked))
      }}
      loading={switchState !== trackViewers}
    />
  )
}

function ViewAnalytics () {
  const { canWrite, isPlayground, trackViewers } = useSelector(state => state.report)
  const dispatch = useDispatch()
  const disabled = !trackViewers
  if (
    !canWrite || // show for authors and editors
    isPlayground // show for public reports
  ) {
    return null
  }
  return (
    <div className={styles.viewAnalytics}>
      <Button
        type='link' onClick={() => {
          dispatch(setAnalyticsModalOpen(true))
          track('OpenAnalyticsModal')
        }} icon={<BarChartOutlined />} size='small' disabled={disabled}
      >
        {disabled ? 'Enable tracking to see analytics' : 'View analytics'}
      </Button>
    </div>
  )
}

function DirectAccess () {
  const { canWrite, isSharable, isPublic } = useSelector(state => state.report)
  const planType = useSelector(state => state.user.stream?.planType)
  const isSnowpark = useSelector(state => state.env.isSnowpark)
  const reportDirectAccessEmails = useSelector(state => state.reportDirectAccessEmails)
  const [emails, setEmails] = useState(reportDirectAccessEmails)
  const inputRef = useRef(null)
  const dispatch = useDispatch()
  const { id: reportId } = useSelector(state => state.report)
  const loading = reportDirectAccessEmails.join(',') !== emails.join(',') // check if emails are loaded
  const users = useSelector(state => state.workspace.users)
  const isDefaultWorkspace = useSelector(state => state.user.isDefaultWorkspace)
  const gated = planType === PlanType.TYPE_PERSONAL || planType === PlanType.TYPE_UNSPECIFIED || planType === PlanType.TYPE_TEAM

  if (!canWrite || !isSharable || isPublic || isDefaultWorkspace || isSnowpark) {
    return null
  }

  return (
    <>
      <div className={styles.boolStatus}>
        <div className={styles.boolStatusIcon}><UserAddOutlined /></div>
        <div className={styles.boolStatusLabel}>
          <div className={styles.statusLabelTitle}>Invite people (view only)</div>
          <div className={styles.statusLabelDescription}>
            {gated
              ? <>This feature is not available in your plan. <a href='/workspace'>Upgrade.</a></>
              : 'Share this map with specific users by email address.'}
          </div>
        </div>
      </div>
      <div className={styles.userSelect}>
        <Select
          mode='tags'
          style={{ width: '100%' }}
          placeholder='Enter email addresses'
          value={reportDirectAccessEmails}
          loading={loading}
          disabled={loading || gated}
          onChange={(emails) => {
            setEmails(emails)
            dispatch(addReportDirectAccess(reportId, emails))
          }}
          tokenSeparators={[',', ' ']}
          ref={inputRef}
          maxTagCount='responsive'
          options={users.map(user => ({
            label: user.email,
            value: user.email
          }))}
        />
      </div>
    </>
  )
}

function TrackViewersDescription () {
  const { trackViewers } = useSelector(state => state.report)
  const isPublic = useSelector(state => state.report.isPublic)
  return trackViewers
    ? <>{isPublic ? 'Login required for public reports.' : 'Viewer analytics are being tracked.'}</>
    : <>Viewer analytics are not being tracked.</>
}

function TrackViewers () {
  const { canWrite } = useSelector(state => state.report)
  const isSnowpark = useSelector(state => state.env.isSnowpark)
  if (isSnowpark) {
    return null
  }
  if (!canWrite) {
    return null
  }

  return (
    <div className={styles.boolStatus}>
      <div className={styles.boolStatusIcon}><BarChartOutlined /></div>
      <div className={styles.boolStatusLabel}>
        <div className={styles.statusLabelTitle}>Track viewer analytics</div>
        <div className={styles.statusLabelDescription}><TrackViewersDescription /></div>
        <ViewAnalytics />
      </div>
      <div className={styles.boolStatusControl}>
        <TrackViewersSwitch />
      </div>
    </div>
  )
}

function PublicPermissions () {
  const { isPublic, isPlayground, canWrite } = useSelector(state => state.report)
  const isSelfHosted = useSelector(state => state.user.isSelfHosted)

  if (isSelfHosted) {
    // do not show feature for self-hosted users yet
    return null
  }
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
        <div className={styles.statusLabelTitle}>Share to anyone with the link</div>
        <div className={styles.statusLabelDescription}><PublishSwitchDescription /></div>
      </div>
      <div className={styles.boolStatusControl}>
        <PublishSwitch />
      </div>
    </div>
  )
}
function AllowExportData () {
  const { allowExport, canWrite, id } = useSelector(state => state.report)
  const [switchState, setSwitchState] = useState(allowExport)
  const dispatch = useDispatch()
  if (
    !canWrite
  ) {
    return null
  }
  return (
    <div className={styles.boolStatus}>
      <div className={styles.boolStatusIcon}><DownloadOutlined /></div>
      <div className={styles.boolStatusLabel}>
        <div className={styles.statusLabelTitle}>Allow exporting data</div>
        <div className={styles.statusLabelDescription}>
          When disabled, users can still view the data in the map, but cannot export CSV, view data table, change tooltips settings and view SQL.
        </div>
      </div>
      <div className={styles.boolStatusControl}>
        <Switch
          checked={allowExport}
          onChange={(checked) => {
            setSwitchState(checked)
            dispatch(allowExportDatasets(id, checked))
          }}
          loading={switchState !== allowExport}
        />
      </div>
    </div>
  )
}

function WorkspacePermissionsDescription () {
  const { isPlayground, discoverable, allowEdit, isPublic, hasDirectAccess } = useSelector(state => state.report)
  switch (true) {
    case isPlayground:
      return <>Workspace permissions are disabled in Playground Mode</>
    case allowEdit:
      return <>Everyone with access to this workspace can view and edit this map</>
    case discoverable:
      return <>Everyone with access to this workspace can discover and refresh this map</>
    case isPublic:
      return <>This map is public.</>
    case hasDirectAccess:
      return <>Users with direct email access can still view this map regardless of workspace access.</>
    default:
      return <>This map is private. Only the author can see it</>
  }
}

const workspacePermissions = {
  CANNOT_VIEW: 'CANNOT_VIEW',
  VIEW: 'VIEW',
  EDIT: 'EDIT'
}

const workspacePermissionsLabels = {
  [workspacePermissions.CANNOT_VIEW]: 'No Access',
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
  const { isPublic, id, isPlayground, isAuthor, allowEdit, discoverable } = useSelector(state => state.report)
  const dispatch = useDispatch()
  const value = permissionValueFromReportProps({ discoverable, allowEdit })
  const [selectValue, setSelectValue] = useState(value)

  useEffect(() => {
    setSelectValue(value)
  }, [value])

  if (isPlayground) {
    return <Button href='/workspace' onClick={() => track('ManageWorkspaceFromShareModal')}>Manage workspace</Button>
  }
  const disabled = !isAuthor
  return (
    <Select
      defaultValue={value}
      id='dekart-workspace-permissions-select'
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
        { value: workspacePermissions.CANNOT_VIEW, label: isPublic ? 'View' : workspacePermissionsLabels[workspacePermissions.CANNOT_VIEW], className: 'dekart-share-cannot-view' },
        { value: workspacePermissions.VIEW, label: isPublic ? 'Refresh' : workspacePermissionsLabels[workspacePermissions.VIEW], className: 'dekart-share-view' },
        { value: workspacePermissions.EDIT, label: workspacePermissionsLabels[workspacePermissions.EDIT] }
      ]}
    />
  )
}
function WorkspacePermissions () {
  const { canWrite, discoverable, isSharable } = useSelector(state => state.report)
  const isDefaultWorkspace = useSelector(state => state.user.isDefaultWorkspace)
  if (isDefaultWorkspace) {
    return null
  }
  if (!canWrite && !discoverable) { // show only for discoverable workspace reports
    return null
  }
  if (!isSharable) {
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

function NonShareableWarning () {
  const { isSharable } = useSelector(state => state.report)
  const history = useHistory()
  if (isSharable) {
    return null
  }
  return (
    <div className={classNames(styles.workspaceStatus, styles.nonSharableWarning)}>
      <div className={styles.workspaceStatusIcon}><WarningOutlined /></div>
      <div className={styles.workspaceStatusLabel}>
        <div className={styles.statusLabelTitle}>Sharing options are limited</div>
        <div className={styles.statusLabelDescription}>
          Use a BigQuery connection with a storage bucket or service account to enable sharing.
        </div>
      </div>
      <div className={styles.workspaceStatusControl}>
        <Button
          onClick={() => {
            track('ManageConnectionsFromShareModal')
            history.push('/connections')
          }}
        >Manage connections
        </Button>
      </div>
    </div>
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
      <NonShareableWarning />
      <PublicPermissions />
      <TrackViewers />
      <DirectAccess />
      <WorkspacePermissions />
      <AllowExportData />
    </>
  )
}

export default function ShareButton () {
  const [modalOpen, setModalOpen] = useState(false)
  const workspaceId = useSelector(state => state.user.stream?.workspaceId)
  const { isPublic, isPlayground, discoverable, canWrite } = useSelector(state => state.report)
  const isSnowpark = useSelector(state => state.env.isSnowpark)
  const analyticsModalOpen = useSelector(state => state.analytics.modalOpen)
  const hasDirectAccess = useSelector(state => state.report.hasDirectAccess)
  useEffect(() => {
    if (analyticsModalOpen) {
      setModalOpen(false)
    }
  }, [analyticsModalOpen])
  const isDefaultWorkspace = useSelector(state => state.user.isDefaultWorkspace)
  let icon = <LockOutlined />
  let tooltip = 'Private map, only you can see it'
  if (isDefaultWorkspace) {
    icon = <LinkOutlined />
    tooltip = 'Share map with workspace users'
  } else if (isPublic || isPlayground) {
    icon = <GlobalOutlined />
    tooltip = 'Public map, anyone with the link can see it'
  } else if (discoverable || hasDirectAccess) {
    icon = <TeamOutlined />
    tooltip = 'Anyone in workspace can view and refresh this report'
  }
  if (!canWrite) {
    return <CopyLinkButton ghost />
  }
  return (
    <>
      <Tooltip title={tooltip} placement='bottom'>
        <Button
          icon={icon}
          type='primary'
          id='dekart-share-report'
          title='Share Map'
          onClick={() => {
            setModalOpen(true)
            track('OpenShareModal')
          }}
        >Share
        </Button>
      </Tooltip>
      <Modal
        title='Share Map'
        visible={modalOpen}
        onOk={() => setModalOpen(false)}
        onCancel={() => setModalOpen(false)}
        bodyStyle={{ padding: '0px' }}
        footer={
          <div className={styles.modalFooter}>
            {workspaceId && !isSnowpark ? <Button icon='+ ' type='primary' href='/workspace' onClick={() => track('AddUsersToWorkspaceFromShareModal')}>Add users to workspace</Button> : null}
            <div className={styles.modalFooterSpacer} />
            <CopyLinkButton />
            <Button
              onClick={() => {
                track('CloseShareModal')
                setModalOpen(false)
              }}
            >
              Done
            </Button>
          </div>
        }
      >
        <ModalContent />
      </Modal>
      <AnalyticsModal />
    </>
  )
}
