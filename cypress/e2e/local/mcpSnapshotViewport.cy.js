/* eslint-disable no-undef */

const apiOrigin = Cypress.env('DEKART_E2E_API_URL')
const apiBase = `${apiOrigin}/api/v1`

function getReduxStoreFromWindow (win) {
  const rootNode = win.document.getElementById('root')
  const reactRootKey = Object.keys(rootNode).find(key => key.startsWith('__reactContainer$') || key.startsWith('__reactFiber$'))
  const reactRoot = rootNode[reactRootKey]
  const initialFiber = reactRoot.current ? reactRoot.current : (reactRoot.stateNode?.current || reactRoot)
  const queue = [initialFiber]
  while (queue.length > 0) {
    const fiber = queue.shift()
    if (fiber?.memoizedProps?.store?.getState) {
      return fiber.memoizedProps.store
    }
    if (fiber?.child) queue.push(fiber.child)
    if (fiber?.sibling) queue.push(fiber.sibling)
  }
  throw new Error('Redux store not found')
}

function getDeviceToken () {
  return cy.request('POST', `${apiBase}/device`, {
    device_name: 'cypress-local-mcp-snapshot'
  }).then((startResp) => {
    expect(startResp.status, 'device start status').to.eq(200)
    const deviceId = startResp.body.device_id
    const authUrl = startResp.body.auth_url
    expect(deviceId, 'device_id').to.be.a('string').and.not.eq('')
    expect(authUrl, 'auth_url').to.be.a('string').and.include('/device/authorize')

    cy.setDevClaimsEmail('test@gmail.com')
    cy.visit(authUrl)
    cy.contains('button', 'Authorize', { timeout: 20000 }).click()
    cy.contains('Device authorized', { timeout: 20000 }).should('be.visible')

    return cy.request('POST', `${apiBase}/device/token`, { device_id: deviceId }).then((tokenResp) => {
      expect(tokenResp.status, 'device token status').to.eq(200)
      expect(tokenResp.body.status, 'device token response status').to.eq('authorized')
      expect(tokenResp.body.token, 'device token').to.be.a('string').and.not.eq('')
      return tokenResp.body.token
    })
  })
}

function callMCP (token, name, args = {}) {
  return cy.request({
    method: 'POST',
    url: `${apiBase}/mcp/call`,
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: {
      name,
      arguments: args
    },
    failOnStatusCode: false
  }).then((response) => {
    expect(response.status, `${name} http status`).to.eq(200)
    expect(response.body).to.have.property('result')
    return response.body.result
  })
}

function readId (obj, candidates) {
  for (const key of candidates) {
    const value = obj?.[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return ''
}

function buildPointLayer (datasetId) {
  return {
    id: 'snapshot-ready-points',
    type: 'point',
    config: {
      dataId: datasetId,
      columnMode: 'points',
      label: 'missed-stops.csv',
      color: [231, 159, 213],
      highlightColor: [252, 242, 26, 255],
      columns: { lat: 'latitude', lng: 'longitude' },
      isVisible: true,
      visConfig: {
        radius: 18,
        fixedRadius: false,
        opacity: 0.8,
        outline: true,
        thickness: 3,
        strokeColor: [255, 255, 255],
        colorRange: {
          name: 'Global Warming',
          type: 'sequential',
          category: 'Uber',
          colors: ['#4C0035', '#880030', '#B72F15', '#D6610A', '#EF9100', '#FFC300']
        },
        strokeColorRange: {
          name: 'Global Warming',
          type: 'sequential',
          category: 'Uber',
          colors: ['#4C0035', '#880030', '#B72F15', '#D6610A', '#EF9100', '#FFC300']
        },
        radiusRange: [0, 50],
        filled: true,
        billboard: false,
        allowHover: true,
        showNeighborOnHover: false,
        showHighlightColor: true
      },
      hidden: false,
      textLabel: [{
        field: null,
        color: [255, 255, 255],
        size: 18,
        offset: [0, 0],
        anchor: 'start',
        alignment: 'center',
        outlineWidth: 0,
        outlineColor: [255, 0, 0, 255],
        background: false,
        backgroundColor: [0, 0, 200, 255]
      }]
    },
    visualChannels: {
      colorField: null,
      colorScale: 'quantile',
      strokeColorField: null,
      strokeColorScale: 'quantile',
      sizeField: null,
      sizeScale: 'linear'
    }
  }
}

function buildMapConfig (mapState, datasetId, filters = []) {
  const layers = datasetId ? [buildPointLayer(datasetId)] : []
  const fieldsToShow = datasetId
    ? {
        [datasetId]: [
          { name: 'primary_type', format: null },
          { name: 'district', format: null },
          { name: 'date', format: null }
        ]
      }
    : {}
  return JSON.stringify({
    version: 'v1',
    config: {
      visState: {
        filters,
        layers,
        effects: [],
        interactionConfig: {
          tooltip: {
            fieldsToShow,
            compareMode: false,
            compareType: 'absolute',
            enabled: true
          },
          brush: { size: 0.5, enabled: false },
          geocoder: { enabled: false },
          coordinate: { enabled: false }
        },
        layerBlending: 'normal',
        overlayBlending: 'normal',
        splitMaps: [],
        animationConfig: { currentTime: null, speed: 1 },
        editor: { features: [], visible: true }
      },
      mapState: {
        bearing: 0,
        dragRotate: false,
        latitude: mapState.lat,
        longitude: mapState.lon,
        pitch: 0,
        zoom: mapState.zoom,
        isSplit: false,
        isViewportSynced: true,
        isZoomLocked: false,
        splitMapViewports: []
      },
      mapStyle: {
        styleType: 'dark',
        topLayerGroups: {},
        visibleLayerGroups: {
          label: true,
          road: true,
          border: false,
          building: true,
          water: true,
          land: true,
          '3d building': false
        },
        threeDBuildingColor: [9.665468314072013, 17.18305478057247, 31.1442867897876],
        backgroundColor: [0, 0, 0],
        mapStyles: {}
      },
      uiState: { mapControls: { mapLegend: { active: false } } }
    }
  })
}

function buildMissedStopsCsv () {
  const lines = ['primary_type,district,latitude,longitude,date']
  for (let index = 0; index < 8000; index += 1) {
    const lat = 33.65 + ((index % 100) * 0.006)
    const lon = -118.45 + (Math.floor(index / 100) * 0.006)
    lines.push(`missed_stop,DLA4,${lat.toFixed(6)},${lon.toFixed(6)},2026-06-30`)
  }
  return `${lines.join('\n')}\n`
}

function uploadMissedStopsCsv (token, fileId) {
  return cy.wrap(buildMissedStopsCsv(), { log: false }).then((fileBody) => {
    const totalSize = Cypress.Buffer.byteLength(fileBody)
    return callMCP(token, 'start_file_upload_session', {
      file_id: fileId,
      name: 'missed-stops.csv',
      mime_type: 'text/csv',
      total_size: totalSize
    }).then((session) => {
      const uploadSessionId = session.upload_session_id || session.uploadSessionId
      const uploadPartEndpoint = session.upload_part_endpoint || session.uploadPartEndpoint
      expect(uploadSessionId, 'upload_session_id').to.be.a('string').and.not.eq('')
      expect(uploadPartEndpoint, 'upload_part_endpoint').to.be.a('string').and.not.eq('')

      return cy.request({
        method: 'PUT',
        url: `${apiOrigin}${uploadPartEndpoint.replace('{part_number}', '1')}?part_size=${totalSize}`,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/csv' },
        body: fileBody
      }).then((partResp) => {
        expect(partResp.status, 'upload part status').to.eq(200)
        return callMCP(token, 'complete_file_upload_session', {
          file_id: fileId,
          upload_session_id: uploadSessionId,
          parts: [partResp.body],
          total_size: totalSize
        })
      })
    })
  })
}

function expectSnapshotMapState (expected) {
  cy.window({ timeout: 60000 }).should((win) => {
    const store = getReduxStoreFromWindow(win)
    const mapState = store.getState().keplerGl.kepler.mapState
    expect(mapState.latitude, 'snapshot latitude').to.be.closeTo(expected.lat, 0.000001)
    expect(mapState.longitude, 'snapshot longitude').to.be.closeTo(expected.lon, 0.000001)
    expect(mapState.zoom, 'snapshot zoom').to.be.closeTo(expected.zoom, 0.000001)
  })
}

function expectSnapshotReadyToken () {
  cy.window({ timeout: 60000 }).should((win) => {
    expect(win.__dekartSnapshotReadyToken || '', 'snapshot ready token').to.be.a('string').and.not.eq('')
  })
}

function delayDatasetSources () {
  cy.intercept('GET', '**/api/v1/dataset-source/**', (req) => {
    req.continue((res) => {
      res.setDelay(3000)
    })
  })
}

// sampleChartsWhenReady records the chart DOM exactly once, at the first moment the ready token appears.
function sampleChartsWhenReady (win) {
  win.__dekartChartsAtReady = null
  const timer = win.setInterval(() => {
    if (!win.__dekartSnapshotReadyToken || win.__dekartChartsAtReady) return
    win.__dekartChartsAtReady = {
      stubs: win.document.querySelectorAll('[data-testid="chart-stub"]').length,
      busy: win.document.querySelectorAll('[aria-label="Report charts"] [aria-busy="true"]').length,
      value: win.document.querySelector('[data-testid="number-value"]')?.textContent || ''
    }
    win.clearInterval(timer)
  }, 10)
}

const countPanel = { id: 'stop-count', type: 'vgplot', title: 'Missed stops', config: { chartType: 'number', settings: { operation: 'count' } } }

// buildWidgetsConfig keys the authored panels to the report dataset that holds the rows.
function buildWidgetsConfig (datasetId, panels = [countPanel]) {
  return JSON.stringify({
    version: 1,
    widgets: panels.map(panel => ({ id: panel.id, dataId: datasetId, type: panel.config.chartType, title: panel.title, settings: panel.config.settings }))
  })
}

// createChartReport uploads the rows, saves a map, and authors the given charts through MCP.
function createChartReport (token, panels, filters) {
  return callMCP(token, 'create_report').then((reportResult) => {
    const reportId = readId(reportResult, ['report_id', 'reportId', 'id']) ||
      readId(reportResult?.report, ['id'])
    return callMCP(token, 'create_dataset', { report_id: reportId }).then((datasetResult) => {
      const datasetId = readId(datasetResult, ['dataset_id', 'datasetId', 'id']) ||
        readId(datasetResult?.dataset, ['id'])
      return callMCP(token, 'create_file', { dataset_id: datasetId }).then((fileResult) => {
        const fileId = readId(fileResult, ['file_id', 'fileId', 'id']) ||
          readId(fileResult?.file, ['id'])
        return uploadMissedStopsCsv(token, fileId)
          .then(() => callMCP(token, 'update_report_map_config', {
            report_id: reportId,
            map_config: buildMapConfig({ lat: 33.95, lon: -118.15, zoom: 9 }, datasetId, filters?.(datasetId))
          }))
          .then(() => callMCP(token, 'update_report_widgets_config', {
            report_id: reportId,
            widgets_config: buildWidgetsConfig(datasetId, panels)
          }))
          .then(() => reportId)
      })
    })
  })
}

describe('local MCP snapshot viewport params', () => {
  it('renders a sensitive report with transient zoom, lat, and lon overrides', () => {
    const override = { lat: 33.95, lon: -118.05, zoom: 8.2 }
    const saved = { lat: 37.7749, lon: -122.4194, zoom: 9 }

    getDeviceToken().then((token) => {
      callMCP(token, 'create_report').then((reportResult) => {
        const reportId = readId(reportResult, ['report_id', 'reportId', 'id']) ||
          readId(reportResult?.report, ['id'])
        expect(reportId, 'report_id').to.be.a('string').and.not.eq('')

        return callMCP(token, 'create_dataset', { report_id: reportId }).then((datasetResult) => {
          const datasetId = readId(datasetResult, ['dataset_id', 'datasetId', 'id']) ||
            readId(datasetResult?.dataset, ['id'])
          expect(datasetId, 'dataset_id').to.be.a('string').and.not.eq('')

          return callMCP(token, 'create_file', { dataset_id: datasetId }).then((fileResult) => {
            const fileId = readId(fileResult, ['file_id', 'fileId', 'id']) ||
              readId(fileResult?.file, ['id'])
            expect(fileId, 'file_id').to.be.a('string').and.not.eq('')

            return uploadMissedStopsCsv(token, fileId).then(() => {
              return callMCP(token, 'update_report_map_config', {
                report_id: reportId,
                map_config: buildMapConfig(saved, datasetId)
              }).then(() => reportId)
            })
          })
        })
      }).then((reportId) => {
        return callMCP(token, 'create_report_snapshot', {
          report_id: reportId,
          zoom: override.zoom,
          lat: override.lat,
          lon: override.lon
        }).then(snapshot => ({ reportId, snapshot }))
      }).then(({ reportId, snapshot }) => {
        const renderUrl = snapshot.snapshot_render_url || snapshot.snapshotRenderUrl
        expect(renderUrl, 'snapshot_render_url').to.be.a('string')
        expect(renderUrl).to.include(`zoom=${override.zoom}`)
        expect(renderUrl).to.include(`lat=${override.lat}`)
        expect(renderUrl).to.include(`lon=${override.lon}`)

        // Seed a sensitive passthrough dataset after token issuance without live Google credentials.
        const connectionId = crypto.randomUUID()
        const datasetId = crypto.randomUUID()
        const queryId = crypto.randomUUID()
        cy.exec(`sqlite3 "\${DEKART_SQLITE_DB_PATH:-data/dekart.db}" "INSERT INTO connections (id,connection_name,bigquery_project_id,connection_type) VALUES ('${connectionId}','Snapshot BigQuery','project',1); INSERT INTO queries (id,query_text,query_source_id,query_source,execution_engine) VALUES ('${queryId}','SELECT 1','',1,1); INSERT INTO datasets (report_id,id,query_id,connection_id,name) VALUES ('${reportId}','${datasetId}','${queryId}','${connectionId}','Sensitive');"`)
        delayDatasetSources()
        cy.visit(renderUrl)
        cy.contains('Untitled Report', { timeout: 60000 }).should('not.exist')
        expectSnapshotMapState(override)
        expectSnapshotReadyToken()
      })
    })
  })

  it('renders the charts pane in a snapshot only when include_widgets is requested', () => {
    getDeviceToken().then((token) => {
      createChartReport(token).then((reportId) => {
        // Default stays map-only: no charts pane and no request parameter.
        callMCP(token, 'create_report_snapshot', { report_id: reportId }).then((snapshot) => {
          const renderUrl = snapshot.snapshot_render_url || snapshot.snapshotRenderUrl
          expect(renderUrl, 'default render url').to.not.include('include_widgets')
          cy.visit(renderUrl)
          expectSnapshotReadyToken()
          cy.get('[data-testid="widget-item"]').should('not.exist')
        })

        return callMCP(token, 'create_report_snapshot', { report_id: reportId, include_widgets: true })
      }).then((snapshot) => {
        const renderUrl = snapshot.snapshot_render_url || snapshot.snapshotRenderUrl
        expect(renderUrl, 'include_widgets render url').to.include('include_widgets=true')
        // Delay the source fetch so readiness has to survive a slow chart load.
        delayDatasetSources()
        cy.visit(renderUrl, { onBeforeLoad: sampleChartsWhenReady })
        expectSnapshotReadyToken()
        // Readiness must wait for the charts, so the capture never shows stubs or a loading value.
        cy.window().its('__dekartChartsAtReady').should('deep.eq', { stubs: 0, busy: 0, value: '8,000' })
        cy.get('[data-testid="widget-item"]').should('exist')
        cy.contains('button', 'Add chart').should('not.exist')
      })
    })
  })

  it('captures charts only after a saved map filter reaches them', () => {
    // Half of every 100 generated rows fall inside this latitude band.
    const latitudeBand = datasetId => [{ id: 'latitude-band', dataId: [datasetId], name: ['latitude'], type: 'range', value: [33.649, 33.9445], enabled: true }]
    getDeviceToken().then((token) => {
      createChartReport(token, undefined, latitudeBand)
        .then((reportId) => callMCP(token, 'create_report_snapshot', { report_id: reportId, include_widgets: true }))
        .then((snapshot) => {
          cy.visit(snapshot.snapshot_render_url || snapshot.snapshotRenderUrl, { onBeforeLoad: sampleChartsWhenReady })
          expectSnapshotReadyToken()
          cy.window().its('__dekartChartsAtReady').should('deep.eq', { stubs: 0, busy: 0, value: '4,000' })
        })
    })
  })

  it('settles an include_widgets snapshot whose chart cannot load its column', () => {
    // An agent can author a chart on a column the dataset does not have; the server only checks the schema.
    const missingColumn = { id: 'no-such-column', type: 'vgplot', title: 'Missing column', config: { chartType: 'count-plot', settings: { field: 'no_such_column' } } }
    getDeviceToken().then((token) => {
      createChartReport(token, [countPanel, missingColumn])
        .then((reportId) => callMCP(token, 'create_report_snapshot', { report_id: reportId, include_widgets: true }))
        .then((snapshot) => {
          cy.visit(snapshot.snapshot_render_url || snapshot.snapshotRenderUrl, { onBeforeLoad: sampleChartsWhenReady })
          expectSnapshotReadyToken()
          cy.window().its('__dekartChartsAtReady').should('deep.eq', { stubs: 0, busy: 0, value: '8,000' })
          cy.get('[aria-label="Report charts"]').contains('Missed stops').should('be.visible')
          cy.get('[aria-label="Report charts"]').contains('Missing column').should('be.visible')
          cy.get('[aria-label="Report charts"]').contains('This chart couldn\'t load.').should('be.visible')
          cy.get('[aria-label="Report charts"]').should('not.contain.text', 'no_such_column')
        })
    })
  })

  // expectSnapshotsSettle authors charts on a dataset prepared by fillSlot, then requires both renders to settle.
  function expectSnapshotsSettle (fillSlot, charts) {
    getDeviceToken().then((token) => {
      callMCP(token, 'create_report').then((reportResult) => {
        const reportId = readId(reportResult, ['report_id', 'reportId', 'id']) ||
          readId(reportResult?.report, ['id'])
        return callMCP(token, 'create_dataset', { report_id: reportId }).then((datasetResult) => {
          const datasetId = readId(datasetResult, ['dataset_id', 'datasetId', 'id']) ||
            readId(datasetResult?.dataset, ['id'])
          return fillSlot(token, datasetId)
            .then(() => callMCP(token, 'update_report_widgets_config', { report_id: reportId, widgets_config: buildWidgetsConfig(datasetId) }))
            .then(() => reportId)
        })
      }).then((reportId) => {
        // The map-only snapshot must not wait for data that will never arrive in this render.
        callMCP(token, 'create_report_snapshot', { report_id: reportId }).then((snapshot) => {
          cy.visit(snapshot.snapshot_render_url || snapshot.snapshotRenderUrl)
          expectSnapshotReadyToken()
        })
        return callMCP(token, 'create_report_snapshot', { report_id: reportId, include_widgets: true })
      }).then((snapshot) => {
        cy.visit(snapshot.snapshot_render_url || snapshot.snapshotRenderUrl, { onBeforeLoad: sampleChartsWhenReady })
        expectSnapshotReadyToken()
        cy.window().its('__dekartChartsAtReady').should('deep.eq', { stubs: 0, busy: 0, value: '' })
        cy.contains('[aria-label="Report charts"]', charts)
      })
    })
  }

  // An agent can author charts on a dataset slot before any query or file fills it.
  it('settles snapshots of a report whose chart dataset has no data yet', () => {
    expectSnapshotsSettle(() => cy.wrap(null), 'No data to chart yet.')
  })

  // A snapshot does not run queries, so a query that was never run never adds data.
  it('settles snapshots of a report whose chart query was never run', () => {
    expectSnapshotsSettle((token, datasetId) => callMCP(token, 'create_query', { dataset_id: datasetId, execution_engine: 'QUERY_EXECUTION_ENGINE_DUCKDB' }), 'No data to chart yet.')
  })

  // A DuckDB query that fails in the browser is an end state for both the map and the charts.
  it('settles snapshots of a report whose chart query fails in the browser', () => {
    expectSnapshotsSettle((token, datasetId) => callMCP(token, 'create_query', { dataset_id: datasetId, execution_engine: 'QUERY_EXECUTION_ENGINE_DUCKDB' })
      .then((queryResult) => {
        const queryId = readId(queryResult, ['query_id', 'queryId'])
        return callMCP(token, 'update_query', { query_id: queryId, query_text: "SELECT error('snapshot boom') AS value" })
          .then(() => callMCP(token, 'run_query', { query_id: queryId, accept_duckdb_execution: true }))
      }), 'snapshot boom')
  })
})
