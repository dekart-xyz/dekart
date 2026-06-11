/* eslint-disable no-undef, no-unused-expressions */

describe('local file upload report persistence with readme conversion', () => {
  it('keeps the uploaded file-backed dataset after adding a readme and reopening the report', () => {
    const appUrl = Cypress.env('DEKART_E2E_BASE_URL') || 'http://localhost:3000'
    const ciValue = String(Cypress.env('CI') ?? '').toLowerCase()
    const isCI = ciValue === 'true' || ciValue === '1' || String(Cypress.env('CYPRESS_CI') ?? '') === '1'
    const apiBase = isCI ? `${appUrl}/api/v1` : 'http://localhost:8080/api/v1'

    const mcpCall = (name, args = {}) => cy.request({
      method: 'POST',
      url: `${apiBase}/mcp/call`,
      body: { name, arguments: args },
      failOnStatusCode: false
    }).then((response) => {
      expect(response.status, `${name} http status`).to.eq(200)
      expect(response.body).to.have.property('result')
      return response.body.result
    })

    const getReportId = () => {
      return cy.location('pathname').should('match', /\/reports\/[^/]+\/source$/).then((pathname) => {
        return pathname.match(/\/reports\/([^/]+)\/source$/)[1]
      })
    }

    const getDatasetId = (dataset) => dataset?.id || dataset?.datasetId || dataset?.dataset_id
    const getDatasetFileId = (dataset) => dataset?.fileId || dataset?.file_id
    const getDatasetQueryId = (dataset) => dataset?.queryId || dataset?.query_id

    const getMapConfigDataIds = (report) => {
      const mapConfig = report?.mapConfig || report?.map_config
      expect(mapConfig, 'saved map_config').to.be.a('string').and.not.be.empty
      const parsed = JSON.parse(mapConfig)
      return (parsed.config?.visState?.layers || [])
        .map((layer) => layer.config?.dataId)
        .filter(Boolean)
    }

    const waitForNoDownloadMessage = () => {
      cy.get('body', { timeout: 120000 }).should(($body) => {
        expect($body.text(), 'download message').not.to.include('Downloading Map Data')
      })
    }

    const waitForAtLeastOneDataset = (reportId, retries = 20) => {
      return mcpCall('get_report_properties', { report_id: reportId }).then((properties) => {
        const datasets = properties.datasets || properties.datasetsList || []
        if (datasets.length > 0) {
          return properties
        }
        if (retries <= 0) {
          throw new Error('timed out waiting for report dataset')
        }
        cy.wait(500)
        return waitForAtLeastOneDataset(reportId, retries - 1)
      })
    }

    const buildPointLayerMapConfig = (datasetId) => JSON.stringify({
      version: 'v1',
      config: {
        visState: {
          filters: [],
          layers: [{
            id: 'file-upload-points',
            type: 'point',
            config: {
              dataId: datasetId,
              columnMode: 'points',
              label: 'sample.csv',
              color: [231, 159, 213],
              highlightColor: [252, 242, 26, 255],
              columns: { lat: 'latitude', lng: 'longitude' },
              isVisible: true,
              visConfig: {
                radius: 10,
                fixedRadius: false,
                opacity: 0.8,
                outline: false,
                thickness: 2,
                strokeColor: null,
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
          }],
          effects: [],
          interactionConfig: {
            tooltip: {
              fieldsToShow: {
                [datasetId]: [
                  { name: 'primary_type', format: null },
                  { name: 'district', format: null },
                  { name: 'date', format: null }
                ]
              },
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
          latitude: 41.833596740999994,
          longitude: -87.7164901155,
          pitch: 0,
          zoom: 10.126044565472931,
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

    cy.visit(`${appUrl}/`)
    cy.get('body', { timeout: 20000 }).then(($body) => {
      if ($body.text().includes('Ready to connect')) {
        cy.contains('button', 'Use file upload').click()
      } else {
        cy.get('button#dekart-create-report', { timeout: 20000 }).click()
      }
    })

    getReportId().then((reportId) => {
      cy.contains('button', 'Upload File', { timeout: 20000 }).click()
      cy.intercept('POST', '**/api/v1/file/*/upload-sessions').as('startSession')
      cy.intercept('PUT', '**/api/v1/file/*/upload-sessions/*/parts/*').as('uploadPart')
      cy.intercept('POST', '**/api/v1/file/*/upload-sessions/*/complete').as('completeSession')

      cy.get('input[type="file"]', { timeout: 20000 }).selectFile('cypress/fixtures/sample.csv', { force: true })
      cy.contains('button', 'Upload').click()
      cy.wait('@startSession', { timeout: 60000 })
      cy.wait('@uploadPart', { timeout: 60000 })
      cy.wait('@completeSession', { timeout: 120000 })
      cy.contains('Ready', { timeout: 120000 }).should('be.visible')
      cy.contains('sample.csv', { timeout: 20000 }).should('be.visible')

      cy.get('button#dekart-save-button', { timeout: 20000 }).click()
      cy.get('button#dekart-save-button', { timeout: 60000 }).should('not.be.disabled')

      mcpCall('get_report_properties', { report_id: reportId }).then((properties) => {
        const datasets = properties.datasets || properties.datasetsList || []
        expect(datasets, 'datasets after UI upload').to.have.length(1)
        const dataset = datasets[0]
        const datasetId = getDatasetId(dataset)
        expect(datasetId, 'uploaded dataset id').to.be.a('string').and.not.be.empty
        expect(getDatasetFileId(dataset), 'uploaded dataset file_id').to.be.a('string').and.not.be.empty
        expect(getDatasetQueryId(dataset) || '', 'uploaded dataset query_id').to.equal('')

        return mcpCall('update_report_map_config', {
          report_id: reportId,
          map_config: buildPointLayerMapConfig(datasetId)
        }).then(() => datasetId)
      }).then((datasetId) => {
        return mcpCall('get_report_properties', { report_id: reportId }).then((properties) => {
          const dataIds = getMapConfigDataIds(properties.report)
          expect(dataIds, 'map_config layer dataIds').to.include(datasetId)
          return datasetId
        })
      }).then((datasetId) => {
        waitForNoDownloadMessage()
        return mcpCall('add_report_readme', {
          report_id: reportId,
          markdown: '# Dataset notes\n\nThis report should keep its uploaded CSV dataset.'
        }).then(() => datasetId)
      })

      cy.visit(`${appUrl}/reports/${reportId}/source`)

      waitForAtLeastOneDataset(reportId).then((properties) => {
        const datasets = properties.datasets || properties.datasetsList || []
        expect(datasets, 'datasets after reopening report').to.have.length(1)
        const dataset = datasets[0]
        const datasetId = getDatasetId(dataset)
        expect(getDatasetFileId(dataset), 'reopened dataset file_id').to.be.a('string').and.not.be.empty

        const dataIds = getMapConfigDataIds(properties.report)
        expect(dataIds, 'reopened map_config layer dataIds').to.include(datasetId)
      })
    })
  })
})
