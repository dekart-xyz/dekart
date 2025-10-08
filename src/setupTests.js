// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Provide Web Crypto and btoa in the test environment (jsdom under Node)
import { webcrypto as nodeWebCrypto } from 'crypto'

if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = nodeWebCrypto
}
if (typeof window !== 'undefined' && typeof window.crypto === 'undefined') {
  window.crypto = nodeWebCrypto
}

if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = function (str) {
    return Buffer.from(str, 'binary').toString('base64')
  }
}
