/* eslint-disable no-undef */

describe('local file-backed dataset download error', () => {
  it('shows the parse error and clears the downloading message', () => {
    const appUrl = Cypress.env('DEKART_E2E_BASE_URL') || 'http://localhost:3000'
    const ciValue = String(Cypress.env('CI') ?? '').toLowerCase()
    const isCI = ciValue === 'true' || ciValue === '1' || String(Cypress.env('CYPRESS_CI') ?? '') === '1'
    const apiOrigin = isCI ? appUrl : 'http://localhost:8080'
    const apiBase = isCI ? `${appUrl}/api/v1` : 'http://localhost:8080/api/v1'

    const getDeviceToken = () => {
      return cy.request('POST', `${apiBase}/device`, {
        device_name: 'cypress-local-download-error'
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

    const mcpCall = (token, name, args = {}) => cy.request({
      method: 'POST',
      url: `${apiBase}/mcp/call`,
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: { name, arguments: args },
      failOnStatusCode: false
    }).then((response) => {
      expect(response.status, `${name} http status`).to.eq(200)
      expect(response.body).to.have.property('result')
      return response.body.result
    })

    const readId = (obj, candidates) => {
      for (const key of candidates) {
        const value = obj?.[key]
        if (typeof value === 'string' && value.length > 0) return value
      }
      return ''
    }

    const buildMapConfig = (datasetId) => JSON.stringify({
      version: 'v1',
      config: {
        visState: {
          filters: [],
          layers: [{
            id: 'broken-download-layer',
            type: 'geojson',
            config: {
              dataId: datasetId,
              label: 'sample.geojson',
              color: [231, 159, 213],
              columns: { geojson: '_geojson' },
              isVisible: true,
              visConfig: {},
              hidden: false,
              textLabel: []
            },
            visualChannels: {}
          }],
          effects: [],
          interactionConfig: {
            tooltip: { fieldsToShow: { [datasetId]: [] }, enabled: true },
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
          latitude: 0,
          longitude: 0,
          pitch: 0,
          zoom: 1,
          isSplit: false,
          isViewportSynced: true,
          isZoomLocked: false,
          splitMapViewports: []
        },
        mapStyle: {
          styleType: 'dark',
          topLayerGroups: {},
          visibleLayerGroups: {},
          mapStyles: {}
        },
        uiState: { mapControls: { mapLegend: { active: false } } }
      }
    })

    const waitForNoDownloadMessage = () => {
      cy.get('body', { timeout: 120000 }).should(($body) => {
        expect($body.text(), 'download message').not.to.include('Downloading Map Data')
      })
    }

    const uploadGeoJson = (token, fileId) => cy.readFile('cypress/fixtures/sample.geojson', 'utf8').then((fileBody) => {
      const totalSize = Cypress.Buffer.byteLength(fileBody)
      return mcpCall(token, 'start_file_upload_session', {
        file_id: fileId,
        name: 'sample.geojson',
        mime_type: 'application/geo+json',
        total_size: totalSize
      }).then((session) => {
        const uploadSessionId = session.upload_session_id || session.uploadSessionId
        const uploadPartEndpoint = session.upload_part_endpoint || session.uploadPartEndpoint
        expect(uploadSessionId, 'upload_session_id').to.be.a('string').and.not.eq('')
        expect(uploadPartEndpoint, 'upload_part_endpoint').to.be.a('string').and.not.eq('')

        return cy.request({
          method: 'PUT',
          url: `${apiOrigin}${uploadPartEndpoint.replace('{part_number}', '1')}?part_size=${totalSize}`,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/geo+json' },
          body: fileBody
        }).then((partResp) => {
          expect(partResp.status, 'upload part status').to.eq(200)
          return mcpCall(token, 'complete_file_upload_session', {
            file_id: fileId,
            upload_session_id: uploadSessionId,
            parts: [partResp.body],
            total_size: totalSize
          })
        })
      })
    })

    getDeviceToken().then((token) => mcpCall(token, 'create_report').then((reportResult) => {
      const reportId = readId(reportResult, ['report_id', 'reportId', 'id']) ||
        readId(reportResult?.report, ['id'])
      expect(reportId, 'report_id').to.be.a('string').and.not.eq('')

      return mcpCall(token, 'create_dataset', { report_id: reportId }).then((datasetResult) => {
        const datasetId = readId(datasetResult, ['dataset_id', 'datasetId', 'id']) ||
          readId(datasetResult?.dataset, ['id'])
        expect(datasetId, 'dataset_id').to.be.a('string').and.not.eq('')

        return mcpCall(token, 'create_file', { dataset_id: datasetId }).then((fileResult) => {
          const fileId = readId(fileResult, ['file_id', 'fileId', 'id']) ||
            readId(fileResult?.file, ['id'])
          expect(fileId, 'file_id').to.be.a('string').and.not.eq('')

          return uploadGeoJson(token, fileId).then(() => {
            return mcpCall(token, 'update_report_map_config', {
              report_id: reportId,
              map_config: buildMapConfig(datasetId)
            }).then(() => reportId)
          })
        })
      })
    })).then((reportId) => {
      cy.intercept('GET', '**/api/v1/dataset-source/**', {
        statusCode: 200,
        headers: { 'content-type': 'application/geo+json' },
        body: '{"type":"FeatureCollection","features":['
      }).as('brokenDatasetSource')

      cy.visit(`${appUrl}/reports/${reportId}/source`)
      cy.wait('@brokenDatasetSource', { timeout: 60000 })
      cy.contains('Error loading dataset', { timeout: 120000 }).should('be.visible')
      waitForNoDownloadMessage()
    })
  })
})
