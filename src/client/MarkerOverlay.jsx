import { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'

function MarkerOverlay ({ map, lng, lat }) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [overlay, setOverlay] = useState(null)

  // Find the overlay element
  useEffect(() => {
    const findOverlay = () => {
      const element = document.querySelector('#default-deckgl-overlay-wrapper')
      if (element) {
        setOverlay(element)
      } else {
        // Retry if overlay not found yet (Kepler might not be fully initialized)
        setTimeout(findOverlay, 100)
      }
    }
    findOverlay()
  }, [])

  // Update marker position when map changes
  useEffect(() => {
    if (!map || !overlay) return

    const mb = map.getMap()

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
  }, [map, lng, lat, overlay])

  console.log('overlay', overlay)

  if (!overlay) return null

  return ReactDOM.createPortal(
    <div
      style={{
        position: 'absolute',
        transform: `translate(${pos.x - 10}px, ${pos.y - 10}px)`,
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: 'red',
        pointerEvents: 'none'
      }}
    />,
    overlay
  )
}

export default MarkerOverlay
