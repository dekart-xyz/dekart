import { Header } from './Header'
import styles from './WorkspacePage.module.css'
import Card from 'antd/es/card'
import { AppstoreTwoTone, TeamOutlined, CreditCardOutlined, RocketTwoTone } from '@ant-design/icons'
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

export function Workspace ({ nextStep, setNextStep }) {
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
              disabled: user.planType !== PlanType.TYPE_TEAM
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
      icon={<RocketTwoTone />}
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
