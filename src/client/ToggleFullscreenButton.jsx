import { useDispatch, useSelector } from 'react-redux'
import Tooltip from 'antd/es/tooltip'
import { VerticalAlignBottomOutlined } from '@ant-design/icons'
import MapControlButton from './MapControlButton'
import { toggleReportFullscreen } from './actions/report'
import { track } from './lib/tracking'
import styles from './ToggleFullscreenButton.module.css'

export default function ToggleFullscreenButton () {
  const dispatch = useDispatch()
  const report = useSelector(state => state.report)
  const hideFullscreen = !report.allowExport && !report.canWrite && !report.readme

  return (
    <div className={styles.toggleFullscreen}>
      <Tooltip title='Toggle fullscreen' placement='left'>
        <MapControlButton
          active
          disabled={hideFullscreen}
          className={styles.toggleFullscreenButton}
          onClick={() => {
            track('ToggleFullscreen')
            dispatch(toggleReportFullscreen())
          }}
        >
          <VerticalAlignBottomOutlined />
        </MapControlButton>
      </Tooltip>
    </div>
  )
}

