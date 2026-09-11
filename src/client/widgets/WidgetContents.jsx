import React, { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { MosaicDashboard, ChartBuilderRoot, ChartBuilderContent, MosaicChartSettingsPanel, createMosaicDashboardChartPanelConfig } from '@sqlrooms/mosaic'
import { Button } from '@sqlrooms/ui'
import { Plus, ArrowLeft, RotateCcw, X } from 'lucide-react'
import classnames from 'classnames'
import { chartTypes, fitWidgetPanels, suggestWidgets, widgetTableName } from './widgetStore'
import { useWidgetFilters } from './useWidgetFilters'
import styles from './ReportWidgets.module.css'

// Dataset bindings remain separate for filtering; the report presents them in one scroll area.
export default function WidgetContents ({ store, sources, editing, onOpenData }) {
  const [builder, setBuilder] = useState(false)
  const [selectedSource, setSelectedSource] = useState('')
  const dashboards = useStore(store, state => state.mosaicDashboard.config.dashboardsById)
  const settingsOpen = useStore(store, state => state.blockSettings.runtime.isSettingsPanelOpen)
  const available = sources.filter(source => source.physical && !source.pending && !source.error)
  const datasetId = available.find(source => source.id === selectedSource)?.id || available[0]?.id || ''
  const hasWidgets = Object.values(dashboards).some(dashboard => dashboard.panels.length)
  useEffect(() => {
    if (!editing) { setBuilder(false); store.getState().blockSettings.requestCloseSettingsPanel() }
  }, [editing, store])
  return (
    <>
      <div className={classnames(styles.reportCharts, { [styles.hidden]: builder || (editing && settingsOpen) })}>
        {sources.filter(source => dashboards[source.id]).map(source => <DatasetCharts key={`${source.id}:${source.physical}`} store={store} source={source} editing={editing} showSource={sources.length > 1} onOpenData={onOpenData} />)}
        {!hasWidgets && <div className={styles.empty}><h3>Dashboard is empty</h3><p>Add a widget from any report dataset.</p></div>}
      </div>
      {editing && settingsOpen && !builder && <WidgetSettings store={store} sources={available} />}
      {editing && builder && (
        <div className={styles.inlineBuilder} data-testid='inline-widget-builder'>
          <div className={styles.builderHeading}><h3>Add widget</h3><Button variant='ghost' onClick={() => setBuilder(false)}>Cancel</Button></div>
          <SourceSelector id='widget-source' value={datasetId} sources={available} onChange={setSelectedSource} />
          {datasetId ? <WidgetBuilder key={datasetId} store={store} datasetId={datasetId} onCreated={() => setBuilder(false)} /> : <p>Wait for a dataset to finish loading.</p>}
        </div>
      )}
      {editing && !builder && <div className={styles.actions}><Button aria-label='Add widget' onClick={() => { store.getState().blockSettings.requestCloseSettingsPanel(); setBuilder(true) }}><Plus size={15} />Add widget</Button><Button variant='ghost' onClick={() => available.forEach(source => suggestWidgets(store, source.id, source.fields))}>Suggest widgets</Button></div>}
    </>
  )
}

function SourceSelector ({ id, value, sources, onChange }) {
  return <div className={styles.source}><label htmlFor={id}>Dataset</label><select id={id} value={value} onChange={event => onChange(event.target.value)}>{sources.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}</select></div>
}

// Keep each dataset's filter bridge alive while its charts are hidden by creation or settings.
function DatasetCharts ({ store, source, editing, showSource, onOpenData }) {
  const { clauses, clear, error } = useWidgetFilters(store, source.id, Boolean(source.physical))
  const dashboard = useStore(store, state => state.mosaicDashboard.config.dashboardsById[source.id])
  return (
    <section className={styles.datasetWidgets} data-testid='dataset-widgets' aria-label={`${source.label} widgets`}>
      {showSource && dashboard?.panels.length > 0 && <h3 className={styles.datasetLabel}>{source.label}</h3>}
      {!!clauses.length && <div className={styles.filters}>{clauses.map((clause, index) => <button key={index} onClick={() => clear(clause)}>{clause.meta?.type === 'interval' ? 'Selected range' : Array.isArray(clause.value) ? clause.value.flat().join(', ') : clause.value}<X size={12} /></button>)}<button onClick={() => clauses.forEach(clear)}><RotateCcw size={12} />Clear filters</button></div>}
      {source.error || error ? <div role='alert' className={styles.error}>{source.error || error}{editing && <Button onClick={onOpenData}>Open data</Button>}</div> : source.pending || !source.physical ? <div className={styles.empty}>Loading {source.label}…</div> : dashboard?.panels.length > 0 ? <MosaicDashboard.Root dashboardId={source.id} readOnly={!editing}><MosaicDashboard.Panels /></MosaicDashboard.Root> : null}
    </section>
  )
}

function WidgetBuilder ({ store, datasetId, onCreated }) {
  const table = useStore(store, state => state.db.tables.find(table => table.table.schema === 'widgets' && table.table.table === `d_${datasetId.replaceAll('-', '_')}`))
  const create = (title, config) => {
    const api = store.getState().mosaicDashboard
    api.ensureDashboard(datasetId, 'Widgets', 'grid')
    api.setSelectedTable(datasetId, `"memory"."widgets"."d_${datasetId.replaceAll('-', '_')}"`)
    api.addPanel(datasetId, createMosaicDashboardChartPanelConfig(title, config))
    fitWidgetPanels(store, datasetId)
    onCreated()
  }
  return <ChartBuilderRoot open={false} tableName={widgetTableName(datasetId)} columns={(table?.columns || []).filter(column => column.name !== '__dekart_row')} chartTypes={chartTypes} onCreateChart={create}><ChartBuilderContent /></ChartBuilderRoot>
}

// Only the report title/source binding is hosted here; chart controls remain upstream SQLRooms.
function WidgetSettings ({ store, sources }) {
  const selected = useStore(store, state => state.blockSettings.runtime.selectedBlock)
  const panel = useStore(store, state => state.mosaicDashboard.config.dashboardsById[selected?.dashboardId]?.panels.find(panel => panel.id === selected?.id))
  const table = useStore(store, state => state.db.tables.find(table => table.table.schema === 'widgets' && table.table.table === `d_${selected?.dashboardId?.replaceAll('-', '_')}`))
  if (!panel) return null
  const api = store.getState().mosaicDashboard
  const close = () => store.getState().blockSettings.requestCloseSettingsPanel()
  const changeSource = datasetId => {
  // Moving one widget must not retarget every other widget from its original dataset.
    const targetTable = store.getState().db.tables.find(table => table.table.schema === 'widgets' && table.table.table === `d_${datasetId.replaceAll('-', '_')}`)
    const fieldExists = targetTable?.columns.some(column => column.name === panel.config.settings.field)
    const config = { ...panel.config, settings: { ...panel.config.settings, field: fieldExists ? panel.config.settings.field : '' } }
    api.ensureDashboard(datasetId, 'Widgets', 'grid')
    api.setSelectedTable(datasetId, `"memory"."widgets"."d_${datasetId.replaceAll('-', '_')}"`)
    const id = api.addPanel(datasetId, createMosaicDashboardChartPanelConfig(panel.title, config))
    api.removePanel(selected.dashboardId, selected.id)
    fitWidgetPanels(store, datasetId)
    store.getState().blockSettings.selectBlock({ ...selected, id, dashboardId: datasetId })
    store.getState().blockSettings.requestOpenSettingsPanel()
  }
  return (
    <div className={styles.settings} data-testid='widget-settings'>
      <Button variant='ghost' onClick={close}><ArrowLeft size={14} />Back to widgets</Button>
      <div className={styles.source}><label htmlFor='widget-title'>Title</label><input id='widget-title' value={panel.title || ''} onChange={event => api.updatePanel(selected.dashboardId, selected.id, { title: event.target.value })} /></div>
      <SourceSelector id='widget-settings-source' value={selected.dashboardId} sources={sources} onChange={changeSource} />
      <div className={styles.chartSettings}><MosaicChartSettingsPanel dataTable={table} config={panel.config} onChange={config => api.updatePanel(selected.dashboardId, selected.id, { config })} showViewSpecButton={false} /></div>
    </div>
  )
}
