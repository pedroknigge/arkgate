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
});
