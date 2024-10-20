import { useDispatch, useSelector } from 'react-redux'
import styles from './MembersTab.module.css'
import { useCallback, useState } from 'react'
import { updateWorkspaceUser } from './actions/workspace'
import { PlanType, UpdateWorkspaceUserRequest, UserRole } from '../proto/dekart_pb'
import Input from 'antd/es/input'
import Button from 'antd/es/button'
import Table from 'antd/es/table'
import Tag from 'antd/es/tag'
import { copyUrlToClipboard } from './actions/clipboard'
import { CopyOutlined } from '@ant-design/icons'
import Select from 'antd/es/select'

export default function MembersTab () {
  const users = useSelector(state => state.workspace.users)
  const addedUsersCount = useSelector(state => state.workspace.addedUsersCount)
  const userStream = useSelector(state => state.user.stream)
  const planType = userStream?.planType
  const dispatch = useDispatch()
  const [email, setEmail] = useState('')
  const isAdmin = useSelector(state => state.user.isAdmin)
  const addUserCb = useCallback(() => {
    if (email && isAdmin) {
      dispatch(updateWorkspaceUser(email, UpdateWorkspaceUserRequest.UserUpdateType.USER_UPDATE_TYPE_ADD))
      setEmail('')
    }
  }, [dispatch, email, isAdmin])
  if (!users) {
    return null
  }

  let inviteDisabled
  if (planType === PlanType.TYPE_TEAM) {
    inviteDisabled = !isAdmin || addedUsersCount >= 20
  } else if (planType > PlanType.TYPE_PERSONAL) {
    inviteDisabled = !isAdmin
  }

  return (
    <div className={styles.teamTab}>
      <div className={styles.inviteUsers}>
        <Input.Group compact>
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
          <Button
            disabled={inviteDisabled}
            className={styles.inviteUsersButton} type='primary' onClick={addUserCb}
          >Invite user
          </Button>
        </Input.Group>
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
                      type='text' onClick={() => dispatch(copyUrlToClipboard(window.location.toString() + '/invite/' + u.inviteId, 'Invite link copied to clipboard'))}
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
                  style={{ width: 120 }}
                  disabled={u.email === userStream.email || !isAdmin}
                  onChange={(value) => {
                    dispatch(updateWorkspaceUser(u.email, UpdateWorkspaceUserRequest.UserUpdateType.USER_UPDATE_TYPE_UPDATE, value))
                  }}
                  options={[
                    {
                      value: UserRole.ROLE_ADMIN,
                      label: 'Admin'
                    },
                    {
                      value: UserRole.ROLE_EDITOR,
                      label: 'Editor'
                    },
                    {
                      value: UserRole.ROLE_VIEWER,
                      label: 'Viewer'
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
                <Button
                  disabled={u.email === userStream.email || !isAdmin}
                  title={u.email === userStream.email ? 'You cannot remove yourself' : undefined}
                  className={styles.removeButton}
                  type='text' onClick={() => {
                    dispatch(updateWorkspaceUser(u.email, UpdateWorkspaceUserRequest.UserUpdateType.USER_UPDATE_TYPE_REMOVE))
                  }}
                >Remove
                </Button>
              )
            }
          ]}
        />
      </div>

    </div>
  )
}
