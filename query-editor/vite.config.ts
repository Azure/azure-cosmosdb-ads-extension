import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: () => 'one-chunk',
        assetFileNames: 'assets/query-editor.[ext]',
        entryFileNames: 'assets/query-editor.js'
      }
    }
  },
  css: {
    devSourcemap: true,
  },
  // optimizeDeps: {
  //   exclude: ['@fluentui/react'],
  // },
})
