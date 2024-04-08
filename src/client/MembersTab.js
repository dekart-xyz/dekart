import { useDispatch, useSelector } from 'react-redux'
import styles from './MembersTab.module.css'
import { useCallback, useState } from 'react'
import { updateWorkspaceUser } from './actions/workspace'
import { UpdateWorkspaceUserRequest } from '../proto/dekart_pb'
import Input from 'antd/es/input'
import Button from 'antd/es/button'
import Table from 'antd/es/table'
import Tag from 'antd/es/tag'

export default function MembersTab () {
  const users = useSelector(state => state.workspace.users)
  const addedUsersCount = useSelector(state => state.workspace.addedUsersCount)
  const userStream = useSelector(state => state.user.stream)
  const dispatch = useDispatch()
  const [email, setEmail] = useState('')
  const addUserCb = useCallback(() => {
    if (email) {
      dispatch(updateWorkspaceUser(email, UpdateWorkspaceUserRequest.UserUpdateType.USER_UPDATE_TYPE_ADD))
      setEmail('')
    }
  }, [dispatch, email])
  if (!users) {
    return null
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
            disabled={addedUsersCount >= 20}
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
            {
              title: 'Status',
              dataIndex: 'status',
              key: 'status',
              render: (status) => <Tag>{['Unknown', 'Pending', 'Active', 'Removed', 'Rejected'][status]}</Tag>
            },
            {
              title: 'Active',
              dataIndex: 'active',
              className: styles.removeButtonColumn,
              render: (a, u) => (
                <Button
                  disabled={u.email === userStream.email}
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
