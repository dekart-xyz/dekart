import prettyBites from 'pretty-bytes'
import { useSelector } from 'react-redux'
import message from 'antd/es/message'
import { useEffect } from 'react'

function DownloadingMessage () {
  const downloadingDatasets = useSelector(state => state.dataset.downloading)
  const files = useSelector(state => state.files)
  const queries = useSelector(state => state.queries)
  const size = downloadingDatasets.reduce((size, { queryId, fileId }) => {
    if (queryId) {
      const query = queries.find(q => q.id === queryId)
      return size + query.resultSize
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
  return (<span>Downloading Map Data...</span>)
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
