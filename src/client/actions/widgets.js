export function widgetsChanged (config) {
  return { type: widgetsChanged.name, config }
}

// A confirmed local dataset deletion removes only that dataset's authored charts.
export function removeDatasetWidgets (datasetId) {
  return (dispatch, getState) => {
    const widgets = getState().widgets
    const dashboards = widgets.config?.config?.dashboardsById
    if (widgets.compatibility !== 'supported' || !dashboards?.[datasetId]) return
    const dashboardsById = { ...dashboards }
    delete dashboardsById[datasetId]
    dispatch(widgetsChanged({ ...widgets.config, config: { ...widgets.config.config, dashboardsById } }))
  }
}

export function widgetsDefaultsConsumed (datasetId) {
  return { type: widgetsDefaultsConsumed.name, datasetId }
}
