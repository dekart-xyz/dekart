import React from 'react'
import { useStoreWithMosaicDashboard } from '@sqlrooms/mosaic'
import { useBlockSettingsStore } from '@sqlrooms/documents'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@sqlrooms/ui'
import { MoreVertical } from 'lucide-react'
import { MosaicDashboardChartHeaderActions } from '@sqlrooms/mosaic/dist/charts/dashboard/MosaicDashboardChartHeaderActions'
import { MosaicDashboardChartSettings } from '@sqlrooms/mosaic/dist/charts/dashboard/MosaicDashboardChartSettings'
import { useMosaicDashboardContext } from '@sqlrooms/mosaic/dist/dashboard/MosaicDashboardContext'
import styles from './ChartHeaderActions.module.css'

// Keep upstream editing and filter actions, with destructive actions tucked into a menu.
export default function ChartHeaderActions (props) {
  const { dashboardId, panel } = props
  const { readOnly } = useMosaicDashboardContext()
  const selectBlock = useBlockSettingsStore(state => state.blockSettings.selectBlock)
  const openSettings = useBlockSettingsStore(state => state.blockSettings.requestOpenSettingsPanel)
  const clearSelection = useBlockSettingsStore(state => state.blockSettings.clearSelectionIfBlockDeleted)
  const remove = useStoreWithMosaicDashboard(state => state.mosaicDashboard.removePanel)
  const edit = () => {
    selectBlock({ type: 'dashboard-panel', id: panel.id, dashboardId, panelType: panel.type, settingsComponent: MosaicDashboardChartSettings, readOnly })
    openSettings()
  }
  return (
    <div className={styles.actions}>
      <MosaicDashboardChartHeaderActions {...props} />
      {!readOnly && <DropdownMenu><DropdownMenuTrigger asChild><button aria-label='Chart actions' className={styles.trigger}><MoreVertical size={14} /></button></DropdownMenuTrigger><DropdownMenuContent align='end'><DropdownMenuItem onSelect={edit}>Edit chart</DropdownMenuItem><DropdownMenuItem onSelect={() => { remove(dashboardId, panel.id); clearSelection(panel.id) }}>Delete chart</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
    </div>
  )
}
