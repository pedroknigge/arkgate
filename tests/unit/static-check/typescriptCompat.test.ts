import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  usableTypescript,
  typescriptUsabilityHint,
} from '../../../bin/ark-shared.mjs';
import { loadTypeScript } from '../../../bin/lib/typescript-host.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CHECK = path.join(REPO, 'bin/ark-check.mjs');
const FIXTURE = path.join(REPO, 'tests/fixtures/ts-consumer');

describe('usableTypescript (TS5/6/7 shape guard)', () => {
  it('accepts a module with sys + AST + resolve (TS 5/6 shape)', () => {
    const fake = {
      version: '5.9.3',
      sys: { fileExists: () => true },
      createSourceFile: () => ({}),
      resolveModuleName: () => ({}),
      isInTypeQuery: () => false,
    };
    expect(usableTypescript(fake)).toBe(fake);
  });

  it('accepts CJS/ESM interop where API lives on .default', () => {
    const api = {
      version: '5.9.3',
      sys: { fileExists: () => true },
      createSourceFile: () => ({}),
      resolveModuleName: () => ({}),
      isInTypeQuery: () => false,
    };
    const mod = { default: api, __esModule: true };
    expect(usableTypescript(mod)).toBe(api);
  });

  it('rejects TypeScript 7.0 main export (version-only)', () => {
    // Real typescript@7.0.2: require('typescript') → { version, versionMajorMinor }
    const ts70 = { version: '7.0.2', versionMajorMinor: '7.0' };
    expect(usableTypescript(ts70)).toBeNull();
    expect(typescriptUsabilityHint(ts70)).toMatch(/version-only/i);
  });

  it('rejects incomplete native-ish export without sys (forces fallback)', () => {
    const nativeIsh = {
      version: '7.0.2',
      // no sys — incomplete host
      createSourceFile: () => ({}),
    };
    expect(usableTypescript(nativeIsh)).toBeNull();
    expect(typescriptUsabilityHint(nativeIsh)).toMatch(/missing ts\.sys/i);
  });

  it('rejects a pre-5 host missing the AST helper used by the scanner', () => {
    const ts46 = {
      version: '4.6.4',
      sys: { fileExists: () => true },
      createSourceFile: () => ({}),
      resolveModuleName: () => ({}),
    };
    expect(usableTypescript(ts46)).toBeNull();
    expect(typescriptUsabilityHint(ts46)).toMatch(/isInTypeQuery|TypeScript 5\/6/i);
  });

  it('rejects incomplete sys host', () => {
    const broken = {
      sys: {},
      createSourceFile: () => ({}),
      resolveModuleName: () => ({}),
    };
    expect(usableTypescript(broken)).toBeNull();
    expect(typescriptUsabilityHint(broken)).toMatch(/fileExists/i);
  });

  it('rejects missing AST/resolve even if sys exists', () => {
    const partial = { sys: { fileExists: () => true } };
    expect(usableTypescript(partial)).toBeNull();
  });
});

describe('ark-check + consumer fixture (real CLI)', () => {
  it('runs --plan on the TS7-ish fixture with the repo TypeScript', () => {
    const r = spawnSync(
      process.execPath,
      [CHECK, '--root', FIXTURE, '--config', 'ark.config.json', '--plan', '--json', '--no-cache'],
      { encoding: 'utf8', cwd: REPO }
    );
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.plan).toBeDefined();
    expect(Array.isArray(out.plan.steps)).toBe(true);
    // domain/bad.ts imports type from app → LAYER_IMPORT type-only → mechanical-safe
    const bad = out.plan.steps.find((s: { file?: string }) => s.file === 'src/domain/bad.ts');
    expect(bad).toBeDefined();
    expect(bad.class).toBe('mechanical-safe');
    expect(bad.typeOnly || bad.sourcePureTypeModule).toBeTruthy();
  });
});

describe('loadTypeScript fallback when project TS is unusable', () => {
  it('uses ArkGate\'s physically distinct TS6 host when project TypeScript is unusable', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-ts7-fallback-'));
    // Copy fixture sources
    fs.cpSync(FIXTURE, root, { recursive: true });
    // Fake unusable project typescript package
    const fakeTs = path.join(root, 'node_modules', 'typescript');
    fs.mkdirSync(fakeTs, { recursive: true });
    fs.writeFileSync(
      path.join(fakeTs, 'package.json'),
      JSON.stringify({ name: 'typescript', version: '7.0.0-fake', main: 'index.js' })
    );
    // No sys — unusable for ark-check
    fs.writeFileSync(
      path.join(fakeTs, 'index.js'),
      'module.exports = { version: "7.0.0-fake", createSourceFile: function() { return {}; } };\n'
    );
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'ts7-fallback-fixture', private: true })
    );

    const loaded = await loadTypeScript(root);
    expect(loaded).toMatchObject({ source: 'arkgate-fallback' });
    expect(loaded?.version).toMatch(/^6\./);
    expect(loaded?.fallbackReason).toMatch(/not API-compatible/i);

    const r = spawnSync(
      process.execPath,
      [CHECK, '--root', root, '--config', 'ark.config.json', '--plan', '--json', '--no-cache'],
      {
        encoding: 'utf8',
        env: { ...process.env, ARK_DEBUG_TS: '1' },
      }
    );
    // Must not crash; the installed CLI must use the same distinct fallback.
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.plan?.steps?.length).toBeGreaterThan(0);
    // stderr/stdout may mention fallback when not json-only for reason — plan is json so
    // fallbackReason is suppressed; success with steps proves load worked via fallback.
    const bad = out.plan.steps.find((s: { file?: string }) => s.file === 'src/domain/bad.ts');
    expect(bad?.class).toBe('mechanical-safe');
  });
});
