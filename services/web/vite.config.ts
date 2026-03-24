import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
  server: {
    host: '0.0.0.0',
    port: 3002,
    allowedHosts: ['adv.my01.ru'],
    proxy: { '/api': 'http://127.0.0.1:8080' }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          zustand: ['zustand'],
        }
      }
    }
  }
})
