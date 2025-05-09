import AceEditor from 'react-ace'
import { AutoSizer } from 'react-virtualized'
import styles from './Readme.module.css'
import Button from 'antd/es/button'
import Markdown from 'react-markdown'
import { useDispatch, useSelector } from 'react-redux'
import { setPreview, setReadmeValue } from './actions/readme'
export default function Readme ({ readme }) {
  const { canWrite } = useSelector(state => state.report)
  const { edit } = useSelector(state => state.reportStatus)
  const showPreview = useSelector(state => state.readme.showPreview)
  const markdown = useSelector(state => state.readme.markdown)
  const dispatch = useDispatch()

  return (
    <div className={styles.readme}>
      <div className={styles.previewButton}>
        <Button
          size='small'
          onClick={() => dispatch(setPreview(!showPreview))}
        >{showPreview ? (canWrite && edit ? 'Edit' : 'Markdown') : (canWrite && edit ? 'Preview' : 'View')}
        </Button>
      </div>
      <AutoSizer>
        {({ height, width }) => (
          showPreview
            ? (
              <div
                className={styles.preview} style={
                {
                  width: `${width}px`,
                  height: `${height}px`
                }
            }
              ><Markdown>{markdown}</Markdown>
              </div>
              )
            : <AceEditor
                mode='markdown'
                width={`${width}px`}
                height={`${height}px`}
                theme='sqlserver'
                name='AceEditor'
                keyboardHandler='vscode'
                onChange={v => dispatch(setReadmeValue(v))}
                value={markdown}
                readOnly={!canWrite}
                editorProps={{ $blockScrolling: true }}
                setOptions={{
                  enableBasicAutocompletion: true,
                  enableLiveAutocompletion: true,
                  enableSnippets: true,
                  highlightActiveLine: canWrite,
                  highlightGutterLine: canWrite
                }}
              />
        )}
      </AutoSizer>
    </div>
  )
}
