import { QueryParam } from 'dekart-proto/dekart_pb'

export function getQueryParamsString (queryParams, values) {
  const params = new URLSearchParams()
  queryParams.forEach(param => {
    params.set(
      'qp_' + param.name,
      values[param.name] === undefined ? param.defaultValue : values[param.name]
    )
  })
  return params.toString()
}

export function getQueryParamsObjArr (queryParams) {
  return queryParams.map(p => {
    const param = new QueryParam()
    param.setName(p.name)
    param.setLabel(p.label)
    param.setDefaultValue(p.defaultValue)
    param.setType(p.type)
    return param
  })
}
