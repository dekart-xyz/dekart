import Title from 'antd/es/typography/Title'
import { Header } from './Header'
import styles from './TeamPage.module.css'
import Table from 'antd/es/table'
import { useDispatch, useSelector } from 'react-redux'
import Button from 'antd/es/button'
import Modal from 'antd/es/modal'
import { useState } from 'react'
import Input from 'antd/es/input'
import { addUser, removeUser } from './actions/organization'

const emailRegex = /^[a-zA-Z0-9._%+-@]+$/

function InviteUsers () {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const dispatch = useDispatch()
  return (
    <div className={styles.inviteUsers}>
      <Button type='primary' onClick={() => setOpen(true)}>Invite users</Button>
      <Modal
        open={open} title='Invite Users' okText='Invite' onOk={() => {
          dispatch(addUser(email))
          setOpen(false)
        }} onCancel={() => setOpen(false)}
      >
        <div className={styles.inviteUsersModal}>
          <Input
            placeholder='Email' value={email} onChange={(e) => {
              const value = e.target.value
              if (emailRegex.test(value)) {
                setEmail(value)
              }
            }}
          />
        </div>
      </Modal>
    </div>
  )
}

export default function TeamPage () {
  const users = useSelector(state => state.organization.users)
  const dispatch = useDispatch()
  return (
    <div className={styles.teamPage}>
      <Header />
      <div className={styles.body}>
        <Title>Team</Title>
        <InviteUsers />
        {
            users
              ? <Table
                  showHeader={false}
                  pagination={false}
                  dataSource={users}
                  rowKey='email'
                  columns={[
                    {
                      title: 'Email',
                      dataIndex: 'email',
                      key: 'email'
                    },
                    {
                      title: 'Status',
                      dataIndex: 'status',
                      key: 'status'
                    },
                    {
                      title: 'Active',
                      dataIndex: 'active',
                      render: (a, user) => <Button
                        type='text' onClick={() => {
                          dispatch(removeUser(user.email))
                        }}
                                           >Remove
                                           </Button>
                    }
                  ]}
                />
              : null
        }

      </div>
    </div>
  )
}
