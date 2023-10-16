import Modal from 'antd/es/modal'
import Button from 'antd/es/button'
import styles from './DatasetSettingsModal.module.css'
import Input from 'antd/es/input'
import { useDispatch, useSelector } from 'react-redux'
import { useState, useEffect } from 'react'
import getDatasetName from './lib/getDatasetName'
import { closeDatasetSettingsModal, removeDataset, updateDatasetName } from './actions/dataset'

function ModalFooter ({ saving, setSaving, name, datasetId }) {
  const dispatch = useDispatch()
  const numDatasets = useSelector(state => state.datasets.length)

  return (
    <div className={styles.modalFooter}>
      <Button
        disabled={saving}
        onClick={() => {
          setSaving(true)
          dispatch(updateDatasetName(datasetId, name))
        }}
      >
        Save
      </Button>
      <Button
        danger
        onClick={() => {
          dispatch(closeDatasetSettingsModal())
          Modal.confirm({
            title: 'Remove dataset from report?',
            okText: 'Yes',
            okType: 'danger',
            cancelText: 'No',
            onOk: () => dispatch(removeDataset(datasetId))
          })
        }}
        disabled={numDatasets < 2 || saving}
      >
        Delete Dataset
      </Button>
    </div>

  )
}

export default function DatasetSettingsModal () {
  const datasetId = useSelector(state => state.datasetSettings.datasetId)
  const dataset = useSelector(state => state.datasets.find(d => d.id === datasetId))
  const queries = useSelector(state => state.queries)
  const files = useSelector(state => state.files)
  const visible = useSelector(state => state.datasetSettings.visible)

  const dispatch = useDispatch()

  const [name, setName] = useState(dataset?.name)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(dataset?.name)
  }, [dataset?.name])

  useEffect(() => {
    if (saving && name === dataset?.name) {
      setSaving(false)
      dispatch(closeDatasetSettingsModal())
    }
  }, [saving, dataset?.name, name, dispatch])

  if (!visible) {
    return null
  }
  return (
    <Modal
      open
      title='Dataset Settings'
      onCancel={() => dispatch(closeDatasetSettingsModal())}
      footer={
        <ModalFooter
          saving={saving}
          setSaving={setSaving}
          datasetId={dataset.id}
          name={name}
        />
            }
    >
      <div className={styles.modalBody}>
        <Input
          placeholder={getDatasetName(dataset, queries, files)}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={saving}
        />
      </div>
    </Modal>

  )
}
