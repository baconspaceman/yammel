import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// Main and preload are written as CommonJS (.cjs): a sandboxed preload script cannot be an ES module.
const commonjs = { output: { format: 'cjs' as const, entryFileNames: '[name].cjs' } };

export default defineConfig({
  main: { build: { rollupOptions: commonjs } },
  preload: { build: { rollupOptions: commonjs } },
  renderer: { plugins: [react()] },
});
