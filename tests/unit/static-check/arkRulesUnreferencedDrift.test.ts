/**
 * ADR 0012 D2: an arkrules/*.json that the arkRules map does not reference is advisory
 * drift. It must be visible on check JSON and doctor, with or without a map, and must
 * never change the verdict.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { loadEffectiveArkRulesFromDisk } from '../../../bin/lib/effective-contract-load.mjs';
import {
  formatArkRulesDoctorLines,
  summarizeRulesUnderContract,
} from '../../../bin/lib/rules-under-contract.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const RULES = {
  schemaVersion: '1.0',
  layer: 'Domain',
  structure: [{ id: 'private-state', sensor: 'aggregate-private-state', mode: 'advisory' }],
};

function fixture(withMap: boolean): { root: string; config: Record<string, unknown> } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-arkrules-drift-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'src', 'domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'arkrules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'domain', 'order.ts'), 'export const x = 1;\n');
  fs.writeFileSync(path.join(root, 'arkrules', 'Domain.json'), JSON.stringify(RULES));
  fs.writeFileSync(path.join(root, 'arkrules', 'Extra.json'), JSON.stringify(RULES));
  const config: Record<string, unknown> = {
    schemaVersion: '1.1',
    include: ['src'],
    layers: [{ name: 'Domain', patterns: ['src/domain/**'] }],
    rules: [],
    dynamicImportAllowlist: [],
    ...(withMap ? { arkRules: { Domain: 'arkrules/Domain.json' } } : {}),
  };
  fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify(config));
  return { root, config };
}

function check(root: string) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(REPO_ROOT, 'bin', 'ark-check.mjs'),
      '--root',
      root,
      '--config',
      path.join(root, 'ark.config.json'),
      '--json',
    ],
    { encoding: 'utf8' }
  );
  return {
    status: result.status,
    json: JSON.parse(result.stdout) as {
      ok: boolean;
      warnings: Array<{ ruleId: string; file?: string; failsStrict?: boolean }>;
    },
  };
}

describe('unreferenced arkrules/*.json drift (arkrules cluster)', () => {
  it('the loader warns with and without an arkRules map', () => {
    const mapped = fixture(true);
    expect(
      loadEffectiveArkRulesFromDisk(mapped.root, mapped.config).warnings.map(
        (w: { path: string }) => w.path
      )
    ).toEqual(['arkrules/Extra.json']);
    const unmapped = fixture(false);
    expect(
      loadEffectiveArkRulesFromDisk(unmapped.root, unmapped.config).warnings.map(
        (w: { path: string }) => w.path
      )
    ).toEqual(['arkrules/Domain.json', 'arkrules/Extra.json']);
  });

  it('ark-check --json lists ARKRULE_FILE_UNREFERENCED as advisory without changing ok', () => {
    for (const withMap of [true, false]) {
      const { root } = fixture(withMap);
      const { status, json } = check(root);
      const drift = json.warnings.filter((w) => w.ruleId === 'ARKRULE_FILE_UNREFERENCED');
      expect(drift.map((w) => w.file)).toContain('arkrules/Extra.json');
      expect(drift.every((w) => w.failsStrict === false)).toBe(true);
      // Same verdict as the fixture without the stray file.
      fs.rmSync(path.join(root, 'arkrules', 'Extra.json'));
      if (!withMap) fs.rmSync(path.join(root, 'arkrules'), { recursive: true });
      const clean = check(root);
      expect(status).toBe(clean.status);
      expect(json.ok).toBe(clean.json.ok);
    }
  });

  it('doctor rulesUnderContract names the unreferenced files, map or not', () => {
    const mapped = fixture(true);
    const summary = summarizeRulesUnderContract(mapped.root, mapped.config, { files: [] });
    expect(summary.unreferencedFiles).toEqual(['arkrules/Extra.json']);
    expect(formatArkRulesDoctorLines(summary).join('\n')).toContain('ARKRULE_FILE_UNREFERENCED');

    const unmapped = fixture(false);
    const inactive = summarizeRulesUnderContract(unmapped.root, unmapped.config, { files: [] });
    expect(inactive.active).toBe(false);
    expect(inactive.unreferencedFiles).toEqual(['arkrules/Domain.json', 'arkrules/Extra.json']);
    expect(formatArkRulesDoctorLines(inactive).join('\n')).toContain('arkrules/Extra.json');
  });
});
