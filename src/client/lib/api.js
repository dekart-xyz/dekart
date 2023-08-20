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
    throw new Error(`Http Error ${res.status} GET ${url}`)
  }
  return res
}
