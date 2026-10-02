import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    deps: {
      interopDefault: false,
      optimizer: {
        web: {
          enabled: true,
          // Bundle Kepler's CommonJS/ESM graph while preserving Node-only loaders.
          include: ['@kepler.gl/layers', '@kepler.gl/reducers'],
          exclude: ['apache-arrow', 'thrift', 'parquet-wasm', 'h3-js']
        }
      }
    },
    setupFiles: './src/setupTests.js' // Optional: Use your existing setupTests.js
  }
})
