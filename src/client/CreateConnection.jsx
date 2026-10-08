import { useEffect, useState } from 'react'
import Button from 'antd/es/button'
import Result from 'antd/es/result'
import { useDispatch, useSelector } from 'react-redux'
import { ApiTwoTone, ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons'
import { useHistory } from 'react-router-dom/cjs/react-router-dom'
import { ConnectionType, PlanType } from 'dekart-proto/dekart_pb'
import { DatasourceIcon } from './Datasource'
import { track } from './lib/tracking'
import { newConnection, newConnectionScreen } from './actions/connection'
import BigQueryConnectionTypeSelectorModal from './BigQueryConnectionTypeSelectorModal'
import OtherConnectorModal, { OTHER_CONNECTOR_OPTIONS } from './OtherConnectorModal'
import styles from './CreateConnection.module.css'

const moreWarehouseHint = ['databricks', 'redshift']
  .map(value => OTHER_CONNECTOR_OPTIONS.find(option => option.value === value)?.label.split('/')[0].trim())
  .filter(Boolean)
  .join(', ')

// Keep the return action above setup options so it is visible before scrolling.
function ConnectionTypeSelectorBack () {
  const dispatch = useDispatch()
  const showCancel = useSelector(state => state.connection.list).length > 0
  const newScreen = useSelector(state => state.connection.screen)
  const isCloud = useSelector(state => state.env.isCloud)
  const history = useHistory()
  const showBack = showCancel || (isCloud && newScreen)
  return showBack
    ? (
      <div className={styles.connectionSelectorBack}>
        <Button
          type='text'
          icon={<ArrowLeftOutlined />}
          onClick={() => {
            track('ReturnFromConnectionSelector')
            if (newScreen) {
              dispatch(newConnectionScreen(false))
            } else {
              history.push('/')
            }
          }}
        >Back
        </Button>
      </div>
      )
    : null
}

function ConnectionTypeSelectorBottom ({ onMoreWarehouses }) {
  const planType = useSelector(state => state.user.stream.planType)
  const showCancel = useSelector(state => state.connection.list).length > 0
  const newScreen = useSelector(state => state.connection.screen)
  const isCloud = useSelector(state => state.env.isCloud)
  const showBack = showCancel || newScreen
  // Cloud replaces the old Other card with a footer overflow entry point.
  if (isCloud) {
    return (
      <div className={styles.connectionSelectorFooter}>
        <Button
          id='dekart-more-warehouses'
          size='large'
          icon={<PlusOutlined />}
          onClick={onMoreWarehouses}
          className={styles.moreWarehousesButton}
          style={{ borderStyle: 'dashed' }}
        >
          <span className={styles.moreWarehousesPrimary}>More warehouses</span>
          <span className={styles.moreWarehousesHint}>{moreWarehouseHint} &amp; more</span>
        </Button>
        {planType === PlanType.TYPE_PERSONAL && !showBack
          ? (
            <div className={styles.notSure}>
              <p>or</p>
              <Button ghost type='primary' href='https://dekart.xyz/self-hosted/?ref=ConnectionTypeSelector' target='_blank' onClick={() => track('GetStartedWithSelfHosting')}>Get Started with Self-Hosting</Button>
            </div>
            )
          : null}
      </div>
    )
  }
  if (showCancel) {
    return null
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
    },
    {
      key: 'postgres',
      title: 'Postgres',
      icon: <DatasourceIcon type={ConnectionType.CONNECTION_TYPE_POSTGRES} />,
      handleClick: () => {
        track('ConnectionTypeSelectorPostgres')
        dispatch(newConnection(ConnectionType.CONNECTION_TYPE_POSTGRES))
      }
    }
  ]
  // Keep warehouse and HTTP cards in separate groups with the existing setup actions.
  const connectionGroups = [
    { title: 'Warehouses', cards: connectionCards },
    {
      title: 'APIs & files',
      cards: [{
        key: 'http',
        title: 'HTTP source',
        subtitle: 'API, S3, parquet over HTTPS',
        icon: <DatasourceIcon type={ConnectionType.CONNECTION_TYPE_HTTP} />,
        handleClick: () => dispatch(newConnection(ConnectionType.CONNECTION_TYPE_HTTP))
      }]
    }
  ]
  const openOtherConnectorModal = () => {
    track('ConnectionTypeSelectorOther')
    setOtherModalOpen(true)
  }
  useEffect(() => {
    track('ConnectionTypeSelector')
  }, [])
  return (
    <>
      <div>
        <BigQueryConnectionTypeSelectorModal open={bigqueryModalOpen} onClose={() => setBigqueryModalOpen(false)} />
        <OtherConnectorModal open={otherModalOpen} onClose={() => setOtherModalOpen(false)} />
        {connectionGroups.map(group => (
          <section key={group.title} className={styles.connectionGroup}>
            <h2>{group.title}</h2>
            <div className={styles.connectionGrid}>
              {group.cards.map(card => (
                <button
                  id={`dekart-connection-type-card-${card.key}`}
                  key={card.key}
                  type='button'
                  className={styles.connectionTypeCard}
                  onClick={card.handleClick}
                >
                  <div className={styles.connectionTypeCardHeader}>
                    <div className={styles.connectionTypeCardIcon}>{card.icon}</div>
                    <div className={styles.connectionTypeCardTitle}>{card.title}</div>
                  </div>
                  <div className={styles.connectionTypeCardSubtitle}>{card.subtitle}</div>
                  <div className={styles.connectionTypeCardCta}>
                    <span className={styles.connectionTypeCardCtaLabel}>Connect</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <ConnectionTypeSelectorBottom onMoreWarehouses={openOtherConnectorModal} />
    </>
  )
}

export default function CreateConnection () {
  return (
    <div className={styles.createConnection}>
      <ConnectionTypeSelectorBack />
      <Result
        className={styles.intro}
        status='success'
        icon={<ApiTwoTone />}
        title='Connect your data'
      />
      <ConnectionTypeSelector />
    </div>
  )
}
