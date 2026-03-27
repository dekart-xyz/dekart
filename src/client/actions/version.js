import { version as packageVersion } from '../../../package.json'

const defaultVersionCheckURL = 'https://cloud.dekart.xyz/api/v1/version'

function getVersionCheckURL (variables = {}) {
  return (variables.VERSION_CHECK_URL || defaultVersionCheckURL).trim()
}

function getCurrentVersion (variables = {}) {
  const forced = (variables.VERSION_CHECK_FORCE_CURRENT_VERSION || '').trim()
  if (forced) {
    return forced
  }
  return packageVersion || '0.0.0'
}

export function testVersion (variables) {
  return async (dispatch) => {
    dispatch({ type: testVersion.name })
    try {
      const url = new URL(getVersionCheckURL(variables))
      url.searchParams.set('app_domain', window.location.host || '')
      url.searchParams.set('current_version', getCurrentVersion(variables))

      const res = await window.fetch(url.toString())
      if (!res.ok || res.status === 204) {
        return
      }

      const release = await res.json()
      if (release && release.tag_name) {
        dispatch(newRelease(release))
      }
    } catch (err) {
      // Silent failure: version-check is best effort only.
    }
  }
}

export function newRelease (release) {
  return { type: newRelease.name, release }
}
