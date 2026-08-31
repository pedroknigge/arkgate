import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeResolvedProject, loadContract } from '../../../src/gate';
import { loadTypeScript } from '../../../bin/lib/typescript-host.mjs';
import { resolveCandidateFacts } from '../../../bin/lib/resolved-candidate-facts.mjs';

const CORPUS = path.resolve('tests/fixtures/arkorder-skip-corpus');
const roots: string[] = [];

const CASES = [
  {
    id: 'missing-plane',
    tree: 'trees/missing-plane',
    expected: ['ARKORDER_MISSING_PLANE'],
  },
  {
    id: 'domain-import',
    tree: 'trees/domain-import',
    expected: ['ARKORDER_KERNEL_IN_DOMAIN'],
  },
  {
    id: 'generic-update',
    tree: 'trees/generic-update',
    expected: ['ARKORDER_GENERIC_UPDATE'],
  },
  {
    id: 'xi-field-write',
    tree: 'trees/xi-field-write',
    expected: ['ARKORDER_XI_FIELD_WRITE'],
  },
  {
    id: 'ingest-writes-xi',
    tree: 'trees/ingest-writes-xi',
    expected: ['ARKORDER_INGEST_WRITES_XI'],
  },
  {
    id: 'too-many-params',
    tree: 'trees/too-many-params',
    expected: ['ARKORDER_TOO_MANY_PARAMS'],
  },
] as const;

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(CORPUS, relativePath), 'utf8')) as Record<
    string,
    unknown
  >;
}

function configFor(mode: 'absent' | 'advisory' | 'enforced'): Record<string, unknown> {
  const layers = readJson('contracts/layers.json');
  if (mode === 'absent') return layers;
  return {
    ...layers,
    ...readJson(
      mode === 'enforced'
        ? 'contracts/arkorder-enforced.json'
        : 'contracts/arkorder-advisory.json'
    ),
  };
}

function copyTree(tree: string): string {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), `ark-or06-${path.basename(tree)}-`))
  );
  roots.push(root);
  fs.cpSync(path.join(CORPUS, tree), root, { recursive: true });
  return root;
}

function orderIds(items: ReadonlyArray<{ ruleId?: string | null }> = []): string[] {
  return [
    ...new Set(
      items
        .map((item) => item.ruleId)
        .filter((id): id is string => typeof id === 'string' && id.startsWith('ARKORDER_'))
    ),
  ].sort();
}

async function analyzeRoot(root: string, config: unknown) {
  const loaded = await loadTypeScript(root);
  expect(loaded.ts).toBeTruthy();
  const contract = loadContract(config);
  const facts = resolveCandidateFacts({
    root,
    config: contract.config,
    ts: loaded.ts,
  });
  return analyzeResolvedProject({ contract, facts });
}

describe('OR06 ArkOrder skip corpus', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it.each(CASES.map((entry) => [entry.id, entry] as const))(
    '%s: extra absent stays green; enforced fails the skip',
    async (_id, entry) => {
      const absentRoot = copyTree(entry.tree);
      const absent = await analyzeRoot(absentRoot, configFor('absent'));
      expect(orderIds(absent.ir.violations)).toEqual([]);
      expect(orderIds(absent.ir.warnings)).toEqual([]);
      expect(absent.valid).toBe(true);

      const enforcedRoot = copyTree(entry.tree);
      const enforced = await analyzeRoot(enforcedRoot, configFor('enforced'));
      expect(orderIds(enforced.ir.violations)).toEqual([...entry.expected].sort());
      expect(enforced.valid).toBe(false);

      const advisoryRoot = copyTree(entry.tree);
      const advisory = await analyzeRoot(advisoryRoot, configFor('advisory'));
      expect(orderIds(advisory.ir.violations)).toEqual([]);
      expect(orderIds(advisory.ir.warnings)).toEqual([...entry.expected].sort());
      expect(advisory.valid).toBe(true);
    }
  );

  it('unvalved second freeze is runtime fail-closed, not a lexical skip (LV02)', async () => {
    const tree = 'trees/unvalved-release';
    const absentRoot = copyTree(tree);
    const absent = await analyzeRoot(absentRoot, configFor('absent'));
    expect(orderIds(absent.ir.violations)).toEqual([]);
    expect(orderIds(absent.ir.warnings)).toEqual([]);
    expect(absent.valid).toBe(true);

    const enforcedRoot = copyTree(tree);
    const enforced = await analyzeRoot(enforcedRoot, configFor('enforced'));
    expect(orderIds(enforced.ir.violations)).not.toContain('ARKORDER_UNVALVED_RELEASE');
    expect(orderIds(enforced.ir.warnings)).not.toContain('ARKORDER_UNVALVED_RELEASE');
  });
});
