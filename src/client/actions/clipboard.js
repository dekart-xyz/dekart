import { success } from './message'
import copy from 'copy-to-clipboard'

export function copyUrlToClipboard (url) {
  return (dispatch) => {
    dispatch({ type: copyUrlToClipboard.name, url })
    copy(url)
    success('Report URL copied to clipboard')
  }
}
