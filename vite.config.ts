import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { handleBusApi } from './server/api/handler.ts'

export default defineConfig({
  server: {
    allowedHosts: ['.trycloudflare.com'],
  },
  preview: {
    allowedHosts: ['.trycloudflare.com'],
  },
  plugins: [
    react(),
    {
      name: '香港巴士資料中介層',
      configureServer(server) {
        server.middlewares.use('/api/bus', handleBusApi)
      },
      configurePreviewServer(server) {
        server.middlewares.use('/api/bus', handleBusApi)
      },
    },
  ],
})
