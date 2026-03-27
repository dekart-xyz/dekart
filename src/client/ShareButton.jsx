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
import classNames from 'classnames'
import { useHistory } from 'react-router-dom/cjs/react-router-dom'
import { showUpgradeModal, UpgradeModalType } from './actions/upgradeModal'

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
        const url = new URL(window.location.href)
        // Remove /source from pathname to ensure view mode
        if (url.pathname.endsWith('/source')) {
          url.pathname = url.pathname.slice(0, -7) // Remove '/source'
        }
        dispatch(copyUrlToClipboard(url.toString(), 'Map URL copied to clipboard'))
      }}
    >Copy Link
    </Button>
  )
}

function PublishSwitchDescription () {
  const { isPublic, isPlayground } = useSelector(state => state.report)
  const isSelfHosted = useSelector(state => state.user.isSelfHosted)
  switch (true) {
    case isPlayground:
      return <>{isSelfHosted ? 'Public link sharing settings are managed at workspace level.' : 'Playground maps are always public.'}</>
    case isPublic:
      return <>This map is public. Anyone with the link can view.</>
    default:
      return <>This map is private.</>
  }
}

function PublishSwitch ({ disabled = false }) {
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
    !canWrite // show for authors and editors
  ) {
    return null
  }
  return (
    <Switch
      checked={switchState}
      id='dekart-publish-report'
      disabled={disabled}
      onChange={(checked) => {
        track('PublishReportChanged')
        setSwitchState(checked)
        dispatch(publishReport(id, checked, cancelPublish))
      }}
      loading={isPlayground ? false : switchState !== isPublic}
    />
  )
}

function TrackViewersSwitch ({ disabled }) {
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
      disabled={disabled}
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
  const authEnabled = useSelector(state => state.env.authEnabled)
  const dispatch = useDispatch()
  const disabled = !trackViewers || !authEnabled
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
  const isSnowpark = useSelector(state => state.env.isSnowpark)
  const isSelfHosted = useSelector(state => state.user.isSelfHosted)
  const reportDirectAccessEmails = useSelector(state => state.reportDirectAccessEmails)
  const [emails, setEmails] = useState(reportDirectAccessEmails)
  const inputRef = useRef(null)
  const dispatch = useDispatch()
  const { id: reportId } = useSelector(state => state.report)
  const loading = reportDirectAccessEmails.join(',') !== emails.join(',') // check if emails are loaded
  const users = useSelector(state => state.workspace.users)
  const isDefaultWorkspace = useSelector(state => state.user.isDefaultWorkspace)
  const isFreemium = useSelector(state => state.user.isFreemium)
  const hasAllFeatures = useSelector(state => state.user.hasAllFeatures)
  if (!canWrite || isSelfHosted) {
    return null
  }
  const disabledReason =
    !isSharable
      ? 'Direct email sharing is unavailable for this map configuration.'
      : isPublic
        ? 'Turn off public sharing to invite specific users by email.'
        : isDefaultWorkspace
          ? 'Direct email sharing is unavailable in the default workspace.'
          : isSnowpark
            ? 'Direct email sharing is unavailable in Snowpark mode.'
            : ''
  const disabled = Boolean(disabledReason) || loading

  return (
    <>
      <div className={styles.boolStatus}>
        <div className={styles.boolStatusIcon}><UserAddOutlined /></div>
        <div className={styles.boolStatusLabel}>
          <div className={styles.statusLabelTitle}>Invite people (view only)</div>
          <div className={styles.statusLabelDescription}>
            Share this map with specific users by email address.
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
          disabled={disabled}
          onChange={(emails) => {
            if (isFreemium) {
              dispatch(showUpgradeModal(UpgradeModalType.DIRECT_ACCESS))
            } else if (hasAllFeatures) {
              setEmails(emails)
              dispatch(addReportDirectAccess(reportId, emails))
            }
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
  const authEnabled = useSelector(state => state.env.authEnabled)
  const disabled = !authEnabled
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
        <TrackViewersSwitch disabled={disabled} />
      </div>
    </div>
  )
}

function PublicPermissions () {
  const { isPublic, isPlayground, canWrite } = useSelector(state => state.report)
  const isSelfHosted = useSelector(state => state.user.isSelfHosted)
  if (isSelfHosted) {
    return null
  }
  if (
    !canWrite && // show for authors and editors
    !isPublic && !isPlayground // show for public reports
  ) {
    return null
  }
  const disabledReason = isSelfHosted ? 'Public link sharing settings are unavailable in self-hosted mode.' : ''
  const disabled = Boolean(disabledReason) || isPlayground
  return (
    <div className={styles.boolStatus}>
      <div className={styles.boolStatusIcon}><GlobalOutlined /></div>
      <div className={styles.boolStatusLabel}>
        <div className={styles.statusLabelTitle}>Share to anyone with the link</div>
        <div className={styles.statusLabelDescription}><PublishSwitchDescription /></div>
      </div>
      <div className={styles.boolStatusControl}>
        <PublishSwitch disabled={disabled} />
      </div>
    </div>
  )
}
function AllowExportData () {
  const { allowExport, canWrite, id } = useSelector(state => state.report)
  const authEnabled = useSelector(state => state.env.authEnabled)
  const disabled = !authEnabled
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
          disabled={disabled}
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
  const isSelfHosted = useSelector(state => state.user.isSelfHosted)
  switch (true) {
    case isPlayground:
      return <>{isSelfHosted ? 'Everyone with access to this workspace can view and edit this map.' : 'Workspace permissions are disabled in Playground Mode'}</>
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

function WorkspacePermissionsSelect ({ disabled = false }) {
  const { isPublic, id, isPlayground, isAuthor, allowEdit, discoverable } = useSelector(state => state.report)
  const dispatch = useDispatch()
  const value = isPlayground
    ? workspacePermissions.EDIT
    : permissionValueFromReportProps({ discoverable, allowEdit })
  const [selectValue, setSelectValue] = useState(value)

  useEffect(() => {
    setSelectValue(value)
  }, [value])

  const selectDisabled = disabled || !isAuthor || isPlayground
  return (
    <Select
      defaultValue={value}
      id='dekart-workspace-permissions-select'
      value={selectValue}
      disabled={selectDisabled}
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
  if (!canWrite && !discoverable) { // show only for discoverable workspace reports
    return null
  }
  let disabledReason = ''
  if (isDefaultWorkspace) {
    disabledReason = 'Workspace-level sharing is unavailable in the default workspace.'
  } else if (!isSharable) {
    disabledReason = 'Workspace-level sharing is unavailable for this map configuration.'
  }
  const disabled = Boolean(disabledReason)
  return (
    <>
      <div className={styles.workspaceStatus}>
        <div className={styles.workspaceStatusIcon}><TeamOutlined /></div>
        <div className={styles.workspaceStatusLabel}>
          <WorkspacePermissionsTitle />
          <div className={styles.statusLabelDescription}><WorkspacePermissionsDescription /></div>
        </div>
        <div className={styles.workspaceStatusControl}>
          <WorkspacePermissionsSelect disabled={disabled} />
        </div>
      </div>
    </>
  )
}

function NonShareableWarning () {
  const { isSharable } = useSelector(state => state.report)
  const datasource = useSelector(state => state.env.variables.DATASOURCE)
  const isPostgresDatasource = datasource === 'PG'
  const canAddConnection = useSelector(state => state.user.isAdmin)
  const connectionsEnabled = useSelector(state => state.connection.userDefined)
  const canManageConnections = canAddConnection && connectionsEnabled
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
          {isPostgresDatasource
            ? 'Postgres sharing is not supported yet.'
            : 'Sharing is currently available for Snowflake, or BigQuery with a storage bucket or service account.'}
        </div>
      </div>
      {canManageConnections && (
        <div className={styles.workspaceStatusControl}>
          <Button
            onClick={() => {
              track('ManageConnectionsFromShareModal')
              history.push('/connections')
            }}
          >Manage connections
          </Button>
        </div>
      )}
    </div>
  )
}

function AuthDisabledWarning () {
  const authEnabled = useSelector(state => state.env.authEnabled)
  if (authEnabled) {
    return null
  }
  return (
    <div className={classNames(styles.workspaceStatus, styles.nonSharableWarning)}>
      <div className={styles.workspaceStatusIcon}><WarningOutlined /></div>
      <div className={styles.workspaceStatusLabel}>
        <div className={styles.statusLabelTitle}>You are not logged in</div>
        <div className={styles.statusLabelDescription}>
          Sharing controls are shown as read-only because you are not logged in.
        </div>
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
      <AuthDisabledWarning />
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
  const authEnabled = useSelector(state => state.env.authEnabled)
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
  if (isDefaultWorkspace) {
    icon = <LinkOutlined />
  } else if (isPublic || isPlayground) {
    icon = <GlobalOutlined />
  } else if (discoverable || hasDirectAccess) {
    icon = <TeamOutlined />
  }
  if (!authEnabled) {
    return null
  }
  if (!canWrite) {
    return <CopyLinkButton ghost />
  }
  return (
    <>
      <Button
        icon={icon}
        ghost={!authEnabled}
        type={authEnabled ? 'primary' : 'default'}
        id='dekart-share-report'
        title='Map sharing options'
        onClick={() => {
          setModalOpen(true)
          track('OpenShareModal')
        }}
      >Share
      </Button>
      <Modal
        title='Share Map'
        visible={modalOpen}
        onOk={() => setModalOpen(false)}
        onCancel={() => setModalOpen(false)}
        bodyStyle={{ padding: '0px' }}
        footer={
          <div className={styles.modalFooter}>
            {workspaceId && !isSnowpark ? <Button icon='+ ' type='primary' href='/workspace/members' onClick={() => track('AddUsersToWorkspaceFromShareModal')}>Add users to workspace</Button> : null}
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
