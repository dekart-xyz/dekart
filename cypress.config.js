const { defineConfig } = require('cypress')

module.exports = defineConfig({
  watchForFileChanges: false,
  viewportWidth: 1280,
  viewportHeight: 720,
  video: true,
  e2e: {
    baseUrl: 'http://localhost:3000'
  }
})
