import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const defineProcessEnv = {
  'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
}

export default defineConfig({
  plugins: [
    react()
  ],
  server: {
    port: 3000,
    watch: {
      // Cypress writes videos, screenshots, and downloads while the app is under test.
      ignored: ['**/cypress/**']
    }
  },
  define: defineProcessEnv,
  resolve: {
    // DuckDB and Kepler must share Arrow constructors even when Vite prebundles them separately.
    alias: [
      {
        find: /^apache-arrow$/,
        replacement: path.resolve('node_modules/apache-arrow/Arrow.dom.mjs')
      }
    ],
    dedupe: ['apache-arrow']
  },
  optimizeDeps: {
    include: [
      'apache-arrow'
    ],
    // serves the file straight from node_modules
    exclude: [
      '@duckdb/duckdb-wasm',
      'parquet-wasm'
    ]
  },
  build: {
    outDir: 'build',
    assetsDir: '.'
  }
})
