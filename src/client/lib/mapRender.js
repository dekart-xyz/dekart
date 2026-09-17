let revision = 0
const listeners = new Set()

// notifyMapRendered records deck.gl's real post-render callback.
export function notifyMapRendered () {
  revision++
  for (const listener of listeners) listener(revision)
}

// Paint feedback first, apply a synchronous map mutation, and keep the caller
// pending until deck.gl presents a newer frame. Returning false from apply
// declares that no map mutation was needed.
export function deferMapPresentation (apply, finish, fail = () => {}) {
  let finished = false
  let frame = window.requestAnimationFrame(() => {
    frame = window.requestAnimationFrame(() => {
      frame = null
      const observedRevision = revision
      const handle = currentRevision => {
        if (currentRevision <= observedRevision) return
        listeners.delete(handle)
        done()
      }
      listeners.add(handle)
      stopWaiting = () => listeners.delete(handle)
      timeout = window.setTimeout(() => {
        fail()
        done()
      }, 10000)
      try {
        if (apply() === false) done()
      } catch (error) {
        done()
        throw error
      }
    })
  })
  let stopWaiting = () => {}
  let timeout
  const done = () => {
    if (finished) return
    finished = true
    stopWaiting()
    window.clearTimeout(timeout)
    finish()
  }
  return () => {
    if (frame !== null) window.cancelAnimationFrame(frame)
    done()
  }
}
