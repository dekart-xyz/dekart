import { GetTokensRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { unary } from '../lib/grpc'
import { error } from './error'

export function setTokens (tokensList) {
  return { type: setTokens.name, tokensList }
}

export function getTokens () {
  return async dispatch => {
    dispatch({ type: getTokens.name })
    const req = new GetTokensRequest()
    try {
      const { tokensList } = await unary(Dekart.GetTokens, req)
      dispatch(setTokens(tokensList))
    } catch (err) {
      dispatch(error(err))
    }
  }
}
