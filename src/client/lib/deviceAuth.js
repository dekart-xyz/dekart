export const pendingDeviceAuthorizationKey = 'pendingDeviceAuthorization'

// getDeviceAuthorizePath builds canonical frontend URL for a device authorization session.
export function getDeviceAuthorizePath (deviceId) {
  const params = new URLSearchParams({ device_id: deviceId })
  return `/device/authorize?${params.toString()}`
}
