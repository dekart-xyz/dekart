import { useSelector } from 'react-redux'

export default function DataDocumentationLink ({ className }) {
  const UX_DATA_DOCUMENTATION = useSelector(state => state.env.variables.UX_DATA_DOCUMENTATION)
  if (UX_DATA_DOCUMENTATION) {
    return (
      <div className={className}>
        <a
          target='_blank'
          rel='noreferrer'
          href={UX_DATA_DOCUMENTATION}
        >
          Which data can I query?
        </a>
      </div>
    )
  }
  return null
}
