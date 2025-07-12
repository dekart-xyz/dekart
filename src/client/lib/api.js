export class ApiError extends Error {
  constructor (url, status, errorDetails) {
    super(`${status} GET ${url}`)
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

export function get (endpoint, token = null, signal = null, onProgress = null, claimEmailCookie = null) {
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

    xhr.responseType = 'arraybuffer'

    xhr.onload = () => {
      const headers = parseHeaders(xhr.getAllResponseHeaders())
      const res = new window.Response(xhr.response, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: new window.Headers(headers)
      })
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(res)
      } else {
        res.text().then(text => {
          reject(new ApiError(url, xhr.status, text))
        }).catch(reject)
      }
    }

    xhr.onerror = () => {
      reject(new ApiError(url, xhr.status, xhr.statusText))
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
