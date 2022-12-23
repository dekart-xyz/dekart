/* eslint-env jest */
import { getRef } from './ref'

describe('getRef', () => {
  const v = '1.0.0'
  let usage, env
  beforeEach(() => {
    usage = {
      loaded: true,
      stats: {
        totalReports: 1,
        totalQueries: 2,
        totalFiles: 3,
        totalAuthors: 4
      }
    }
    env = {
      loaded: true,
      variables: {
        DATASOURCE: 'BQ',
        DISABLE_USAGE_STATS: ''
      }
    }
  })
  it('localhost', () => {
    expect(getRef(env, usage, new URL('http://localhost:3000/reports/7b818764-9f82-4029-99b3-d8faf9ea8de6/source'), v)).toEqual('dekart-1.0.0-localhost-2-1-2-3-4')
    expect(getRef(env, usage, new URL('http://localhost/'), v)).toEqual('dekart-1.0.0-localhost-2-1-2-3-4')
  })
  it('deployment', () => {
    expect(getRef(env, usage, new URL('http://play.dekart.xyz/reports/'), v)).toEqual('dekart-1.0.0-3be6a15a-2-1-2-3-4')
    expect(getRef(env, usage, new URL('https://play.dekart.xyz/reports/'), v)).toEqual('dekart-1.0.0-3be6a15a-2-1-2-3-4')
  })
  it('stats disabled', () => {
    env.variables.DISABLE_USAGE_STATS = '1'
    expect(getRef(env, usage, new URL('http://play.dekart.xyz/reports/'), v)).toEqual('dekart-stats-disabled')
  })
})
