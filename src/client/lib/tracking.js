// https://plausible.io/docs/custom-event-goals
window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments) }

export function track (event, props) {
  if (window.plausible) {
    setTimeout(() => {
      // console.warn('Dev tracking:', event, data)
      window.plausible(event, { props })
    }, 0)
  }
}
