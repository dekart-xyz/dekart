import Modal from 'antd/es/modal'
import Button from 'antd/es/button'
import styles from './DatasetSettingsModal.module.css'
import Input from 'antd/es/input'
import { useDispatch, useSelector } from 'react-redux'
import { useState, useEffect } from 'react'
import getDatasetName from './lib/getDatasetName'
import { removeDataset, updateDataset } from './actions'

function ModalFooter ({ disabled, setDisabled, setSaving, datasetId, name, setSettingDatasetId }) {
  const dispatch = useDispatch()

  const numDatasets = useSelector(state => state.datasets.length)

  return (
    <div className={styles.modalFooter}>
      <Button
        disabled={disabled}
        onClick={() => {
          setDisabled(true)
          dispatch(updateDataset(datasetId, name))
          setSaving(true)
        }}
      >
        Save
      </Button>
      <Button
        danger
        onClick={() => {
          setSettingDatasetId(null)
          Modal.confirm({
            title: 'Remove dataset from report?',
            okText: 'Yes',
            okType: 'danger',
            cancelText: 'No',
            onOk: () => dispatch(removeDataset(datasetId))
          })
        }}
        disabled={numDatasets < 2 || disabled}
      >
        Delete Dataset
      </Button>
    </div>

  )
}

export default function DatasetSettingsModal ({ settingDatasetId, setSettingDatasetId }) {
  const dataset = useSelector(state => state.datasets.find(d => d.id === settingDatasetId))
  const queries = useSelector(state => state.queries)
  const files = useSelector(state => state.files)

  const [name, setName] = useState(dataset?.name)
  const [disabled, setDisabled] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDisabled(false)
  }, [dataset?.id])

  useEffect(() => {
    setName(dataset?.name)
  }, [dataset?.name])

  useEffect(() => {
    if (saving && name === dataset?.name) {
      setSaving(false)
      setSettingDatasetId(null)
    }
  }, [saving, dataset?.name, name])

  if (!dataset) {
    return null
  }
  return (
    <Modal
      open
      title='Dataset Settings'
      onCancel={() => setSettingDatasetId(null)}
      footer={
        <ModalFooter
          disabled={disabled}
          setDisabled={setDisabled}
          setSaving={setSaving}
          datasetId={dataset.id}
          name={name}
          setSettingDatasetId={setSettingDatasetId}
        />
            }
    >
      <div className={styles.modalBody}>
        <Input
          placeholder={getDatasetName(dataset, queries, files)}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={disabled}
        />
      </div>
    </Modal>

  )
}
