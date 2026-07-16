import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  entry: {
    index: path.join(root, 'src/runtime/index.ts'),
    'nestjs/index': path.join(root, 'src/nestjs/index.ts'),
  },
  format: ['esm', 'cjs'],
  external: ['@nestjs/common'],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  // Same trade as the gate bundle (tsup.config.ts at the root): compact the
  // duplicate ESM/CJS distribution so the experimental runtime stays inside its
  // release artifact budget instead of ratcheting the ceiling.
  minify: true,
  // Minification must not break name-keyed reflection or Nest diagnostics:
  // class/function .name stays stable across ESM/CJS.
  keepNames: true,
  treeshake: false,
  cjsInterop: true,
  target: 'es2022',
  outDir: path.join(root, 'packages/runtime/dist'),
});
