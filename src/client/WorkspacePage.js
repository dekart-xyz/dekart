import { Header } from './Header'
import styles from './WorkspacePage.module.css'
import Card from 'antd/es/card'
import Icon, { AppstoreTwoTone, TeamOutlined, CreditCardOutlined, RocketTwoTone } from '@ant-design/icons'
import Title from 'antd/es/typography/Title'
import Button from 'antd/es/button'
import { useEffect, useState } from 'react'
import { createWorkspace, updateWorkspace, respondToInvite } from './actions/workspace'
import { useDispatch, useSelector } from 'react-redux'
import { PlanType } from '../proto/dekart_pb'
import Table from 'antd/es/table'
import Input from 'antd/es/input'
import Onboarding from './Onboarding'
import Badge from 'antd/es/badge'
import Steps from 'antd/es/steps'
import Radio from 'antd/es/radio'
import Form from 'antd/es/form'
import SubscriptionTab from './SubscriptionTab'
import MembersTab from './MembersTab'
import Result from 'antd/es/result'

function Invites () {
  const workspace = useSelector(state => state.workspace)
  const invites = workspace.invites
  const dispatch = useDispatch()
  return (
    <div className={styles.invites}>
      {invites.length === 0
        ? (
          <Onboarding
            icon={<TeamOutlined />}
            title='Awaiting an Invitation?'
            steps={
              <ol>
                <li>Ask a current member to send an invite to your email from the "Members" tab.</li>
                <li>Once they've sent it, you'll be able to accept the invitation here.</li>
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
                  className: styles.inviteActionsColumn,
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

function WorkspaceTab ({ nextStep, setNextStep }) {
  const user = useSelector(state => state.user)
  const workspace = useSelector(state => state.workspace)
  const invites = workspace.invites
  if (user.workspaceId && user.workspaceId !== workspace.id) {
    return null
  }
  let form = workspace.id ? <UpdateWorkspaceForm /> : <CreateWorkspaceForm />
  if (nextStep === 'invites') {
    form = <Invites />
  }

  let title = 'Create workspace'
  if (nextStep === 'invites') {
    title = 'Join workspace'
  } else if (workspace.id) {
    title = 'Update workspace'
  }

  return (
    <div className={styles.workspaceTab}>
      <div className={styles.workspaceTabHeader}>
        <div>
          <Title level={4}>{title}</Title>
        </div>
        {user.workspaceId
          ? null
          : (
            <div><Radio.Group
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              options={[
                { label: 'Create', value: 'workspace' },
                { label: <Badge color='blue' count={invites.length} offset={[14, -10]}><span className={styles.joinRadioItem}>Join</span></Badge>, value: 'invites' }
              ]}
              optionType='button'
              buttonStyle='solid'
                 />
            </div>
            )}
      </div>
      <div className={styles.workspaceTabBody}>{form}</div>

    </div>
  )
}

function getMembersSubTitle (addedUsersCount, planType) {
  if (isNaN(addedUsersCount)) {
    return ''
  }
  if (planType === PlanType.TYPE_TEAM) {
    return `(${addedUsersCount} of 20)`
  }
  return `(${addedUsersCount})`
}

export function Workspace ({ nextStep, setNextStep }) {
  const user = useSelector(state => state.user)
  const addedUsersCount = useSelector(state => state.workspace.addedUsersCount)
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
              icon: <AppstoreTwoTone />
            },
            {
              title: 'Billing',
              icon: <CreditCardOutlined />,
              disabled: !user.workspaceId
            },
            {
              title: 'Members',
              icon: <TeamOutlined />,
              disabled: user.planType !== PlanType.TYPE_TEAM,
              subTitle: getMembersSubTitle(addedUsersCount, planType)
            }
          ]}
        />
      </div>
      {([<WorkspaceTab key={0} nextStep={nextStep} setNextStep={setNextStep} />, <SubscriptionTab key={1} />, <MembersTab key={2} />])[step]}
    </div>
  )
}

function WelcomeScreen ({ setNextStep }) {
  const workspace = useSelector(state => state.workspace)
  const invites = workspace.invites
  return (
    <Result
      status='success'
      icon={<span className={styles.rocketIcon} />}
      // icon={<svg viewBox='64 64 896 896' focusable='false' data-icon='rocket' width='64px' height='64px' fill='currentColor' aria-hidden='true'><path d='M261.7 621.4c-9.4 14.6-17 30.3-22.5 46.6H324V558.7c-24.8 16.2-46 37.5-62.3 62.7zM700 558.7V668h84.8c-5.5-16.3-13.1-32-22.5-46.6a211.6 211.6 0 00-62.3-62.7zm-64-239.9l-124-147-124 147V668h248V318.8zM512 448a48.01 48.01 0 010-96 48.01 48.01 0 010 96z' fill='#e6f7ff' /><path d='M864 736c0-111.6-65.4-208-160-252.9V317.3c0-15.1-5.3-29.7-15.1-41.2L536.5 95.4C530.1 87.8 521 84 512 84s-18.1 3.8-24.5 11.4L335.1 276.1a63.97 63.97 0 00-15.1 41.2v165.8C225.4 528 160 624.4 160 736h156.5c-2.3 7.2-3.5 15-3.5 23.8 0 22.1 7.6 43.7 21.4 60.8a97.2 97.2 0 0043.1 30.6c23.1 54 75.6 88.8 134.5 88.8 29.1 0 57.3-8.6 81.4-24.8 23.6-15.8 41.9-37.9 53-64a97 97 0 0043.1-30.5 97.52 97.52 0 0021.4-60.8c0-8.4-1.1-16.4-3.1-23.8L864 736zm-540-68h-84.8c5.5-16.3 13.1-32 22.5-46.6 16.3-25.2 37.5-46.5 62.3-62.7V668zm64-184.9V318.8l124-147 124 147V668H388V483.1zm240.1 301.1c-5.2 3-11.2 4.2-17.1 3.4l-19.5-2.4-2.8 19.4c-5.4 37.9-38.4 66.5-76.7 66.5s-71.3-28.6-76.7-66.5l-2.8-19.5-19.5 2.5a27.7 27.7 0 01-17.1-3.5c-8.7-5-14.1-14.3-14.1-24.4 0-10.6 5.9-19.4 14.6-23.8h231.3c8.8 4.5 14.6 13.3 14.6 23.8-.1 10.2-5.5 19.6-14.2 24.5zM700 668V558.7a211.6 211.6 0 0162.3 62.7c9.4 14.6 17 30.3 22.5 46.6H700z' fill='#1890ff' /><path d='M464 400a48 48 0 1096 0 48 48 0 10-96 0z' fill='#1890ff' /></svg>}
      // icon={<RocketTwoTone />}
      title='Get started!'
      subTitle="Let's find you a workspace to create your first report"
      extra={[
        <Button type='primary' key='1' onClick={() => setNextStep('workspace')}>
          Create workspace
        </Button>,
        <Button key='2' onClick={() => setNextStep('invites')}><Badge color='blue' count={invites.length} offset={[14, -10]}>Join existing workspace</Badge></Button>
      ]}
    />
  )
}

export default function WorkspacePage () {
  const user = useSelector(state => state.user)
  const workspaceId = user?.workspaceId
  const [nextStep, setNextStep] = useState(null)
  return (
    <div className={styles.workspacePage}>
      <Header />
      {user
        ? (
          <div className={styles.body}>
            {workspaceId || nextStep ? <Workspace nextStep={nextStep} setNextStep={setNextStep} /> : <WelcomeScreen setNextStep={setNextStep} />}
          </div>
          )
        : null}
    </div>
  )
}
