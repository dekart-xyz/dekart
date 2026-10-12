/* eslint-disable no-undef */

// enterVisibleQuery pastes SQL atomically so autosave cannot interrupt a long sequence of keystrokes.
export function enterVisibleQuery (sql) {
  cy.get('.ace_editor:visible textarea', { timeout: 30000 }).first()
    .focus()
    .type('{selectall}', { force: true })
    .then($textarea => {
      if (sql === '') {
        return cy.wrap($textarea).type('{backspace}', { force: true })
      }
      const view = $textarea[0].ownerDocument.defaultView
      const clipboardData = new view.DataTransfer()
      clipboardData.setData('text/plain', sql)
      $textarea[0].dispatchEvent(new view.ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData
      }))
    })
    .wait(250)
}

export function queryParameterInput (name) {
  return cy.contains('.ant-input-group-addon', name)
    .parent()
    .find('input')
    .first()
}
