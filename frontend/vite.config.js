import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    dedupe: ['react', 'react-dom'],
  },

  define: {
    global: 'globalThis',
    'process.env': {},
  },

  // snarkjs ships CommonJS with dynamic requires; exclude it from esbuild
  // so Vite resolves it as a real ESM module at runtime.
  optimizeDeps: {
    exclude: ['snarkjs'],
    rolldownOptions: {
      define: { global: 'globalThis' },
    },
  },

  // Allow the browser to load .wasm files directly from /public
  assetsInclude: ['**/*.wasm', '**/*.zkey'],

})
