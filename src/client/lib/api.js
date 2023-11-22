
export class ApiError extends Error {
  constructor (url, status, errorDetails) {
    super(`${status} GET ${url}`)
    this.status = status
    this.errorDetails = errorDetails
  }
}

export async function get (endpoint, token = null) {
  const headers = {}
  if (token) {
    headers.Authorization = `Bearer ${token.access_token}`
  }
  const { REACT_APP_API_HOST } = process.env
  const host = REACT_APP_API_HOST || ''

  const url = `${host}/api/v1${endpoint}`
  const res = await window.fetch(
    url,
    {
      method: 'GET',
      headers
    }
  )
  if (!res.ok) {
    const errorDetails = await res.text()
    throw new ApiError(url, res.status, errorDetails)
  }
  return res
}

export function authRedirect (state) {
  const { REACT_APP_API_HOST } = process.env
  const req = new URL('/api/v1/authenticate', REACT_APP_API_HOST || window.location.href)
  state.setAuthUrl(req.href)
  const stateBase64 = btoa(String.fromCharCode.apply(null, state.serializeBinary()))
  req.searchParams.set('state', stateBase64)
  window.location.href = req.href
}
