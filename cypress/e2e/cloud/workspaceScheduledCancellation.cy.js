// Regression: workspace deletion stayed disabled after scheduling subscription cancellation.
import { GetWorkspaceResponse } from 'dekart-proto/dekart_pb'

// Replace only the billing details; workspace access and deletion use the local server.
function withSubscription (body, cancelAt) {
  const bytes = new Uint8Array(body)
  const length = new DataView(bytes.buffer).getUint32(1)
  const message = GetWorkspaceResponse.deserializeBinary(bytes.subarray(5, 5 + length))
  const subscription = message.getSubscription()
  // Deletion refreshes the screen with no current workspace or subscription.
  if (!subscription) return body
  subscription.setStripeSubscriptionId('sub_scheduled_cancellation')
  subscription.setCancelAt(cancelAt)
  const payload = message.serializeBinary()
  const result = new Uint8Array(bytes.length - length + payload.length)
  new DataView(result.buffer).setUint32(1, payload.length)
  result.set(payload, 5)
  result.set(bytes.subarray(5 + length), 5 + payload.length)
  return result.buffer
}

describe('Workspace deletion after scheduled cancellation', () => {
  const id = '00000000-0000-0000-0000-000000000418'
  const email = 'scheduled-cancellation@example.com'

  before(() => {
    cy.psql(`
      INSERT INTO workspaces(id,name) VALUES('${id}','Cancellation regression');
      INSERT INTO workspace_log(id,workspace_id,email,status,authored_by,role)
      VALUES('00000000-0000-0000-0000-000000000419','${id}','${email}',1,'${email}',1);
      INSERT INTO subscription_log(workspace_id,plan_type,authored_by,trial_ends_at)
      VALUES('${id}',6,'${email}',CURRENT_TIMESTAMP + interval '14 days');
    `)
  })

  after(() => {
    cy.psql(`DELETE FROM subscription_log WHERE workspace_id='${id}';
      DELETE FROM workspace_log WHERE workspace_id='${id}';
      DELETE FROM workspaces WHERE id='${id}';`)
  })

  it('blocks renewal, then allows cancellation through the confirmation dialog', () => {
    let cancelAt = 0
    let deleting = false
    cy.setDevClaimsEmail(email)
    cy.intercept('POST', '**/Dekart/GetWorkspace', req => {
      // The delete redirect aborts workspace refreshes; leave those requests untouched.
      if (deleting) return req.continue()
      req.continue(res => {
        res.body = withSubscription(res.body, cancelAt)
      })
    })
    cy.visit('/workspace')
    cy.contains('button', 'Delete workspace').should('be.disabled')
    cy.contains('Cancel your subscription first.').should('be.visible')

    cy.then(() => { cancelAt = 2000000000 })
    cy.reload()
    cy.contains('button', 'Delete workspace').should('be.enabled').click()
    cy.get('.ant-modal').should('be.visible')
    cy.get('.ant-modal-footer').contains('button', 'Delete').should('be.disabled')
    cy.get('input[aria-label="Workspace name to delete"]').type('Cancellation regression')
    cy.then(() => { deleting = true })
    cy.get('.ant-modal-footer').contains('button', 'Delete').should('be.enabled').click()
    cy.contains('button', 'Create Workspace', { timeout: 20000 }).should('be.visible')
    cy.psql(`SELECT count(*) FROM workspaces WHERE id='${id}' AND deleted_at IS NOT NULL`)
      .its('stdout').should('eq', '1')
  })
})
