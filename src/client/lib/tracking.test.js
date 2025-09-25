import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { track, shortEmailId } from './tracking'
import { LOCAL_STORAGE_KEY } from './constants'
import { createHash, webcrypto as nodeWebCrypto } from 'crypto'

// Ensure Web Crypto and btoa exist in the test environment
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
  globalThis.crypto = nodeWebCrypto
}
if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = function (str) {
    return Buffer.from(str, 'binary').toString('base64')
  }
}

function expectedShort (email) {
  const input = String(email ?? '')
  const hash = createHash('sha256').update(input).digest()
  const first8 = hash.subarray(0, 8)
  return first8.toString('hex').toUpperCase()
}

describe('shortEmailId', () => {
  it('produces 16-char uppercase hex', async () => {
    const id = await shortEmailId('user@example.com')
    expect(id).toMatch(/^[0-9A-F]{16}$/)
  })

  it('is deterministic and uses exact input (no normalization)', async () => {
    const a = await shortEmailId('  User@Example.com  ')
    const b = await shortEmailId('user@example.com')
    expect(a).not.toBe(b)
  })

  it('matches Node crypto reference implementation', async () => {
    const samples = [
      '',
      'a@b.c',
      'Alice@example.com',
      'bob.smith+news@Example.ORG',
      ' spaced@example.com '
    ]
    for (const email of samples) {
      const got = await shortEmailId(email)
      const want = expectedShort(email)
      expect(got).toBe(want)
    }
  })
})

describe('track', () => {
  let mockPlausible
  let originalLocalStorage

  beforeEach(() => {
    // Mock plausible
    mockPlausible = vi.fn()
    window.plausible = mockPlausible

    // Mock localStorage
    originalLocalStorage = global.localStorage
    delete global.localStorage
    global.localStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn()
    }

    // Clear all mocks
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore localStorage
    global.localStorage = originalLocalStorage
  })

  it('calls plausible with event and props when plausible exists', async () => {
    global.localStorage.getItem.mockReturnValue(null)

    track('test-event', { prop1: 'value1' })

    // Wait for setTimeout to execute
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(mockPlausible).toHaveBeenCalledWith('test-event', { props: { prop1: 'value1' } })
  })

  it('does nothing when plausible does not exist', async () => {
    window.plausible = undefined
    global.localStorage.getItem.mockReturnValue(null)

    track('test-event', { prop1: 'value1' })

    // Wait for setTimeout to execute
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(mockPlausible).not.toHaveBeenCalled()
  })

  it('includes seid when loginHint is available in localStorage', async () => {
    const loginHint = 'user@example.com'
    global.localStorage.getItem.mockReturnValue(JSON.stringify({ loginHint }))

    track('test-event', { prop1: 'value1' })

    // Wait for setTimeout to execute
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(global.localStorage.getItem).toHaveBeenCalledWith(LOCAL_STORAGE_KEY)
    expect(mockPlausible).toHaveBeenCalledWith('test-event', {
      props: expect.objectContaining({
        prop1: 'value1'
      })
    })
    // Should include seid but not loginHint
    const call = mockPlausible.mock.calls[0]
    expect(call[1].props).toHaveProperty('seid')
    expect(call[1].props).not.toHaveProperty('loginHint')
  })

  it('includes seid when loginHint is available', async () => {
    const loginHint = 'user@example.com'
    global.localStorage.getItem.mockReturnValue(JSON.stringify({ loginHint }))

    track('test-event', { prop1: 'value1' })

    // Wait for setTimeout to execute
    await new Promise(resolve => setTimeout(resolve, 10))

    const call = mockPlausible.mock.calls[0]
    expect(call[1].props).toHaveProperty('seid')
    expect(call[1].props.seid).toMatch(/^[0-9A-F]{16}$/)
  })

  it('handles localStorage parsing errors gracefully', async () => {
    global.localStorage.getItem.mockReturnValue('invalid-json')

    track('test-event', { prop1: 'value1' })

    // Wait for setTimeout to execute
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(mockPlausible).toHaveBeenCalledWith('test-event', { props: { prop1: 'value1' } })
  })

  it('handles localStorage getItem errors gracefully', async () => {
    global.localStorage.getItem.mockImplementation(() => {
      throw new Error('localStorage error')
    })

    track('test-event', { prop1: 'value1' })

    // Wait for setTimeout to execute
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(mockPlausible).toHaveBeenCalledWith('test-event', { props: { prop1: 'value1' } })
  })

  it('handles shortEmailId errors gracefully', async () => {
    const loginHint = 'user@example.com'
    global.localStorage.getItem.mockReturnValue(JSON.stringify({ loginHint }))

    // Mock crypto.subtle.digest to throw an error
    const originalDigest = global.crypto.subtle.digest
    global.crypto.subtle.digest = vi.fn().mockRejectedValue(new Error('crypto error'))

    track('test-event', { prop1: 'value1' })

    // Wait for setTimeout to execute
    await new Promise(resolve => setTimeout(resolve, 10))

    // Should still call plausible without seid (and without loginHint for privacy)
    expect(mockPlausible).toHaveBeenCalledWith('test-event', {
      props: expect.objectContaining({
        prop1: 'value1'
      })
    })
    expect(mockPlausible.mock.calls[0][1].props).not.toHaveProperty('seid')
    expect(mockPlausible.mock.calls[0][1].props).not.toHaveProperty('loginHint')

    // Restore original digest
    global.crypto.subtle.digest = originalDigest
  })

  it('handles any unexpected errors and falls back to basic tracking', async () => {
    global.localStorage.getItem.mockImplementation(() => {
      throw new Error('Unexpected error')
    })

    track('test-event', { prop1: 'value1' })

    // Wait for setTimeout to execute
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(mockPlausible).toHaveBeenCalledWith('test-event', { props: { prop1: 'value1' } })
  })

  it('works with null localStorage value', async () => {
    global.localStorage.getItem.mockReturnValue(null)

    track('test-event', { prop2: 'value2' })

    // Wait for setTimeout to execute
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(mockPlausible).toHaveBeenCalledWith('test-event', { props: { prop2: 'value2' } })
  })

  it('works with empty localStorage object', async () => {
    global.localStorage.getItem.mockReturnValue('{}')

    track('test-event', { prop3: 'value3' })

    // Wait for setTimeout to execute
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(mockPlausible).toHaveBeenCalledWith('test-event', { props: { prop3: 'value3' } })
  })

  it('works with localStorage object without loginHint', async () => {
    global.localStorage.getItem.mockReturnValue(JSON.stringify({ otherProp: 'value' }))

    track('test-event', { prop4: 'value4' })

    // Wait for setTimeout to execute
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(mockPlausible).toHaveBeenCalledWith('test-event', { props: { prop4: 'value4' } })
  })

  it('handles empty loginHint gracefully', async () => {
    global.localStorage.getItem.mockReturnValue(JSON.stringify({ loginHint: '' }))

    track('test-event', { prop5: 'value5' })

    // Wait for setTimeout to execute
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(mockPlausible).toHaveBeenCalledWith('test-event', { props: { prop5: 'value5' } })
  })
})
