import { defineConfig } from 'vite';

// Builds the command-line and MCP tool into out/cli/apyaml.mjs: one file, for Node, with the `yaml` library bundled in.
export default defineConfig({
  build: {
    ssr: 'src/cli/main.ts',
    outDir: 'out/cli',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: { output: { entryFileNames: 'apyaml.mjs', format: 'es' } },
  },
  ssr: { noExternal: true },
});
