import { useState, useEffect, useRef } from 'react'
import { useDispatch } from 'react-redux'
import Tooltip from 'antd/es/tooltip'
import { AimOutlined } from '@ant-design/icons'
import MapControlButton from './MapControlButton'
import styles from './ShowMyLocationButton.module.css'
import classnames from 'classnames'
import { setLocation } from './actions/location'
import { setError } from './actions/message'

function useUserLocation (isActive) {
  const [isGeolocationSupported, setIsGeolocationSupported] = useState(true)
  const dispatch = useDispatch()
  const watchIdRef = useRef(null)

  // Check geolocation support on init
  useEffect(() => {
    if (!navigator.geolocation) {
      setIsGeolocationSupported(false)
    }
  }, [])

  useEffect(() => {
    if (!isActive) {
      // Stop tracking if button is inactive
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      return
    }

    const handleSuccess = (position) => {
      const { latitude, longitude, heading } = position.coords
      // Dispatch setLocation action on init or when location changes
      dispatch(setLocation({ latitude, longitude, heading }))
    }

    const handleError = (error) => {
      dispatch(setError(error))
    }

    // Start watching position
    watchIdRef.current = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000
      }
    )

    // Cleanup function to stop tracking on unmount or when inactive
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [isActive, dispatch])

  return { isGeolocationSupported }
}

export default function ShowMyLocationButton () {
  const [isActive, setIsActive] = useState(false)
  const { isGeolocationSupported } = useUserLocation(isActive)

  const handleClick = () => {
    setIsActive(!isActive)
  }

  return (
    <div className={styles.showMyLocation}>
      <Tooltip title={isActive ? 'Hide my location' : 'Show my location'} placement='left'>
        <MapControlButton
          active={isActive}
          disabled={!isGeolocationSupported}
          className={classnames(styles.showMyLocationButton, {
            [styles.active]: isActive,
            [styles.inactive]: !isActive
          })}
          onClick={handleClick}
        >
          <AimOutlined />
        </MapControlButton>
      </Tooltip>
    </div>
  )
}
