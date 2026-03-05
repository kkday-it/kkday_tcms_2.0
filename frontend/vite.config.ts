import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

import fs from 'fs'
import type { PluginOption } from 'vite'

// Custom Vite plugin to log requests to a local access.log file
function viteLogger(): PluginOption {
  return {
    name: 'vite-logger',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const start = Date.now()
        res.on('finish', () => {
          const duration = Date.now() - start
          const time = new Date().toISOString()
          const logLine = `[${time}] ${req.method} ${req.url} ${res.statusCode} ${duration}ms\n`

          const logDir = path.resolve(__dirname, '../logs')
          if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true })
          }

          fs.appendFile(path.join(logDir, 'frontend.log'), logLine, (err) => {
            if (err) console.error('Failed to write log:', err)
          })
        })
        next()
      })
    }
  }
}

// https://vite.dev/config/
// VITE_BASE_URL：掛在子路徑時設為 /tcms/，預設 /
export default defineConfig({
  base: process.env.VITE_BASE_URL || '/',
  plugins: [react(), viteLogger()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 8085,
    proxy: {
      '/api': {
        target: 'http://localhost:19425',
        changeOrigin: true,
      },
    },
  },
})
