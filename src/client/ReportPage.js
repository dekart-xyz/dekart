import { useParams } from 'react-router-dom'
import AceEditor from 'react-ace'

import 'ace-builds/src-noconflict/mode-sql'
import 'ace-builds/src-noconflict/theme-textmate'
import 'ace-builds/src-noconflict/ext-language_tools'
import 'ace-builds/webpack-resolver'

export default function ReportPage () {
  const { id } = useParams()
  return (
    <div>
      <div>Report {id}</div>
      <AceEditor
        mode='sql'
        theme='textmate'
        // onChange={onChange}
        name='UNIQUE_ID_OF_DIV'
        editorProps={{ $blockScrolling: true }}
        setOptions={{
          enableBasicAutocompletion: true,
          enableLiveAutocompletion: true,
          enableSnippets: true
        }}
      />
    </div>
  )
}
