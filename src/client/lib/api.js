import { UNKNOWN_EMAIL } from './constants'
import { getReportIdFromUrl } from './getReportIdFromUrl'

export class ApiError extends Error {
  constructor (url, status, errorDetails, method = 'GET') {
    super(`${status} ${method} ${url}`)
    this.status = status
    this.errorDetails = errorDetails
  }
}

export class AbortError extends Error {
  constructor (message) {
    super(message)
    this.name = 'AbortError'
  }
}

// post sends authenticated JSON payloads to Dekart HTTP API and returns parsed JSON body.
export async function post (endpoint, body, token = null) {
  return requestJSON('POST', endpoint, token, body)
}

// del sends authenticated DELETE requests to Dekart HTTP API and returns parsed JSON body when present.
export async function del (endpoint, token = null) {
  return requestJSON('DELETE', endpoint, token)
}

// put sends authenticated PUT requests to Dekart HTTP API and returns parsed JSON body when present.
export async function put (endpoint, body, token = null, contentType = 'application/json') {
  if (contentType === 'application/json') {
    return requestJSON('PUT', endpoint, token, body)
  }
  return requestRaw('PUT', endpoint, token, body, contentType)
}

export function get (endpoint, token = null, signal = null, onProgress = null, claimEmailCookie = null, reportId = '', loginHint = null) {
  return new Promise((resolve, reject) => {
    const xhr = new window.XMLHttpRequest()
    const { VITE_API_HOST } = import.meta.env
    const host = VITE_API_HOST || ''
    const url = `${host}/api/v1${endpoint}`

    xhr.open('GET', url, true)

    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token.access_token}`)
    }
    if (claimEmailCookie) {
      xhr.setRequestHeader('X-Dekart-Claim-Email', claimEmailCookie)
    }
    if (reportId) {
      xhr.setRequestHeader('X-Dekart-Report-Id', reportId)
    }
    if (loginHint && loginHint !== UNKNOWN_EMAIL) {
      xhr.setRequestHeader('X-Dekart-Logged-In', 'true')
    }
    xhr.responseType = 'arraybuffer'

    xhr.onload = () => {
      const headers = parseHeaders(xhr.getAllResponseHeaders())
      if (xhr.status === 204) {
        resolve(new window.Response(null, {
          status: xhr.status,
          statusText: xhr.statusText
        }))
        return
      }
      const res = new window.Response(xhr.response, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: new window.Headers(headers)
      })
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(res)
      } else {
        res.text().then(text => {
          reject(new ApiError(url, xhr.status, text, 'GET'))
        }).catch(reject)
      }
    }

    xhr.onerror = () => {
      reject(new ApiError(url, xhr.status, xhr.statusText, 'GET'))
    }

    xhr.onabort = () => {
      reject(new AbortError('Request aborted'))
    }

    if (onProgress) {
      xhr.onprogress = (event) => {
        if (event.loaded) {
          onProgress(event.loaded)
        }
      }
    }

    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort()
      })
    }

    xhr.send()
  })
}

function parseHeaders (headersString) {
  const headers = {}
  headersString.trim().split(/[\r\n]+/).forEach(line => {
    const parts = line.split(': ')
    const key = parts.shift()
    const value = parts.join(': ')
    headers[key] = value
  })
  return headers
}

// requestJSON is a shared HTTP JSON helper for authenticated Dekart API calls.
async function requestJSON (method, endpoint, token = null, body = undefined) {
  const { VITE_API_HOST } = import.meta.env
  const host = VITE_API_HOST || ''
  const url = `${host}/api/v1${endpoint}`
  const headers = {
    Accept: 'application/json'
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token.access_token}`
  }
  const reportId = getReportIdFromUrl()
  if (reportId) {
    headers['X-Dekart-Report-Id'] = reportId
  }
  const response = await window.fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new ApiError(url, response.status, errorText, method)
  }
  if (response.status === 204) {
    return null
  }
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

// requestRaw is a shared HTTP helper for authenticated non-JSON Dekart API calls.
async function requestRaw (method, endpoint, token = null, body = undefined, contentType = null) {
  const { VITE_API_HOST } = import.meta.env
  const host = VITE_API_HOST || ''
  const url = `${host}/api/v1${endpoint}`
  const headers = {
    Accept: 'application/json'
  }
  if (contentType) {
    headers['Content-Type'] = contentType
  }
  if (token) {
    headers.Authorization = `Bearer ${token.access_token}`
  }
  const reportId = getReportIdFromUrl()
  if (reportId) {
    headers['X-Dekart-Report-Id'] = reportId
  }
  const response = await window.fetch(url, {
    method,
    headers,
    body
  })
  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new ApiError(url, response.status, errorText, method)
  }
  if (response.status === 204) {
    return null
  }
  const text = await response.text()
  return text ? JSON.parse(text) : null
}
