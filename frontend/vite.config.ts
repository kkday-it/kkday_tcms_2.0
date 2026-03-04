import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

// https://vite.dev/config/
// VITE_BASE_URL：掛在子路徑時設為 /tcms/，預設 /
export default defineConfig({
  base: process.env.VITE_BASE_URL || '/',
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 8085,
    proxy: {
      '/api': {
        target: 'http://localhost:19425',
        changeOrigin: true,
      },
    },
  },
})
