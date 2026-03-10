import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from "vite-plugin-wasm";
import path from "path";

export default defineConfig({
  plugins: [react(), wasm()],
  esbuild: {
    target: "esnext", 
  },
  build: {
    target: "esnext", 
  },
  define: {
    global: 'window',
    'process.env': {},
  },
  resolve: {
    alias: {
      buffer: path.resolve(__dirname, 'node_modules', 'buffer'),
      crypto: "node:crypto", 
    },
  },
  optimizeDeps: {
    include: ["buffer"], 
  },
});
