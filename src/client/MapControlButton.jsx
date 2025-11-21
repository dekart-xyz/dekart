import { MapControlButton as KeplerMapControlButton } from '@kepler.gl/components/dist/common/styled-components'
import styles from './MapControlButton.module.css'
import classnames from 'classnames'

export default function MapControlButton ({ className, ...props }) {
  return (
    <KeplerMapControlButton
      className={classnames(styles.mapControlButton, className)}
      {...props}
    />
  )
}
