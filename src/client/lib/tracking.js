// https://plausible.io/docs/custom-event-goals
import { LOCAL_STORAGE_KEY } from './constants'

window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments) }

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

export function track (event, props = {}) {
  if (window.plausible) {
    setTimeout(async () => {
      try {
        // read loginHint here
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

        const trackingProps = {
          ...props,
          ...(shortEmailIdValue && { seid: shortEmailIdValue })
        }
        window.plausible(event, { props: trackingProps })

        // For Dekart Cloud, also send to server
        if (reduxStore && trackEventToServerFn) {
          reduxStore.dispatch(trackEventToServerFn(event, trackingProps))
        }
      } catch (error) {
        // Fallback: track with original props even if loginHint processing fails
        console.warn('Tracking error, falling back to basic tracking:', error)
        window.plausible(event, { props })
      }
    }, 0)
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
