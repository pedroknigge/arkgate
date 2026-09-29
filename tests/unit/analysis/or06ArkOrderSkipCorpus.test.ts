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
  {
    // README one-liner: `new PrismaClient().billing.update({ data: { plan } })`.
    id: 'xi-field-write-inline-client',
    tree: 'trees/xi-field-write-inline-client',
    expected: ['ARKORDER_XI_FIELD_WRITE'],
  },
  {
    id: 'xi-field-write-renamed-client',
    tree: 'trees/xi-field-write-renamed-client',
    expected: ['ARKORDER_XI_FIELD_WRITE'],
  },
  {
    // Constructor-injected client: `constructor(private readonly orm: PrismaClient)`.
    id: 'xi-field-write-injected-client',
    tree: 'trees/xi-field-write-injected-client',
    expected: ['ARKORDER_XI_FIELD_WRITE'],
  },
  {
    // Map.set in the plane root stays silent; (billingPlane as T).update elsewhere denies.
    id: 'generic-update-named-plane',
    tree: 'trees/generic-update-named-plane',
    expected: ['ARKORDER_GENERIC_UPDATE'],
  },
  {
    id: 'xi-ttl',
    tree: 'trees/xi-ttl',
    expected: ['ARKORDER_XI_TTL'],
  },
  {
    id: 'information-budget',
    tree: 'trees/information-budget',
    expected: ['ARKORDER_INFORMATION_BUDGET'],
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

  it('EOSF5-001: React/UI .set() without arkgate/order stays silent', async () => {
    const reactView = `import { useState } from 'react';

export function ScheduleMilestoneTrialView(): void {
  const [tab, setTab] = useState('schedule');
  const order = new Map<string, string>();
  order.set('milestone', 'trial');
  const searchParams = new URLSearchParams();
  searchParams.set('tab', tab);
  setTab('done');
}
`;

    const writeView = (root: string) => {
      const dir = path.join(root, 'src/application');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'schedule-milestone-trial-view.ts'), reactView);
    };

    const absentRoot = copyTree('trees/unvalved-release');
    writeView(absentRoot);
    const absent = await analyzeRoot(absentRoot, configFor('absent'));
    expect(orderIds(absent.ir.violations)).toEqual([]);
    expect(orderIds(absent.ir.warnings)).toEqual([]);
    expect(absent.valid).toBe(true);

    const enforcedRoot = copyTree('trees/unvalved-release');
    writeView(enforcedRoot);
    const enforced = await analyzeRoot(enforcedRoot, configFor('enforced'));
    expect(orderIds(enforced.ir.violations)).not.toContain('ARKORDER_GENERIC_UPDATE');
    expect(orderIds(enforced.ir.warnings)).not.toContain('ARKORDER_GENERIC_UPDATE');
    expect(enforced.valid).toBe(true);

    const advisoryRoot = copyTree('trees/unvalved-release');
    writeView(advisoryRoot);
    const advisory = await analyzeRoot(advisoryRoot, configFor('advisory'));
    expect(orderIds(advisory.ir.violations)).not.toContain('ARKORDER_GENERIC_UPDATE');
    expect(orderIds(advisory.ir.warnings)).not.toContain('ARKORDER_GENERIC_UPDATE');
  });

  it('EOSF5-001: plane.set / orderPlane.update deny when enforced (ArkOrder evidence in the file)', async () => {
    const writeDenies = (root: string) => {
      const dir = path.join(root, 'src/application');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'plane-set.ts'),
        `import type { OrderPlane } from 'arkgate/order';
export function bump(plane: OrderPlane): void {
  (plane as unknown as { set(xi: object): void }).set({ plan: 'pro' });
}
`
      );
      fs.writeFileSync(
        path.join(dir, 'order-plane-update.ts'),
        `import type {} from 'arkgate/order';
export function bump(orderPlane: { update(xi: object): void }): void {
  orderPlane.update({ plan: 'pro' });
}
`
      );
    };

    const enforcedRoot = copyTree('trees/unvalved-release');
    writeDenies(enforcedRoot);
    const enforced = await analyzeRoot(enforcedRoot, configFor('enforced'));
    const files = enforced.ir.violations
      .filter((item) => item.ruleId === 'ARKORDER_GENERIC_UPDATE')
      .map((item) => item.file)
      .sort();
    expect(files).toEqual([
      'src/application/order-plane-update.ts',
      'src/application/plane-set.ts',
    ]);
    expect(enforced.valid).toBe(false);
  });

  it('precision: a `*Plane` name with no ArkOrder evidence is not a plane (clipPlane / controlPlane)', async () => {
    const root = copyTree('trees/unvalved-release');
    const dir = path.join(root, 'src/application');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'other.ts'),
      `export function clip(clipPlane: { set(a: number, b: number): void }): void {
  clipPlane.set(1, 0);
}
export function scale(controlPlane: { update(x: object): void }): void {
  controlPlane.update({ replicas: 3 });
}
`
    );
    const enforced = await analyzeRoot(root, configFor('enforced'));
    const hits = [...enforced.ir.violations, ...enforced.ir.warnings].filter(
      (item) => item.ruleId === 'ARKORDER_GENERIC_UPDATE' && item.file === 'src/application/other.ts'
    );
    expect(hits).toEqual([]);
  });

  it('precision: residual bindings, repo writes, σ freshness, and lock leases stay silent', async () => {
    const writeQuiet = (root: string) => {
      fs.writeFileSync(
        path.join(root, 'src/main.ts'),
        `import { createOrderPlane } from 'arkgate/order';

export function boot(): void {
  const plane = createOrderPlane({
    projector: () => ({ allowedKinds: ['InvoicePosted'], invalidated: [] }),
  });
  plane.release({ plan: 'free' }, { freshUntil: 1500 });
  const currentResidual = plane.ingest({ kind: 'InvoicePosted' });
  const patternResult = plane.ingest({ kind: 'InvoicePosted' });
  const lock = { release(_: object): void {} };
  lock.release({ ttl: 5 });
  void currentResidual;
  void patternResult;
}
`
      );
      const dir = path.join(root, 'src/application');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'save.ts'),
        `import { PrismaClient } from '@prisma/client';

export async function savePlan(repo: { update(x: object): Promise<void> }): Promise<void> {
  void PrismaClient;
  await repo.update({ plan: 'pro' });
}
`
      );
    };
    const enforcedRoot = copyTree('trees/unvalved-release');
    writeQuiet(enforcedRoot);
    const enforced = await analyzeRoot(enforcedRoot, configFor('enforced'));
    expect(orderIds(enforced.ir.violations)).toEqual([]);
    expect(enforced.valid).toBe(true);
  });

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
