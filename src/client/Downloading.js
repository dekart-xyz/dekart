import prettyBites from 'pretty-bytes'
import { useDispatch, useSelector } from 'react-redux'
import message from 'antd/es/message'
import { useEffect, useState } from 'react'
import Button from 'antd/es/button'
import styles from './Downloading.module.css'
import Modal from 'antd/es/modal'
import { addDatasetToMap, cancelDownloading, processDownloadError } from './actions/dataset'

function CancelDownloadingButton () {
  const dispatch = useDispatch()
  return <Button className={styles.cancel} onClick={() => dispatch(cancelDownloading())} size='small'>Cancel</Button>
}

function DownloadingMessage () {
  const downloading = useSelector(state => state.dataset.downloading)
  const files = useSelector(state => state.files)
  const hash = useSelector(state => state.queryParams.hash)
  const queryJobs = useSelector(state => state.queryJobs)
  const size = downloading.reduce((size, { dataset: { queryId, fileId } }) => {
    if (queryId) {
      const job = queryJobs.find(j => j.queryId === queryId && j.queryParamsHash === hash)
      return size + job.resultSize
    }
    if (fileId) {
      const file = files.find(f => f.id === fileId)
      return size + file.size
    }
    return size
  }, 0)
  const loaded = downloading.reduce((l, { loaded }) => l + loaded, 0)
  return (
    <span>Downloading Map Data {(() => {
      if (size > 0) {
        return `(${prettyBites(loaded)} of ${prettyBites(size)})`
      } else if (loaded > 0) {
        return `(${prettyBites(loaded)})`
      }
      return ''
    })()}  <CancelDownloadingButton />
    </span>
  )
}

let closeMessage = null
export default function Downloading () {
  const [maxDatasetSize, setMaxDatasetSize] = useState(150 * 1024 * 1024)
  const downloading = useSelector(state => state.dataset.downloading)
  const downloaded = downloading.filter(d => d.res && !d.addingToMap)
  const dispatch = useDispatch()
  const pendingConfirmationList = downloading.filter(d => d.res && d.loaded > maxDatasetSize && !d.addingToMap)
  const [pendingConfirmation, setPendingConfirmation] = useState(null)
  const [msg, messageHolder] = message.useMessage()
  const [mdl, modalHolder] = Modal.useModal()

  // show downloading message when no pending confirmation modals
  const showDownloading = downloading.length > 0 && !pendingConfirmation

  // set pending confirmation when not set
  // this step is needed to prevent multiple confirmation modals
  useEffect(() => {
    if (!pendingConfirmation) {
      const pending = pendingConfirmationList[0]
      if (pending) {
        setPendingConfirmation(pending)
      }
    }
  }, [pendingConfirmation, setPendingConfirmation, pendingConfirmationList])

  // show downloading message
  useEffect(() => {
    if (showDownloading) {
      closeMessage = msg.loading({
        content: <DownloadingMessage />,
        duration: 0
      })
    } else if (closeMessage) {
      closeMessage()
      closeMessage = null
    }
  }, [showDownloading, msg])

  // auto add dataset to map when no confirmation needed
  useEffect(() => {
    if (downloaded.length > 0 && pendingConfirmationList.length === 0) {
      const { dataset, prevDatasetsList, res, extension } = downloaded[0]
      dispatch(addDatasetToMap(dataset, prevDatasetsList, res, extension))
    }
  }, [downloaded, pendingConfirmationList, dispatch])

  // confirm loading large dataset
  useEffect(() => {
    if (pendingConfirmation) {
      const { dataset, res, extension, loaded, prevDatasetsList, label } = pendingConfirmation
      mdl.confirm({
        title: `${label} result is larger than ${prettyBites(maxDatasetSize)}`,
        content: `Dataset size is ${prettyBites(loaded)}. Loading this dataset may slow down your browser. Continue?`,
        onOk: () => {
          dispatch(addDatasetToMap(dataset, prevDatasetsList, res, extension))
          setMaxDatasetSize(Math.round(loaded * 1.2)) // do not ask for same size again
          setPendingConfirmation(null)
        },
        onCancel: () => {
          dispatch(processDownloadError(new Error(`Downloading ${label} cancelled by user`), dataset, label))
          setPendingConfirmation(null)
        }
      })
    }
  }, [pendingConfirmation, mdl, dispatch, setMaxDatasetSize, maxDatasetSize])

  return <>{messageHolder}{modalHolder}</>
}
