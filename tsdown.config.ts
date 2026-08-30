import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    outDir: 'dist',
    clean: true,
    external: ['cordis', 'zod', 'dsh'],
  },
  {
    entry: ['client/index.tsx'],
    format: ['esm'],
    dts: true,
    outDir: 'dist/client',
    external: ['cordis', 'zod', 'dsh', 'react'],
  },
]);
