import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/eslint/index.ts', 'src/nestjs/index.ts'],
  format: ['esm', 'cjs'],
  external: ['@nestjs/common'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  treeshake: false,
  cjsInterop: true,
  target: 'es2022',
  outDir: 'dist',
});
