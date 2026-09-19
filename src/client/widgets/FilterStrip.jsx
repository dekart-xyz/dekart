// REVIEW: Present Kepler-owned filters as a shared widget-pane strip with edit, add, and render-aware removal controls.
import React, { useLayoutEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { removeFilter } from '@kepler.gl/actions'
import { Filter, Plus, X, ChevronDown } from 'lucide-react'
import styles from './FilterStrip.module.css'

// One shared filter surface; Kepler remains the owner of filter values and persistence.
export default function FilterStrip ({ visible, editing, onEdit, onApply }) {
  const dispatch = useDispatch()
  const filters = useSelector(state => state.keplerGl.kepler?.visState.filters || [])
  const datasets = useSelector(state => state.keplerGl.kepler?.visState.datasets || {})
  const ref = useRef(null)
  useLayoutEffect(() => {
    const element = ref.current
    const parent = element.parentElement
    const resize = () => parent.style.setProperty('--filter-strip-height', `${element.getBoundingClientRect().height}px`)
    const observer = new window.ResizeObserver(resize)
    observer.observe(element)
    resize()
    return () => { observer.disconnect(); parent.style.removeProperty('--filter-strip-height') }
  }, [])
  const entries = filters.map((filter, index) => ({ filter, index })).filter(({ filter }) => filter.name?.some(Boolean))
  const label = filter => filter.name.filter(Boolean).join(', ').replaceAll('_', ' ')
  const description = filter => `${filter.dataId.map(id => datasets[id]?.label || id).join(', ')} · ${JSON.stringify(filter.value)}`
  const chip = ({ filter, index }) => (
    <span className={styles.chip} key={filter.id}>
      <button className={styles.name} title={description(filter)} onClick={() => onEdit(index)} disabled={!editing}>{label(filter)}</button>
      <button className={styles.remove} aria-label={`Remove ${label(filter)} filter`} onClick={() => onApply(() => dispatch(removeFilter(index)))}><X size={11} /></button>
    </span>
  )
  return (
    <div ref={ref} className={styles.strip} style={{ display: visible ? undefined : 'none' }} data-testid='filter-strip' aria-label='Map and chart filters'>
      <Filter size={13} className={styles.icon} />
      {entries.length > 0 && (
        <>
          <div className={styles.chips} data-count={entries.length}>
            {(entries.length > 4 ? entries.slice(0, 2) : entries).map(chip)}
            {entries.length > 4 && <details className={styles.overflow}><summary>+{entries.length - 2} more<ChevronDown size={11} /></summary><div className={styles.menu}>{entries.slice(2).map(chip)}</div></details>}
            {editing && <button className={styles.add} aria-label='Add filter' onClick={() => onEdit()}><Plus size={13} /></button>}
          </div>
          <button className={styles.clear} onClick={() => onApply(() => filters.map((_, index) => index).reverse().forEach(index => dispatch(removeFilter(index))))}>Clear all</button>
        </>
      )}
      {!entries.length && <><span className={styles.empty}>No filters</span>{editing && <button className={styles.clear} onClick={() => onEdit()}><Plus size={12} />Add filter</button>}</>}
    </div>
  )
}
