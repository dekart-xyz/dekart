/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'
import { duplicateLayer } from '@kepler.gl/actions'

const LAYER_NAME_INPUT_SELECTOR = '[data-testid="sortable-layer-item"] [data-testid="layer__title__editor"]:visible, [data-testid="static-layer-item"] [data-testid="layer__title__editor"]:visible'

function runQueryAndWaitReady (queryText) {
  cy.get('button:contains("Run SQL")').click()
  cy.get('textarea').first().clear({ force: true }).type(queryText, { force: true })
  cy.get(`button:contains("${copy.execute}")`).click()
  cy.get(`span:contains("${copy.ready}")`, { timeout: 60000 }).should('be.visible')
}

function getLayerNameInputs () {
  return cy.get(LAYER_NAME_INPUT_SELECTOR, { timeout: 60000 })
}

function setLayerNames (names) {
  getLayerNameInputs().should('have.length', names.length)
  names.forEach((name, index) => {
    getLayerNameInputs().eq(index).clear({ force: true }).type(name, { force: true })
  })
}

function getLayerNamesInVisualOrder () {
  return getLayerNameInputs().then(($inputs) => [...$inputs].map((el) => el.value.trim()))
}

function duplicateFirstLayer () {
  cy.window({ timeout: 60000 }).should((win) => {
    const rootNode = win.document.getElementById('root')
    const reactRootKey = Object.keys(rootNode).find(key => key.startsWith('__reactContainer$') || key.startsWith('__reactFiber$'))
    const reactRoot = rootNode[reactRootKey]
    const initialFiber = reactRoot.current ? reactRoot.current : (reactRoot.stateNode?.current || reactRoot)
    const queue = [initialFiber]
    let store
    while (queue.length > 0 && !store) {
      const fiber = queue.shift()
      if (fiber?.memoizedProps?.store?.getState) {
        store = fiber.memoizedProps.store
        break
      }
      if (fiber?.child) queue.push(fiber.child)
      if (fiber?.sibling) queue.push(fiber.sibling)
    }
    expect(Boolean(store)).to.equal(true)
    const layerCount = store.getState().keplerGl.kepler.visState.layers.length
    expect(layerCount).to.be.greaterThan(0)
  })

  cy.window().then((win) => {
    const rootNode = win.document.getElementById('root')
    const reactRootKey = Object.keys(rootNode).find(key => key.startsWith('__reactContainer$') || key.startsWith('__reactFiber$'))
    const reactRoot = rootNode[reactRootKey]
    const initialFiber = reactRoot.current ? reactRoot.current : (reactRoot.stateNode?.current || reactRoot)
    const queue = [initialFiber]
    let store
    while (queue.length > 0 && !store) {
      const fiber = queue.shift()
      if (fiber?.memoizedProps?.store?.getState) {
        store = fiber.memoizedProps.store
        break
      }
      if (fiber?.child) queue.push(fiber.child)
      if (fiber?.sibling) queue.push(fiber.sibling)
    }
    if (!store) throw new Error('Redux store not found')
    const firstLayerId = store.getState().keplerGl.kepler.visState.layers[0]?.id
    if (!firstLayerId) throw new Error('No layer to duplicate')
    store.dispatch(duplicateLayer(firstLayerId))
  })
}

describe('layer order regression on query re-run', () => {
  it('shows visible names and reproduces 1,2,3 -> 3,1,2', () => {
    const query1Sql = 'SELECT ROUND(uniform(-90::float, 90::float, random()), 6) AS lat, ROUND(uniform(-180::float, 180::float, random()), 6) AS lon FROM TABLE(GENERATOR(ROWCOUNT => 111))'
    const query2InitialSql = 'SELECT ROUND(uniform(-90::float, 90::float, random()), 6) AS lat, ROUND(uniform(-180::float, 180::float, random()), 6) AS lon FROM TABLE(GENERATOR(ROWCOUNT => 222))'

    cy.visit('/')
    cy.get('button#dekart-create-report').click()

    // Query 1 (dataset A)
    runQueryAndWaitReady(query1Sql)

    // Duplicate existing layer from dataset A
    duplicateFirstLayer()

    // Query 2 (dataset B)
    cy.get('button.ant-tabs-nav-add:visible').click()
    runQueryAndWaitReady(query2InitialSql)

    // Make sure we have exactly 3 visible layer title editors and rename them.
    setLayerNames(['1', '2', '3'])

    getLayerNamesInVisualOrder().then((beforeOrder) => {
      expect(beforeOrder.join(',')).to.equal('1,2,3')
      cy.wrap(beforeOrder).as('beforeOrder')
    })

    // Re-run Query 2 with changed SQL to refresh dataset B.
    cy.contains('.ant-tabs-tab', 'Query 1').click({ force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 60000 }).should('be.visible')

    getLayerNamesInVisualOrder().then((afterOrder) => {
      expect(afterOrder.join(',')).to.equal('1,2,3')
    })
  })
})
