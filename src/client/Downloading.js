import prettyBites from 'pretty-bytes'
import { useDispatch, useSelector } from 'react-redux'
import message from 'antd/es/message'
import { useEffect } from 'react'
import Button from 'antd/es/button'
import styles from './Downloading.module.css'
import { cancelDownloading } from './actions/message'

function DownloadingMessage () {
  const downloadingDatasets = useSelector(state => state.dataset.downloading)
  const dispatch = useDispatch()
  const files = useSelector(state => state.files)
  const hash = useSelector(state => state.queryParams.hash)
  const queryJobs = useSelector(state => state.queryJobs)
  const size = downloadingDatasets.reduce((size, { queryId, fileId }) => {
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
  if (size) {
    return (<span>Downloading Map Data ({prettyBites(size)})</span>)
  }
  return (<span>Downloading Map Data <Button className={styles.cancel} onClick={() => dispatch(cancelDownloading())} size='small'>Cancel</Button></span>)
}

let hideDownloading = null
export default function Downloading () {
  const downloadingDatasets = useSelector(state => state.dataset.downloading)
  const show = downloadingDatasets.length > 0
  const [api, contextHolder] = message.useMessage()
  useEffect(() => {
    if (show && !hideDownloading) {
      hideDownloading = api.loading({
        content: <DownloadingMessage />,
        duration: 0
      })
    }
    if (!show && hideDownloading) {
      hideDownloading()
      hideDownloading = null
    }
    return () => {
      if (hideDownloading) {
        hideDownloading()
        hideDownloading = null
      }
    }
  }, [show, api])
  return contextHolder
}
