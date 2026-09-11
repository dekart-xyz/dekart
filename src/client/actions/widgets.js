// Participate in the normal report autosave only when the author is editing.
export function widgetsChanged (config) {
  return (dispatch, getState) => {
    const { report, reportStatus, workspace } = getState()
    if (report?.canWrite && reportStatus.edit && !workspace.readOnly) dispatch({ type: widgetsChanged.name, config })
  }
}
