import { Header } from './Header'
import styles from './WorkspacePage.module.css'
import Card from 'antd/es/card'
import { AppstoreTwoTone, TeamOutlined, CreditCardOutlined } from '@ant-design/icons'
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
import { switchPlayground } from './actions/user'
import { useParams } from 'react-router-dom'
import { track } from './lib/tracking'
import Select from 'antd/es/select'

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
                <li>Ask a current member to send an invite to your email from the User Menu → Manage Workspace.</li>
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

const publicDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com', 'protonmail.com', 'zoho.com', 'yandex.com', 'mail.com', 'gmx.com', 'inbox.com', 'fastmail.com', 'tutanota.com', 'disroot.org', 'riseup.net', 'tuta.io', 'keemail.me', 'elude.in']
function suggestWorkspaceName (email) {
  // Validate the email format
  if (!email || !email.includes('@')) {
    return ''
  }

  // Split the email into user handler and domain
  const [, domain] = email.split('@')

  // Capitalize the first letter of a string for a nicer format
  const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1)

  // Check if the domain is public
  if (publicDomains.includes(domain)) {
    return 'Personal'
  }

  // If it's a private domain, assume it's a company
  const companyName = capitalize(domain.split('.')[0]) // Use the main part of the domain

  return companyName
}

function CreateWorkspaceForm () {
  const [disabled, setDisabled] = useState(false)
  const email = useSelector(state => state.user.stream?.email)
  const dispatch = useDispatch()
  const [form] = Form.useForm()
  useEffect(() => {
    form.setFieldsValue({ name: suggestWorkspaceName(email) })
  }, [email, form])

  return (
    <Card>
      <Form
        form={form}
        disabled={disabled}
        layout='vertical' onFinish={(values) => {
          track('CreateWorkspaceFormFinish')
          if (values.source) {
            track('CreateWorkspaceFormSource' + values.source)
          }
          setDisabled(true)
          dispatch(createWorkspace(values.name))
        }}
      >
        <Form.Item label='Workspace Name' name='name' rules={[{ required: true, message: 'Workspace name is required' }]}>
          <Input placeholder='Workspace name' />
        </Form.Item>
        <Form.Item label='Where did you first hear about Dekart?' extra='Optional, helps us improve' name='source' rules={[{ required: false }]}>
          <Select
            placeholder='Select a source'
            options={[
              { value: 'LinkedIn', label: 'LinkedIn' },
              { value: 'GoogleSearch', label: 'Google Search' },
              { value: 'GoogleAds', label: 'Google Ads' },
              { value: 'Reddit', label: 'Reddit' },
              { value: 'GitHub', label: 'GitHub' },
              { value: 'Other', label: 'Other' }
            ]}
          />
        </Form.Item>
        <Form.Item>
          <Button type='primary' htmlType='submit'>
            Create Workspace
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )
}

function UpdateWorkspaceForm () {
  const workspace = useSelector(state => state.workspace)
  const isAdmin = useSelector(state => state.user.isAdmin)
  const [disabled, setDisabled] = useState(!isAdmin)
  const dispatch = useDispatch()
  useEffect(() => {
    setDisabled(!isAdmin)
  }, [workspace, isAdmin])
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
  const userStream = useSelector(state => state.user.stream)
  const workspace = useSelector(state => state.workspace)
  const invites = workspace.invites
  if (userStream.workspaceId && userStream.workspaceId !== workspace.id) {
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
    title = 'Edit workspace'
  }

  return (
    <div className={styles.workspaceTab}>
      <div className={styles.workspaceTabHeader}>
        <div>
          <Title level={4}>{title}</Title>
        </div>
        {userStream.workspaceId && invites.length === 0 // user is in workspace and has no invites
          ? null
          : (
            <div><Radio.Group
              value={nextStep || 'workspace'}
              onChange={(e) => setNextStep(e.target.value)}
              options={[
                { label: userStream.workspaceId ? 'Edit' : 'Create', value: 'workspace' },
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
  if (isNaN(addedUsersCount) || planType > PlanType.TYPE_TEAM) {
    return ''
  }
  if (planType === PlanType.TYPE_TEAM) {
    return `(${addedUsersCount} of 20)`
  }
  return '(paid plan)'
}

export function Workspace ({ nextStep, setNextStep }) {
  const { inviteId } = useParams()
  const userStream = useSelector(state => state.user.stream)
  const addedUsersCount = useSelector(state => state.workspace.addedUsersCount)
  const workspaceId = userStream?.workspaceId
  const planType = userStream?.planType
  const [step, setStep] = useState(0)
  // move to the next step if workspaceId is set
  useEffect(() => {
    if (inviteId) {
      setStep(0)
    } else if (workspaceId) {
      if (planType > PlanType.TYPE_PERSONAL) {
        setStep(2)
      } else {
        setStep(1)
      }
    }
  }, [workspaceId, planType, setStep, inviteId])

  if (!userStream) {
    return null
  }
  return (
    <div className={styles.workspace}>
      {workspaceId
        ? (
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
                  title: 'Plan',
                  icon: <CreditCardOutlined />,
                  disabled: !userStream.workspaceId
                },
                {
                  title: 'Members',
                  icon: <TeamOutlined />,
                  disabled: userStream.planType <= PlanType.TYPE_PERSONAL,
                  subTitle: getMembersSubTitle(addedUsersCount, planType)
                }
              ]}
            />
          </div>

          )
        : null}

      {([<WorkspaceTab key={0} nextStep={nextStep} setNextStep={setNextStep} />, <SubscriptionTab key={1} />, <MembersTab key={2} />])[step]}
    </div>
  )
}

function WelcomeScreen ({ setNextStep }) {
  const workspace = useSelector(state => state.workspace)
  const invites = workspace.invites
  useEffect(() => {
    track('WelcomeScreen')
  }, [])
  return (
    <Result
      status='success'
      icon={<span className={styles.rocketIcon} />}
      title='Start Mapping in Seconds'
      subTitle='Set up a secure space to connect your data, and share live maps with your team.'
      extra={(
        <>
          <Button
            type='primary' key='1' onClick={() => {
              track('CreateWorkspace')
              setNextStep('workspace')
            }}
          >
            Create Workspace
          </Button>
          <Button key='2' onClick={() => setNextStep('invites')}><Badge color='blue' count={invites.length} offset={[14, -10]}>Join Existing Workspace</Badge></Button>
          <div className={styles.notSure}>
            <div className={styles.notSureItems}>
              <div>→ Connect Instantly to BigQuery and Snowflake</div>
              <div>→ Create Your First Map in 30 Seconds</div>
              <div>→ No credit card required.</div>
            </div>
            <Button ghost type='primary' href='https://dekart.xyz/docs/about/screencast/' target='_blank'>🎬 Watch a 40-Second Walkthrough</Button>
          </div>
        </>
      )}
    />
  )
}

export default function WorkspacePage () {
  const userStream = useSelector(state => state.user.stream)
  const workspaceId = userStream?.workspaceId
  const [nextStep, setNextStep] = useState(null)
  const isPlayground = useSelector(state => state.user.isPlayground)
  const dispatch = useDispatch()
  useEffect(() => {
    if (isPlayground) {
      dispatch(switchPlayground(false, '/workspace'))
    }
  }, [isPlayground, dispatch])
  if (isPlayground) {
    return null
  }
  return (
    <div className={styles.workspacePage}>
      <Header />
      {userStream
        ? (
          <div className={styles.body}>
            {workspaceId || nextStep ? <Workspace nextStep={nextStep} setNextStep={setNextStep} /> : <WelcomeScreen setNextStep={setNextStep} />}
          </div>
          )
        : null}
    </div>
  )
}
