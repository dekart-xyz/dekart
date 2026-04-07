export const pendingDeviceAuthSessionKey = 'dekart-pending-device-id'

// getDeviceAuthorizePath builds canonical frontend URL for a device authorization session.
export function getDeviceAuthorizePath (deviceId) {
  const params = new URLSearchParams({ device_id: deviceId })
  return `/device/authorize?${params.toString()}`
}

// rememberPendingDeviceAuthorization stores a device id to resume auth after workspace onboarding.
export function rememberPendingDeviceAuthorization (deviceId) {
  window.sessionStorage.setItem(pendingDeviceAuthSessionKey, deviceId)
}

// consumePendingDeviceAuthorization returns and clears pending device id, if present.
export function consumePendingDeviceAuthorization () {
  const pendingDeviceId = window.sessionStorage.getItem(pendingDeviceAuthSessionKey) || ''
  window.sessionStorage.removeItem(pendingDeviceAuthSessionKey)
  return pendingDeviceId
}

// consumePendingAuthorizePath resolves a stored pending device id into frontend authorize URL.
export function consumePendingAuthorizePath () {
  const pendingDeviceId = consumePendingDeviceAuthorization()
  if (!pendingDeviceId) {
    return ''
  }
  return getDeviceAuthorizePath(pendingDeviceId)
}
