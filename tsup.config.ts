import fs from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * CommonJS shape of `arkgate/eslint`: `require('arkgate/eslint')` must return the plugin
 * itself (`.configs`, `.rules`, `.meta`), matching `export = plugin` in index.d.cts and the
 * ESM default. The entry also has named exports, so cjsInterop alone leaves a namespace;
 * this footer re-points module.exports at the plugin and keeps every named export reachable
 * as a non-enumerable property (the plugin's own enumerable keys stay meta/rules/configs).
 */
const ESLINT_CJS_MARKER = '/* arkgate:eslint-cjs-plugin-shape */';
const ESLINT_CJS_FOOTER = `${ESLINT_CJS_MARKER}
;(function(){var m=module.exports,p=m&&m.default;if(!p||typeof p!=="object")return;
Object.keys(m).forEach(function(k){if(Object.prototype.hasOwnProperty.call(p,k))return;
Object.defineProperty(p,k,{get:function(){return k==="default"?p:m[k]},enumerable:false,configurable:true});});
module.exports=p;})();
`;

function patchEslintCjs(): void {
  const file = 'dist/eslint/index.cjs';
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes(ESLINT_CJS_MARKER)) return;
  fs.writeFileSync(file, `${text}\n${ESLINT_CJS_FOOTER}`);
}

export default defineConfig({
  entry: {
    index: 'src/gate.ts',
    'eslint/index': 'src/eslint/index.ts',
    'order/index': 'src/kernel/order/index.ts',
    'runtime/index': 'src/runtime/index.ts',
    'nestjs/index': 'src/nestjs/index.ts',
  },
  format: ['esm', 'cjs'],
  external: ['@nestjs/common'],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  // npm ships this output alongside readable TypeScript sources in the repository.
  // Compact the duplicate ESM/CJS distribution so stable analysis features stay
  // inside the release artifact budget. keepNames: Nest/kernel reflection.
  minify: true,
  keepNames: true,
  treeshake: false,
  cjsInterop: true,
  target: 'es2022',
  outDir: 'dist',
  // ESLint plugin meta.version (cache key for `eslint --cache` across arkgate upgrades).
  define: { __ARKGATE_VERSION__: JSON.stringify(pkg.version) },
  onSuccess: async () => {
    patchEslintCjs();
  },
});
