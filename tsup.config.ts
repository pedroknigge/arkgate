import { defineConfig, type Options } from 'tsup';

const shared: Options = {
  format: ['esm', 'cjs'],
  external: ['@nestjs/common'],
  dts: true,
  sourcemap: false,
  // `npm run build` wipes dist/ first (scripts/clean-gate-dist.mjs); the two
  // builds below write into the same outDir, so neither may clean it.
  clean: false,
  // npm ships this output alongside readable TypeScript sources in the repository.
  // Compact the duplicate ESM/CJS distribution so stable analysis features stay
  // inside the release artifact budget. keepNames: Nest/kernel reflection.
  minify: true,
  keepNames: true,
  treeshake: false,
  cjsInterop: true,
  target: 'es2022',
  outDir: 'dist',
};

export default defineConfig([
  {
    ...shared,
    entry: {
      index: 'src/gate.ts',
      'eslint/index': 'src/eslint/index.ts',
      'order/index': 'src/kernel/order/index.ts',
    },
    splitting: false,
  },
  {
    ...shared,
    // arkgate/runtime and arkgate/nestjs share ONE kernel chunk: an ArkModule
    // kernel throws the same error classes arkgate/runtime exports (instanceof
    // works) and module-level state is not duplicated between the two entries.
    entry: {
      'runtime/index': 'src/runtime/index.ts',
      'nestjs/index': 'src/nestjs/index.ts',
    },
    splitting: true,
  },
]);
