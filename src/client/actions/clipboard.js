import { info, success } from './message'
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

export function copyErrorToClipboard (error) {
  return (dispatch) => {
    dispatch({ type: copyErrorToClipboard.name, error })
    copy(error)
    dispatch(info('Error copied to clipboard'))
  }
}
