/**
 * ADR 0039 D1: no path from the write hook, MCP, ESLint, action.yml or
 * --strict-merge can spawn a test runner. The probe's runner, workspace and CLI
 * are reachable from exactly one edge — the owner-invoked dynamic import in
 * the ark-check entry, behind `args.probeInvariants` — and parseArgs refuses
 * every pairing that would put that edge on a gate path.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../../bin/lib/check-args.mjs';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const RUNNING_MODULES = [
  'bin/lib/invariant-probe-cli.mjs',
  'bin/lib/invariant-probe-runner.mjs',
  'bin/lib/invariant-probe-workspace.mjs',
];
const OWNER_EDGE = { from: 'bin/ark-check-runtime.mjs', to: 'bin/lib/invariant-probe-cli.mjs' };
const SPECIFIER =
  /(?:\bimport\s+(?:[^'"`;]*?\s+from\s+)?|\bexport\s+[^'"`;]*?\s+from\s+|\bimport\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

function resolve(fromRel: string, specifier: string): string | null {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), specifier));
  const candidates = [base, `${base}.ts`, `${base}.mjs`, `${base}.js`, `${base}/index.ts`];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(REPO_ROOT, candidate)) && fs.statSync(path.join(REPO_ROOT, candidate)).isFile()) {
      return candidate;
    }
  }
  return null;
}

/** Every module reachable from `entry` through static and literal dynamic imports, with the edge used. */
function reachable(entry: string, skipEdge?: { from: string; to: string }): Map<string, string> {
  const seen = new Map<string, string>([[entry, '(entry)']]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (file.startsWith('dist/')) continue;
    const text = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
    for (const match of text.matchAll(SPECIFIER)) {
      const target = resolve(file, match[1]!);
      if (!target || seen.has(target)) continue;
      if (skipEdge && file === skipEdge.from && target === skipEdge.to) continue;
      seen.set(target, file);
      queue.push(target);
    }
  }
  return seen;
}

describe('the probe never runs on a gate path (ADR 0039 D1)', () => {
  it.each([
    'bin/ark-mcp.mjs',
    'bin/ark-mcp-runtime.mjs',
    'bin/lib/hook-templates.mjs',
    'bin/lib/resident-hook.mjs',
    'templates/hooks/opencode-ark-write-gate.mjs',
    'src/eslint/index.ts',
    'src/gate.ts',
  ])('%s cannot reach the runner, the workspace or the probe CLI', (entry) => {
    const graph = reachable(entry);
    expect(graph.has(entry)).toBe(true);
    for (const module of RUNNING_MODULES) expect(graph.has(module), `${entry} reaches ${module}`).toBe(false);
  });

  it('the check entry reaches them only through the owner-invoked edge', () => {
    const withEdge = reachable('bin/ark-check.mjs');
    expect(withEdge.has(OWNER_EDGE.to)).toBe(true);
    const without = reachable('bin/ark-check.mjs', OWNER_EDGE);
    for (const module of RUNNING_MODULES) expect(without.has(module), `ark-check reaches ${module}`).toBe(false);
    const runtime = fs.readFileSync(path.join(REPO_ROOT, OWNER_EDGE.from), 'utf8');
    const imports = [...runtime.matchAll(/import\(\s*'\.\/lib\/invariant-probe-cli\.mjs'\s*\)/g)];
    expect(imports).toHaveLength(1);
    const before = runtime.slice(0, imports[0]!.index);
    expect(before.slice(before.lastIndexOf('if (')).startsWith('if (args.probeInvariants) {')).toBe(true);
  });

  it('the evidence reader that gate paths load never spawns or writes', () => {
    const reader = fs.readFileSync(path.join(REPO_ROOT, 'bin/lib/invariant-probe-io.mjs'), 'utf8');
    expect(reader).not.toMatch(/child_process|writeFileSync|renameSync|rmSync/);
  });

  it('parseArgs refuses every pairing with a gate path', () => {
    const argv = (...rest: string[]) => ['node', 'ark-check', ...rest];
    for (const flag of ['--strict-merge', '--strict', '--changed', '--local', '--doctor', '--update-baseline']) {
      expect(() => parseArgs(argv('--probe-invariants', flag), {}), flag).toThrow(/--probe-invariants cannot be combined/);
    }
    for (const flag of ['--promote', '--sensors', '--report', '--coverage']) {
      expect(() => parseArgs(argv('--probe-invariants', flag), {}), flag).toThrow(/silently do nothing/);
    }
    expect(() => parseArgs(argv('--runner', 'node'), {})).toThrow(/--runner applies to --probe-invariants/);
    expect(() => parseArgs(argv('--probe-invariants', '--runner', 'mocha'), {})).toThrow(/--runner must be one of/);
    expect(parseArgs(argv('--probe-invariants', '--write', '--json', '--runner', 'node'), {})).toMatchObject({
      probeInvariants: true,
      write: true,
      json: true,
      runner: 'node',
    });
    expect(parseArgs(argv('--probe-invariants=INV-A'), {}).probeInvariants).toBe('INV-A');
    expect(parseArgs(argv('--probe-invariants', 'INV-B'), {}).probeInvariants).toBe('INV-B');
    // ARK_CHECK_LOCAL=1 never turns the probe into a changed-files run.
    expect(parseArgs(argv('--probe-invariants'), { ARK_CHECK_LOCAL: '1' })).toMatchObject({ local: false, changed: false });
  });

  it('the GitHub Action never passes the flag', () => {
    expect(fs.readFileSync(path.join(REPO_ROOT, 'action.yml'), 'utf8')).not.toMatch(/probe-invariants/);
  });
});
