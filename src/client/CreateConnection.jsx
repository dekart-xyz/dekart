import { useEffect, useState } from 'react'
import Button from 'antd/es/button'
import Result from 'antd/es/result'
import { useDispatch, useSelector } from 'react-redux'
import { ApiTwoTone, LeftOutlined, DatabaseOutlined } from '@ant-design/icons'
import { useHistory } from 'react-router-dom/cjs/react-router-dom'
import { ConnectionType, PlanType } from 'dekart-proto/dekart_pb'
import { DatasourceIcon } from './Datasource'
import { track } from './lib/tracking'
import { newConnection, newConnectionScreen } from './actions/connection'
import BigQueryConnectionTypeSelectorModal from './BigQueryConnectionTypeSelectorModal'
import OtherConnectorModal from './OtherConnectorModal'
import styles from './HomePage.module.css'

function ConnectionTypeSelectorBottom () {
  const dispatch = useDispatch()
  const planType = useSelector(state => state.user.stream.planType)
  const showCancel = useSelector(state => state.connection.list).length > 0
  const newScreen = useSelector(state => state.connection.screen)
  const history = useHistory()
  if (showCancel) {
    return (
      <div>
        <Button
          type='ghost'
          onClick={() => {
            track('ReturnFromConnectionSelector')
            if (newScreen) {
              dispatch(newConnectionScreen(false))
            } else {
              history.push('/')
            }
          }}
          icon={<LeftOutlined />}
        >Back
        </Button>
      </div>
    )
  }
  if (planType === PlanType.TYPE_PERSONAL) {
    return (
      <div className={styles.notSure}>
        <p>or</p>
        <Button ghost type='primary' href='https://dekart.xyz/self-hosted/?ref=ConnectionTypeSelector' target='_blank' onClick={() => track('GetStartedWithSelfHosting')}>Get Started with Self-Hosting</Button>
      </div>
    )
  }
  return null
}

// Render the connection options and route users to the selected connector setup.
function ConnectionTypeSelector () {
  const dispatch = useDispatch()
  const [bigqueryModalOpen, setBigqueryModalOpen] = useState(false)
  const [otherModalOpen, setOtherModalOpen] = useState(false)
  const isCloud = useSelector(state => state.env.isCloud)
  const connectionCards = [
    {
      key: 'bigquery',
      title: 'BigQuery',
      icon: <DatasourceIcon type={ConnectionType.CONNECTION_TYPE_BIGQUERY} />,
      handleClick: () => {
        track('ConnectionTypeSelectorBigQuery')
        setBigqueryModalOpen(true)
      }
    },
    {
      key: 'snowflake',
      title: 'Snowflake',
      icon: <DatasourceIcon type={ConnectionType.CONNECTION_TYPE_SNOWFLAKE} />,
      handleClick: () => {
        track('ConnectionTypeSelectorSnowflake')
        dispatch(newConnection(ConnectionType.CONNECTION_TYPE_SNOWFLAKE))
      }
    },
    {
      key: 'wherobots',
      title: 'Wherobots',
      icon: <DatasourceIcon type={ConnectionType.CONNECTION_TYPE_WHEROBOTS} />,
      handleClick: () => {
        track('ConnectionTypeSelectorWherobots')
        dispatch(newConnection(ConnectionType.CONNECTION_TYPE_WHEROBOTS))
      }
    }
  ]
  if (!isCloud) {
    connectionCards.push({
      key: 'postgres',
      title: 'Postgres',
      icon: <DatasourceIcon type={ConnectionType.CONNECTION_TYPE_POSTGRES} />,
      handleClick: () => {
        track('ConnectionTypeSelectorPostgres')
        dispatch(newConnection(ConnectionType.CONNECTION_TYPE_POSTGRES))
      }
    })
  }
  if (isCloud) {
    connectionCards.push({
      key: 'other',
      title: 'Other',
      subtitle: 'Postgres, Databricks, Redshift, more',
      icon: <DatabaseOutlined />,
      hideConnectCta: true,
      handleClick: () => {
        track('ConnectionTypeSelectorOther')
        setOtherModalOpen(true)
      }
    })
  }
  useEffect(() => {
    track('ConnectionTypeSelector')
  }, [])
  return (
    <>
      <div className={styles.connectionTypeSelector}>
        <BigQueryConnectionTypeSelectorModal open={bigqueryModalOpen} onClose={() => setBigqueryModalOpen(false)} />
        <OtherConnectorModal open={otherModalOpen} onClose={() => setOtherModalOpen(false)} />
        {connectionCards.map(card => (
          <button
            key={card.key}
            type='button'
            className={styles.connectionTypeCard}
            onClick={card.handleClick}
            disabled={Boolean(card.disabled)}
            title={card.disabled ? card.disabledTitle : ''}
          >
            <div className={styles.connectionTypeCardIcon}>{card.icon}</div>
            <div className={styles.connectionTypeCardTitle}>{card.title}</div>
            {card.subtitle ? <div className={styles.connectionTypeCardSubtitle}>{card.subtitle}</div> : null}
            {card.hideConnectCta
              ? null
              : (
                <div className={styles.connectionTypeCardCta}>
                  <span className={styles.connectionTypeCardCtaLabel}>Connect</span>
                </div>
                )}
          </button>
        ))}
      </div>
      <ConnectionTypeSelectorBottom />
    </>
  )
}

export default function CreateConnection () {
  return (
    <>
      <Result
        status='success'
        icon={<ApiTwoTone />}
        title='Connect your warehouse.'
        subTitle={<>We run queries there; nothing is copied to Dekart.</>}
      />
      <ConnectionTypeSelector />
    </>
  )
}
