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
  minify: false,
  treeshake: false,
  cjsInterop: true,
  target: 'es2022',
  outDir: path.join(root, 'packages/runtime/dist'),
});
