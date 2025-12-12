import { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'

export function useMapPreview (reportId) {
  const token = useSelector(state => state.token)
  const claimEmailCookie = useSelector(state => state.user.claimEmailCookie)
  const { VITE_API_HOST } = import.meta.env
  const host = VITE_API_HOST || ''

  const [previewError, setPreviewError] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [previewUrl, setPreviewUrl] = useState(null)
  const blobUrlRef = useRef(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    blobUrlRef.current = null

    async function loadPreview () {
      try {
        setPreviewLoading(true)
        setPreviewError(false)
        const url = `${host}/map-preview/${reportId}.png`
        const headers = new Headers()

        if (token) {
          headers.append('Authorization', `Bearer ${token.access_token}`)
        }
        if (claimEmailCookie) {
          headers.append('X-Dekart-Claim-Email', claimEmailCookie)
        }

        const res = await fetch(url, {
          method: 'GET',
          headers,
          credentials: 'include'
        })

        if (cancelledRef.current) return

        if (!res.ok) {
          throw new Error(`Failed to load preview: ${res.status}`)
        }

        const blob = await res.blob()
        if (cancelledRef.current) return

        const blobUrl = URL.createObjectURL(blob)
        blobUrlRef.current = blobUrl
        setPreviewUrl(blobUrl)
        setPreviewLoading(false)
      } catch (err) {
        if (cancelledRef.current) return
        console.warn('Map preview failed to load:', err)
        setPreviewError(true)
        setPreviewLoading(false)
      }
    }

    loadPreview()

    return function cleanup () {
      cancelledRef.current = true
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [reportId, token, claimEmailCookie, host])

  return {
    previewUrl,
    previewLoading,
    previewError,
    setPreviewLoading,
    setPreviewError
  }
}
