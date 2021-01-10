import { genericError } from '../lib/message'

export function error (err) {
  console.error(err)
  genericError(err)
  return {
    type: error.name,
    err
  }
}
