import React, { useEffect } from 'react'
import { Provider } from 'react-redux'
import { createStore } from 'redux'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ReportWidgetsErrorBoundary from './ReportWidgetsErrorBoundary'
import { setError } from '../actions/message'

vi.mock('../actions/message', () => ({
  setError: vi.fn(() => ({ type: 'reported-chart-error' }))
}))

// Exercise both render failures and the effect failure seen during map navigation.
function BrokenChart ({ error, phase }) {
  useEffect(() => {
    if (phase === 'effect') throw error
  }, [error, phase])
  if (phase === 'render') throw error
  return <div>Chart</div>
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it.each([
  ['render', false], ['effect', false], ['render', true], ['effect', true]
])('reports a chart %s exception through setError (panel: %s)', (phase, panel) => {
  const error = new TypeError('Chart setup failed')
  const store = createStore((state = {}) => state)
  const dispatch = vi.spyOn(store, 'dispatch')
  const onError = vi.fn()
  render(
    <Provider store={store}>
      <ReportWidgetsErrorBoundary
        fallback={panel ? <div role='alert'>Chart unavailable</div> : undefined}
        onError={panel ? onError : undefined}
      >
        <BrokenChart error={error} phase={phase} />
      </ReportWidgetsErrorBoundary>
    </Provider>
  )
  expect(screen.getByText(panel ? 'Chart unavailable' : 'Something went wrong')).toBeVisible()
  expect(setError).toHaveBeenCalledExactlyOnceWith(error)
  expect(dispatch).toHaveBeenCalledWith({ type: 'reported-chart-error' })
  expect(onError).toHaveBeenCalledTimes(panel ? 1 : 0)
})
