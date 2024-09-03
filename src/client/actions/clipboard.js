import { success } from './message'
import copy from 'copy-to-clipboard'

export function copyUrlToClipboard (url, successMessage) {
  return (dispatch) => {
    dispatch({ type: copyUrlToClipboard.name, url })
    copy(url)
    if (successMessage) {
      dispatch(success(successMessage))
    }
  }
}
