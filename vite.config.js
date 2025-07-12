import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const defineProcessEnv = {
  'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
}

export default defineConfig({
  plugins: [
    react()
  ],
  server: {
    port: 3000
  },
  define: defineProcessEnv,
  optimizeDeps: {
    // serves the file straight from node_modules
    exclude: [
      'parquet-wasm'
    ]
  },
  build: {
    outDir: 'build',
    assetsDir: '.'
  }
})
