import React, { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { MosaicDashboard, ChartBuilderRoot, ChartBuilderContent, MosaicChartSettingsPanel, createMosaicDashboardChartPanelConfig } from '@sqlrooms/mosaic'
import { Button } from '@sqlrooms/ui'
import { Plus, ArrowLeft } from 'lucide-react'
import classnames from 'classnames'
import { chartTypes, fitWidgetPanels, widgetTableName } from './widgetStore'
import { useWidgetFilters } from './useWidgetFilters'
import styles from './ReportWidgets.module.css'

// Dataset bindings remain separate for filtering; the report presents them in one scroll area.
export default function WidgetContents ({ store, snapshot, sources, loading, dataReloadPending, placeholderCount, onOpenData, editing }) {
  const [builder, setBuilder] = useState(false)
  const [selectedSource, setSelectedSource] = useState('')
  const dashboards = useStore(store, state => state.mosaicDashboard.config.dashboardsById)
  const settingsOpen = useStore(store, state => state.blockSettings.runtime.isSettingsPanelOpen)
  const available = sources.filter(source => source.physical && !source.pending && !source.error)
  const datasetId = available.find(source => source.id === selectedSource)?.id || available[0]?.id || ''
  const hasBoundCharts = sources.some(source => dashboards[source.id]?.panels.length)
  const hasWidgets = Object.values(dashboards).some(dashboard => dashboard.panels.length)
  return (
    <>
      {!snapshot && !builder && !settingsOpen && <div className={styles.actions}><h2>Charts</h2><Button aria-label='Add chart' disabled={!datasetId} onClick={() => setBuilder(true)}><Plus size={15} />Add chart</Button></div>}
      <div className={classnames(styles.reportCharts, { [styles.hidden]: builder || settingsOpen })}>
        {sources.filter(source => dashboards[source.id]).map(source => <DatasetCharts key={source.id} store={store} snapshot={snapshot} source={source} dataReloadPending={dataReloadPending} showSource={sources.length > 1} onOpenData={onOpenData} editing={editing} />)}
        {!hasBoundCharts && loading && <ChartStubs count={placeholderCount} />}
        {!snapshot && !hasWidgets && !loading && datasetId && <div className={styles.empty}><h3>Dashboard is empty</h3><p>Add a chart from any report dataset.</p></div>}
      </div>
      {settingsOpen && !builder && <WidgetSettings store={store} sources={available} />}
      {builder && (
        <div className={styles.inlineBuilder} data-testid='inline-widget-builder'>
          <div className={styles.builderHeading}><h3>Add chart</h3><Button variant='ghost' onClick={() => setBuilder(false)}>Cancel</Button></div>
          <SourceSelector id='widget-source' value={datasetId} sources={available} onChange={setSelectedSource} />
          {datasetId ? <WidgetBuilder key={datasetId} store={store} datasetId={datasetId} onCreated={() => setBuilder(false)} /> : <p>Wait for a dataset to finish loading.</p>}
        </div>
      )}
    </>
  )
}

function SourceSelector ({ id, value, sources, onChange }) {
  return <div className={styles.source}><label htmlFor={id}>Dataset</label><select id={id} value={value} onChange={event => onChange(event.target.value)}>{sources.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}</select></div>
}

// Use the same placeholders before config adoption and while individual datasets load.
function ChartStubs ({ count }) {
  return Array.from({ length: count }, (_, index) => <div key={index} className={styles.chartStub} data-testid='chart-stub' aria-hidden='true'><div className={styles.stubLabel} /><div className={styles.stubLines}><i /><i /><i /></div></div>)
}

// Keep each dataset's filter bridge alive while its charts are hidden by creation or settings.
function DatasetCharts ({ store, snapshot, source, dataReloadPending, showSource, onOpenData, editing }) {
  const { error } = useWidgetFilters(store, source.id, Boolean(source.physical), editing, source.pending || source.downloading || dataReloadPending)
  const dashboard = useStore(store, state => state.mosaicDashboard.config.dashboardsById[source.id])
  useEffect(() => { if (dashboard?.panels.length) fitWidgetPanels(store, source.id) }, [store, source.id, dashboard?.panels])
  // REVIEW: A failed dataset or an empty slot in a snapshot is an end state, so all its panels are marked painted and the empty slot draws nothing instead of placeholders.
  const failed = Boolean(source.error || error)
  // A snapshot of a dataset that cannot load says so rather than showing placeholders that never resolve.
  const empty = snapshot && !source.loadable
  useEffect(() => {
    // A section showing an alert or the no-data message renders no panels, so it reports them settled.
    if (failed || empty) dashboard?.panels.forEach(panel => store.getState().markPanelPainted(panel.id))
  }, [failed, empty, dashboard?.panels, store])
  return (
    <section className={styles.datasetWidgets} data-testid='dataset-widgets' aria-label={`${source.label} charts`}>
      {showSource && dashboard?.panels.length > 0 && <h3 className={styles.datasetLabel}>{source.label}</h3>}
      {/* REVIEW: The dataset alert drops the Open data button in snapshots, where nothing is clickable. */}
      {failed ? <div role='alert' className={styles.error}>{source.error || error}{!snapshot && <Button onClick={onOpenData}>Open data</Button>}</div> : empty ? <div className={styles.empty}>No data to chart yet.</div> : source.pending || !source.physical ? <ChartStubs count={dashboard?.panels.length || 0} /> : dashboard?.panels.length > 0 ? <MosaicDashboard.Root dashboardId={source.id}><MosaicDashboard.Panels /></MosaicDashboard.Root> : null}
    </section>
  )
}

function createWidget (store, datasetId, title, config) {
  const api = store.getState().mosaicDashboard
  api.ensureDashboard(datasetId, 'Widgets', 'grid')
  api.setSelectedTable(datasetId, `"memory"."widgets"."d_${datasetId.replaceAll('-', '_')}"`)
  api.addPanel(datasetId, createMosaicDashboardChartPanelConfig(title, config))
  fitWidgetPanels(store, datasetId)
}

function WidgetBuilder ({ store, datasetId, onCreated }) {
  const table = useStore(store, state => state.db.tables.find(table => table.table.schema === 'widgets' && table.table.table === `d_${datasetId.replaceAll('-', '_')}`))
  return <ChartBuilderRoot open={false} tableName={widgetTableName(datasetId)} columns={table?.columns || []} chartTypes={chartTypes} onCreateChart={(title, config) => { createWidget(store, datasetId, title, config); onCreated() }}><ChartBuilderContent /></ChartBuilderRoot>
}

// Moving one widget must not retarget every other widget from its original dataset.
function moveWidgetToDataset (store, selected, panel, datasetId) {
  const api = store.getState().mosaicDashboard
  const targetTable = store.getState().db.tables.find(table => table.table.schema === 'widgets' && table.table.table === `d_${datasetId.replaceAll('-', '_')}`)
  const fieldExists = targetTable?.columns.some(column => column.name === panel.config.settings.field)
  const config = { ...panel.config, settings: { ...panel.config.settings, field: fieldExists ? panel.config.settings.field : '' } }
  api.ensureDashboard(datasetId, 'Widgets', 'grid')
  api.setSelectedTable(datasetId, `"memory"."widgets"."d_${datasetId.replaceAll('-', '_')}"`)
  const id = api.addPanel(datasetId, { ...panel, config })
  api.removePanel(selected.dashboardId, selected.id)
  fitWidgetPanels(store, datasetId)
  store.getState().blockSettings.selectBlock({ ...selected, id, dashboardId: datasetId })
  store.getState().blockSettings.requestOpenSettingsPanel()
}

// Only the report title/source binding is hosted here; chart controls remain upstream SQLRooms.
function WidgetSettings ({ store, sources }) {
  const selected = useStore(store, state => state.blockSettings.runtime.selectedBlock)
  const panel = useStore(store, state => state.mosaicDashboard.config.dashboardsById[selected?.dashboardId]?.panels.find(panel => panel.id === selected?.id))
  const table = useStore(store, state => state.db.tables.find(table => table.table.schema === 'widgets' && table.table.table === `d_${selected?.dashboardId?.replaceAll('-', '_')}`))
  if (!panel) return null
  const api = store.getState().mosaicDashboard
  return (
    <div className={styles.settings} data-testid='widget-settings'>
      <Button variant='ghost' onClick={() => store.getState().blockSettings.requestCloseSettingsPanel()}><ArrowLeft size={14} />Back to charts</Button>
      <div className={styles.source}><label htmlFor='widget-title'>Title</label><input id='widget-title' value={panel.title || ''} onChange={event => api.updatePanel(selected.dashboardId, selected.id, { title: event.target.value })} /></div>
      <SourceSelector id='widget-settings-source' value={selected.dashboardId} sources={sources} onChange={datasetId => moveWidgetToDataset(store, selected, panel, datasetId)} />
      <div className={styles.chartSettings}><MosaicChartSettingsPanel dataTable={table} config={panel.config} onChange={config => api.updatePanel(selected.dashboardId, selected.id, { config })} showViewSpecButton={false} /></div>
    </div>
  )
}
