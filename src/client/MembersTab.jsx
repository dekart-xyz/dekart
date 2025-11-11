import { useDispatch, useSelector } from 'react-redux'
import styles from './MembersTab.module.css'
import { useCallback, useEffect, useState } from 'react'
import { updateWorkspaceUser } from './actions/workspace'
import { PlanType, UpdateWorkspaceUserRequest, UserRole } from 'dekart-proto/dekart_pb'
import Input from 'antd/es/input'
import Button from 'antd/es/button'
import Table from 'antd/es/table'
import Tag from 'antd/es/tag'
import { copyUrlToClipboard } from './actions/clipboard'
import { CopyOutlined } from '@ant-design/icons'
import Select from 'antd/es/select'
import { track } from './lib/tracking'
import { showUpgradeModal, UpgradeModalType } from './actions/upgradeModal'

function getRoleTitle (role, planType) {
  const roleLabels = {
    [PlanType.TYPE_GROW]: {
      [UserRole.ROLE_ADMIN]: 'Admin ($49/month)',
      [UserRole.ROLE_EDITOR]: 'Editor ($49/month)',
      [UserRole.ROLE_VIEWER]: 'Viewer (free)'
    },
    default: {
      [UserRole.ROLE_ADMIN]: 'Admin',
      [UserRole.ROLE_EDITOR]: 'Editor',
      [UserRole.ROLE_VIEWER]: 'Viewer'
    }
  }
  const labels = roleLabels[planType] || roleLabels.default
  return labels[role] || 'Unknown'
}

export default function MembersTab () {
  const users = useSelector(state => state.workspace.users)
  const addedUsersCount = useSelector(state => state.workspace.addedUsersCount)
  const userStream = useSelector(state => state.user.stream)
  const planType = userStream?.planType
  const dispatch = useDispatch()
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState(UserRole.ROLE_VIEWER)
  const isAdmin = useSelector(state => state.user.isAdmin)
  const expired = useSelector(state => state.workspace.expired)
  const canManageUsers = isAdmin && !expired
  const isFreemium = useSelector(state => state.user.isFreemium)
  const addUserCb = useCallback(() => {
    if (email && canManageUsers) {
      dispatch(updateWorkspaceUser(email, UpdateWorkspaceUserRequest.UserUpdateType.USER_UPDATE_TYPE_ADD, inviteRole))
      setEmail('')
    }
  }, [dispatch, email, canManageUsers, inviteRole])
  const usersLoaded = Boolean(users)
  useEffect(() => {
    if (usersLoaded) {
      track('MembersTabLoaded')
    }
  }, [usersLoaded])
  if (!usersLoaded) {
    return null
  }

  let inviteDisabled
  if (planType === PlanType.TYPE_TEAM) {
    inviteDisabled = !canManageUsers || addedUsersCount >= 20
  } else {
    inviteDisabled = !canManageUsers
  }

  return (
    <div className={styles.teamTab}>
      <div className={styles.inviteUsers}>
        <Input
          className={styles.inviteUsersInput}
          name='email'
          type='email'
          autoComplete='email'
          aria-label='Email'
          pattern='^[a-zA-Z0-9._%+\-@]*$'
          placeholder='Email' value={email} onChange={(e) => setEmail(e.target.value)}
          onPressEnter={addUserCb}
        />
        <Select
          style={{ width: 220 }}
          name='role'
          value={inviteRole}
          onChange={(value) => {
            setInviteRole(value)
          }}
          options={[
            {
              value: UserRole.ROLE_ADMIN,
              label: getRoleTitle(UserRole.ROLE_ADMIN, planType)
            },
            {
              value: UserRole.ROLE_EDITOR,
              label: getRoleTitle(UserRole.ROLE_EDITOR, planType)
            },
            {
              value: UserRole.ROLE_VIEWER,
              label: getRoleTitle(UserRole.ROLE_VIEWER, planType)
            }

          ]}
        />
        <Button
          disabled={inviteDisabled}
          className={styles.inviteUsersButton} type='primary' onClick={() => {
            if (isFreemium) {
              dispatch(showUpgradeModal(UpgradeModalType.INVITE))
              return
            }
            track('InviteUser', { role: inviteRole })
            addUserCb()
          }}
        >Invite user
        </Button>
      </div>
      <div className={styles.userTable}>
        <Table
          showHeader={false}
          pagination={false}
          loading={!users.length}
          dataSource={users.filter(u => u.status !== 3)}
          rowClassName={styles.userListRow}
          rowKey='email'
          columns={[
            {
              title: 'Email',
              dataIndex: 'email',
              key: 'email',
              className: styles.emailColumn
            },
            // copy invite link
            {
              title: 'Invite',
              dataIndex: 'status',
              key: 'invite',
              render: (status, u) => (
                status === 1
                  ? (
                    <Button
                      icon={<CopyOutlined />}
                      className={styles.inviteButton}
                      title='Copy invite link'
                      type='text' onClick={() => {
                        track('CopyInviteLink', { inviteId: u.inviteId })
                        dispatch(copyUrlToClipboard(window.location.toString() + '/invite/' + u.inviteId, 'Invite link copied to clipboard'))
                      }}
                    />
                    )
                  : null
              )
            },
            {
              title: 'Status',
              dataIndex: 'status',
              key: 'status',
              render: (status) => <Tag>{['Unknown', 'Pending', 'Active', 'Removed', 'Rejected'][status]}</Tag>
            },
            {
              title: 'Role',
              dataIndex: 'role',
              key: 'role',
              render: (role, u) => (
                <Select
                  defaultValue={role}
                  style={{ width: 220 }}
                  disabled={u.email === userStream.email || !canManageUsers}
                  onChange={(value) => {
                    track('ChangeUserRole', { email: u.email, newRole: value })
                    dispatch(updateWorkspaceUser(u.email, UpdateWorkspaceUserRequest.UserUpdateType.USER_UPDATE_TYPE_UPDATE, value))
                  }}
                  options={[
                    {
                      value: UserRole.ROLE_ADMIN,
                      label: getRoleTitle(UserRole.ROLE_ADMIN, planType)
                    },
                    {
                      value: UserRole.ROLE_EDITOR,
                      label: getRoleTitle(UserRole.ROLE_EDITOR, planType)
                    },
                    {
                      value: UserRole.ROLE_VIEWER,
                      label: getRoleTitle(UserRole.ROLE_VIEWER, planType)
                    }

                  ]}
                />
              )
            },
            {
              title: 'Active',
              dataIndex: 'active',
              className: styles.removeButtonColumn,
              render: (a, u) => (
                <RemoveButton email={u.email} />
              )
            }
          ]}
        />
      </div>

    </div>
  )
}

function RemoveButton ({ email }) {
  const [removing, setRemoving] = useState(false)
  const dispatch = useDispatch()
  const userStream = useSelector(state => state.user.stream)
  const isAdmin = useSelector(state => state.user.isAdmin)
  return (
    <Button
      disabled={email === userStream.email || !isAdmin || removing}
      loading={removing}
      title={email === userStream.email ? 'You cannot remove yourself' : undefined}
      className={styles.removeButton}
      type='text' onClick={() => {
        track('RemoveUserFromWorkspace', { email })
        setRemoving(true)
        dispatch(updateWorkspaceUser(email, UpdateWorkspaceUserRequest.UserUpdateType.USER_UPDATE_TYPE_REMOVE))
      }}
    >Remove
    </Button>
  )
}
