// getSnapshotTokenFromUrl returns snapshot token from URL query string when present.
export function getSnapshotTokenFromUrl () {
  const params = new URLSearchParams(window.location.search)
  return params.get('snapshot_token') || ''
}
