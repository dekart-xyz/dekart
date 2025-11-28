// Centralized helpers for MIME and extension mapping

const EXT_TO_MIME = {
  csv: 'text/csv',
  geojson: 'application/geo+json',
  parquet: 'application/vnd.apache.parquet',
  json: 'application/json'
}

const MIME_TO_EXT = {
  'text/csv': 'csv',
  'application/geo+json': 'geojson',
  'application/vnd.apache.parquet': 'parquet',
  'application/json': 'json',
  // Some browsers may provide generic octet-stream for parquet
  'application/octet-stream': 'parquet'
}

export function mimeFromExtension (extension) {
  if (!extension) return ''
  const key = String(extension).toLowerCase().replace(/^\./, '')
  return EXT_TO_MIME[key] || ''
}

export function extensionFromMime (mime) {
  if (!mime) return ''
  return MIME_TO_EXT[mime] || ''
}

export function inferMimeFromName (name) {
  if (typeof name !== 'string') return ''
  const match = /\.([a-z0-9]+)$/i.exec(name)
  if (!match) return ''
  return mimeFromExtension(match[1])
}

export function contentTypeFromExtension (extension) {
  // For network/content-type headers by extension
  const mime = mimeFromExtension(extension)
  return mime || 'text/csv'
}

export const MIME_CONSTANTS = {
  CSV: EXT_TO_MIME.csv,
  GEOJSON: EXT_TO_MIME.geojson,
  PARQUET: EXT_TO_MIME.parquet,
  OCTET_STREAM: 'application/octet-stream'
}
