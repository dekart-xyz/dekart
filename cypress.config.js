const { defineConfig } = require('cypress')

module.exports = defineConfig({
  watchForFileChanges: false,
  viewportWidth: 1280,
  viewportHeight: 720,
  e2e: {
    baseUrl: 'http://127.0.0.1:3000',
    setupNodeEvents (on, config) {
    }
  }
})
