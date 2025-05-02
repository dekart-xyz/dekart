import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import commonjsExternals from 'vite-plugin-commonjs-externals'

// Add this line:
const defineProcessEnv = {
  'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
}

export default defineConfig({
  plugins: [
    react(),
    commonjsExternals({
      externals: ['@/proto/dekart_pb']
    })
  ],
  server: {
    port: 3000
  },
  define: defineProcessEnv,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'dekart-proto': path.resolve(__dirname, 'src/proto')
    }
  },
  optimizeDeps: {
    include: ['dekart-proto/dekart_pb', 'dekart-proto/dekart_pb_service']
  },
  build: {
    outDir: 'build',
    assetsDir: '.',
    rollupOptions: {
      external: ['dekart-proto/dekart_pb', 'dekart-proto/dekart_pb_service']
    }
  }
})
