/**
 * Branch coverage for projected-governed-coverage helpers + resolveStartInitPreset.
 * Spawn/CLI tests do not reliably hit parse/JSON fall-through or preset forks.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveStartInitPreset } from '../../../bin/ark-shared.mjs';
import {
  measureGovernedCoverage,
  measureProjectedGovernedCoverage,
  resolveProjectedCoverageConfig,
  starterConfigForPreset,
  summarizeGovernedCoverage,
  withProjectedGovernedCoverage,
} from '../../../bin/lib/projected-governed-coverage.mjs';

function mkTemp(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(file: string, body: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

function fullCoverConfig() {
  return {
    include: ['src'],
    layers: [{ name: 'App', patterns: ['src/**'] }],
    rules: [],
  };
}

describe('starterConfigForPreset', () => {
  it('returns null for unknown ids and uses include-roots for monorepo/ui-surface', () => {
    const root = mkTemp('ark-pgc-starter-');
    try {
      expect(starterConfigForPreset(root, 'not-a-preset')).toBeNull();
      const spa = starterConfigForPreset(root, 'vite-vercel-spa');
      expect(spa).toBeTruthy();
      expect(spa.layers?.length).toBeGreaterThan(0);
      writeFile(path.join(root, 'packages/ui/package.json'), '{"name":"ui"}\n');
      writeFile(path.join(root, 'packages/ui/src/index.ts'), 'export const n = 1;\n');
      const mono = starterConfigForPreset(root, 'monorepo');
      expect(mono).toBeTruthy();
      expect(Array.isArray(mono.include) || Array.isArray(mono.layers)).toBe(true);
      const ui = starterConfigForPreset(root, 'ui-surface');
      expect(ui).toBeTruthy();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('resolveProjectedCoverageConfig + measureProjectedGovernedCoverage', () => {
  it('uses an existing object config and falls through invalid JSON / non-objects', async () => {
    const existing = mkTemp('ark-pgc-existing-');
    try {
      writeFile(path.join(existing, 'ark.config.json'), JSON.stringify(fullCoverConfig()));
      writeFile(path.join(existing, 'src/ok.ts'), 'export const ok = 1;\n');
      const resolved = resolveProjectedCoverageConfig(existing, { preset: 'hexagonal' });
      expect(resolved.source).toBe('existing-config');
      expect(resolved.config.layers[0].name).toBe('App');
      const measured = await measureProjectedGovernedCoverage(existing, { preset: 'hexagonal' });
      expect(measured.source).toBe('existing-config');
      expect(measured.percent).toBe(100);
      const withRules = measureGovernedCoverage(existing, {
        ...fullCoverConfig(),
        rules: [{ from: 'App', to: 'App', allowed: true }],
      });
      expect(withRules.governed.percent).toBe(100);
    } finally {
      fs.rmSync(existing, { recursive: true, force: true });
    }

    const badJson = mkTemp('ark-pgc-badjson-');
    try {
      writeFile(path.join(badJson, 'ark.config.json'), '{not-json');
      const fromInvalid = resolveProjectedCoverageConfig(badJson, { preset: 'vite-vercel-spa' });
      expect(fromInvalid.source).toBe('start-starter');
      expect(fromInvalid.preset).toBe('vite-vercel-spa');
      expect(fromInvalid.config).toBeTruthy();
    } finally {
      fs.rmSync(badJson, { recursive: true, force: true });
    }

    const asNull = mkTemp('ark-pgc-nullcfg-');
    try {
      writeFile(path.join(asNull, 'ark.config.json'), 'null');
      const fromNull = resolveProjectedCoverageConfig(asNull, { preset: 'vite-vercel-spa' });
      expect(fromNull.source).toBe('start-starter');
    } finally {
      fs.rmSync(asNull, { recursive: true, force: true });
    }

    const asNumber = mkTemp('ark-pgc-numcfg-');
    try {
      writeFile(path.join(asNumber, 'ark.config.json'), '42');
      const fromNumber = resolveProjectedCoverageConfig(asNumber, { preset: 'vite-vercel-spa' });
      expect(fromNumber.source).toBe('start-starter');
    } finally {
      fs.rmSync(asNumber, { recursive: true, force: true });
    }
  });

  it('returns source none / empty coverage when no config and no preset', async () => {
    const empty = mkTemp('ark-pgc-none-');
    try {
      const none = resolveProjectedCoverageConfig(empty, {});
      expect(none).toEqual({ config: null, source: 'none', preset: null });
      const coverage = await measureProjectedGovernedCoverage(empty, {});
      expect(coverage).toMatchObject({
        percent: 0,
        classifiedFiles: 0,
        totalFiles: 0,
        emptyScope: true,
        source: 'none',
        preset: null,
      });
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it('treats an unknown recommended preset as an empty starter measurement', async () => {
    const dir = mkTemp('ark-pgc-badpreset-');
    try {
      const resolved = resolveProjectedCoverageConfig(dir, { preset: 'not-a-preset' });
      expect(resolved.source).toBe('start-starter');
      expect(resolved.config).toBeNull();
      const coverage = await measureProjectedGovernedCoverage(dir, { preset: 'not-a-preset' });
      expect(coverage.source).toBe('start-starter');
      expect(coverage.preset).toBe('not-a-preset');
      expect(coverage.emptyScope).toBe(true);
      expect(coverage.percent).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('summarizeGovernedCoverage', () => {
  it('treats missing or non-numeric percent as 0 and reads emptyScope', () => {
    expect(summarizeGovernedCoverage(undefined)).toEqual({
      percent: 0,
      classifiedFiles: 0,
      totalFiles: 0,
      emptyScope: false,
    });
    expect(summarizeGovernedCoverage({ percent: 'high', totalFiles: 4 })).toEqual({
      percent: 0,
      classifiedFiles: 0,
      totalFiles: 4,
      emptyScope: false,
    });
    expect(
      summarizeGovernedCoverage({
        governed: { percent: 36, classifiedFiles: 18, totalFiles: 50 },
        emptyScope: true,
      })
    ).toEqual({
      percent: 36,
      classifiedFiles: 18,
      totalFiles: 50,
      emptyScope: true,
    });
  });
});

describe('withProjectedGovernedCoverage', () => {
  it('is a no-op on non-objects', () => {
    const root = mkTemp('ark-pgc-noop-');
    try {
      expect(withProjectedGovernedCoverage(null, root)).toBeNull();
      expect(withProjectedGovernedCoverage('nope', root)).toBe('nope');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('replaces a stale confirmation reason with the measured percent', () => {
    const root = mkTemp('ark-pgc-rewrite-');
    try {
      const withoutReasons = withProjectedGovernedCoverage({}, root);
      expect(withoutReasons.confirmationReasons).toEqual([
        'projected governed coverage is 0% (below 90%)',
      ]);
      const rewritten = withProjectedGovernedCoverage(
        {
          confirmationReasons: ['projected governed coverage is 89% (below 90%)'],
        },
        root
      );
      expect(rewritten.projectedCoverage.percent).toBe(0);
      expect(rewritten.signals.projectedGovernedCoverage).toBe(0);
      expect(rewritten.confirmationReasons).toEqual([
        'projected governed coverage is 0% (below 90%)',
      ]);
      expect(rewritten.requiresConfirmation).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps requiresConfirmation on a thin TypeScript surface even at 100%', () => {
    const root = mkTemp('ark-pgc-thin-');
    try {
      writeFile(path.join(root, 'ark.config.json'), JSON.stringify(fullCoverConfig()));
      writeFile(path.join(root, 'src/ok.ts'), 'export const ok = 1;\n');
      const wrapped = withProjectedGovernedCoverage(
        {
          requiresConfirmation: false,
          confirmationReasons: [],
          thinTsSurface: true,
        },
        root
      );
      expect(wrapped.projectedCoverage.percent).toBe(100);
      expect(wrapped.requiresConfirmation).toBe(true);
      expect(wrapped.confirmationReasons.some((line: string) => line.includes('below 90%'))).toBe(
        false
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('resolveStartInitPreset', () => {
  it('prefers rec.preset, then a valid archetype, then null', () => {
    const root = mkTemp('ark-pgc-preset-');
    try {
      expect(resolveStartInitPreset(root, {})).toBeNull();
      expect(resolveStartInitPreset(root, { preset: 'hexagonal' })).toBe('hexagonal');
      expect(resolveStartInitPreset(root, { preset: 'vite-vercel-spa' })).toBe('vite-vercel-spa');
      expect(resolveStartInitPreset(root, { archetype: 'api-backend' })).toBe('hexagonal');
      expect(resolveStartInitPreset(root, { archetype: 'not-real' })).toBeNull();
      expect(resolveStartInitPreset(root, { preset: 'layered' }, 'api-backend')).toBe('layered');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('maps monorepo-looking trees to monorepo or ui-surface', () => {
    const apps = mkTemp('ark-pgc-apps-');
    try {
      fs.mkdirSync(path.join(apps, 'apps'));
      expect(resolveStartInitPreset(apps, { mature: true, preset: 'hexagonal' })).toBe('monorepo');
      expect(
        resolveStartInitPreset(apps, { mature: true, archetype: 'frontend-surface' })
      ).toBe('ui-surface');
      expect(resolveStartInitPreset(apps, { mature: true, preset: 'feature-sliced' })).toBe(
        'ui-surface'
      );
    } finally {
      fs.rmSync(apps, { recursive: true, force: true });
    }

    const many = mkTemp('ark-pgc-many-');
    try {
      for (const name of ['a', 'b', 'c', 'd']) {
        writeFile(path.join(many, `packages/${name}/package.json`), `{"name":"${name}"}\n`);
        writeFile(path.join(many, `packages/${name}/src/index.ts`), 'export const n = 1;\n');
      }
      expect(
        resolveStartInitPreset(many, { archetype: 'frontend-surface', mature: true })
      ).toBe('monorepo');
    } finally {
      fs.rmSync(many, { recursive: true, force: true });
    }

    const markers = mkTemp('ark-pgc-markers-');
    try {
      writeFile(path.join(markers, 'rush.json'), '{}\n');
      expect(resolveStartInitPreset(markers, { mature: true })).toBe('monorepo');
      fs.unlinkSync(path.join(markers, 'rush.json'));
      writeFile(path.join(markers, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
      expect(resolveStartInitPreset(markers, { mature: true })).toBe('monorepo');
      fs.unlinkSync(path.join(markers, 'pnpm-workspace.yaml'));
      writeFile(path.join(markers, 'lerna.json'), '{}\n');
      expect(resolveStartInitPreset(markers, { mature: true })).toBe('monorepo');
    } finally {
      fs.rmSync(markers, { recursive: true, force: true });
    }
  });
});
