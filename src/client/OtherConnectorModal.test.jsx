import { describe, it, expect } from 'vitest'
import { buildBookCallUrl } from './OtherConnectorModal'

describe('buildBookCallUrl', () => {
  it('includes connector and workspace query params', () => {
    const url = buildBookCallUrl('redshift', 'ws-123')
    expect(url).toContain('https://calendly.com/vladi-dekart/30min?')
    expect(url).toContain('connector=redshift')
    expect(url).toContain('workspace=ws-123')
  })

  it('supports empty values', () => {
    const url = buildBookCallUrl('', '')
    expect(url).toContain('connector=')
    expect(url).toContain('workspace=')
  })
})
