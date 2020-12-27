import { useEffect } from 'react'
import { useHistory } from 'react-router-dom'
import { createReport } from './lib/grpc'

async function redirectToReport (history) {
  const { report } = await createReport()
  history.replace(`/reports/${report.id}/edit`)
}

export default function HomePage () {
  const history = useHistory()
  useEffect(() => {
    redirectToReport(history).catch(console.error)
  })
  return (
    <div>HomePage</div>
  )
}
