// filepath: /Users/vladi/dev/dekart/vitest.config.js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js' // Optional: Use your existing setupTests.js
  }
})
