import { version } from '../../../package.json'
import sha256 from 'crypto-js/sha256'

export function getRef (location = window.location, v = version) {
  switch (location.hostname) {
    case 'localhost':
    case '127.0.0.1':
      return `dekart-${v}-localhost`
    default:
      return `dekart-${v}-${sha256(location.hostname).toString().slice(0, 8)}`
  }
}
