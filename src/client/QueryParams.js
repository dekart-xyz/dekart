import Form from 'antd/es/form'
import styles from './QueryParams.module.css'
import Input from 'antd/es/input'
import { MoreOutlined, DoubleRightOutlined } from '@ant-design/icons'
import Button from 'antd/es/button'
import { useDispatch, useSelector } from 'react-redux'
import Modal from 'antd/es/modal'
import { useEffect, useState } from 'react'
import { applyQueryParams, closeQueryParamSettings, openQueryParamSettings, queryParamChanged, setQueryParamValue, updateQueryParamsFromURL } from './actions/query'
import { useLocation } from 'react-router-dom'

function Label ({ children }) {
  return (
    <div className={styles.label}>
      {children}
    </div>
  )
}

function useCanEditReport () {
  const { edit } = useSelector(state => state.reportStatus)
  const { canWrite } = useSelector(state => state.report)
  return canWrite && edit
}

function SettingsButton ({ name }) {
  const editable = useCanEditReport()
  const dispatch = useDispatch()
  if (!editable) {
    return <Button type='text' size='small' className={styles.settingsButtonDisabled} icon={<MoreOutlined />} />
  }
  return (
    <Button type='text' size='small' onClick={() => dispatch(openQueryParamSettings(name))} className={styles.settingsButton} icon={<MoreOutlined />} />
  )
}

function TextParameter ({ queryParam }) {
  const value = useSelector(state => state.queryParams.values[queryParam.name] || queryParam.defaultValue)
  const dispatch = useDispatch()
  return (
    <Form.Item>
      <Input
        addonBefore={<Label>{queryParam.label || queryParam.name}</Label>}
        suffix={<SettingsButton name={queryParam.name} />}
        placeholder={queryParam.defaultValue}
        value={value}
        onChange={(e) => {
          dispatch(setQueryParamValue(queryParam.name, e.target.value.trim()))
        }}
      />
    </Form.Item>
  )
}

function ModalContent ({ form }) {
  return (
    <div>
      <Form form={form} layout='vertical'>
        <Form.Item label='Name' name='name'>
          <Input readOnly />
        </Form.Item>
        <Form.Item label='Label' name='label'>
          <Input />
        </Form.Item>
        <Form.Item label='Default Value' name='defaultValue'>
          <Input />
        </Form.Item>
      </Form>
    </div>
  )
}

function ModalFooter ({ onSave }) {
  const disabled = !useCanEditReport()

  return (
    <div>
      <Button type='primary' disabled={disabled} onClick={onSave}>Save</Button>
    </div>
  )
}

export default function QueryParams () {
  const dispatch = useDispatch()
  const [form] = Form.useForm()
  const location = useLocation()

  const [tempDisabled, setTempDisabled] = useState(false)

  const queryParamsList = useSelector(state => state.queryParams.list)
  const name = useSelector(state => state.queryParams.modal)
  const modalQueryParam = useSelector(state => state.queryParams.list.find(p => p.name === name))
  const { lastChanged, lastSaved } = useSelector(state => state.reportStatus)
  const numRunningQueries = useSelector(state => state.numRunningQueries)
  const { discoverable, canWrite } = useSelector(state => state.report)
  const isViewer = useSelector(state => state.user.isViewer)

  const reportChanged = lastChanged > lastSaved

  const applyButtonDisabled = (
    reportChanged || // report has unsaved changes
    numRunningQueries > 0 || // some queries are running
    ((!canWrite && !discoverable) || isViewer) || // user can't write or report is not discoverable
    tempDisabled // apply button was clicked
  )

  useEffect(() => {
    // reset tempDisabled when queries start running
    setTempDisabled(false)
  }, [numRunningQueries])

  useEffect(() => {
    // Handle URL parameter changes here
    dispatch(updateQueryParamsFromURL(location.search))
  }, [location, dispatch])

  // Set values in the modal form when it is opened
  useEffect(() => {
    if (!modalQueryParam) {
      return
    }
    const values = {
      name: modalQueryParam.name,
      label: modalQueryParam.label || modalQueryParam.name,
      defaultValue: modalQueryParam.defaultValue
    }
    form.setFieldsValue(values)
  }, [modalQueryParam, form])

  if (!queryParamsList.length) {
    return null
  }

  return (
    <div className={styles.queryParams}>
      <div className={styles.wrapper}>
        <Form
          layout='horizontal' onSubmitCapture={(e) => {
            e.preventDefault()
            setTempDisabled(true)
            dispatch(applyQueryParams())
          }}
        >
          {queryParamsList.map((p, index) => {
            return (
              <TextParameter key={index} queryParam={p} />
            )
          })}
          <Form.Item>
            <Button
              type='primary'
              ghost
              title='Apply query parameters'
              icon={<DoubleRightOutlined />}
              htmlType='submit'
              disabled={applyButtonDisabled}
            />
          </Form.Item>
        </Form>
        <Modal
          title='Query Parameter'
          open={name}
          onCancel={() => dispatch(closeQueryParamSettings(null))}
          footer={<ModalFooter onSave={() => {
            if (modalQueryParam) {
              const values = form.getFieldsValue()
              modalQueryParam.label = values.label
              modalQueryParam.defaultValue = values.defaultValue
              dispatch(queryParamChanged())
            }
          }}
                  />}
        ><ModalContent form={form} />
        </Modal>
      </div>
    </div>
  )
}
