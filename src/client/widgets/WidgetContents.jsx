import React, { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
// TODO: SQLRooms 0.29.0 internal modules are imported directly to reuse the upstream panel shell outside its grid, so dependency upgrades must revalidate these paths.
import { ChartBuilderRoot, ChartBuilderContent, MosaicChartSettingsPanel, createMosaicDashboardChartPanelConfig } from '@sqlrooms/mosaic'
import { MosaicDashboardContext } from '@sqlrooms/mosaic/dist/dashboard/MosaicDashboardContext'
import { MosaicDashboardPanel } from '@sqlrooms/mosaic/dist/dashboard/panel/MosaicDashboardPanel'
import { LayoutNodeProvider } from '@sqlrooms/layout'
import { LayoutRendererProvider } from '@sqlrooms/layout/dist/LayoutRendererContext'
import { DockingContext } from '@sqlrooms/layout/dist/docking/DockingContext'
import { LeafLayoutPanelDraggableProvider } from '@sqlrooms/layout/dist/node-renderers/leaf-node-renderer/LeafLayoutPanelDraggableContext'
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Button } from '@sqlrooms/ui'
import { Plus, ArrowLeft } from 'lucide-react'
import classnames from 'classnames'
import { chartTypes, fitWidgetPanels, widgetTableName } from './widgetStore'
import { useWidgetFilters } from './useWidgetFilters'
import { reorderWidgets, serializeWidgetsConfig } from './widgetsConfig'
import { WidgetSlotProvider } from './WidgetPanel'
import styles from './ReportWidgets.module.css'

const noLayoutDrag = { attributes: {}, listeners: {} }

// Publish one authored array move after a completed sortable drag.
function publishDrag (event, config, onReorder) {
  const draggedId = String(event.active.id)
  const targetId = event.over ? String(event.over.id) : draggedId
  const reordered = reorderWidgets(config, draggedId, targetId)
  // Unknown, cancelled, and same-position drops do not publish redundant edits.
  if (reordered !== config) onReorder(reordered)
}

// Keep pointer announcements complete because dnd-kit replaces, rather than merges, this contract.
function announceDragStart ({ active }) {
  return `Picked up ${active.data.current?.title || 'Widget'}`
}

function announceDragOver ({ active, over }) {
  const title = active.data.current?.title || 'Widget'
  if (!over) return `${title} is no longer over a widget position`
  const position = (over.data.current?.sortable?.index ?? 0) + 1
  return `${title} is over position ${position}`
}

// Describe the final persisted position through dnd-kit's live region.
function announceDrag (event) {
  // A drop outside the list leaves the saved order unchanged.
  if (!event.over) return 'Widget was not moved'
  const title = event.active.data.current?.title || 'Widget'
  const position = (event.over.data.current?.sortable?.index ?? 0) + 1
  const count = event.active.data.current?.count || 1
  return `Moved ${title} to position ${position} of ${count}`
}

function announceDragCancel ({ active }) {
  return `Cancelled moving ${active.data.current?.title || 'widget'}`
}

const pointerAnnouncements = { onDragStart: announceDragStart, onDragOver: announceDragOver, onDragEnd: announceDrag, onDragCancel: announceDragCancel }

// Keep one source-level filter error for every headless filter bridge.
function updateFilterError (setFilterErrors, sourceId, error) {
  setFilterErrors(previous => previous[sourceId] === error ? previous : { ...previous, [sourceId]: error })
}

// Keep query filter ownership alive when the flat list is hidden by another pane.
function FilterBridge ({ store, source, editing, pending, setFilterErrors }) {
  const { error } = useWidgetFilters(store, source.id, Boolean(source.physical), editing, source.pending || source.downloading || pending)
  useEffect(() => updateFilterError(setFilterErrors, source.id, error), [error, setFilterErrors, source.id])
  return null
}

// SQLRooms 0.29.0 panel internals are pinned here so the normal header can be reused without its grid.
function WidgetPanelShell ({ widget, draggable = noLayoutDrag }) {
  const node = { type: 'panel', id: `widget-panel-${widget.id}`, panel: { key: 'mosaic-dashboard-panel', meta: { panelId: widget.id } } }
  const rootLayout = { type: 'dock', id: `widget-dock-${widget.id}`, root: node }
  return (
    <MosaicDashboardContext.Provider value={{ dashboardId: widget.dataId }}>
      <LayoutRendererProvider rootLayout={rootLayout}>
        <DockingContext.Provider value={{ rootLayout }}>
          <LayoutNodeProvider containerType='leaf' node={node} path={[node.id]} parentContainerType='dock' parentContainerId={rootLayout.id}>
            <LeafLayoutPanelDraggableProvider value={draggable}>
              <MosaicDashboardPanel meta={{ panelId: widget.id }} />
            </LeafLayoutPanelDraggableProvider>
          </LayoutNodeProvider>
        </DockingContext.Provider>
      </LayoutRendererProvider>
    </MosaicDashboardContext.Provider>
  )
}

// Apply a previewed ID order without freezing newer widget titles or settings.
function configWithWidgetOrder (config, order) {
  const byID = new Map(config.widgets.map(widget => [widget.id, widget]))
  const widgets = order.flatMap(id => byID.has(id) ? [byID.get(id)] : [])
  const ordered = new Set(order)
  // Preserve widgets introduced after the keyboard move began.
  for (const widget of config.widgets) if (!ordered.has(widget.id)) widgets.push(widget)
  return { ...config, widgets }
}

// Move one ID in the keyboard preview while leaving authored widget data untouched.
function moveWidgetID (order, draggedId, targetId) {
  const from = order.indexOf(draggedId)
  const to = order.indexOf(targetId)
  // Invalid and same-position moves must not create a publishable preview.
  if (from < 0 || to < 0 || from === to) return order
  const next = [...order]
  const [dragged] = next.splice(from, 1)
  next.splice(to, 0, dragged)
  return next
}

// Suppress authored updates when a keyboard move returns to its original order.
function sameWidgetOrder (left, right) {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

// Restore canonical order and announce any abandoned keyboard move.
function cancelKeyboardDrag (keyboardDrag, config, setKeyboardDrag, setKeyboardAnnouncement) {
  // Callers may cancel defensively after another path already cleared the move.
  if (!keyboardDrag) return
  const title = config.widgets.find(widget => widget.id === keyboardDrag.id)?.title || 'widget'
  setKeyboardDrag(null)
  setKeyboardAnnouncement(`Cancelled moving ${title}`)
}

function handleSortableKeyDown (event, editing, widget, config, configFingerprint, keyboardDrag, setKeyboardDrag, onReorder, setKeyboardAnnouncement) {
  if (editing && keyboardDrag && event.code === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancelKeyboardDrag(keyboardDrag, config, setKeyboardDrag, setKeyboardAnnouncement)
    return
  }
  // SQLRooms owns nested controls; the flat list owns only keyboard events on its header handle.
  if (!editing || !event.target.closest('[data-layout-drag-handle="true"]') || event.target.closest('button, input, textarea, select, a, [data-layout-drag-cancel="true"]')) return
  if (event.code === 'Space') {
    event.preventDefault()
    event.stopPropagation()
    if (!keyboardDrag) {
      const order = config.widgets.map(item => item.id)
      setKeyboardDrag({ id: widget.id, order, originalOrder: order, configFingerprint })
      setKeyboardAnnouncement(`Picked up ${widget.title}`)
    } else if (keyboardDrag.id === widget.id) {
      const position = keyboardDrag.order.indexOf(widget.id) + 1
      if (!sameWidgetOrder(keyboardDrag.order, keyboardDrag.originalOrder)) onReorder(configWithWidgetOrder(config, keyboardDrag.order))
      setKeyboardDrag(null)
      setKeyboardAnnouncement(`Moved ${widget.title} to position ${position} of ${keyboardDrag.order.length}`)
    }
    return
  }
  if (keyboardDrag?.id !== widget.id) return
  if (event.code !== 'ArrowUp' && event.code !== 'ArrowDown') return
  event.preventDefault()
  event.stopPropagation()
  const index = keyboardDrag.order.indexOf(widget.id)
  const targetIndex = index + (event.code === 'ArrowUp' ? -1 : 1)
  const targetId = keyboardDrag.order[targetIndex]
  if (!targetId) return
  setKeyboardDrag({ ...keyboardDrag, order: moveWidgetID(keyboardDrag.order, widget.id, targetId) })
}

function handleSortableBlur (event, widget, config, keyboardDrag, setKeyboardDrag, setKeyboardAnnouncement) {
  if (keyboardDrag?.id !== widget.id) return
  const handle = event.currentTarget.querySelector('[data-layout-drag-handle="true"]')
  if (event.relatedTarget === handle) return
  cancelKeyboardDrag(keyboardDrag, config, setKeyboardDrag, setKeyboardAnnouncement)
}

// Bind the flat-list sorter to SQLRooms' existing header without its grid drag behavior.
function SortableWidget ({ store, widget, source, filterError, snapshot, onOpenData, editing, configRevision, count, dataReloadPending, config, configFingerprint, keyboardDrag, setKeyboardDrag, onReorder, setKeyboardAnnouncement }) {
  const itemRef = useRef(null)
  const failed = useStore(store, state => Boolean(state.failedPanels[widget.id]))
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id, disabled: !editing, data: { title: widget.title, count } })
  useEffect(() => {
    const handle = itemRef.current?.querySelector('[data-layout-drag-handle="true"]')
    if (!editing || !handle) return
    setActivatorNodeRef(handle)
    return () => setActivatorNodeRef(null)
  }, [editing, setActivatorNodeRef])
  // Bind dnd-kit directly where SQLRooms renders its header handle; relaying from the wrapper loses pointer activation semantics.
  const draggable = editing
    ? { attributes: { ...attributes, 'aria-label': `Move ${widget.title}`, 'aria-pressed': keyboardDrag?.id === widget.id }, listeners: keyboardDrag ? undefined : listeners }
    : noLayoutDrag
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`, transition } : { transition }
  const slot = { error: source?.error || filterError, pending: Boolean(source?.pending || source?.downloading || dataReloadPending), physical: Boolean(source?.physical), loadable: Boolean(source?.loadable), snapshot, onOpenData }
  return (
    <div
      ref={element => { itemRef.current = element; setNodeRef(element) }}
      style={style}
      className={classnames(styles.widgetItem, widget.type === 'number' ? styles.numberWidget : styles.chartWidget, { [styles.failedWidget]: failed, [styles.draggingWidget]: isDragging, [styles.draggableWidget]: editing })}
      data-testid='widget-item'
      data-widget-id={widget.id}
      onKeyDown={event => handleSortableKeyDown(event, editing, widget, config, configFingerprint, keyboardDrag, setKeyboardDrag, onReorder, setKeyboardAnnouncement)}
      onBlur={event => handleSortableBlur(event, widget, config, keyboardDrag, setKeyboardDrag, setKeyboardAnnouncement)}
    >
      <WidgetSlotProvider value={slot}><WidgetPanelShell key={`${configRevision}:${widget.id}`} widget={widget} draggable={draggable} /></WidgetSlotProvider>
    </div>
  )
}

// Dataset bindings remain separate for filtering; the report presents them in one scroll area.
export default function WidgetContents ({ store, snapshot, sources, loading, dataReloadPending, placeholderCount, onOpenData, editing, configRevision, persistedConfig, onReorder }) {
  const [builder, setBuilder] = useState(false)
  const [selectedSource, setSelectedSource] = useState('')
  const [filterErrors, setFilterErrors] = useState({})
  const [keyboardDrag, setKeyboardDrag] = useState(null)
  const [keyboardAnnouncement, setKeyboardAnnouncement] = useState('')
  const dashboards = useStore(store, state => state.mosaicDashboard.config.dashboardsById)
  const settingsOpen = useStore(store, state => state.blockSettings.runtime.isSettingsPanelOpen)
  const available = sources.filter(source => source.physical && !source.pending && !source.error)
  const datasetId = available.find(source => source.id === selectedSource)?.id || available[0]?.id || ''
  const config = serializeWidgetsConfig({ dashboardsById: dashboards }, persistedConfig)
  const configFingerprint = JSON.stringify(config)
  useEffect(() => {
    // Live edits, deletion, and view-mode transitions cancel instead of publishing a stale preview.
    if (keyboardDrag && (!editing || keyboardDrag.configFingerprint !== configFingerprint || !config.widgets.some(widget => widget.id === keyboardDrag.id))) cancelKeyboardDrag(keyboardDrag, config, setKeyboardDrag, setKeyboardAnnouncement)
  }, [configFingerprint, editing, keyboardDrag, config])
  // Preview only the ID order; always render and eventually publish the latest authored widget values.
  const displayedConfig = keyboardDrag ? configWithWidgetOrder(config, keyboardDrag.order) : config
  const hasWidgets = displayedConfig.widgets.length > 0
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  return (
    <>
      {sources.map(source => <FilterBridge key={source.id} store={store} source={source} editing={editing} pending={dataReloadPending} setFilterErrors={setFilterErrors} />)}
      {!snapshot && !builder && !settingsOpen && <div className={styles.actions}><h2>Charts</h2><Button aria-label='Add chart' disabled={!datasetId} onClick={() => setBuilder(true)}><Plus size={15} />Add chart</Button></div>}
      <div className={classnames(styles.reportCharts, { [styles.hidden]: builder || settingsOpen })}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={event => publishDrag(event, config, onReorder)} accessibility={{ announcements: pointerAnnouncements }}>
          <SortableContext items={displayedConfig.widgets.map(widget => widget.id)} strategy={verticalListSortingStrategy}>
            {displayedConfig.widgets.map(widget => <SortableWidget key={`${configRevision}:${widget.id}`} store={store} widget={widget} source={sources.find(source => source.id === widget.dataId)} filterError={filterErrors[widget.dataId]} snapshot={snapshot} onOpenData={onOpenData} editing={editing} configRevision={configRevision} count={displayedConfig.widgets.length} dataReloadPending={dataReloadPending} config={config} configFingerprint={configFingerprint} keyboardDrag={keyboardDrag} setKeyboardDrag={setKeyboardDrag} onReorder={onReorder} setKeyboardAnnouncement={setKeyboardAnnouncement} />)}
          </SortableContext>
        </DndContext>
        <div className={styles.announcer} role='status' aria-live='assertive'>{keyboardAnnouncement}</div>
        {!hasWidgets && loading && <ChartStubs count={placeholderCount} />}
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

// Only the report title/source binding is hosted here; chart controls remain upstream SQLRooms.
function WidgetSettings ({ store, sources }) {
  const selected = useStore(store, state => state.blockSettings.runtime.selectedBlock)
  const panel = useStore(store, state => state.mosaicDashboard.config.dashboardsById[selected?.dashboardId]?.panels.find(panel => panel.id === selected?.id))
  const table = useStore(store, state => state.db.tables.find(table => table.table.schema === 'widgets' && table.table.table === `d_${selected?.dashboardId?.replaceAll('-', '_')}`))
  if (!panel) return null
  const api = store.getState().mosaicDashboard
  const sourceLabel = sources.find(source => source.id === selected.dashboardId)?.label || selected.dashboardId
  return (
    <div className={styles.settings} data-testid='widget-settings'>
      <Button variant='ghost' onClick={() => store.getState().blockSettings.requestCloseSettingsPanel()}><ArrowLeft size={14} />Back to charts</Button>
      <div className={styles.source}><label htmlFor='widget-title'>Title</label><input id='widget-title' value={panel.title || ''} onChange={event => api.updatePanel(selected.dashboardId, selected.id, { title: event.target.value })} /></div>
      <div className={styles.source}><span>Dataset</span><strong data-testid='widget-settings-dataset'>{sourceLabel}</strong></div>
      <div className={styles.chartSettings}><MosaicChartSettingsPanel dataTable={table} config={panel.config} onChange={config => api.updatePanel(selected.dashboardId, selected.id, { config })} showViewSpecButton={false} /></div>
    </div>
  )
}
