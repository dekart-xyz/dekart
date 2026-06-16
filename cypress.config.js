const { defineConfig } = require('cypress')
const { RedirectState } = require('dekart-proto/dekart_pb')

function sensitiveScopes () {
  return [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/devstorage.read_write',
    'https://www.googleapis.com/auth/bigquery',
    ...(process.env.DEKART_GCP_EXTRA_OAUTH_SCOPES || '').split(',').filter(Boolean)
  ]
}

async function exchangeRefreshToken (refreshTokenEnvName) {
  const refreshToken = process.env[refreshTokenEnvName]
  if (!refreshToken) {
    throw new Error(`${refreshTokenEnvName} is required`)
  }
  const clientId = process.env.DEKART_GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.DEKART_GOOGLE_OAUTH_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('DEKART_GOOGLE_OAUTH_CLIENT_ID and DEKART_GOOGLE_OAUTH_SECRET are required')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })
  const token = await response.json()
  if (!response.ok) {
    throw new Error(`Google refresh token exchange failed: ${token.error || response.status}`)
  }
  const tokenInfo = await getTokenInfo(token.access_token)
  return {
    ...token,
    refresh_token: refreshToken,
    scope: token.scope || tokenInfo.scope
  }
}

async function getTokenInfo (accessToken) {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`)
  const tokenInfo = await response.json()
  if (!response.ok) {
    throw new Error(`Google token info lookup failed: ${tokenInfo.error || response.status}`)
  }
  return tokenInfo
}

function tokenHasSensitiveScopes (scope = '') {
  return sensitiveScopes().every(item => scope.includes(item))
}

function encodeRedirectState (token) {
  const redirectState = new RedirectState()
  redirectState.setTokenJson(JSON.stringify(token))
  redirectState.setSensitiveScopesGranted(tokenHasSensitiveScopes(token.scope))
  return Buffer.from(redirectState.serializeBinary()).toString('base64')
}

module.exports = defineConfig({
  watchForFileChanges: false,
  viewportWidth: 1280,
  viewportHeight: 720,
  video: true,
  e2e: {
    baseUrl: 'http://localhost:3000',
    setupNodeEvents (on) {
      on('task', {
        async googleOAuthRedirectState ({ refreshTokenEnvName }) {
          const token = await exchangeRefreshToken(refreshTokenEnvName)
          return encodeRedirectState(token)
        }
      })
    }
  }
})
