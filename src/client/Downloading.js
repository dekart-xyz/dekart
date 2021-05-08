import prettyBites from 'pretty-bytes'
import { useSelector } from 'react-redux'
import message from 'antd/es/message'
import { useEffect } from 'react'

function DownloadingMessage () {
  const downloadingQueryResults = useSelector(state => state.downloadingQueryResults)
  const size = downloadingQueryResults.reduce((size, { resultSize }) => size + resultSize, 0)
  if (size) {
    return (<span>Downloading Map Data ({prettyBites(size)})</span>)
  }
  return (<span>Downloading Map Data...</span>)
}

let hideDownloading = null
export default function Downloading () {
  const downloadingQueryResults = useSelector(state => state.downloadingQueryResults)
  const show = downloadingQueryResults.length > 0
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
