import { Layers, ChartNoAxesColumn, ChevronLeft, ChevronRight } from 'lucide-react'
import classnames from 'classnames'
import styles from './MapPaneHeader.module.css'

// One persistent anchor for both editors, including when their bodies are collapsed.
export default function MapPaneHeader ({ selected, expanded, canEdit, filterCount, onSelect, onToggle }) {
  const tabs = canEdit ? ['map', 'widgets'] : ['widgets']
  const navigate = event => {
    const direction = { ArrowRight: 1, ArrowLeft: -1, Home: -tabs.length, End: tabs.length }[event.key]
    if (direction === undefined) return
    event.preventDefault()
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.indexOf(selected) + direction + tabs.length) % tabs.length
    onSelect(tabs[index])
    event.currentTarget.querySelectorAll('[role="tab"]')[index].focus()
  }
  return (
    <div className={classnames(styles.header, { [styles.collapsed]: !expanded })} aria-label='Map panels'>
      <div className={styles.tabs} role='tablist' aria-label='Control pane' onKeyDown={navigate}>
        {tabs.map(panel => (
          <button key={panel} role='tab' data-testid={panel === 'map' ? 'map-settings-tab' : 'widgets-tab'} aria-selected={selected === panel} aria-expanded={selected === panel && expanded} tabIndex={selected === panel ? 0 : -1} onClick={() => onSelect(panel)}>
            {panel === 'map' ? <Layers size={15} /> : <ChartNoAxesColumn size={15} />}
            {panel === 'map' ? 'Map settings' : 'Widgets'}
            {panel === 'widgets' && filterCount > 0 && <span className={styles.badge} title={`${filterCount} active widget filters`}>{filterCount}<span className={styles.srOnly}> {filterCount === 1 ? 'filter' : 'filters'}</span></span>}
          </button>
        ))}
      </div>
      <button className={styles.collapse} aria-label={expanded ? 'Collapse control pane' : 'Expand control pane'} aria-expanded={expanded} onClick={onToggle}>
        {expanded ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
      </button>
    </div>
  )
}
