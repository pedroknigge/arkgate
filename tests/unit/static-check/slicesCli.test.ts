/**
 * Hierarchical slices through the real ark-check CLI: the advisory sibling
 * ratchet against a baseline (#336), the version floor that needs pin evidence
 * (#338), and `--changed` when only a shared root changed (slice audit).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { baselineOccurrenceKeys } from '../../../bin/lib/baseline-key.mjs';
import { baselineRecordsDocument } from '../../../bin/lib/team-parliament.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const ARK_CHECK = path.join(REPO_ROOT, 'bin/ark-check.mjs');
const temps: string[] = [];

afterEach(() => {
  for (const root of temps.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function tempRoot(prefix: string): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  temps.push(root);
  return root;
}

function write(root: string, rel: string, body: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

function check(root: string, extra: string[] = []) {
  const result = spawnSync(
    process.execPath,
    [ARK_CHECK, '--root', root, '--config', path.join(root, 'ark.config.json'), '--no-cache', ...extra],
    { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } }
  );
  return result;
}

function checkJson(root: string, extra: string[] = []) {
  const result = check(root, ['--json', ...extra]);
  const stdout = result.stdout ?? '';
  const parsed = JSON.parse(stdout.slice(stdout.indexOf('{'))) as {
    ok: boolean;
    violations: { ruleId: string; file: string; reasonId?: string; severity?: string; failsStrict?: boolean }[];
    warnings?: { ruleId: string; file?: string; line?: number; nextAction?: string }[];
    diagnostics?: { ruleId: string; location: { file: string; line: number }; nextAction?: string }[];
    doctor?: Record<string, unknown>;
  };
  return { status: result.status, parsed, stderr: result.stderr };
}

const APP_LAYERS = [{ name: 'Application', patterns: ['src/lib/**'] }];

function childConfig(siblings: unknown) {
  return {
    schemaVersion: '1.3',
    include: ['src'],
    layers: APP_LAYERS,
    rules: [
      {
        from: 'Application',
        to: 'Application',
        allowed: false,
        peerIsolation: true,
        sliceFolders: ['features'],
        childSlices: { sliceFolders: ['lib/features/*/*'], sliceIdentity: 'stars', siblings },
      },
    ],
  };
}

function ratchetFixture(siblings: unknown): string {
  const root = tempRoot('ark-slices-ratchet-');
  write(root, 'ark.config.json', JSON.stringify(childConfig(siblings), null, 2));
  write(root, 'src/lib/features/projects/scm/s.ts', 'export const s = 1;\n');
  write(root, 'src/lib/features/projects/d2d/d.ts', 'export const d = 1;\n');
  // Enforced importer: an error on every run.
  write(root, 'src/lib/features/projects/rfi/a.ts', "import { s } from '../scm/s';\nexport const a = s;\n");
  // Advisory importers: warnings unless the ratchet promotes them.
  write(root, 'src/lib/features/projects/scm/b.ts', "import { d } from '../d2d/d';\nexport const b = d;\n");
  write(root, 'src/lib/features/projects/scm/c.ts', "import { d } from '../d2d/d';\nexport const c = d;\n");
  return root;
}

function writeBaselineFor(root: string, keep: (row: { file: string; failsStrict?: boolean }) => boolean) {
  const { parsed } = checkJson(root);
  const rows = parsed.violations;
  const keys = baselineOccurrenceKeys(rows).filter((_: string, index: number) => keep(rows[index]!));
  write(root, '.ark-baseline.json', `${JSON.stringify(baselineRecordsDocument(keys, 'test'), null, 2)}\n`);
}

const advisory = (rows: { reasonId?: string; severity?: string; failsStrict?: boolean; file: string }[]) =>
  rows
    .filter((row) => row.reasonId === 'CROSS_SIBLING_SLICE' && row.file.includes('/scm/'))
    .map((row) => `${path.basename(row.file)}:${row.failsStrict === false ? 'warning' : 'error'}`)
    .sort();

describe('advisory sibling ratchet through ark-check --baseline (#336)', () => {
  const siblings = { default: 'advisory', enforce: ['features/projects/rfi'] };

  it('ark-check --json diagnostics carry the slice reason and its own next action', () => {
    const root = ratchetFixture(siblings);
    const { parsed } = checkJson(root);
    const diagnostics = (parsed.diagnostics ?? []) as {
      ruleId: string;
      location: { file: string };
      evidence: { reasonId?: string; universeFrom?: string };
      nextAction?: string;
    }[];
    const enforced = diagnostics.find((row) => row.location.file.endsWith('/rfi/a.ts'));
    expect(enforced?.evidence).toMatchObject({ reasonId: 'CROSS_SIBLING_SLICE', universeFrom: 'projects' });
    expect(enforced?.nextAction).toContain('Import universe-common code');
  });

  it('an empty baseline keeps advisory crossings as warnings', () => {
    const root = ratchetFixture(siblings);
    write(root, '.ark-baseline.json', `${JSON.stringify(baselineRecordsDocument([], 'test'))}\n`);
    const { parsed } = checkJson(root, ['--baseline']);
    expect(advisory(parsed.violations)).toEqual(['b.ts:warning', 'c.ts:warning']);
  });

  it('a legacy baseline (frozen before the child wall) passes with warnings only', () => {
    const root = ratchetFixture(siblings);
    writeBaselineFor(root, (row) => row.failsStrict !== false);
    const { status, parsed } = checkJson(root, ['--baseline']);
    expect(status).toBe(0);
    expect(parsed.ok).toBe(true);
  });

  it('ratchet: true makes the unrecorded advisory crossings errors', () => {
    const root = ratchetFixture({ ...siblings, ratchet: true });
    writeBaselineFor(root, (row) => row.failsStrict !== false);
    const { status, parsed } = checkJson(root, ['--baseline']);
    expect(status).toBe(1);
    expect(advisory(parsed.violations)).toEqual(['b.ts:error', 'c.ts:error']);
  });

  it('auto: with one advisory crossing recorded, only the new one fails', () => {
    const root = ratchetFixture(siblings);
    writeBaselineFor(root, (row) => !row.file.endsWith('/c.ts'));
    const { status, parsed } = checkJson(root, ['--baseline']);
    expect(status).toBe(1);
    // b.ts is recorded (suppressed by the baseline); the new c.ts is promoted.
    expect(advisory(parsed.violations)).toEqual(['c.ts:error']);
    expect(parsed.violations.find((row) => row.file.endsWith('/c.ts'))).toMatchObject({ severity: 'error' });
  });

  it('doctor counts the same blocking findings as --baseline', () => {
    const root = ratchetFixture({ ...siblings, ratchet: true });
    writeBaselineFor(root, (row) => row.failsStrict !== false);
    const { parsed } = checkJson(root, ['--doctor']);
    const honesty = (parsed.doctor?.productHonesty ?? {}) as { reasonIds?: string[] };
    expect(honesty.reasonIds ?? []).toContain('active-blocking-violations');
    const measure = ratchetFixture({ ...siblings, ratchet: false });
    writeBaselineFor(measure, (row) => row.failsStrict !== false);
    const quiet = checkJson(measure, ['--doctor']).parsed.doctor?.productHonesty as { reasonIds?: string[] };
    expect(quiet?.reasonIds ?? []).not.toContain('active-blocking-violations');
  });
});

describe('config version floor through ark-check (#338)', () => {
  function pinFixture(): string {
    const root = tempRoot('ark-slices-pins-');
    write(root, 'ark.config.json', JSON.stringify(childConfig('deny'), null, 2));
    write(root, 'src/lib/features/projects/rfi/a.ts', 'export const a = 1;\n');
    return root;
  }
  const versionRows = (parsed: ReturnType<typeof checkJson>['parsed']) =>
    (parsed.diagnostics ?? []).filter((row) => row.ruleId === 'CONFIG_CHILD_SLICES_VERSION');

  it('is silent when every pin is current or there is no pin', () => {
    const root = pinFixture();
    expect(versionRows(checkJson(root).parsed)).toEqual([]);
    write(root, 'package.json', JSON.stringify({ name: 'app', devDependencies: { arkgate: '4.8.23' } }, null, 2));
    write(root, 'scripts/ark-write-hook.sh', '#!/bin/sh\nexec npx -y arkgate@4.8.23 ark-mcp --hook\n');
    expect(versionRows(checkJson(root).parsed)).toEqual([]);
  });

  it('points at a stale CI pin with the version to bump to', () => {
    const root = pinFixture();
    write(
      root,
      '.github/workflows/ark.yml',
      'name: ark\non: push\njobs:\n  ark:\n    steps:\n      - uses: pedroknigge/arkgate@v4.8.22\n'
    );
    const rows = versionRows(checkJson(root).parsed);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.location).toMatchObject({ file: '.github/workflows/ark.yml', line: 6 });
    expect(rows[0]?.nextAction).toMatch(/^Bump arkgate in \.github\/workflows\/ark\.yml from 4\.8\.22 to \d+\.\d+\.\d+/);
  });

  it('covers deny-cross-parent without childSlices', () => {
    const root = tempRoot('ark-slices-pins-dcp-');
    const config = childConfig('deny');
    const rule = { ...config.rules[0]!, sharedImportsSlice: 'deny-cross-parent' } as Record<string, unknown>;
    delete rule.childSlices;
    write(root, 'ark.config.json', JSON.stringify({ ...config, rules: [rule] }, null, 2));
    write(root, 'src/lib/features/projects/rfi/a.ts', 'export const a = 1;\n');
    write(root, 'package.json', JSON.stringify({ name: 'app', devDependencies: { arkgate: '4.8.22' } }, null, 2));
    const rows = versionRows(checkJson(root).parsed);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.location.file).toBe('package.json');
  });
});

describe('--changed when only a shared root changed (slice audit)', () => {
  function git(root: string, args: string[]) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
  }

  it('fails like the full check when a shared edit completes a cross-universe path', () => {
    const root = tempRoot('ark-slices-changed-');
    write(
      root,
      'ark.config.json',
      JSON.stringify(
        {
          schemaVersion: '1.3',
          include: ['src'],
          layers: APP_LAYERS,
          rules: [
            {
              from: 'Application',
              to: 'Application',
              allowed: false,
              peerIsolation: true,
              sliceFolders: ['features'],
              sharedRoots: ['lib/shared'],
              sharedImportsSlice: 'deny-cross-parent',
            },
          ],
        },
        null,
        2
      )
    );
    write(root, 'src/lib/shared/bridge.ts', 'export const BRIDGE = 1;\n');
    write(root, 'src/lib/features/projects/p.ts', "import { BRIDGE } from '../../shared/bridge';\nexport const p = BRIDGE;\n");
    write(root, 'src/lib/features/management/m.ts', 'export const M = 1;\n');
    git(root, ['init', '-q']);
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base']);
    expect(check(root).status).toBe(0);

    write(root, 'src/lib/shared/bridge.ts', "import { M } from '../features/management/m';\nexport const BRIDGE = M;\n");
    const full = checkJson(root);
    expect(full.parsed.violations.some((row) => row.reasonId === 'CROSS_PARENT_VIA_SHARED')).toBe(true);
    const changed = checkJson(root, ['--changed', '--base', 'HEAD']);
    expect(changed.status).toBe(1);
    expect(changed.parsed.violations.find((row) => row.reasonId === 'CROSS_PARENT_VIA_SHARED')?.file).toBe(
      'src/lib/features/projects/p.ts'
    );
  });
});
