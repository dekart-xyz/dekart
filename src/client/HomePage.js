import { useEffect } from 'react'
import { useHistory } from 'react-router-dom'
import { post } from './lib/api'

async function redirectToReport (history) {
  const res = await post('/report')
  const { report } = await res.json()
  history.replace(`/reports/${report.id}`)
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
