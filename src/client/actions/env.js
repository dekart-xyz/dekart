import { GetEnvRequest, GetEnvResponse } from 'dekart-proto/dekart_pb'
import { Dekart } from 'dekart-proto/dekart_pb_service'
import { grpcCall } from './grpc'

export function setEnv (variables) {
  return { type: setEnv.name, variables }
}

const typeToName = Object.keys(GetEnvResponse.Variable.Type).map(n => n.slice(5))

export function getEnv () {
  return async dispatch => {
    dispatch({ type: getEnv.name })
    const req = new GetEnvRequest()
    dispatch(grpcCall(Dekart.GetEnv, req, (res) => {
      const { variablesList } = res
      const variables = variablesList.reduce((variables, v) => {
        variables[typeToName[v.type]] = v.value
        return variables
      }, {})
      dispatch(setEnv(variables))
    }))
  }
}
