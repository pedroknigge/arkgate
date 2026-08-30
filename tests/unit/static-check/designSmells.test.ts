/**
 * P02/P03 — design smells + patternBets IR drive real shipped modules.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  detectDesignSmells,
  buildPatternBetsFromSmells,
  formatGreenPlanPointer,
  GREEN_PLAN_POINTER_MAX_IDS,
  isDesignWeak,
  summarizeDesignFitness,
  DESIGN_SMELL_IDS,
  assertNotHealthyFinishedIgnoringDesign,
  assertPatternBetsNeverMechanicalSafe,
} from '../../../bin/lib/design-smells.mjs';
import {
  buildRemediationPlan,
  runDoctor,
  runPlan,
  computeCoverage,
} from '../../../bin/lib/doctor-plan.mjs';
import { MECHANICAL_SAFE_KINDS } from '../../../bin/lib/remediation.mjs';

const temps: string[] = [];

function mk(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-design-smells-'));
  temps.push(root);
  return root;
}

afterEach(() => {
  for (const root of temps.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function write(root: string, rel: string, body: string) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
  return abs;
}

const elevenish = {
  include: ['src'],
  layers: [
    { name: 'DomainModel', patterns: ['src/domain/**'] },
    {
      name: 'ApplicationOrchestration',
      patterns: ['src/application/**'],
    },
    {
      name: 'PersistenceAdapters',
      patterns: ['src/repositories/**', 'src/persistence/**'],
    },
    {
      name: 'PresentationAdapters',
      patterns: ['src/routes/**', 'src/components/**', 'src/pages/**'],
    },
  ],
  rules: [
    { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
    { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
    { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
    { from: 'ApplicationOrchestration', to: 'PresentationAdapters', allowed: false },
  ],
};

describe('detectDesignSmells (shipped)', () => {
  it('exports stable smell ids', () => {
    expect(DESIGN_SMELL_IDS).toContain('facade-sql-in-routes');
    expect(DESIGN_SMELL_IDS).toContain('god-module');
  });

  it('flags facade-sql-in-routes with evidence path', () => {
    const root = mk();
    const route = write(
      root,
      'src/routes/orders.ts',
      `import { PrismaClient } from '@prisma/client';\nexport async function GET() { return new PrismaClient().order.findMany(); }\n`
    );
    write(root, 'src/domain/types.ts', 'export type Id = string;\n');
    const smells = detectDesignSmells(root, elevenish, [route, path.join(root, 'src/domain/types.ts')], {
      layersWithoutRules: [],
      emptyLayers: [],
      layers: [],
    });
    const hit = smells.find((s) => s.id === 'facade-sql-in-routes');
    expect(hit).toBeTruthy();
    expect(hit!.evidence.some((e) => e.includes('routes/orders'))).toBe(true);
  });

  it('flags handler-in-persistence', () => {
    const root = mk();
    const f = write(
      root,
      'src/repositories/user-repo.ts',
      `import { Router } from 'express';\nexport const router = Router();\nrouter.get('/', (_req, res) => res.json({}));\n`
    );
    const smells = detectDesignSmells(root, elevenish, [f], null);
    expect(smells.some((s) => s.id === 'handler-in-persistence')).toBe(true);
  });

  it('flags domain-logic-in-ui', () => {
    const root = mk();
    const f = write(
      root,
      'src/components/Price.tsx',
      `export function canCheckout(total: number) { return total > 0; }\nexport function calculateTax(n: number) { return n * 0.2; }\n`
    );
    const smells = detectDesignSmells(root, elevenish, [f], null);
    expect(smells.some((s) => s.id === 'domain-logic-in-ui')).toBe(true);
  });

  it('keeps permission and local UI state out of domain-logic-in-ui', () => {
    const root = mk();
    const f = write(
      root,
      'src/components/Editor.tsx',
      `export const canEdit = permissions.includes('order:edit');
export const shouldShowPanel = isOpen && !isLoading;
`
    );
    const smells = detectDesignSmells(root, elevenish, [f], null);
    expect(smells.some((s) => s.id === 'domain-logic-in-ui')).toBe(false);
  });

  it('keeps real business decisions and routes the fix through Application', () => {
    const root = mk();
    const f = write(
      root,
      'src/components/OrderEditor.tsx',
      `export function canEditOrder(order: { status: string }, actor: { role: string }) {
  return order.status === 'draft' && actor.role === 'manager';
}\n`
    );
    const smell = detectDesignSmells(root, elevenish, [f], null).find(
      (item) => item.id === 'domain-logic-in-ui'
    );
    expect(smell).toBeTruthy();
    const [bet] = buildPatternBetsFromSmells([smell!]);
    expect(bet.fix).toMatch(/Domain.*Application.*UI/i);
    expect(bet.fix).toMatch(/never Presentation.*Domain/i);
    expect(bet.successSignal).toMatch(/UI imports Application only/i);
  });

  it('flags god-module by LOC + export surface', () => {
    const root = mk();
    const lines = Array.from({ length: 420 }, (_, i) => `export const v${i} = ${i};`);
    const f = write(root, 'src/application/god.ts', `${lines.join('\n')}\n`);
    const smells = detectDesignSmells(root, elevenish, [f], null);
    expect(smells.some((s) => s.id === 'god-module')).toBe(true);
  });

  it('does not select seed, fixture, demo, migration, or generated files as god modules', () => {
    const root = mk();
    const huge = `${Array.from({ length: 420 }, (_, i) => `export const v${i} = ${i};`).join('\n')}\n`;
    const files = [
      'src/seeds/huge.ts',
      'src/fixtures/huge.ts',
      'src/demo/huge.ts',
      'src/migrations/huge.ts',
      'src/generated/huge.ts',
      'src/application/huge.generated.ts',
      'src/application/seed.ts',
      'src/application/fixture.ts',
      'src/application/migration.ts',
      'src/application/demo.ts',
      'src/application/generated.ts',
    ].map((rel) => write(root, rel, huge));
    files.push(
      write(root, 'src/application/generated-banner.ts', `// @generated — do not edit\n${huge}`)
    );
    const smells = detectDesignSmells(root, elevenish, files, null);
    expect(smells.some((s) => s.id === 'god-module')).toBe(false);
  });

  it('flags soft-contract from coverage.layersWithoutRules', () => {
    const root = mk();
    const f = write(root, 'src/domain/x.ts', 'export type T = 1;\n');
    const smells = detectDesignSmells(root, elevenish, [f], {
      layersWithoutRules: ['DomainModel'],
      emptyLayers: [],
      layers: [{ name: 'DomainModel', files: 1 }],
    });
    expect(smells.some((s) => s.id === 'soft-contract')).toBe(true);
  });

  it('clean pure domain tree has no facade/handler smells', () => {
    const root = mk();
    const f = write(root, 'src/domain/money.ts', 'export function add(a: number, b: number) { return a + b; }\n');
    const smells = detectDesignSmells(root, elevenish, [f], {
      layersWithoutRules: [],
      emptyLayers: [],
      layers: [{ name: 'DomainModel', files: 1 }],
    });
    expect(smells.find((s) => s.id === 'facade-sql-in-routes')).toBeFalsy();
    expect(smells.find((s) => s.id === 'handler-in-persistence')).toBeFalsy();
  });
});

describe('patternBets IR (P03)', () => {
  it('buildPatternBetsFromSmells marks neverMechanicalSafe', () => {
    const bets = buildPatternBetsFromSmells([
      {
        id: 'facade-sql-in-routes',
        severity: 'warn',
        message: 'sql in routes',
        evidence: ['src/routes/a.ts'],
        fix: 'move',
      },
    ]);
    expect(bets).toHaveLength(1);
    expect(bets[0].neverMechanicalSafe).toBe(true);
    expect(bets[0].class).toBe('judgment');
    expect(bets[0].pilot).toBeTruthy();
    expect(bets[0].successSignal).toBeTruthy();
    expect(bets[0].killSwitch).toBeTruthy();
  });

  it('buildRemediationPlan attaches patternBets and designWeak when edges clean', () => {
    const root = mk();
    write(
      root,
      'src/routes/orders.ts',
      `import { PrismaClient } from '@prisma/client';\nexport async function GET() { return new PrismaClient().order.findMany(); }\n`
    );
    write(root, 'src/domain/types.ts', 'export type Id = string;\n');
    const files = [
      path.join(root, 'src/routes/orders.ts'),
      path.join(root, 'src/domain/types.ts'),
    ];
    const cov = computeCoverage(root, elevenish, files, elevenish.rules);
    const plan = buildRemediationPlan(root, [], 100, files.length, {
      completeness: 'complete',
      config: elevenish,
      files,
      coverage: cov,
    });
    expect(plan.goal.met).toBe(true);
    expect(plan.goal.designWeak).toBe(true);
    expect(plan.patternBets.length).toBeGreaterThan(0);
    expect(plan.patternBets.every((b: { neverMechanicalSafe: boolean }) => b.neverMechanicalSafe)).toBe(
      true
    );
    expect(plan.steps).toEqual([]);
    // mechanical-safe counts stay zero — B is not auto
    expect(plan.counts.mechanicalSafe).toBe(0);
  });

  it('isDesignWeak is false when active violations exist', () => {
    expect(
      isDesignWeak([{ id: 'god-module', severity: 'warn', message: 'x', evidence: [], fix: '' }], {
        activeViolations: 3,
        governedPercent: 100,
        totalFiles: 10,
      })
    ).toBe(false);
  });
});

describe('doctor JSON surface (P02)', () => {
  it('runDoctor --json includes designSmells and designFitness', () => {
    const root = mk();
    write(
      root,
      'src/routes/orders.ts',
      `import { PrismaClient } from '@prisma/client';\nexport async function GET() { return new PrismaClient().order.findMany(); }\n`
    );
    write(root, 'src/domain/types.ts', 'export type Id = string;\n');
    const files = [
      path.join(root, 'src/routes/orders.ts'),
      path.join(root, 'src/domain/types.ts'),
    ];
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    try {
      runDoctor(root, elevenish, files, elevenish.rules, [], true, { completeness: 'complete' });
    } finally {
      console.log = orig;
    }
    const joined = logs.join('\n');
    const payload = JSON.parse(joined);
    expect(payload.doctor.designSmells).toBeDefined();
    expect(Array.isArray(payload.doctor.designSmells)).toBe(true);
    expect(payload.doctor.designSmells.some((s: { id: string }) => s.id === 'facade-sql-in-routes')).toBe(
      true
    );
    expect(payload.doctor.designFitness).toBeDefined();
    expect(payload.doctor.designFitness.designWeak).toBe(true);
    expect(payload.doctor.designFitness.status).toBe('design-weak');
  });

  it('runPlan --json includes patternBets with neverMechanicalSafe', () => {
    const root = mk();
    write(
      root,
      'src/routes/orders.ts',
      `import { PrismaClient } from '@prisma/client';\nexport async function GET() { return new PrismaClient().order.findMany(); }\n`
    );
    const files = [path.join(root, 'src/routes/orders.ts')];
    const cov = computeCoverage(root, elevenish, files, elevenish.rules);
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    try {
      runPlan(root, [], true, 100, files.length, { config: elevenish, files, coverage: cov });
    } finally {
      console.log = orig;
    }
    const payload = JSON.parse(logs.join('\n'));
    expect(payload.plan.patternBets.length).toBeGreaterThan(0);
    expect(payload.plan.patternBets[0].neverMechanicalSafe).toBe(true);
    expect(payload.plan.goal.designWeak).toBe(true);
  });
});

describe('summarizeDesignFitness', () => {
  it('ok when no smells', () => {
    const s = summarizeDesignFitness([], { activeViolations: 0, governedPercent: 100, totalFiles: 5 });
    expect(s.status).toBe('ok');
    expect(s.designWeak).toBe(false);
  });

  it('uses the actual operating mode and stays neutral when mode is unknown', () => {
    const smells = [
      { id: 'god-module', severity: 'warn' as const, message: 'x', evidence: [], fix: 'x' },
    ];
    const context = { activeViolations: 0, governedPercent: 100, totalFiles: 5 };
    expect(summarizeDesignFitness(smells, context).label).toMatch(/leftover design work/);
    expect(summarizeDesignFitness(smells, { ...context, operatingMode: 'adapt' }).label).toMatch(
      /^ADAPT · leftover design work/
    );
    expect(summarizeDesignFitness(smells, { ...context, operatingMode: 'enforce' }).label).toMatch(
      /^ENFORCE · leftover design work/
    );
  });
});

describe('patternBets non-auto contract (P03)', () => {
  it('patternBets never collide with MECHANICAL_SAFE_KINDS', () => {
    const bets = buildPatternBetsFromSmells(
      DESIGN_SMELL_IDS.map((id) => ({
        id,
        severity: 'warn' as const,
        message: id,
        evidence: [`src/${id}.ts`],
        fix: 'x',
      }))
    );
    const guard = assertPatternBetsNeverMechanicalSafe(bets, MECHANICAL_SAFE_KINDS);
    expect(guard.ok).toBe(true);
    for (const kind of MECHANICAL_SAFE_KINDS) {
      expect(bets.some((b) => b.remediationKind === kind)).toBe(false);
    }
  });

  it('assertNotHealthyFinishedIgnoringDesign fails when designWeak under met edges', () => {
    const bad = assertNotHealthyFinishedIgnoringDesign({
      goal: { met: true, designWeak: true },
      patternBets: [{ id: 'x', neverMechanicalSafe: true }],
    });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/healthy finished|design-weak/i);

    const good = assertNotHealthyFinishedIgnoringDesign({
      goal: { met: true, designWeak: false },
      patternBets: [],
      designSmells: [],
    });
    expect(good.ok).toBe(true);
  });
});

describe('green-run --plan pointer', () => {
  const smell = (id: string) => ({
    id,
    severity: 'warn' as const,
    message: id,
    evidence: [`src/${id}.ts`],
    fix: 'x',
  });
  const green = { blockingViolations: 0, governedPercent: 90, totalFiles: 40 };

  it('names --plan, the smell count and the ids when a passing run still carries design residual', () => {
    const line = formatGreenPlanPointer(
      [smell('god-module'), smell('soft-contract')],
      green,
      'npx ark-check --plan'
    );
    expect(line).toBe(
      'Import rules are clean; the design bets are not settled — 2 design smells ' +
        '(god-module, soft-contract). They never fail this check: npx ark-check --plan'
    );
  });

  it('agrees exactly with isDesignWeak — it can never fire on a run that is not already green', () => {
    const smells = [smell('god-module')];
    const asWeakCtx = (ctx: typeof green) => ({
      activeViolations: ctx.blockingViolations,
      governedPercent: ctx.governedPercent,
      totalFiles: ctx.totalFiles,
    });
    for (const ctx of [
      { ...green, blockingViolations: 1 },
      { ...green, totalFiles: 0 },
      { ...green, governedPercent: 49 },
    ]) {
      expect(isDesignWeak(smells, asWeakCtx(ctx))).toBe(false);
      expect(formatGreenPlanPointer(smells, ctx, 'npx ark-check --plan')).toBeNull();
    }
    expect(isDesignWeak(smells, asWeakCtx(green))).toBe(true);
    expect(formatGreenPlanPointer(smells, green, 'npx ark-check --plan')).not.toBeNull();
  });

  it('stays silent when the pass has nothing behind it', () => {
    expect(formatGreenPlanPointer([], green, 'npx ark-check --plan')).toBeNull();
  });

  it('caps the named ids and counts the rest instead of printing a wall', () => {
    const ids = DESIGN_SMELL_IDS.slice(0, GREEN_PLAN_POINTER_MAX_IDS + 2);
    const line = formatGreenPlanPointer(ids.map(smell), green, 'npx ark-check --plan') as string;
    expect(line).toContain(`${ids.length} design smells`);
    expect(line).toContain('+2 more');
    const sorted = [...ids].sort();
    for (const id of sorted.slice(0, GREEN_PLAN_POINTER_MAX_IDS)) expect(line).toContain(id);
    for (const id of sorted.slice(GREEN_PLAN_POINTER_MAX_IDS)) expect(line).not.toContain(id);
  });

  it('names the suppression instead of calling a baselined run clean', () => {
    const line = formatGreenPlanPointer(
      [smell('god-module')],
      { ...green, suppressedCount: 3 },
      'npx ark-check --plan'
    ) as string;
    expect(line).toContain('No blocking import-rule violations (3 suppressed by baseline)');
    expect(line).not.toContain('Import rules are clean');
  });

  it('says "1 design smell", not "1 design smells"', () => {
    const line = formatGreenPlanPointer([smell('god-module')], green, 'x') as string;
    expect(line).toContain('1 design smell (');
  });
});
