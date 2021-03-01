import { GetEnvRequest, GetEnvResponse } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { unary } from '../lib/grpc'
import { error } from './message'

export function setEnv (variables) {
  return { type: setEnv.name, variables }
}

const typeToName = Object.keys(GetEnvResponse.Variable.Type).map(n => n.slice(5))

export function getEnv () {
  return async dispatch => {
    dispatch({ type: getEnv.name })
    const req = new GetEnvRequest()
    try {
      const { variablesList } = await unary(Dekart.GetEnv, req)
      const variables = variablesList.reduce((variables, v) => {
        variables[typeToName[v.type]] = v.value
        return variables
      }, {})
      dispatch(setEnv(variables))
    } catch (err) {
      dispatch(error(err))
    }
  }
}
