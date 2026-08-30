import { QueryParam } from 'dekart-proto/dekart_pb'
import { md5 } from 'js-md5'

function queryParamValue (param, values) {
  return values[param.name] === undefined
    ? param.defaultValue
    : values[param.name]
}

export function getQueryParamsValuesFromSearch (search) {
  const values = {}
  const params = new URLSearchParams(search)
  params.forEach((value, key) => {
    if (key.startsWith('qp_')) {
      values[key.substring(3)] = value
    }
  })
  return values
}

export function normalizeQueryParamsValues (queryParams, valuesIn) {
  return Object.fromEntries(queryParams.map(param => [
    param.name,
    queryParamValue(param, valuesIn)
  ]))
}

export function getQueryParamsState (queryParams, search) {
  const values = normalizeQueryParamsValues(queryParams, getQueryParamsValuesFromSearch(search))
  return {
    values,
    url: getQueryParamsString(queryParams, values),
    hash: getQueryParamsHash(queryParams, values)
  }
}

function queryParamSchemasEqual (current, next) {
  return current.length === next.length && current.every((param, index) => {
    const nextParam = next[index]
    return param.name === nextParam.name &&
      param.label === nextParam.label &&
      param.defaultValue === nextParam.defaultValue &&
      param.type === nextParam.type
  })
}

// Report streams can update while a parameter input contains an unapplied draft.
// Reinitialize only when the schema or URL changed; otherwise retain that draft.
export function reconcileQueryParamsState (current, queryParams, search) {
  const fromURL = getQueryParamsState(queryParams, search)
  if (queryParamSchemasEqual(current.list, queryParams) && current.url === fromURL.url) {
    return {
      values: current.values,
      url: current.url,
      hash: current.hash
    }
  }
  return fromURL
}

export function getQueryParamsString (queryParams, values) {
  const params = new URLSearchParams()
  queryParams.forEach(param => {
    params.set(
      'qp_' + param.name,
      queryParamValue(param, values)
    )
  })
  return params.toString()
}

export function getQueryParamsHash (queryParams, values) {
  return md5(getQueryParamsString(queryParams, values))
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
