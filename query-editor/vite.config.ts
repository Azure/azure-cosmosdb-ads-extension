import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react()
  ],
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: () => 'one-chunk',
        assetFileNames: 'assets/query-editor.[ext]',
        entryFileNames: 'assets/query-editor.js'
      }
    }
  },
  css: {
    devSourcemap: false,
  },
  optimizeDeps: {
    force: true,
    esbuildOptions: {
      plugins: [
        {
          // Some @fluentui require calls are not resolved correctly by vite:pre-bundling plugin
          name: "fluentui:scss:resolver",
          setup(build) {
              build.onResolve({
                  filter: new RegExp(".scss$")
              }, args => {
                return { path: path.resolve(args.resolveDir, `${args.path}.js`) };
              });
          }
        },
      ]
    }
  },
})
