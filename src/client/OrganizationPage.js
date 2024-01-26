import Tabs from 'antd/es/tabs'
import { Header } from './Header'
import styles from './OrganizationPage.module.css'
import Card from 'antd/es/card'
import Tag from 'antd/es/tag'
import { GithubOutlined, HomeOutlined, TeamOutlined, CheckCircleOutlined, HighlightOutlined, UsergroupAddOutlined, InboxOutlined, CheckCircleFilled, DownOutlined } from '@ant-design/icons'
import Title from 'antd/es/typography/Title'
import Text from 'antd/es/typography/Text'
import Button from 'antd/es/button'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cancelSubscription, createOrganization, updateOrganization, createSubscription, updateOrganizationUser, respondToInvite, redirectToCustomerPortal } from './actions/organization'
import { useDispatch, useSelector } from 'react-redux'
import { PlanType, UpdateOrganizationUserRequest } from '../proto/dekart_pb'
import Dropdown from 'antd/es/dropdown'
import Modal from 'antd/es/modal/Modal'
import { useHistory } from 'react-router-dom/cjs/react-router-dom'
import Table from 'antd/es/table'
import Input from 'antd/es/input'
import Onboarding from './Onboarding'
import Badge from 'antd/es/badge'
import Steps from 'antd/es/steps'
import Radio from 'antd/es/radio'
import Form from 'antd/es/form'

function Invites () {
  const organization = useSelector(state => state.organization)
  const invites = organization.invites
  console.log(invites)
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
                  className: styles.organizationNameColumn,
                  render: (invite) => (
                    <>
                      <div className={styles.organizationName}>Join <i>{invite.organizationName}</i></div>
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
  const users = useSelector(state => state.organization.users)
  const user = useSelector(state => state.user)
  const dispatch = useDispatch()
  const [email, setEmail] = useState('')
  const addUserCb = useCallback(() => {
    if (email) {
      dispatch(updateOrganizationUser(email, UpdateOrganizationUserRequest.UserUpdateType.USER_UPDATE_TYPE_ADD))
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
              render: (a, u) => <Button
                disabled={u.email === user.email}
                title={u.email === user.email ? 'You cannot remove yourself' : undefined}
                className={styles.removeButton}
                type='text' onClick={() => {
                  dispatch(updateOrganizationUser(u.email, UpdateOrganizationUserRequest.UserUpdateType.USER_UPDATE_TYPE_REMOVE))
                }}
                                >Remove
                                </Button>
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
  // const subscription = useSelector(state => state.organization.subscription)
  return (
    <Card
      hoverable
      type='inner'
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      style={{ width: 300 }}
      actions={[
        user.planType === planType
          ? (
            <>
              <Button
                key='1' disabled
              >Current plan
              </Button>
              {cancelAt ? (<div className={styles.cancelAt}>Cancels {(new Date(1000 * cancelAt)).toLocaleString()}</div>) : null}
            </>
            )
          : (
            <Button
              key='1' type={hover ? 'primary' : 'default'} onClick={() => {
                dispatch(createSubscription(planType))
              }} ghost={hover}
            >{action}
            </Button>
            )
      ]}
    >{children}
    </Card>
  )
}

function Plans () {
  const user = useSelector(state => state.user)
  const organization = useSelector(state => state.organization)
  return (
    <div className={styles.plans}>
      <Plan
        title={<PlanTitle
          icon={<HomeOutlined />}
          name='personal'
          selected={user.planType === PlanType.TYPE_PERSONAL}
          price='$0'
          description='requires use of personal email'
               />}
        planType={PlanType.TYPE_PERSONAL}
        action='Choose personal'
      >
        <p><Text type='success'><CheckCircleOutlined /> Access to private datasets</Text></p>
        <p><Text><CheckCircleOutlined /> <s>SSO with company email</s></Text></p>
        <p><Text><HighlightOutlined /> Requires Google Cloud access</Text></p>
        <p><Text><HighlightOutlined /> Requires Google Cloud Storage</Text></p>
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
        cancelAt={organization?.subscription?.cancelAt}
      >
        <p><Text type='success'><CheckCircleOutlined /> Access to private datasets</Text></p>
        <p><Text type='success'><CheckCircleOutlined /> SSO with company email</Text></p>
        <p><Text><HighlightOutlined /> Requires Google Cloud access</Text></p>
        <p><Text><HighlightOutlined /> Requires Google Cloud Storage</Text></p>
      </Plan>
    </div>
  )
}

function SubscriptionTab () {
  const user = useSelector(state => state.user)
  const subscription = useSelector(state => state.organization.subscription)
  const dispatch = useDispatch()
  if (!user) {
    return null
  }
  const menuProps = {
    items: [
      {
        label: 'Cancel subscription',
        danger: true,
        onClick: () => {
          Modal.confirm({
            title: 'Cancel subscription?',
            okText: 'Yes',
            okType: 'danger',
            cancelText: 'No',
            onOk: () => dispatch(cancelSubscription())
          })
        }
      },
      {
        label: 'Payment & invoices',
        onClick: () => {
          dispatch(redirectToCustomerPortal())
        }
      }
    ]
  }
  return (
    <div className={styles.subscriptionTab}>
      {/* {subscription?.active && subscription.cancelAt
        ? (
          <div className={styles.cancelsAt}>
            <Text type='secondary'>Your subscription will be cancelled on {subscription.cancelsAt}</Text>
          </div>
          )
        : null} */}
      {/* <div className={styles.title}>
        <Title>
          {user.subscriptionActive ? <span className={styles.titleCheck}><CheckCircleFilled /></span> : <span className={styles.titleLock}><LockFilled /></span>}
          <> Subscription</>
        </Title>
      </div> */}
      <Plans />
      {subscription && subscription.planType
        ? (
          <div className={styles.bottomPanel}>
            <div className={styles.manageSubscription}>
              <Dropdown menu={menuProps}>
                <Button>
                  Manage subscription
                  <DownOutlined />
                </Button>
              </Dropdown>
            </div>
          </div>
          )
        : null}
    </div>
  )
}

function CreateOrganizationForm () {
  const [disabled, setDisabled] = useState(false)
  const dispatch = useDispatch()
  return (
    <Card>
      <Form
        disabled={disabled}
        layout='vertical' onFinish={(values) => {
          setDisabled(true)
          dispatch(createOrganization(values.name))
        }}
      >
        <Form.Item name='name' rules={[{ required: true, message: 'Organization name is required' }]}>
          <Input placeholder='Organization name' />
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

function UpdateOrganizationForm () {
  const organization = useSelector(state => state.organization)
  const [disabled, setDisabled] = useState(false)
  const dispatch = useDispatch()
  useEffect(() => {
    setDisabled(false)
  }, [organization])
  return (
    <Card>
      <Form
        disabled={disabled}
        initialValues={{ name: organization.name }}
        layout='vertical' onFinish={(values) => {
          setDisabled(true)
          dispatch(updateOrganization(values.name))
        }}
      >
        <Form.Item name='name' label='Organization name' rules={[{ required: true, message: 'Organization name is required' }]}>
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

function OrganizationTab () {
  // // const invites = useSelector(state => state.organization.invites)
  const user = useSelector(state => state.user)
  const organization = useSelector(state => state.organization)
  const invites = organization.invites
  // const subscriptionActive = user?.subscriptionActive
  // const prevSubscriptionActiveRef = useRef()
  // const dispatch = useDispatch()
  // const history = useHistory()
  // const [disabled, setDisabled] = useState(false)
  const [radioValue, setRadioValue] = useState('organization')
  if (user.organizationId && user.organizationId !== organization.id) {
    return null
  }
  let form = organization.id ? <UpdateOrganizationForm /> : <CreateOrganizationForm />
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
    <div className={styles.organizationTab}>
      <div className={styles.organizationTabHeader}>
        <div>
          <Title level={4}>Create organization or join existing one</Title>
        </div>
        <div><Radio.Group
          value={radioValue}
          onChange={(e) => setRadioValue(e.target.value)}
          // size='sm'
          options={[
            { label: organization.id ? 'Update' : 'Create', value: 'organization' },
            { label: <Badge color='blue' count={invites.length} offset={[14, -10]}>Join</Badge>, value: 'invites' }
          ]}
        // onChange={onChange4}
        // value={value4}
          optionType='button'
          buttonStyle='solid'
             />
        </div>
      </div>
      <div className={styles.organizationTabBody}>{form}</div>

    </div>
  )
  // return (
  //   <div className={styles.organizationTab}>
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
  //                 className: styles.organizationNameColumn,
  //                 render: (invite) => (
  //                   <>
  //                     <div className={styles.organizationName}>{invite.organization.name}</div>
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
  //                       className={styles.acceptButton} onClick={() => dispatch(respondToInvite(invite.organization.id, true))}
  //                     >Accept
  //                     </Button>
  //                     <Button
  //                       type='danger'
  //                       ghost onClick={() => dispatch(respondToInvite(invite.organization.id, false))}
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

export function Organization () {
  const user = useSelector(state => state.user)
  const organizationId = user?.organizationId
  const planType = user?.planType
  const [step, setStep] = useState(0)

  // move to the next step if organizationId is set
  useEffect(() => {
    if (organizationId) {
      if (planType === PlanType.TYPE_TEAM) {
        setStep(2)
      } else {
        setStep(1)
      }
    }
  }, [organizationId, planType])

  if (!user) {
    return null
  }
  return (
    <div className={styles.organization}>
      <div className={styles.organizationSteps}>
        <Steps
          type='navigation'
        // progressDot={<> </>}
          size='default'
          current={step}
          onChange={(current) => {
            console.log(current)
            setStep(current)
          }}
          className='site-navigation-steps'
          items={[
            {
              title: 'Organization',
              icon: <TeamOutlined />
            },
            {
              title: 'Plan',
              icon: <TeamOutlined />,
              disabled: !user.organizationId
            },
            {
              title: 'Members',
              icon: <TeamOutlined />,
              disabled: user.planType !== PlanType.TYPE_TEAM
            }
          ]}
        />
      </div>
      {([<OrganizationTab key={0} />, <SubscriptionTab key={1} />, <TeamTab key={2} />])[step]}
    </div>
  )
}

export default function OrganizationPage ({ tab }) {
  // const subscription = useSelector(state => state.organization.subscription)
  // const teamPlan = subscription?.planType === PlanType.TYPE_TEAM
  // const user = useSelector(state => state.user)
  // const invites = useSelector(state => state.organization.invites)
  // const history = useHistory()
  return (
    <div className={styles.organizationPage}>
      <Header />
      <div className={styles.body}>
        <Organization />
      </div>
    </div>
  )
}
