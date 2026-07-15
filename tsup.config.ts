import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/gate.ts', 'eslint/index': 'src/eslint/index.ts' },
  format: ['esm', 'cjs'],
  external: ['@nestjs/common'],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  // npm ships this output alongside readable TypeScript sources in the repository.
  // Compact the duplicate ESM/CJS distribution so stable analysis features stay
  // inside the release artifact budget.
  minify: true,
  treeshake: false,
  cjsInterop: true,
  target: 'es2022',
  outDir: 'dist',
});
