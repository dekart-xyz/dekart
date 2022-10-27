import Button from 'antd/es/button'
import styles from './Dataset.module.css'
import { useDispatch, useSelector } from 'react-redux'
import Query from './Query'
import { createQuery, createFile } from './actions'
import File from './File'

function DatasetSelector ({ dataset }) {
  const dispatch = useDispatch()
  return (
    <div className={styles.datasetSelector}>
      <div className={styles.selector}>
        <div className={styles.selectorButtons}>
          <Button block onClick={() => dispatch(createQuery(dataset.id))}>Athena query</Button>
          <Button block onClick={() => dispatch(createFile(dataset.id))}>Upload file</Button>
        </div>
      </div>
      <div className={styles.status}>Select data source</div>
    </div>
  )
}

export default function Dataset ({ dataset }) {
  let query = null
  let file = null
  const queries = useSelector(state => state.queries)
  const files = useSelector(state => state.files)
  if (dataset.queryId) {
    query = queries.find(q => q.id === dataset.queryId)
  } else if (dataset.fileId) {
    file = files.find(f => f.id === dataset.fileId)
  }
  return (
    <>
      {query ? <Query query={query} /> : file ? <File file={file} /> : <DatasetSelector dataset={dataset} />}
    </>
  )
}
