import React, { useEffect, useMemo } from 'react'
import { useSelector } from 'react-redux'
import { IntlProvider } from 'react-intl'
import { ThemeProvider } from 'styled-components'
import { Search } from 'lucide-react'
import { z } from 'zod'
import { ItemSelector } from '@kepler.gl/components'
import { messages } from '@kepler.gl/localization'
import { theme } from '@kepler.gl/styles'
import { getOrdinalDomain } from '@kepler.gl/utils'
import { clausePoints } from '@uwdata/mosaic-core'
import { column } from '@uwdata/mosaic-sql'
import { ColumnSelector, Field, useStoreWithMosaicDashboard } from '@sqlrooms/mosaic'
import { useMosaicChartSettingsContext } from '@sqlrooms/mosaic/dist/charts/chart-settings/MosaicChartSettingsContext'
import { WidgetStub } from './WidgetPanel'
import { widgetFilterId } from './widgetStore'

const settingsSchema = z.object({
  field: z.string().min(1),
  crossFilter: z.boolean().optional()
})
const searchableFieldTypes = new Set(['string', 'h3', 'date'])

export const searchChartType = {
  id: 'search',
  label: 'Search',
  description: 'Find and filter values in a text column.',
  aiDescription: 'Search a categorical column and filter the map by selected values.',
  icon: Search,
  schema: settingsSchema,
  settingsComponent: SearchSettings,
  renderer: SearchWidget,
  buildTitle: settings => settings.field?.replaceAll('_', ' ') || 'Search'
}

// Match Category's text-only field picker.
export function SearchSettings () {
  const { config, onChangeConfig } = useMosaicChartSettingsContext('search')
  return (
    <Field label='Field' required>
      <ColumnSelector.Categorical
        value={config.settings.field}
        onChange={value => onChangeConfig('field', value)}
      />
    </Field>
  )
}

// A class retains identity when SQLRooms registers panel clients inside Immer.
export class SearchInteractor {
  constructor (selection, field) {
    this.selection = selection
    this.field = field
    this.value = null
  }

  clause (value) {
    return clausePoints([column(this.field)], value, { source: this })
  }

  reset () {
    this.value = null
  }
}

// Search publishes the same categorical selection clause as a Category click.
export default function SearchWidget ({ config, dataTable, params, runtimeIssueContext, runtimeIssueReporter }) {
  const [dashboardId, panelId] = useMemo(() => {
    const match = /^dashboard:(.*):panel:(.*)$/.exec(runtimeIssueContext.panelId)
    return [match?.[1], match?.[2]]
  }, [runtimeIssueContext.panelId])
  const dataset = useSelector(state => state.keplerGl.kepler?.visState.datasets?.[dashboardId])
  const filter = useSelector(state => state.keplerGl.kepler?.visState.filters?.find(filter => filter.id === widgetFilterId(panelId)))
  const field = dataset?.fields.find(field => field.name === config.settings.field)
  const missingField = !dataTable.columns.some(column => column.name === config.settings.field)
  const invalidField = Boolean(field && !searchableFieldTypes.has(field.type))
  const selection = params?.get('brush')
  const registerPanelClient = useStoreWithMosaicDashboard(state => state.mosaicDashboard.registerPanelClient)
  const unregisterPanelClient = useStoreWithMosaicDashboard(state => state.mosaicDashboard.unregisterPanelClient)
  const markPanelPainted = useStoreWithMosaicDashboard(state => state.markPanelPainted)
  const client = useMemo(() => new SearchInteractor(selection, config.settings.field), [selection, config.settings.field])
  // Kepler replaces the dataset wrapper on filter changes; the data container stays stable.
  const options = useMemo(() => {
    const sourceField = dataset?.fields.find(field => field.name === config.settings.field)
    return sourceField && dataset.dataContainer
      ? getOrdinalDomain(dataset.dataContainer, sourceField.valueAccessor)
      : null
  }, [dataset?.dataContainer, config.settings.field])
  const selected = filter?.enabled !== false ? filter?.value || [] : []

  useEffect(() => {
    // Invalid fields must fail before a panel client can publish a map filter.
    if (missingField || invalidField) runtimeIssueReporter.reportIssue({ message: 'Chart failed' })
  }, [missingField, invalidField, runtimeIssueReporter])
  useEffect(() => {
    if (!options || missingField || invalidField) return
    registerPanelClient(dashboardId, panelId, client)
    return () => unregisterPanelClient(dashboardId, panelId, client)
  }, [options, missingField, invalidField, dashboardId, panelId, client, registerPanelClient, unregisterPanelClient])
  useEffect(() => {
    if (options && !missingField && !invalidField) markPanelPainted(panelId)
  }, [options, missingField, invalidField, markPanelPainted, panelId])

  if (missingField || invalidField) return null
  if (!field || !options) return <WidgetStub />

  return (
    <div data-testid='search-widget'>
      <IntlProvider locale='en' messages={messages.en}>
        <ThemeProvider theme={theme}>
          <ItemSelector
            options={options}
            selectedItems={selected}
            onChange={values => {
              client.value = values?.length ? values.map(value => [value]) : null
              selection.update(client.clause(client.value))
            }}
          />
        </ThemeProvider>
      </IntlProvider>
    </div>
  )
}
