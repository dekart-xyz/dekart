/* eslint-disable no-undef */

// synthesizeWheelGesture sends compositor-independent native zoom input through Chrome DevTools.
function synthesizeWheelGesture (x, y, yDistance, speed) {
  return Cypress.automation('remote:debugger:protocol', {
    command: 'Input.synthesizeScrollGesture',
    params: {
      x,
      y,
      yDistance,
      speed,
      gestureSourceType: 'mouse',
      preventFling: true
    }
  })
}

// mapViewport translates AUT iframe coordinates to Chrome's root viewport coordinates.
function mapViewport (mapCanvas) {
  const win = mapCanvas.ownerDocument.defaultView
  const canvasBounds = mapCanvas.getBoundingClientRect()
  const frameBounds = win.frameElement?.getBoundingClientRect() || {
    left: 0,
    top: 0,
    width: win.innerWidth,
    height: win.innerHeight
  }
  const scaleX = frameBounds.width / win.innerWidth
  const scaleY = frameBounds.height / win.innerHeight
  return {
    win,
    canvasBounds,
    x: frameBounds.left + (canvasBounds.left + canvasBounds.width * 0.5) * scaleX,
    y: frameBounds.top + (canvasBounds.top + canvasBounds.height * 0.5) * scaleY,
    clip: {
      x: frameBounds.left + canvasBounds.left * scaleX,
      y: frameBounds.top + canvasBounds.top * scaleY,
      width: canvasBounds.width * scaleX,
      height: canvasBounds.height * scaleY,
      scale: 1
    }
  }
}

// captureViewportScreenshot captures the visible map region without changing application state.
function captureViewportScreenshot (clip) {
  return Cypress.automation('remote:debugger:protocol', {
    command: 'Page.captureScreenshot',
    params: {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
      clip
    }
  })
}

// captureMapScreenshot captures all visible map layers for a DOM-level rendering assertion.
export function captureMapScreenshot (mapCanvas) {
  return captureViewportScreenshot(mapViewport(mapCanvas).clip)
}

// assertNativeZoomChangesMap proves the native gesture reaches the visible map.
async function assertNativeZoomChangesMap (mapCanvas, hiddenLayerPixels) {
  const { canvasBounds, x, y, clip } = mapViewport(mapCanvas)
  const distance = Math.round(canvasBounds.height * 0.1)
  const before = await captureViewportScreenshot(clip)
  // The optional hidden capture makes the same pre-zoom readback prove the data layer rendered.
  if (hiddenLayerPixels) {
    expect(before.data, 'visible layer changes map pixels').not.to.equal(hiddenLayerPixels)
  }
  await synthesizeWheelGesture(x, y, distance, distance * 2)
  const zoomed = await captureViewportScreenshot(clip)
  expect(zoomed.data, 'visible map pixels after native zoom').not.to.equal(before.data)
  await synthesizeWheelGesture(x, y, -distance, distance * 2)
  await Cypress.Promise.delay(500)
}

// measureNativeZoom records animation frames and main-thread stalls during native zoom input.
async function measureNativeZoom (mapCanvas, durationMs) {
  const { win, canvasBounds, x, y } = mapViewport(mapCanvas)
  const distance = Math.round(canvasBounds.height * 0.25)
  const speed = Math.round(distance / (durationMs / 2000))
  const frameTimes = []
  const longTasks = []
  let finished = false
  const observer = new win.PerformanceObserver(list => {
    longTasks.push(...list.getEntries().map(entry => entry.duration))
  })

  observer.observe({ entryTypes: ['longtask'] })
  const captureFrame = timestamp => {
    if (finished) return
    frameTimes.push(timestamp)
    win.requestAnimationFrame(captureFrame)
  }
  win.requestAnimationFrame(captureFrame)

  const startedAt = win.performance.now()
  await synthesizeWheelGesture(x, y, distance, speed)
  await synthesizeWheelGesture(x, y, -distance, speed)
  const inputEndedAt = win.performance.now()
  // Keep observing after native input so deferred map redraws remain part of jank assertions.
  await Cypress.Promise.delay(500)
  const observationEndedAt = win.performance.now()
  finished = true
  await Cypress.Promise.delay(0)
  observer.disconnect()

  return {
    startedAt,
    inputEndedAt,
    observationEndedAt,
    frameTimes,
    longTasks
  }
}

// summarizeMeasurement calculates user-visible frame and main-thread stall metrics.
function summarizeMeasurement ({ startedAt, inputEndedAt, observationEndedAt, frameTimes, longTasks }) {
  const inputDuration = inputEndedAt - startedAt
  const inputFrames = frameTimes.filter(timestamp => timestamp <= inputEndedAt)
  const inputBoundaries = [startedAt, ...inputFrames, inputEndedAt]
  const inputIntervals = inputBoundaries.slice(1).map((timestamp, index) => timestamp - inputBoundaries[index])
  const observedBoundaries = [startedAt, ...frameTimes, observationEndedAt]
  const observedIntervals = observedBoundaries.slice(1).map((timestamp, index) => timestamp - observedBoundaries[index])
  const sortedInputIntervals = [...inputIntervals].sort((a, b) => a - b)
  return {
    fps: inputFrames.length * 1000 / inputDuration,
    longTaskTime: longTasks.reduce((sum, task) => sum + task, 0),
    maxLongTask: Math.max(0, ...longTasks),
    maxFrame: Math.max(0, ...observedIntervals),
    p95Frame: sortedInputIntervals[Math.floor(sortedInputIntervals.length * 0.95)] || inputDuration
  }
}

// median keeps a single noisy browser sample from deciding the performance result.
function median (values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

// measureMapZoomPerformance returns median metrics from three identical native zoom runs.
export async function measureMapZoomPerformance (mapCanvas, durationMs = 3000, hiddenLayerPixels = null) {
  await assertNativeZoomChangesMap(mapCanvas, hiddenLayerPixels)
  const runs = []
  for (let run = 0; run < 3; run++) {
    runs.push(summarizeMeasurement(await measureNativeZoom(mapCanvas, durationMs)))
    await Cypress.Promise.delay(500)
  }
  return {
    fps: median(runs.map(run => run.fps)),
    longTaskTime: median(runs.map(run => run.longTaskTime)),
    maxLongTask: Math.max(...runs.map(run => run.maxLongTask)),
    maxFrame: Math.max(...runs.map(run => run.maxFrame)),
    p95Frame: median(runs.map(run => run.p95Frame))
  }
}

// formatMapPerformance creates one comparable summary for assertions and terminal output.
export function formatMapPerformance ({ fps, p95Frame, maxFrame, longTaskTime, maxLongTask }) {
  return `${fps.toFixed(1)} FPS, ${p95Frame.toFixed(1)} ms p95 frame, ${maxFrame.toFixed(1)} ms worst frame, ${longTaskTime.toFixed(0)} ms blocked, ${maxLongTask.toFixed(0)} ms longest task`
}
