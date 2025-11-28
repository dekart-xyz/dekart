import { describe, it, expect } from 'vitest'
import { mimeFromExtension, extensionFromMime, inferMimeFromName, contentTypeFromExtension } from './mime'

describe('mime helpers (client)', () => {
  it('maps extension to mime', () => {
    expect(mimeFromExtension('csv')).toBe('text/csv')
    expect(mimeFromExtension('.geojson')).toBe('application/geo+json')
    expect(mimeFromExtension('parquet')).toBe('application/vnd.apache.parquet')
    expect(mimeFromExtension('json')).toBe('application/json')
  })

  it('maps mime to extension', () => {
    expect(extensionFromMime('text/csv')).toBe('csv')
    expect(extensionFromMime('application/geo+json')).toBe('geojson')
    expect(extensionFromMime('application/vnd.apache.parquet')).toBe('parquet')
    expect(extensionFromMime('application/octet-stream')).toBe('parquet')
    expect(extensionFromMime('application/json')).toBe('json')
  })

  it('infers mime from filename', () => {
    expect(inferMimeFromName('file.CSV')).toBe('text/csv')
    expect(inferMimeFromName('data.geojson')).toBe('application/geo+json')
    expect(inferMimeFromName('new-test.parquet')).toBe('application/vnd.apache.parquet')
    expect(inferMimeFromName('unknown.bin')).toBe('')
  })

  it('contentTypeFromExtension defaults to csv', () => {
    expect(contentTypeFromExtension('csv')).toBe('text/csv')
    expect(contentTypeFromExtension('geojson')).toBe('application/geo+json')
    expect(contentTypeFromExtension('parquet')).toBe('application/vnd.apache.parquet')
    expect(contentTypeFromExtension('json')).toBe('application/json')
    expect(contentTypeFromExtension('unknown')).toBe('text/csv')
  })
})
