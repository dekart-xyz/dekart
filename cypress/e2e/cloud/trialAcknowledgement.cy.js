/* eslint-disable no-undef */
import { CreateSubscriptionRequest, GetWorkspaceRequest, GetWorkspaceResponse, PlanType } from 'dekart-proto/dekart_pb'

function decodeGrpcRequest (body) {
  const bytes = Cypress.Buffer.from(body)
  return CreateSubscriptionRequest.deserializeBinary(new Uint8Array(bytes.buffer, bytes.byteOffset + 5, bytes.length - 5))
}

function grpcFrame (message) {
  const requestBytes = message.serializeBinary()
  const body = new Uint8Array(requestBytes.length + 5)
  const view = new DataView(body.buffer)
  view.setUint32(1, requestBytes.length)
  body.set(requestBytes, 5)
  return body
}

function readGrpcResponse (response, bytes) {
  const headerStatus = response.headers.get('grpc-status')
  let status = headerStatus === null ? null : Number(headerStatus)
  let data
  let offset = 0
  while (offset + 5 <= bytes.length) {
    const frameType = bytes[offset]
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0)
    const payload = bytes.subarray(offset + 5, offset + 5 + length)
    if ((frameType & 0x80) !== 0) {
      const match = new TextDecoder().decode(payload).match(/grpc-status:\s*(\d+)/i)
      if (match) status = Number(match[1])
    } else if (!data) {
      data = payload
    }
    offset += 5 + length
  }
  if (status === null) throw new Error('gRPC status missing')
  return { status, data }
}

function startTrialRequest (win, email, workspaceId, revision) {
  const request = new CreateSubscriptionRequest()
  request.setPlanType(PlanType.TYPE_TRIAL)
  request.setRevision(revision)
  const headers = new win.Headers({
    'Content-Type': 'application/grpc-web+proto',
    'X-Grpc-Web': '1',
    'X-Dekart-Claim-Email': email,
    'X-Dekart-Workspace-Id': workspaceId
  })
  return win.fetch(`${Cypress.env('DEKART_E2E_API_URL')}/Dekart/CreateSubscription`, {
    method: 'POST',
    headers,
    body: grpcFrame(request)
  }).then(async response => {
    const bytes = new Uint8Array(await response.arrayBuffer())
    return readGrpcResponse(response, bytes).status
  })
}

function getWorkspaceRequest (win, email, workspaceId) {
  const request = new GetWorkspaceRequest()
  const headers = new win.Headers({
    'Content-Type': 'application/grpc-web+proto',
    'X-Grpc-Web': '1',
    'X-Dekart-Claim-Email': email,
    'X-Dekart-Workspace-Id': workspaceId
  })
  return win.fetch(`${Cypress.env('DEKART_E2E_API_URL')}/Dekart/GetWorkspace`, {
    method: 'POST',
    headers,
    body: grpcFrame(request)
  }).then(async response => {
    const bytes = new Uint8Array(await response.arrayBuffer())
    const grpcResponse = readGrpcResponse(response, bytes)
    expect(grpcResponse.status).to.equal(0)
    return GetWorkspaceResponse.deserializeBinary(grpcResponse.data)
  })
}

describe('Cloud trial acknowledgement', () => {
  const email = 'trial-ack@example.com'
  const apiBase = `${Cypress.env('DEKART_E2E_API_URL')}/api/v1`

  beforeEach(() => {
    cy.resetCloudTestDatabase()
    cy.setDevClaimsEmail(email)
  })

  it('requires a new workspace to start a trial before creating maps', () => {
    let delayNextWorkspaceResponse = false
    cy.intercept('POST', '**/Dekart/GetWorkspace', req => {
      const delayResponse = delayNextWorkspaceResponse
      if (delayResponse) {
        delayNextWorkspaceResponse = false
        req.alias = 'delayedWorkspace'
      }
      req.continue(res => {
        // Delay the post-create workspace details while the user stream already identifies the new workspace.
        if (delayResponse) {
          res.setDelay(8000)
        }
      })
    })
    cy.visit('/', {
      onBeforeLoad: win => {
        win.localStorage.setItem('dekart-local-storage-v1', JSON.stringify({
          preferredWorkspaceId: '00000000-0000-0000-0000-000000000399'
        }))
      }
    })
    cy.get('button#dekart-create-workspace').click()
    cy.get('input#name').type('Trial workspace')
    cy.get('#source').click()
    cy.get('.ant-select-item-option').contains('Google Search').click()
    cy.then(() => { delayNextWorkspaceResponse = true })
    cy.get('button:contains("Create")').click()

    cy.location('pathname', { timeout: 30000 }).should('equal', '/workspace/trial')
    cy.contains('Start your 14-day trial').should('be.visible')
    cy.contains('$49/month per editor').should('be.visible')
    cy.contains('$490/month').should('be.visible')
    cy.get('button#dekart-start-trial').should('be.disabled')
    cy.wait('@delayedWorkspace')
    cy.contains('Your 14-day trial').should('be.visible')
    cy.get('button#dekart-start-trial').should('not.be.disabled')
    cy.request('POST', `${apiBase}/device`, { device_name: 'cypress-trial-gate' }).then(startResp => {
      const deviceId = startResp.body.device_id
      cy.visit(startResp.body.auth_url)
      cy.contains('Authorize this device').should('be.visible')
      cy.contains('Start your trial to use this workspace.').should('not.exist')
      cy.contains('button', 'Authorize').click()
      cy.location('pathname', { timeout: 20000 }).should('equal', '/workspace/trial')
      cy.request('POST', `${apiBase}/device/token`, { device_id: deviceId }).then(tokenResp => {
        expect(tokenResp.body.status).to.equal('authorized')
        expect(tokenResp.body.token).to.be.a('string').and.not.be.empty
      })
    })
    cy.visit('/workspace/trial')
    cy.visit('/workspace/plan')
    cy.location('pathname').should('equal', '/workspace/plan')
    cy.contains('Grow').should('be.visible')
    cy.visit('/')
    cy.location('pathname').should('equal', '/workspace/trial')

    cy.get('button#dekart-start-trial').dblclick()
    cy.get('button#dekart-create-report', { timeout: 30000 }).should('be.visible')
    cy.visit('/workspace/plan')
    cy.contains('14 days left').should('be.visible')
    cy.contains('of your 14-day trial').should('be.visible')
    cy.contains('When the trial ends, your workspace becomes read-only and your maps stay viewable.').should('be.visible')
    cy.contains('button', 'Upgrade').should('be.visible')
    cy.psql(`
      SELECT COUNT(*)
      FROM subscription_log
      WHERE authored_by = '${email}' AND plan_type = 6
    `).its('stdout').should('match', /^1\s*$/)
    cy.psql(`
      UPDATE subscription_log
      SET trial_ends_at = NOW() + INTERVAL '2 seconds'
      WHERE authored_by = '${email}' AND plan_type = 6
    `)
    cy.visit('/')
    cy.get('button#dekart-create-report').should('be.visible')
    cy.contains('Workspace is read-only.', { timeout: 10000 }).should('be.visible')
    cy.contains('Your trial has ended. Your maps stay viewable.').should('be.visible')
    cy.contains('button', 'See plans').should('be.visible')
    cy.contains('a', 'Book a call').should('be.visible')
    cy.contains('button', 'See plans').click()
    cy.location('pathname').should('equal', '/workspace/plan')
    cy.contains('Your trial has ended').should('be.visible')
    cy.contains('The workspace is read-only and your maps stay viewable. Upgrade below to start editing again, or book a call to extend the trial.').should('be.visible')
    cy.contains('a', 'Book a call').should('be.visible')
    cy.contains('0 days left').should('not.exist')
    cy.contains('Trial ended — workspace is paused.').should('not.exist')
  })

  it('shows members an admin-only gate without a start action', () => {
    const adminEmail = 'trial-admin@example.com'
    cy.psql(`
      WITH workspace AS (
        INSERT INTO workspaces (id, name)
        VALUES ('00000000-0000-0000-0000-000000000301', 'Personal workspace')
        RETURNING id
      )
      INSERT INTO workspace_log (workspace_id, email, status, authored_by, id, role)
      SELECT id, '${adminEmail}', 1, '${adminEmail}', '00000000-0000-0000-0000-000000000302'::uuid, 1 FROM workspace
      UNION ALL
      SELECT id, '${email}', 1, '${email}', '00000000-0000-0000-0000-000000000303'::uuid, 2 FROM workspace;

      INSERT INTO subscription_log (workspace_id, authored_by, plan_type)
      VALUES ('00000000-0000-0000-0000-000000000301', '${adminEmail}', 1);
    `)

    cy.visit('/')
    cy.location('pathname', { timeout: 30000 }).should('equal', '/workspace/trial')
    cy.contains('Ask your workspace admin to start the trial').should('be.visible')
    cy.get('button#dekart-start-trial').should('not.exist')

    cy.psql(`
      UPDATE subscription_log
      SET plan_type = 6, trial_ends_at = NOW() - INTERVAL '1 minute'
      WHERE workspace_id = '00000000-0000-0000-0000-000000000301'
    `)
    cy.visit('/workspace/plan')
    cy.contains('Your trial has ended').should('be.visible')
    cy.contains('Ask your workspace admin to upgrade, or book a call to extend the trial.').should('be.visible')
    cy.contains('button', 'Upgrade').should('be.disabled')
  })

  it('requires the legacy Cloud default workspace to start a trial', () => {
    const workspaceId = '00000000-0000-0000-0000-000000000000'
    let delayInitialWorkspaceResponse = true
    cy.intercept('POST', '**/Dekart/GetWorkspace', req => {
      const delayResponse = delayInitialWorkspaceResponse
      delayInitialWorkspaceResponse = false
      if (delayResponse) req.alias = 'delayedInitialWorkspace'
      req.continue(res => {
        if (delayResponse) res.setDelay(3000)
      })
    })
    cy.psql(`
      INSERT INTO workspaces (id, name, is_default)
      VALUES ('${workspaceId}', 'Default', TRUE);

      INSERT INTO workspace_log (workspace_id, email, status, authored_by, id, role)
      VALUES ('${workspaceId}', '${email}', 1, '${email}', '00000000-0000-0000-0000-000000000351', 1);

      INSERT INTO subscription_log (workspace_id, authored_by, plan_type)
      VALUES ('${workspaceId}', '${email}', 1);
    `)

    cy.visit('/')
    cy.location('pathname', { timeout: 30000 }).should('equal', '/workspace/trial')
    cy.get('button#dekart-start-trial').should('be.disabled')
    cy.wait('@delayedInitialWorkspace')
    cy.contains('Your 14-day trial').should('be.visible')
    cy.get('button#dekart-start-trial').should('not.be.disabled')
    cy.get('button#dekart-start-trial').click()
    cy.get('button#dekart-create-report', { timeout: 30000 }).should('be.visible')
  })

  it('keeps the legacy Team plan fully available', () => {
    // Stripe test subscription sub_1UGcKGCnpQUpbHMF71A3sEY4 belongs to this shared read-only fixture customer.
    const legacyTeamCustomerId = 'cus_VHALvFVvwmmmGA'
    cy.psql(`
      WITH workspace AS (
        INSERT INTO workspaces (id, name)
        VALUES ('00000000-0000-0000-0000-000000000401', 'Legacy Team')
        RETURNING id
      )
      INSERT INTO workspace_log (workspace_id, email, status, authored_by, id, role)
      SELECT id, '${email}', 1, '${email}', '00000000-0000-0000-0000-000000000402'::uuid, 1 FROM workspace;

      INSERT INTO subscription_log (workspace_id, customer_id, authored_by, plan_type)
      VALUES ('00000000-0000-0000-0000-000000000401', '${legacyTeamCustomerId}', '${email}', 2);

      INSERT INTO reports (id, title, author_email, workspace_id)
      VALUES (
        '00000000-0000-0000-0000-000000000403',
        'Legacy Team map',
        '${email}',
        '00000000-0000-0000-0000-000000000401'
      );
    `)

    cy.visit('/')
    cy.contains('Legacy Team map', { timeout: 30000 }).should('be.visible')
    cy.get('button#dekart-create-report').should('be.visible').and('not.be.disabled').click()
    cy.location('pathname', { timeout: 30000 }).should('match', /^\/reports\/[a-f0-9-]+\/source$/)
    cy.get('#dekart-add-connection').should('be.visible')

    cy.visit('/workspace/plan')
    cy.contains('Team').should('be.visible')
    cy.contains('button', 'Manage subscription').should('be.visible').and('not.be.disabled')
    cy.contains('Workspace is read-only.').should('not.exist')
  })

  it('keeps an existing Personal map viewable while gating its source route', () => {
    const workspaceId = '00000000-0000-0000-0000-000000000501'
    const reportId = '00000000-0000-0000-0000-000000000502'
    cy.psql(`
      INSERT INTO workspaces (id, name)
      VALUES ('${workspaceId}', 'Personal map workspace');

      INSERT INTO workspace_log (workspace_id, email, status, authored_by, id, role)
      VALUES ('${workspaceId}', '${email}', 1, '${email}', '00000000-0000-0000-0000-000000000503', 1);

      INSERT INTO subscription_log (workspace_id, authored_by, plan_type)
      VALUES ('${workspaceId}', '${email}', 1);

      INSERT INTO reports (id, title, author_email, workspace_id)
      VALUES ('${reportId}', 'Existing Personal map', '${email}', '${workspaceId}');
    `)

    cy.visit(`/reports/${reportId}`)
    cy.location('pathname', { timeout: 30000 }).should('equal', `/reports/${reportId}`)
    cy.contains('Existing Personal map').should('be.visible')
    cy.contains('Start your trial to use this workspace.').should('be.visible')

    cy.visit(`/reports/${reportId}/source`)
    cy.location('pathname', { timeout: 30000 }).should('equal', '/workspace/trial')
  })

  it('recovers when trial activation fails', () => {
    const workspaceId = '00000000-0000-0000-0000-000000000601'
    cy.psql(`
      INSERT INTO workspaces (id, name)
      VALUES ('${workspaceId}', 'Trial retry workspace');

      INSERT INTO workspace_log (workspace_id, email, status, authored_by, id, role)
      VALUES ('${workspaceId}', '${email}', 1, '${email}', '00000000-0000-0000-0000-000000000602', 1);

      INSERT INTO subscription_log (workspace_id, authored_by, plan_type)
      VALUES ('${workspaceId}', '${email}', 1);
    `)
    cy.intercept('POST', '**/Dekart/CreateSubscription', { forceNetworkError: true }).as('failedTrialStart')

    cy.visit('/workspace/trial')
    cy.get('button#dekart-start-trial').click()
    cy.wait('@failedTrialStart')
    cy.contains('Could not start the trial. Please try again.').should('be.visible')
    cy.get('button#dekart-start-trial').should('not.be.disabled')
  })

  it('sends Grow and Max upgrades and recovers when checkout creation fails', () => {
    const workspaceId = '00000000-0000-0000-0000-000000000701'
    cy.psql(`
      INSERT INTO workspaces (id, name)
      VALUES ('${workspaceId}', 'Trial upgrade workspace');

      INSERT INTO workspace_log (workspace_id, email, status, authored_by, id, role)
      VALUES ('${workspaceId}', '${email}', 1, '${email}', '00000000-0000-0000-0000-000000000702', 1);

      INSERT INTO subscription_log (workspace_id, authored_by, plan_type, trial_ends_at)
      VALUES ('${workspaceId}', '${email}', 6, NOW() + INTERVAL '14 days');
    `)
    const requestedPlans = []
    cy.intercept('POST', '**/Dekart/CreateSubscription', req => {
      const planType = decodeGrpcRequest(req.body).getPlanType()
      if (requestedPlans.at(-1) !== planType) requestedPlans.push(planType)
      return new Cypress.Promise(resolve => {
        setTimeout(() => {
          req.destroy()
          resolve()
        }, 500)
      })
    }).as('failedCheckout')

    cy.visit('/workspace/plan')
    cy.get(`button#dekart-${PlanType.TYPE_GROW}-choose-plan`).click().should('be.disabled')
    cy.wait('@failedCheckout')
    cy.get(`button#dekart-${PlanType.TYPE_GROW}-choose-plan`).should('not.be.disabled')
    cy.get(`button#dekart-${PlanType.TYPE_MAX}-choose-plan`).click().should('be.disabled')
    cy.wait('@failedCheckout')
    cy.get(`button#dekart-${PlanType.TYPE_MAX}-choose-plan`).should('not.be.disabled')
    cy.then(() => expect(requestedPlans).to.deep.equal([PlanType.TYPE_GROW, PlanType.TYPE_MAX]))
  })

  it('serializes concurrent trial starts with one stale command', () => {
    const workspaceId = '00000000-0000-0000-0000-000000000801'
    cy.psql(`
      INSERT INTO workspaces (id, name)
      VALUES ('${workspaceId}', 'Concurrent trial workspace');

      INSERT INTO workspace_log (workspace_id, email, status, authored_by, id, role)
      VALUES ('${workspaceId}', '${email}', 1, '${email}', '00000000-0000-0000-0000-000000000802', 1);

      INSERT INTO subscription_log (workspace_id, authored_by, plan_type)
      VALUES ('${workspaceId}', '${email}', 1);
    `)

    cy.visit('/workspace/trial')
    cy.window().then(win => {
      return getWorkspaceRequest(win, email, workspaceId).then(workspace => {
        const revision = workspace.getSubscription().getRevision()
        expect(revision).to.be.a('string').and.not.be.empty
        return Cypress.Promise.all([
          startTrialRequest(win, email, workspaceId, revision),
          startTrialRequest(win, email, workspaceId, revision)
        ]).then(statuses => {
          expect(statuses.sort()).to.deep.equal([0, 10])
          return getWorkspaceRequest(win, email, workspaceId)
        }).then(current => {
          expect(current.getSubscription().getPlanType()).to.equal(PlanType.TYPE_TRIAL)
        })
      })
    })
    cy.psql(`
      SELECT COUNT(*)
      FROM subscription_log
      WHERE workspace_id = '${workspaceId}' AND plan_type = 6
    `).its('stdout').should('match', /^1\s*$/)
    cy.visit('/')
    cy.get('button#dekart-create-report', { timeout: 30000 }).should('be.visible')
  })

})
