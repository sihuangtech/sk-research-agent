import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';
export default defineConfig({
  plugins: [react()], clearScreen: false,
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': { target: `http://127.0.0.1:${process.env.AGENTIC_PORT || 4019}` } } },
  build: { target: ['es2022', 'safari16'] },
});
