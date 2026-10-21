import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // transformers.js ships large prebuilt binaries; keep them out of Vite's dep scan.
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
})
