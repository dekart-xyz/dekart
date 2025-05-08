import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Add this line:
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
  build: {
    outDir: 'build',
    assetsDir: '.'
  }
})
