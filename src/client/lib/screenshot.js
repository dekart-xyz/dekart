import { setExportImageSetting } from '@dekart-xyz/kepler.gl/dist/actions/ui-state-actions'

export default function screenshotInit (store) {
  // This function is called from the e2e tests.
  window.dekartMapScreenshot = () => {
    return new Promise((resolve) => {
      const unsubscribe = store.subscribe(() => {
        const { keplerGl } = store.getState()
        const {
          kepler: {
            uiState
          }
        } = keplerGl
        if (uiState) {
          const { exportImage } = uiState
          if (exportImage && exportImage.imageDataUri) {
            unsubscribe()
            resolve(exportImage)
          }
        }
      })
      const { keplerGl } = store.getState()
      const { kepler: { mapState: { width, height } } } = keplerGl
      store.dispatch(setExportImageSetting({
        exporting: true,
        processing: true,
        mapH: height,
        mapW: width
      }))
    })
  }
}
