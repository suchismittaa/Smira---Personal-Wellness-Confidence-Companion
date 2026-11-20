import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/gemini': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gemini/, ''),
      },
    },
  },
  build: {
    // Split the largest third-party deps into their own chunks so the
    // main app bundle (and any single screen) doesn't have to wait on
    // the full Firebase + charting payload before it can render.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase')) return 'firebase'
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) return 'charts'
        },
      },
    },
  },
})
