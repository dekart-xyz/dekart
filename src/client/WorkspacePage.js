import { Header } from './Header'
import styles from './WorkspacePage.module.css'
import Card from 'antd/es/card'
import Tag from 'antd/es/tag'
import { HomeOutlined, TeamOutlined, CheckCircleOutlined, InboxOutlined, CreditCardOutlined } from '@ant-design/icons'
import Title from 'antd/es/typography/Title'
import Text from 'antd/es/typography/Text'
import Button from 'antd/es/button'
import { useCallback, useEffect, useState } from 'react'
import { createWorkspace, updateWorkspace, createSubscription, updateWorkspaceUser, respondToInvite, redirectToCustomerPortal } from './actions/workspace'
import { useDispatch, useSelector } from 'react-redux'
import { PlanType, UpdateWorkspaceUserRequest } from '../proto/dekart_pb'
import Table from 'antd/es/table'
import Input from 'antd/es/input'
import Onboarding from './Onboarding'
import Badge from 'antd/es/badge'
import Steps from 'antd/es/steps'
import Radio from 'antd/es/radio'
import Form from 'antd/es/form'

function Invites () {
  const workspace = useSelector(state => state.workspace)
  const invites = workspace.invites
  const dispatch = useDispatch()
  return (
    <div className={styles.invites}>
      {invites.length === 0
        ? (
          <Onboarding
            icon={<InboxOutlined />}
            title='Users of existing team can invite you to join'
            steps={
              <ol>
                <li>User of existing team can invite by adding your email in "Members" tab</li>
                <li>Once you email added you can accept it here</li>
              </ol>
            }
          />
          )
        : (
          <div className={styles.inviteList}>
            <Table
              dataSource={invites}
              pagination={false}
              showHeader={false}
              columns={[
                {
                  key: 'invite',
                  className: styles.workspaceNameColumn,
                  render: (invite) => (
                    <>
                      <div className={styles.workspaceName}>Join <i>{invite.workspaceName}</i></div>
                      <div className={styles.inviterEmail}>invited by {invite.inviterEmail}</div>
                    </>)
                },
                {
                  title: 'Actions',
                  key: 'actions',
                  render: (invite) => (
                    <>
                      <Button
                        ghost
                        type='primary'
                        className={styles.acceptButton} onClick={() => dispatch(respondToInvite(invite.inviteId, true))}
                      >Accept
                      </Button>
                      <Button
                        type='danger'
                        ghost onClick={() => dispatch(respondToInvite(invite.inviteId, false))}
                      >Decline
                      </Button>
                    </>)
                }
              ]}
            />

          </div>)}

    </div>
  )
}

function TeamTab () {
  const users = useSelector(state => state.workspace.users)
  const user = useSelector(state => state.user)
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
              render: (status) => <Tag>{['Unknown', 'Pending', 'Active', 'Removed'][status]}</Tag>
            },
            {
              title: 'Active',
              dataIndex: 'active',
              className: styles.removeButtonColumn,
              render: (a, u) => (
                <Button
                  disabled={u.email === user.email}
                  title={u.email === user.email ? 'You cannot remove yourself' : undefined}
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

function PlanTitle ({ name, price, icon, color, description, selected }) {
  return (
    <div className={styles.planTitle}>
      <div className={styles.planTitleText}>
        <Tag icon={icon} color={selected ? '#108ee9' : undefined}>{name}</Tag>
      </div>
      <div className={styles.planTitlePrice}>
        <Title level={2}>{price}</Title>
      </div>
      <div className={styles.planTitleDescription}>
        <Title level={5} type='secondary'>{description}</Title>
      </div>
    </div>
  )
}

function Plan ({ title, children, action, planType, cancelAt }) {
  const [hover, setHover] = useState(false)
  const user = useSelector(state => state.user)
  const dispatch = useDispatch()
  const [waitForRedirect, setWaitForRedirect] = useState(false)
  let actionButton = (
    <Button
      key='1' type={hover ? 'primary' : 'default'}
      disabled={waitForRedirect} loading={waitForRedirect}
      onClick={() => {
        setWaitForRedirect(true)
        dispatch(createSubscription(planType))
      }} ghost={hover}
    >Choose plan
    </Button>
  )
  if (user.planType === PlanType.TYPE_TEAM && planType === PlanType.TYPE_PERSONAL) {
    actionButton = (
      <Button disabled title='Downgrading from Team to Personal is not supported'>Choose plan</Button>
    )
  }
  if (user.planType === PlanType.TYPE_PERSONAL && planType === PlanType.TYPE_PERSONAL) {
    actionButton = (
      <Button disabled>Current plan</Button>
    )
  }
  if (user.planType === PlanType.TYPE_TEAM && planType === PlanType.TYPE_TEAM) {
    actionButton = (
      <>
        <Button
          disabled={waitForRedirect} loading={waitForRedirect} onClick={() => {
            setWaitForRedirect(true)
            dispatch(redirectToCustomerPortal())
          }}
        >Manage subscription
        </Button>
        {cancelAt ? (<div className={styles.cancelAt}>Cancels {(new Date(1000 * cancelAt)).toLocaleString()}</div>) : null}
      </>
    )
  }
  // const subscription = useSelector(state => state.workspace.subscription)
  return (
    <Card
      hoverable
      type='inner'
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      style={{ width: 300 }}
      actions={[actionButton]}
    >{children}
    </Card>
  )
}

function Plans () {
  const user = useSelector(state => state.user)
  const workspace = useSelector(state => state.workspace)
  return (
    <div className={styles.plans}>
      <Plan
        title={<PlanTitle
          icon={<HomeOutlined />}
          name='personal'
          selected={user.planType === PlanType.TYPE_PERSONAL}
          price='$0'
          description='for personal use and evaluation'
               />}
        planType={PlanType.TYPE_PERSONAL}
        action='Choose personal'
      >
        <p><Text><CheckCircleOutlined /> Query data from BigQuery</Text></p>
        <p><Text><CheckCircleOutlined /> Access private datasets</Text></p>
        <p><Text><CheckCircleOutlined /> Unlimited maps</Text></p>
        <p><Text>No collaborators</Text></p>
      </Plan>
      <Plan
        title={<PlanTitle
          icon={<TeamOutlined />}
          name='team'
          price='$100/month'
          selected={user.planType === PlanType.TYPE_TEAM}
          description='for teams up to 20 people'
               />}
        planType={PlanType.TYPE_TEAM}
        action='Choose team'
        cancelAt={workspace?.subscription?.cancelAt}
      >
        <p><Text><CheckCircleOutlined /> Query data from BigQuery</Text></p>
        <p><Text><CheckCircleOutlined /> Access private datasets</Text></p>
        <p><Text><CheckCircleOutlined /> Unlimited maps</Text></p>
        <p><Text type='success'><CheckCircleOutlined /> Up to 20 collaborators</Text></p>
      </Plan>
    </div>
  )
}

function SubscriptionTab () {
  const user = useSelector(state => state.user)
  if (!user) {
    return null
  }
  return (
    <div className={styles.subscriptionTab}>
      <Plans />
    </div>
  )
}

function CreateWorkspaceForm () {
  const [disabled, setDisabled] = useState(false)
  const dispatch = useDispatch()
  return (
    <Card>
      <Form
        disabled={disabled}
        layout='vertical' onFinish={(values) => {
          setDisabled(true)
          dispatch(createWorkspace(values.name))
        }}
      >
        <Form.Item name='name' rules={[{ required: true, message: 'Workspace name is required' }]}>
          <Input placeholder='Workspace name' />
        </Form.Item>
        <Form.Item>
          <Button type='primary' htmlType='submit'>
            Create
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )
}

function UpdateWorkspaceForm () {
  const workspace = useSelector(state => state.workspace)
  const [disabled, setDisabled] = useState(false)
  const dispatch = useDispatch()
  useEffect(() => {
    setDisabled(false)
  }, [workspace])
  return (
    <Card>
      <Form
        disabled={disabled}
        initialValues={{ name: workspace.name }}
        layout='vertical' onFinish={(values) => {
          setDisabled(true)
          dispatch(updateWorkspace(values.name))
        }}
      >
        <Form.Item name='name' label='Workspace name' rules={[{ required: true, message: 'Workspace name is required' }]}>
          <Input />
        </Form.Item>
        <Form.Item>
          <Button type='primary' htmlType='submit'>
            Update
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )
}

function WorkspaceTab () {
  // // const invites = useSelector(state => state.workspace.invites)
  const user = useSelector(state => state.user)
  const workspace = useSelector(state => state.workspace)
  const invites = workspace.invites
  // const subscriptionActive = user?.subscriptionActive
  // const prevSubscriptionActiveRef = useRef()
  // const dispatch = useDispatch()
  // const history = useHistory()
  // const [disabled, setDisabled] = useState(false)
  const [radioValue, setRadioValue] = useState('workspace')
  if (user.workspaceId && user.workspaceId !== workspace.id) {
    return null
  }
  let form = workspace.id ? <UpdateWorkspaceForm /> : <CreateWorkspaceForm />
  if (radioValue === 'invites') {
    form = <Invites />
  }
  // useEffect(() => {
  //   prevSubscriptionActiveRef.current = true
  // }, [])
  // useEffect(() => {
  //   if (subscriptionActive && !prevSubscriptionActiveRef.current) {
  //     history.push('/')
  //   } else {
  //     prevSubscriptionActiveRef.current = subscriptionActive
  //   }
  // }, [subscriptionActive, history])
  return (
    <div className={styles.workspaceTab}>
      <div className={styles.workspaceTabHeader}>
        <div>
          <Title level={4}>Create workspace or join existing one</Title>
        </div>
        <div><Radio.Group
          value={radioValue}
          onChange={(e) => setRadioValue(e.target.value)}
          // size='sm'
          options={[
            { label: workspace.id ? 'Update' : 'Create', value: 'workspace' },
            { label: <Badge color='blue' count={invites.length} offset={[14, -10]}>Join</Badge>, value: 'invites' }
          ]}
        // onChange={onChange4}
        // value={value4}
          optionType='button'
          buttonStyle='solid'
             />
        </div>
      </div>
      <div className={styles.workspaceTabBody}>{form}</div>

    </div>
  )
  // return (
  //   <div className={styles.workspaceTab}>
  //     {invites.length === 0
  //       ? (
  //         <Onboarding
  //           icon={<InboxOutlined />}
  //           title='Users of existing team can invite you to join'
  //           steps={
  //             <ol>
  //               <li>User of existing team can invite by adding your email in "Members" tab</li>
  //               <li>Once you email added you can accept it here</li>
  //             </ol>
  //           }
  //         />
  //         )
  //       : (
  //         <div className={styles.inviteList}>
  //           <Table
  //             dataSource={invites}
  //             pagination={false}
  //             showHeader={false}
  //             columns={[
  //               {
  //                 key: 'invite',
  //                 className: styles.workspaceNameColumn,
  //                 render: (invite) => (
  //                   <>
  //                     <div className={styles.workspaceName}>{invite.workspace.name}</div>
  //                     <div className={styles.inviterEmail}>invited by {invite.inviterEmail}</div>
  //                   </>)
  //               },
  //               {
  //                 title: 'Actions',
  //                 key: 'actions',
  //                 render: (invite) => (
  //                   <>
  //                     <Button
  //                       ghost
  //                       type='primary'
  //                       className={styles.acceptButton} onClick={() => dispatch(respondToInvite(invite.workspace.id, true))}
  //                     >Accept
  //                     </Button>
  //                     <Button
  //                       type='danger'
  //                       ghost onClick={() => dispatch(respondToInvite(invite.workspace.id, false))}
  //                     >Decline
  //                     </Button>
  //                   </>)
  //               }
  //             ]}
  //           />

  //         </div>)}

  //   </div>
  // )
}

export function Workspace () {
  const user = useSelector(state => state.user)
  const workspaceId = user?.workspaceId
  const planType = user?.planType
  const [step, setStep] = useState(0)

  // move to the next step if workspaceId is set
  useEffect(() => {
    if (workspaceId) {
      if (planType === PlanType.TYPE_TEAM) {
        setStep(2)
      } else {
        setStep(1)
      }
    }
  }, [workspaceId, planType])

  if (!user) {
    return null
  }
  return (
    <div className={styles.workspace}>
      <div className={styles.workspaceSteps}>
        <Steps
          type='navigation'
          size='default'
          current={step}
          onChange={(current) => {
            setStep(current)
          }}
          className='site-navigation-steps'
          items={[
            {
              title: 'Workspace',
              icon: <HomeOutlined />
            },
            {
              title: 'Billing',
              icon: <CreditCardOutlined />,
              disabled: !user.workspaceId
            },
            {
              title: 'Members',
              icon: <TeamOutlined />,
              disabled: user.planType !== PlanType.TYPE_TEAM
            }
          ]}
        />
      </div>
      {([<WorkspaceTab key={0} />, <SubscriptionTab key={1} />, <TeamTab key={2} />])[step]}
    </div>
  )
}

export default function WorkspacePage ({ tab }) {
  // const subscription = useSelector(state => state.workspace.subscription)
  // const teamPlan = subscription?.planType === PlanType.TYPE_TEAM
  // const user = useSelector(state => state.user)
  // const invites = useSelector(state => state.workspace.invites)
  // const history = useHistory()
  return (
    <div className={styles.workspacePage}>
      <Header />
      <div className={styles.body}>
        <Workspace />
      </div>
    </div>
  )
}
