export async function call (method, endpoint, body) {
  const headers = {}
  if (body) {
    headers['Content-Type'] = 'application/json; charset=utf-8'
  }
  const { REACT_APP_API_HOST } = process.env
  const url = `${REACT_APP_API_HOST}/api/v1${endpoint}`
  const res = await window.fetch(
    url,
    {
      method: method,
      body: body && JSON.stringify(body),
      headers
    }
  )
  if (!res.ok) {
    throw new Error(`Http Error ${res.status} ${method} ${url}`)
  }
  return res
}

// export const post = call.bind(null, 'POST')
export const get = call.bind(null, 'GET')
