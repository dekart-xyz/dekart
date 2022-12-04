import { error } from './message'
import { version } from '../../../package.json'
import semver from 'semver'

export function testVersion () {
  return async (dispatch) => {
    dispatch({ type: testVersion.name })
    try {
      const res = await window.fetch('https://api.github.com/repos/dekart-xyz/dekart/releases')
      if (!res.ok) {
        throw new Error(`Fetching releases: ${res.statusMessage}`)
      }
      const releases = await res.json()
      const validReleases = releases.filter(({ draft, prerelease }) => !draft && !prerelease).filter(({ tag_name: tagName }) => {
        if (tagName.match(/^v/)) {
          const releaseVersion = tagName.slice(1)
          if (semver.valid(releaseVersion) && semver.gt(releaseVersion, version)) {
            return true
          }
        }
        return false
      })
      if (validReleases.length) {
        dispatch(newRelease(releases[0]))
      }
    } catch (err) {
      dispatch(error(err))
    }
  }
}

export function newRelease (release) {
  return { type: newRelease.name, release }
}
