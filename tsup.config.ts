import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/gate.ts', 'eslint/index': 'src/eslint/index.ts' },
  format: ['esm', 'cjs'],
  external: ['@nestjs/common'],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: false,
  treeshake: false,
  cjsInterop: true,
  target: 'es2022',
  outDir: 'dist',
});
