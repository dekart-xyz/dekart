import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { removeFilter } from '@kepler.gl/actions'
import { usePanelClients, useStoreWithMosaicDashboard } from '@sqlrooms/mosaic'
import { useBlockSettingsStore } from '@sqlrooms/documents'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@sqlrooms/ui'
import { MoreVertical } from 'lucide-react'
import { MosaicDashboardChartSettings } from '@sqlrooms/mosaic/dist/charts/dashboard/MosaicDashboardChartSettings'
import { useMosaicDashboardContext } from '@sqlrooms/mosaic/dist/dashboard/MosaicDashboardContext'
import { usePanelResetFilters } from '@sqlrooms/mosaic/dist/dashboard/hooks/usePanelResetFilters'
import { ResetFiltersButton } from '@sqlrooms/mosaic/dist/dashboard/components/ResetFiltersButton'
import styles from './ChartHeaderActions.module.css'

// Keep upstream editing and filter actions, with destructive actions tucked into a menu.
export default function ChartHeaderActions (props) {
  const { dashboardId, panel, selectionName } = props
  const { readOnly } = useMosaicDashboardContext()
  const dispatch = useDispatch()
  const filters = useSelector(state => state.keplerGl.kepler?.visState.filters || [])
  const panelClients = usePanelClients(dashboardId, panel.id)
  const { hasActiveFilters, reset } = usePanelResetFilters({ panelClients, selectionName })
  const selectBlock = useBlockSettingsStore(state => state.blockSettings.selectBlock)
  const openSettings = useBlockSettingsStore(state => state.blockSettings.requestOpenSettingsPanel)
  const clearSelection = useBlockSettingsStore(state => state.blockSettings.clearSelectionIfBlockDeleted)
  const removePanel = useStoreWithMosaicDashboard(state => state.mosaicDashboard.removePanel)
  const field = panel.config.settings.field
  const matchingFilters = filters.flatMap((filter, index) => {
    const datasetIndex = filter.dataId.indexOf(dashboardId)
    const owned = filter.id === `widget:${panel.id}`
    const native = !filter.id.startsWith('widget:') && datasetIndex >= 0 && filter.name[datasetIndex] === field
    return owned || native ? [{ filter, index }] : []
  })
  const resetFilters = () => {
    reset()
    matchingFilters.reverse().forEach(({ index }) => dispatch(removeFilter(index)))
  }
  const edit = () => {
    selectBlock({ type: 'dashboard-panel', id: panel.id, dashboardId, panelType: panel.type, settingsComponent: MosaicDashboardChartSettings, readOnly })
    openSettings()
  }
  return (
    <div className={styles.actions}>
      <ResetFiltersButton disabled={!hasActiveFilters && matchingFilters.length === 0} onClick={resetFilters} aria-label={`Reset ${panel.title} filters`} tooltip='Reset panel filters' />
      {!readOnly && <DropdownMenu><DropdownMenuTrigger asChild><button aria-label='Chart actions' className={styles.trigger}><MoreVertical size={14} /></button></DropdownMenuTrigger><DropdownMenuContent align='end'><DropdownMenuItem onSelect={edit}>Edit chart</DropdownMenuItem><DropdownMenuItem onSelect={() => { removePanel(dashboardId, panel.id); clearSelection(panel.id) }}>Delete chart</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
    </div>
  )
}
