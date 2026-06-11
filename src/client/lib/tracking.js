// https://plausible.io/docs/custom-event-goals
import { LOCAL_STORAGE_KEY } from './constants'

window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments) }
const TRACKING_TIMEOUT_MS = 1000

// Store reference to Redux store - will be set by setTrackingStore
let reduxStore = null
let trackEventToServerFn = null

export function setTrackingStore (store) {
  reduxStore = store
}

// Set the trackEventToServer function to avoid circular dependency
export function setTrackEventToServer (fn) {
  trackEventToServerFn = fn
}

export async function track (event, props = {}) {
  let trackingProps = props

  try {
    trackingProps = await getTrackingProps(props)
  } catch (error) {
    console.warn('Tracking error, falling back to basic tracking:', error)
  }

  trackPlausible(event, trackingProps)
  await awaitInternalTracking(event, trackingProps)
}

async function getTrackingProps (props) {
  const localStorageValue = window.localStorage.getItem(LOCAL_STORAGE_KEY)
  let loginHint = null
  let shortEmailIdValue = null

  if (localStorageValue) {
    try {
      const parsed = JSON.parse(localStorageValue)
      loginHint = parsed.loginHint
      if (loginHint) {
        shortEmailIdValue = await shortEmailId(loginHint)
      }
    } catch (parseError) {
      console.warn('Failed to parse localStorage:', parseError)
    }
  }

  return {
    ...props,
    ...(shortEmailIdValue && { seid: shortEmailIdValue })
  }
}

function trackPlausible (event, props) {
  if (!window.plausible) {
    return
  }
  setTimeout(() => {
    try {
      window.plausible(event, { props })
    } catch (error) {
      console.warn('Plausible tracking failed:', error)
    }
  }, 0)
}

async function awaitInternalTracking (event, props) {
  if (!reduxStore || !trackEventToServerFn) {
    return
  }

  const tracking = reduxStore.dispatch(trackEventToServerFn(event, props))
  const timeout = new Promise(resolve => setTimeout(resolve, TRACKING_TIMEOUT_MS))

  try {
    await Promise.race([tracking, timeout])
  } catch (error) {
    console.warn('Internal tracking failed:', error)
  }
}

// in SQL:select Upper(TO_HEX(SUBSTR(SHA256('user@example.com'), 1, 8)))
export async function shortEmailId (email) {
  const input = String(email ?? '')
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const first8 = new Uint8Array(digest).slice(0, 8)
  let hex = ''
  for (let i = 0; i < first8.length; i++) {
    hex += first8[i].toString(16).padStart(2, '0')
  }
  return hex.toUpperCase() // match BigQuery TO_HEX
}
