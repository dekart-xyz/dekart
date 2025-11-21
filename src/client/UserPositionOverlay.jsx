import { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import { useSelector } from 'react-redux'
import styles from './UserPositionOverlay.module.css'

function UserPositionOverlay ({ map }) {
  const location = useSelector(state => state.location)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [overlay, setOverlay] = useState(null)

  // Find the overlay element
  useEffect(() => {
    const element = document.querySelector('#default-deckgl-overlay-wrapper')
    if (element) {
      setOverlay(element)
    }
  }, [])

  // Update marker position when map changes
  useEffect(() => {
    if (!map || !overlay || !location) {
      return
    }

    const mb = map.getMap()
    const lng = location.longitude
    const lat = location.latitude

    const update = () => {
      const p = mb.project([lng, lat])
      setPos({ x: p.x, y: p.y })
    }

    mb.on('move', update)
    mb.on('zoom', update)
    mb.on('pitch', update)
    mb.on('rotate', update)
    update()

    return () => {
      mb.off('move', update)
      mb.off('zoom', update)
      mb.off('pitch', update)
      mb.off('rotate', update)
    }
  }, [map, location, overlay])

  if (!overlay || !location) return null

  return ReactDOM.createPortal(
    <div
      className={styles.marker}
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`
      }}
    >
      <div className={styles.pulse} />
      <div className={styles.pulse2} />
      <div className={styles.dot} />
    </div>,
    overlay
  )
}

export default UserPositionOverlay
