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

  it('flags god-module by LOC + export surface', () => {
    const root = mk();
    const lines = Array.from({ length: 420 }, (_, i) => `export const v${i} = ${i};`);
    const f = write(root, 'src/application/god.ts', `${lines.join('\n')}\n`);
    const smells = detectDesignSmells(root, elevenish, [f], null);
    expect(smells.some((s) => s.id === 'god-module')).toBe(true);
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
      runDoctor(root, elevenish, files, elevenish.rules, [], true, {});
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
