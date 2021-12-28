/* eslint-env jest */
import { getRef } from './ref'

describe('getRef', () => {
  const v = '1.0.0'
  it('localhost', () => {
    expect(getRef(new URL('http://localhost:3000/reports/7b818764-9f82-4029-99b3-d8faf9ea8de6/source'), v)).toEqual('dekart-1.0.0-localhost')
    expect(getRef(new URL('http://localhost/'), v)).toEqual('dekart-1.0.0-localhost')
  })
  it('deployment', () => {
    expect(getRef(new URL('http://play.dekart.xyz/reports/'), v)).toEqual('dekart-1.0.0-3be6a15a')
    expect(getRef(new URL('https://play.dekart.xyz/reports/'), v)).toEqual('dekart-1.0.0-3be6a15a')
  })
})
