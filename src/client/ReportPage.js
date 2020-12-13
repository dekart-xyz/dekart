import { useParams } from 'react-router-dom'

export default function ReportPage () {
  const { id } = useParams()
  return (
    <div>Report {id}</div>
  )
}
