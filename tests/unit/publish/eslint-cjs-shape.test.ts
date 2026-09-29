/**
 * `require('arkgate/eslint')` must be the plugin itself (index.d.cts says `export = plugin`),
 * so an eslint.config.cjs can use `ark.configs.recommended` / `plugins: { ark: require(...) }`.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import esmPlugin from '../../../dist/eslint/index.js';

const require = createRequire(import.meta.url);

describe('arkgate/eslint CommonJS shape', () => {
  it('module.exports is the plugin with configs, rules, meta, and named helpers', () => {
    const cjs = require(path.resolve('dist/eslint/index.cjs'));
    expect(Object.keys(cjs)).toEqual(['meta', 'rules', 'configs']);
    expect(typeof cjs.configs.recommended).toBe('object');
    expect(cjs.configs.recommended.plugins.ark).toBe(cjs);
    expect(cjs.rules['no-domain-infra-imports']).toBeDefined();
    expect(cjs.default).toBe(cjs);
    expect(cjs.plugin).toBe(cjs);
    expect(typeof cjs.findConfigPath).toBe('function');
    expect(cjs.meta).toMatchObject({ name: 'arkgate' });
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
    expect(cjs.meta.version).toBe(pkg.version);

    expect(Object.keys(esmPlugin.rules)).toEqual(Object.keys(cjs.rules));
    expect(esmPlugin.meta).toEqual(cjs.meta);
  });

  it('named exports survive Babel / TypeScript CommonJS interop helpers', () => {
    const cjs = require(path.resolve('dist/eslint/index.cjs'));
    // The plugin shape `require()` returns is unchanged by the interop marker.
    expect(Object.keys(cjs)).toEqual(['meta', 'rules', 'configs']);
    expect(cjs.__esModule).toBe(true);
    expect(Object.getOwnPropertyDescriptor(cjs, '__esModule')?.enumerable).toBe(false);

    // Babel `_interopRequireWildcard` (plugin-transform-modules-commonjs), verbatim shape:
    // an `__esModule` object is used as-is, otherwise only enumerable own keys are copied.
    function babelInteropRequireWildcard(obj: any): any {
      if (obj && obj.__esModule) return obj;
      if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
        return { default: obj };
      }
      const newObj: any = { __proto__: null };
      for (const key in obj) {
        if (key !== 'default' && Object.prototype.hasOwnProperty.call(obj, key)) {
          newObj[key] = obj[key];
        }
      }
      newObj.default = obj;
      return newObj;
    }
    function babelInteropRequireDefault(obj: any): any {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    // TypeScript 5.0 `__importStar` (esModuleInterop), verbatim shape: `for (var k in mod)`.
    function tsImportStar(mod: any): any {
      if (mod && mod.__esModule) return mod;
      const result: any = {};
      if (mod != null) {
        for (const k in mod) {
          if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k)) result[k] = mod[k];
        }
      }
      result.default = mod;
      return result;
    }
    function tsImportDefault(mod: any): any {
      return mod && mod.__esModule ? mod : { default: mod };
    }

    for (const ns of [babelInteropRequireWildcard(cjs), tsImportStar(cjs)]) {
      expect(typeof ns.loadArkConfig).toBe('function');
      expect(typeof ns.findConfigPath).toBe('function');
      expect(typeof ns.resolveImportSpecifier).toBe('function');
      expect(typeof ns.noDomainInfraImports).toBe('object');
      expect(ns.plugin).toBe(cjs);
      expect(ns.default).toBe(cjs);
      expect(ns.default.configs.recommended.plugins.ark).toBe(cjs);
    }
    for (const mod of [babelInteropRequireDefault(cjs), tsImportDefault(cjs)]) {
      expect(mod.default).toBe(cjs);
      expect(Object.keys(mod.default.rules)).toContain('no-domain-infra-imports');
    }
  });
});
