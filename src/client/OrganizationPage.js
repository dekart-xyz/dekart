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
import { cancelSubscription, createSubscription, addUser, removeUser, respondToInvite } from './actions/organization'
import { useDispatch, useSelector } from 'react-redux'
import { PlanType } from '../proto/dekart_pb'
import Dropdown from 'antd/es/dropdown'
import Modal from 'antd/es/modal/Modal'
import { useHistory } from 'react-router-dom/cjs/react-router-dom'
import Table from 'antd/es/table'
import Input from 'antd/es/input'
import Onboarding from './Onboarding'
import Badge from 'antd/es/badge'

function TeamTab () {
  const users = useSelector(state => state.organization.users)
  const user = useSelector(state => state.user)
  const dispatch = useDispatch()
  const [email, setEmail] = useState('')
  const addUserCb = useCallback(() => {
    if (email) {
      dispatch(addUser(email))
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
                  dispatch(removeUser(u.email))
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

function Plan ({ title, children, action, planType }) {
  const [hover, setHover] = useState(false)
  const dispatch = useDispatch()
  const subscription = useSelector(state => state.organization.subscription)
  return (
    <Card
      hoverable
      type='inner'
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      style={{ width: 300 }}
      actions={[
        subscription.planType === planType
          ? (
            <Button
              key='1' disabled
            >Current plan
            </Button>
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
  const subscription = useSelector(state => state.organization.subscription)
  if (!subscription) {
    return null
  }
  return (
    <div className={styles.plans}>
      <Plan
        title={<PlanTitle
          icon={<HomeOutlined />}
          name='personal'
          selected={subscription.planType === PlanType.TYPE_PERSONAL}
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
          selected={subscription.planType === PlanType.TYPE_TEAM}
          description='for teams up to 20 people'
               />}
        planType={PlanType.TYPE_TEAM}
        action='Choose team'
      >
        <p><Text type='success'><CheckCircleOutlined /> Access to private datasets</Text></p>
        <p><Text type='success'><CheckCircleOutlined /> SSO with company email</Text></p>
        <p><Text><HighlightOutlined /> Requires Google Cloud access</Text></p>
        <p><Text><HighlightOutlined /> Requires Google Cloud Storage</Text></p>
      </Plan>
      <Plan
        title={<PlanTitle
          icon={<GithubOutlined />}
          name='community'
          price='self-hosted'
          description='estimated cost ~$65/month'
               />}
        action={<>Go to documentation</>}
      >
        <p><Text><HighlightOutlined /> Requires Google Cloud access</Text></p>
        <p><Text><HighlightOutlined /> Requires deployment on premise</Text></p>
        <p><Text><HighlightOutlined /> Requires configuration</Text></p>
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
    items: [{
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
    }]
  }
  return (
    <div className={styles.subscriptionTab}>
      {/* <div className={styles.title}>
        <Title>
          {user.subscriptionActive ? <span className={styles.titleCheck}><CheckCircleFilled /></span> : <span className={styles.titleLock}><LockFilled /></span>}
          <> Subscription</>
        </Title>
      </div> */}
      <Plans />
      {subscription && subscription.active
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

function InvitesTab () {
  const invites = useSelector(state => state.organization.invites)
  const user = useSelector(state => state.user)
  const subscriptionActive = user?.subscriptionActive
  const prevSubscriptionActiveRef = useRef()
  const dispatch = useDispatch()
  const history = useHistory()
  useEffect(() => {
    prevSubscriptionActiveRef.current = true
  }, [])
  useEffect(() => {
    if (subscriptionActive && !prevSubscriptionActiveRef.current) {
      history.push('/')
    } else {
      prevSubscriptionActiveRef.current = subscriptionActive
    }
  }, [subscriptionActive, history])
  return (
    <div className={styles.invitesTab}>
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
                      <div className={styles.organizationName}>{invite.organization.name}</div>
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
                        className={styles.acceptButton} onClick={() => dispatch(respondToInvite(invite.organization.id, true))}
                      >Accept
                      </Button>
                      <Button
                        type='danger'
                        ghost onClick={() => dispatch(respondToInvite(invite.organization.id, false))}
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

export default function OrganizationPage ({ tab }) {
  const subscription = useSelector(state => state.organization.subscription)
  const teamPlan = subscription?.planType === PlanType.TYPE_TEAM
  const user = useSelector(state => state.user)
  const invites = useSelector(state => state.organization.invites)
  const history = useHistory()
  return (
    <div className={styles.organizationPage}>
      <Header />
      <div className={styles.body}>
        {/* <Radio.Group>
          <Radio.Button value='my'>Plan</Radio.Button>
          <Radio.Button value='discoverable'>Team</Radio.Button>
        </Radio.Group> */}

        {/* <div className={styles.title}><Title level={3}>Manage organization</Title></div> */}
        {
          user
            ? (
              <Tabs
                activeKey={tab} centered onChange={(activeKey) => {
                  history.push('/organization/' + activeKey)
                }}
              >
                <Tabs.TabPane tab='Plan' key='plan'>
                  <SubscriptionTab />
                </Tabs.TabPane>
                <Tabs.TabPane tab='Members' key='team' disabled={!teamPlan}>
                  <TeamTab />
                </Tabs.TabPane>
                <Tabs.TabPane tab={<><span className={styles.invitesTabName}>Invites</span><Badge count={invites.length} /></>} key='invites'>
                  <InvitesTab />
                </Tabs.TabPane>
              </Tabs>
              )
            : null
        }

      </div>
    </div>
  )
}
