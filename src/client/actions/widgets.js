export function widgetsChanged (config) {
  return { type: widgetsChanged.name, config }
}

// Remove the deleted dataset's dashboard through the normal report save path.
export function removeDatasetWidgets (datasetId) {
  return (dispatch, getState) => {
    const widgets = getState().widgets
    const dashboards = widgets.config?.config?.dashboardsById
    if (!dashboards?.[datasetId]) return
    const dashboardsById = { ...dashboards }
    delete dashboardsById[datasetId]
    dispatch(widgetsChanged({ ...widgets.config, config: { ...widgets.config.config, dashboardsById } }))
  }
}

export function widgetsDefaultsConsumed (datasetId) {
  return { type: widgetsDefaultsConsumed.name, datasetId }
}
