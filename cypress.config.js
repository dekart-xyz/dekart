const { defineConfig } = require('cypress')

module.exports = defineConfig({
  watchForFileChanges: false,
  viewportWidth: 1280,
  viewportHeight: 720,
  e2e: {
    baseUrl: 'http://127.0.0.1:3000',
    setupNodeEvents (on, config) {
      // implement node event listeners here
      on('before:browser:launch', (browser = {}, launchOptions) => {
        // Add custom browser launch options if needed
        if (browser.name === 'chrome' && browser.isHeadless) {
          launchOptions.args.push('--disable-gpu')
          launchOptions.args.push('--window-size=1280,720')
        }
        return launchOptions
      })
    }
  },
  video: false
  // reporter: 'spec',
  // reporterOptions: {
  //   toConsole: true
  // }
})
