/**
 * Field product phases for arkgate 4.1.0:
 * P0-A Next API shell · P0-B product honesty · P0-C ESLint aliases ·
 * P1-L structure false-negatives · P1-M merge planes · P1-type edges · P2-N inventory.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyFrameworkLayoutOverlays } from '../../../bin/ark-shared.mjs';
import { ARCHITECTURE_PRESETS } from '../../../bin/lib/presets.mjs';
import { suggestLayerForPath } from '../../../bin/lib/suggestions.mjs';
import {
  buildCoverageHonesty,
  buildBaselineHonesty,
  buildProductHonesty,
  computeDoctorEnforcementHonesty,
} from '../../../bin/lib/enforcement-honesty.mjs';
import { layerForRelativePath } from '../../../src/domain/layerMatch';
import {
  extractClassShapesFromSource,
  evaluateArkRuleSensors,
} from '../../../src/domain/arkRuleSensors';
import { buildEffectiveArkRules, loadArkRulesContract } from '../../../src/domain/arkRulesContract';
import { buildRulesInventory } from '../../../src/domain/rulesInventory';
import { evaluateArchitectureGraph } from '../../../src/kernel/graphEvaluate';
import {
  resolveImportSpecifier,
  readTsconfigPathAliases,
  noDomainInfraImports,
} from '../../../src/eslint/index';
import {
  renderProductHonestyCard,
  buildReportDepthPayload,
} from '../../../bin/lib/html-report-depth.mjs';
import { computeReportFitness } from '../../../bin/lib/html-report.mjs';

const temps: string[] = [];
function mk(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-41-'));
  temps.push(root);
  return root;
}
afterEach(() => {
  for (const t of temps.splice(0)) {
    try {
      fs.rmSync(t, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function effectiveDomain(structure: unknown[]) {
  const file = loadArkRulesContract({
    schemaVersion: '1.0',
    layer: 'DomainModel',
    structure,
  }).config;
  return buildEffectiveArkRules([
    { layer: 'DomainModel', sourceFile: 'arkrules/DomainModel.json', file },
  ]);
}

describe('P0-A Next API shell is Application, not Presentation', () => {
  it('framework overlay classifies app/api under ApplicationOrchestration', () => {
    const root = mk();
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { next: '16.3.0' } }));
    fs.mkdirSync(path.join(root, 'src/app/api/orders'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app/api/orders/route.ts'), 'export async function GET() {}\n');
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app/page.tsx'), 'export default function Page() { return null }\n');

    const base = ARCHITECTURE_PRESETS['ui-surface']([], root);
    const cfg = applyFrameworkLayoutOverlays(base, root);
    const apiLayer = layerForRelativePath('src/app/api/orders/route.ts', cfg.layers);
    const pageLayer = layerForRelativePath('src/app/page.tsx', cfg.layers);
    expect(apiLayer).toBe('ApplicationOrchestration');
    expect(pageLayer).toBe('PresentationAdapters');
  });

  it('monorepo preset prefers app/api as Application over **/app/** Presentation', () => {
    const cfg = ARCHITECTURE_PRESETS.monorepo([], undefined);
    expect(layerForRelativePath('apps/web/src/app/api/health/route.ts', cfg.layers)).toBe(
      'ApplicationOrchestration'
    );
    expect(layerForRelativePath('apps/web/src/app/dashboard/page.tsx', cfg.layers)).toBe(
      'PresentationAdapters'
    );
  });

  it('suggestLayerForPath maps Next API dirs to ApplicationOrchestration', () => {
    expect(suggestLayerForPath('src/app/api/orders')).toMatchObject({
      layer: 'ApplicationOrchestration',
    });
    expect(suggestLayerForPath('pages/api/users')).toMatchObject({
      layer: 'ApplicationOrchestration',
    });
    expect(suggestLayerForPath('src/app/(marketing)/api/health')).toMatchObject({
      layer: 'ApplicationOrchestration',
    });
  });
});

describe('P0-B product honesty anti false-green', () => {
  it('table-driven reasonIds matrix (FG01 / S1)', () => {
    const cases: Array<{
      name: string;
      input: Parameters<typeof buildProductHonesty>[0];
      expectIds: string[];
      unfinished: boolean;
      headlineIncludes?: string;
      headlineExcludes?: string;
      finished?: boolean;
    }> = [
      {
        name: 'coverage-partial (50–79%)',
        input: {
          coverageHonesty: buildCoverageHonesty({ percent: 65, totalFiles: 100 }),
          baselineHonesty: buildBaselineHonesty({ exists: false }),
        },
        expectIds: ['coverage-partial'],
        unfinished: true,
        headlineIncludes: 'not whole-tree',
      },
      {
        name: 'package-version-dual-truth (whole-tree governed)',
        input: {
          coverageHonesty: buildCoverageHonesty({ percent: 100, totalFiles: 10 }),
          baselineHonesty: buildBaselineHonesty({ exists: false }),
          packageVersionTruth: {
            dualTruth: true,
            note: 'CLI ahead of package.json pin',
            cliVersion: '4.1.0',
          },
        },
        expectIds: ['package-version-dual-truth'],
        unfinished: true,
        // P0B-HEADLINE: dual-truth only must NOT say "not whole-tree"
        headlineIncludes: 'Not finished',
        headlineExcludes: 'not whole-tree',
      },
      {
        // EH05: soft-write alone is environment residual — not architecture unfinished
        name: 'soft-write-host',
        input: {
          coverageHonesty: buildCoverageHonesty({ percent: 100, totalFiles: 10 }),
          baselineHonesty: buildBaselineHonesty({ exists: false }),
          writePathHonesty: {
            advisory: true,
            softWriteHost: true,
            activeHost: 'codex',
            message: 'Local write is advisory',
          },
        },
        expectIds: ['soft-write-host'],
        unfinished: false,
        finished: true,
        headlineIncludes: 'Architecture contract ready',
        headlineExcludes: 'Not finished',
      },
      {
        name: 'amarilla-like: 1000+ blocking + adapt',
        input: {
          coverageHonesty: buildCoverageHonesty({ percent: 100, totalFiles: 2000 }),
          baselineHonesty: buildBaselineHonesty({
            exists: false,
            activeViolations: 1057,
            totalViolations: 1057,
          }),
          operatingMode: 'adapt',
          activeBlockingViolations: 1057,
        },
        expectIds: [
          'active-blocking-violations',
          'mode-adapt-with-debt',
          'baseline-missing-with-debt',
        ],
        unfinished: true,
        finished: false,
      },
      {
        name: 'design smells + open edges',
        input: {
          coverageHonesty: buildCoverageHonesty({ percent: 100, totalFiles: 50 }),
          baselineHonesty: buildBaselineHonesty({
            exists: true,
            frozenKeys: 0,
            activeViolations: 5,
            totalViolations: 5,
          }),
          designSmellCount: 5,
          designSmellsWithOpenEdges: true,
          activeBlockingViolations: 5,
          operatingMode: 'adapt',
        },
        expectIds: [
          'active-blocking-violations',
          'design-smells-open-edges',
          'mode-adapt-with-debt',
        ],
        unfinished: true,
        finished: false,
      },
      {
        name: 'package-pin-absent',
        input: {
          coverageHonesty: buildCoverageHonesty({ percent: 100, totalFiles: 10 }),
          baselineHonesty: buildBaselineHonesty({ exists: false }),
          packageVersionTruth: {
            dualTruth: false,
            code: 'PACKAGE_PIN_ABSENT',
            note: 'No arkgate pin in package.json',
          },
        },
        expectIds: ['package-pin-absent'],
        unfinished: true,
        headlineExcludes: 'not whole-tree',
      },
      {
        name: 'enforce green finished',
        input: {
          coverageHonesty: buildCoverageHonesty({ percent: 100, totalFiles: 10 }),
          baselineHonesty: buildBaselineHonesty({
            exists: true,
            frozenKeys: 0,
            activeViolations: 0,
            totalViolations: 0,
          }),
          designWeak: false,
          operatingMode: 'enforce',
          activeBlockingViolations: 0,
        },
        expectIds: [],
        unfinished: false,
        finished: true,
      },
      {
        name: 'clear whole-tree path',
        input: {
          coverageHonesty: buildCoverageHonesty({ percent: 100, totalFiles: 10 }),
          baselineHonesty: buildBaselineHonesty({ exists: false }),
          designWeak: false,
        },
        expectIds: [],
        unfinished: false,
      },
    ];
    for (const c of cases) {
      const honesty = buildProductHonesty(c.input);
      expect(honesty.notAScore, c.name).toBe(true);
      expect(honesty.unfinished, c.name).toBe(c.unfinished);
      if (c.finished !== undefined) {
        expect(honesty.finished, c.name).toBe(c.finished);
      }
      if (c.expectIds.length === 0) {
        expect(honesty.reasonIds, c.name).toEqual([]);
      } else {
        expect(honesty.reasonIds, c.name).toEqual(expect.arrayContaining(c.expectIds));
      }
      if (c.headlineIncludes) {
        expect(honesty.headline.toLowerCase(), c.name).toContain(c.headlineIncludes.toLowerCase());
      }
      if (c.headlineExcludes) {
        expect(honesty.headline.toLowerCase(), c.name).not.toContain(
          c.headlineExcludes.toLowerCase()
        );
      }
    }
  });

  it('buildProductHonesty flags design-weak + weak coverage as unfinished', () => {
    const honesty = buildProductHonesty({
      coverageHonesty: buildCoverageHonesty({ percent: 40, totalFiles: 100 }),
      baselineHonesty: buildBaselineHonesty({ exists: false }),
      designWeak: true,
      designWeakLabel: 'ENFORCE · design-weak residual',
      residualPilots: true,
      pilotTarget: 'src/app/messy.ts',
    });
    expect(honesty.notAScore).toBe(true);
    expect(honesty.finished).toBe(false);
    expect(honesty.unfinished).toBe(true);
    expect(honesty.elegant).toBe(false);
    expect(honesty.wholeTreeGuarantee).toBe(false);
    expect(honesty.reasonIds).toEqual(
      expect.arrayContaining(['design-weak', 'coverage-weak-or-empty', 'residual-pilot'])
    );
    expect(honesty.primaryMessage).toMatch(/design-weak|residual|worse than no gate/i);
    expect(honesty.headline).toMatch(/not finished/i);
  });

  it('computeDoctorEnforcementHonesty includes productHonesty', () => {
    const bundle = computeDoctorEnforcementHonesty({
      governedPercent: 100,
      totalFiles: 10,
      emptyScope: false,
      baselineExists: true,
      frozenKeys: 20,
      activeViolations: 0,
      suppressed: 20,
      totalViolations: 20,
      designWeak: true,
    });
    expect(bundle.productHonesty.unfinished).toBe(true);
    expect(bundle.productHonesty.reasonIds).toEqual(
      expect.arrayContaining(['design-weak', 'dirty-freeze'])
    );
  });

  it('computeDoctorEnforcementHonesty: adapt + 1000 viol is unfinished (FG-FINISHED-ADAPT-DEBT)', () => {
    const bundle = computeDoctorEnforcementHonesty({
      governedPercent: 92,
      totalFiles: 2000,
      emptyScope: false,
      baselineExists: false,
      frozenKeys: 0,
      activeViolations: 1057,
      activeBlockingViolations: 1057,
      suppressed: 0,
      totalViolations: 1057,
      operatingMode: 'adapt',
      designWeak: false,
      designSmellCount: 3,
      designSmellsWithOpenEdges: true,
    });
    expect(bundle.productHonesty.finished).toBe(false);
    expect(bundle.productHonesty.unfinished).toBe(true);
    expect(bundle.productHonesty.reasonIds).toEqual(
      expect.arrayContaining([
        'active-blocking-violations',
        'mode-adapt-with-debt',
        'baseline-missing-with-debt',
        'design-smells-open-edges',
      ])
    );
    expect(bundle.productHonesty.notAScore).toBe(true);
  });

  it('type-only debt does not force active-blocking-violations; adapt clear only when whole-tree green', () => {
    // Type-only only: blocking=0 → no active-blocking reason.
    const typeOnlyOnly = buildProductHonesty({
      coverageHonesty: buildCoverageHonesty({ percent: 100, totalFiles: 10 }),
      baselineHonesty: buildBaselineHonesty({
        exists: false,
        activeViolations: 12, // raw list may still list type-only
        totalViolations: 12,
      }),
      activeBlockingViolations: 0,
      designSmellCount: 0,
      operatingMode: 'enforce',
    });
    expect(typeOnlyOnly.reasonIds).not.toContain('active-blocking-violations');

    // adapt + whole tree + zero smells + zero blocking → no mode-adapt-with-debt
    const adaptClear = buildProductHonesty({
      coverageHonesty: buildCoverageHonesty({ percent: 100, totalFiles: 10 }),
      baselineHonesty: buildBaselineHonesty({ exists: false }),
      activeBlockingViolations: 0,
      designSmellCount: 0,
      operatingMode: 'adapt',
    });
    expect(adaptClear.reasonIds).not.toContain('mode-adapt-with-debt');

    // adapt + partial coverage → unfinished via mode-adapt
    const adaptPartial = buildProductHonesty({
      coverageHonesty: buildCoverageHonesty({ percent: 70, totalFiles: 10 }),
      baselineHonesty: buildBaselineHonesty({ exists: false }),
      activeBlockingViolations: 0,
      designSmellCount: 0,
      operatingMode: 'adapt',
    });
    expect(adaptPartial.reasonIds).toContain('mode-adapt-with-debt');
    expect(adaptPartial.unfinished).toBe(true);
  });

  it('HTML card renders without repeating headline twice as the only body', () => {
    const html = renderProductHonestyCard({
      unfinished: true,
      headline: 'Not finished / not whole-tree guarantee',
      primaryMessage: 'Weak coverage (40%): a green check on a minority of the tree is worse than no gate.',
      reasonIds: ['coverage-weak-or-empty'],
      notAScore: true,
    });
    expect(html).toContain('data-product-honesty="1"');
    expect(html).toContain('Weak coverage');
    expect(html).toContain('coverage-weak-or-empty');
    // Headline-only body is rewritten to a distinct residual line.
    const same = renderProductHonestyCard({
      unfinished: true,
      headline: 'Not finished / not whole-tree guarantee',
      primaryMessage: 'Not finished / not whole-tree guarantee',
      reasonIds: ['design-weak'],
      notAScore: true,
    });
    expect(same).toMatch(/Residual honesty signals remain/i);
    expect(same).not.toMatch(
      /<p style="margin:\.45rem 0 0">Not finished \/ not whole-tree guarantee<\/p>/
    );
  });
});

describe('P0-C ESLint tsconfig path alias resolution', () => {
  it('readTsconfigPathAliases + resolveImportSpecifier resolve @/*', () => {
    const root = mk();
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: { '@/*': ['src/*'] },
        },
      })
    );
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export class Order {}\n');
    fs.writeFileSync(
      path.join(root, 'src/app/page.ts'),
      "import { Order } from '@/domain/order';\nexport const x = Order;\n"
    );

    const aliases = readTsconfigPathAliases(root);
    expect(aliases.aliases.some((a) => a.from === '@/')).toBe(true);

    const resolved = resolveImportSpecifier(
      path.join(root, 'src/app/page.ts'),
      '@/domain/order',
      root
    );
    expect(resolved && path.relative(root, resolved).split(path.sep).join('/')).toBe(
      'src/domain/order.ts'
    );
  });

  it('ESLint rule fires on forbidden edge via path alias', () => {
    const root = mk();
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } },
      })
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'PresentationAdapters', patterns: ['src/app/**'] },
        ],
        rules: [{ from: 'DomainModel', to: 'PresentationAdapters', allowed: false }],
      })
    );
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app/ui.ts'), 'export const UI = 1;\n');
    const domainFile = path.join(root, 'src/domain/order.ts');
    fs.writeFileSync(domainFile, "import { UI } from '@/app/ui';\nexport const o = UI;\n");

    const reports: Array<Record<string, unknown>> = [];
    const listener = noDomainInfraImports.create({
      filename: domainFile,
      report(desc) {
        reports.push(desc);
      },
      sourceCode: { getScope: () => undefined },
    });
    // Simulate ImportDeclaration visit
    const importNode = {
      type: 'ImportDeclaration',
      importKind: 'value',
      source: { value: '@/app/ui' },
      specifiers: [{ type: 'ImportSpecifier', importKind: 'value' }],
      loc: { start: { line: 1, column: 0 } },
    };
    listener.ImportDeclaration?.(importNode);
    expect(reports.length).toBeGreaterThanOrEqual(1);
    expect(reports[0]?.messageId).toBe('forbiddenImport');
    const diagnostic = reports[0]?.diagnostic as { evidence?: { fromLayer?: string; toLayer?: string }; severity?: string };
    expect(diagnostic?.evidence?.fromLayer).toBe('DomainModel');
    expect(diagnostic?.evidence?.toLayer).toBe('PresentationAdapters');
    expect(diagnostic?.severity).toBe('error');
  });

  it('ESLint type-only alias edge is warning severity with SharedTypes hint', () => {
    const root = mk();
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } },
      })
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'PresentationAdapters', patterns: ['src/app/**'] },
        ],
        rules: [{ from: 'DomainModel', to: 'PresentationAdapters', allowed: false }],
      })
    );
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app/types.ts'), 'export type UiId = string;\n');
    const domainFile = path.join(root, 'src/domain/order.ts');
    fs.writeFileSync(domainFile, "import type { UiId } from '@/app/types';\nexport type O = UiId;\n");

    const reports: Array<Record<string, unknown>> = [];
    const listener = noDomainInfraImports.create({
      filename: domainFile,
      report(desc) {
        reports.push(desc);
      },
      sourceCode: { getScope: () => undefined },
    });
    listener.ImportDeclaration?.({
      type: 'ImportDeclaration',
      importKind: 'type',
      source: { value: '@/app/types' },
      specifiers: [{ type: 'ImportSpecifier', importKind: 'type' }],
      loc: { start: { line: 1, column: 0 } },
    });
    expect(reports.length).toBe(1);
    const diagnostic = reports[0]?.diagnostic as {
      severity?: string;
      message?: string;
      evidence?: { typeOnly?: boolean };
    };
    expect(diagnostic?.evidence?.typeOnly).toBe(true);
    expect(diagnostic?.severity).toBe('warning');
    expect(diagnostic?.message).toMatch(/SharedTypes|placement debt/i);
  });

  it('CLI + ESLint both flag the same @/* forbidden value edge (P0C dual-driver)', () => {
    const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
    const check = path.resolve('bin/ark-check.mjs');
    const root = mk();
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } },
      })
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'PresentationAdapters', patterns: ['src/app/**'] },
        ],
        rules: [{ from: 'DomainModel', to: 'PresentationAdapters', allowed: false }],
      })
    );
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app/ui.ts'), 'export const UI = 1;\n');
    const domainFile = path.join(root, 'src/domain/order.ts');
    fs.writeFileSync(domainFile, "import { UI } from '@/app/ui';\nexport const o = UI;\n");

    // CLI sees the path-alias edge
    const cli = spawnSync(
      process.execPath,
      [check, '--root', root, '--config', 'ark.config.json', '--json', '--no-cache'],
      { encoding: 'utf8' }
    );
    expect(cli.status, cli.stderr + cli.stdout).not.toBe(0);
    const cliJson = JSON.parse(cli.stdout || '{}') as {
      ok: boolean;
      violations: Array<{ ruleId: string; typeOnly?: boolean; fromLayer?: string; toLayer?: string }>;
    };
    expect(cliJson.ok).toBe(false);
    const cliHits = cliJson.violations.filter((v) => v.ruleId === 'LAYER_IMPORT_VIOLATION');
    expect(cliHits.length).toBeGreaterThan(0);
    expect(cliHits.every((v) => v.typeOnly !== true)).toBe(true);

    // ESLint rule fires on the same specifier
    const reports: Array<Record<string, unknown>> = [];
    const listener = noDomainInfraImports.create({
      filename: domainFile,
      report(desc) {
        reports.push(desc);
      },
      sourceCode: { getScope: () => undefined },
    });
    listener.ImportDeclaration?.({
      type: 'ImportDeclaration',
      importKind: 'value',
      source: { value: '@/app/ui' },
      specifiers: [{ type: 'ImportSpecifier', importKind: 'value' }],
      loc: { start: { line: 1, column: 0 } },
    });
    expect(reports.length).toBeGreaterThanOrEqual(1);
    expect(reports[0]?.messageId).toBe('forbiddenImport');
    const diagnostic = reports[0]?.diagnostic as {
      evidence?: { fromLayer?: string; toLayer?: string };
      severity?: string;
    };
    expect(diagnostic?.evidence?.fromLayer).toBe('DomainModel');
    expect(diagnostic?.evidence?.toLayer).toBe('PresentationAdapters');
    expect(diagnostic?.severity).toBe('error');
  });
});

describe('P1-L structure sensors prefer false negatives on weak evidence', () => {
  it('quiet intentional DDD aggregate with private state + public constructor', () => {
    const shapes = extractClassShapesFromSource(
      'src/domain/lot.ts',
      `
export class Lot {
  private constructor(private readonly props: { id: string; area: number }) {}
  static create(props: { id: string; area: number }) { return new Lot(props); }
  get id() { return this.props.id; }
  resize(area: number) { this.ensureInvariants(); Object.assign(this.props, { area }); this.ensureInvariants(); }
  ensureInvariants() { if (this.props.area < 0) throw new Error('bad'); }
}
`
    );
    const findings = evaluateArkRuleSensors({
      arkRules: effectiveDomain([
        { id: 'private-state', sensor: 'aggregate-private-state', mode: 'advisory' },
        { id: 'factory', sensor: 'always-valid-factory', mode: 'advisory' },
      ]),
      classShapes: shapes,
      files: ['src/domain/lot.ts'],
    });
    expect(findings).toEqual([]);
  });

  it('still flags true public mutable + bare constructor without factory', () => {
    const shapes = extractClassShapesFromSource(
      'src/domain/order.ts',
      `export class Order { public total = 0; constructor() {} setTotal(n: number) { this.total = n; } }`
    );
    const findings = evaluateArkRuleSensors({
      arkRules: effectiveDomain([
        { id: 'private-state', sensor: 'aggregate-private-state', mode: 'enforced' },
        { id: 'factory', sensor: 'always-valid-factory', mode: 'enforced' },
      ]),
      classShapes: shapes,
      files: ['src/domain/order.ts'],
    });
    expect(findings.some((f) => f.arkruleId === 'private-state' && f.failsStrict)).toBe(true);
    expect(findings.some((f) => f.arkruleId === 'factory' && f.failsStrict)).toBe(true);
  });

  it('readonly-only public props do not fire aggregate-private-state', () => {
    const shapes = extractClassShapesFromSource(
      'src/domain/money.ts',
      `export class Money { public readonly amount: number; constructor(amount: number) { this.amount = amount; } }`
    );
    // public constructor alone without mutability → no always-valid-factory either
    const findings = evaluateArkRuleSensors({
      arkRules: effectiveDomain([
        { id: 'private-state', sensor: 'aggregate-private-state', mode: 'enforced' },
        { id: 'factory', sensor: 'always-valid-factory', mode: 'enforced' },
      ]),
      classShapes: shapes,
      files: ['src/domain/money.ts'],
    });
    expect(findings.filter((f) => f.arkruleId === 'private-state')).toHaveLength(0);
    expect(findings.filter((f) => f.arkruleId === 'factory')).toHaveLength(0);
  });

  it('multi-decl line keeps mutable field next to readonly (no false quiet)', () => {
    const shapes = extractClassShapesFromSource(
      'src/domain/bag.ts',
      `export class Bag { public readonly id: string; public count = 0; constructor() {} setCount(n: number) { this.count = n; } }`
    );
    expect(shapes[0]?.hasPublicMutableFields).toBe(true);
    const findings = evaluateArkRuleSensors({
      arkRules: effectiveDomain([
        { id: 'private-state', sensor: 'aggregate-private-state', mode: 'enforced' },
      ]),
      classShapes: shapes,
      files: ['src/domain/bag.ts'],
    });
    expect(findings.some((f) => f.arkruleId === 'private-state')).toBe(true);
  });

  it('anemic bar requires ≥2 public fields', () => {
    const single = extractClassShapesFromSource(
      'src/domain/one.ts',
      `export class One { public id: string; }`
    );
    const multi = extractClassShapesFromSource(
      'src/domain/two.ts',
      `export class Two { public id: string; public name: string; }`
    );
    expect(single[0]?.dataOnly).toBeFalsy();
    expect(multi[0]?.dataOnly).toBe(true);
  });
});

describe('P1-type type-only edges are placement debt, not merge blockers', () => {
  it('type-only denied edges stay on violations with failsStrict false; value still blocks', () => {
    const result = evaluateArchitectureGraph({
      config: {
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'PresentationAdapters', patterns: ['src/app/**'] },
        ],
      },
      rules: [{ from: 'DomainModel', to: 'PresentationAdapters', allowed: false }],
      files: ['src/domain/order.ts', 'src/app/types.ts'],
      contentViolations: [],
      edges: [
        {
          from: 'src/domain/order.ts',
          fromLayer: 'DomainModel',
          to: 'src/app/types.ts',
          toLayer: 'PresentationAdapters',
          line: 1,
          kind: 'import',
          typeOnly: true,
        },
        {
          from: 'src/domain/order.ts',
          fromLayer: 'DomainModel',
          to: 'src/app/ui.ts',
          toLayer: 'PresentationAdapters',
          line: 2,
          kind: 'import',
          typeOnly: false,
        },
      ],
    });
    const typeV = result.violations.find((v) => v.typeOnly);
    const valueV = result.violations.find((v) => v.target === 'src/app/ui.ts');
    expect(typeV?.failsStrict).toBe(false);
    expect(typeV?.message).toMatch(/type placement|SharedTypes/i);
    expect(valueV?.typeOnly).toBeUndefined();
    expect(valueV?.failsStrict).not.toBe(false);
  });

  it('sourcePureTypeModule alone does not soft-skip a value edge', () => {
    const result = evaluateArchitectureGraph({
      config: { layers: [] },
      rules: [{ from: 'DomainModel', to: 'PresentationAdapters', allowed: false }],
      files: ['src/domain/a.ts', 'src/app/types-only.ts'],
      contentViolations: [],
      edges: [
        {
          from: 'src/domain/a.ts',
          fromLayer: 'DomainModel',
          to: 'src/app/types-only.ts',
          toLayer: 'PresentationAdapters',
          line: 1,
          kind: 'import',
          typeOnly: false,
          sourcePureTypeModule: true,
        },
      ],
    });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.typeOnly).toBeUndefined();
    expect(result.violations[0]?.failsStrict).not.toBe(false);
    expect(result.violations[0]?.sourcePureTypeModule).toBe(true);
  });

  it('matrix: typeOnly, namedBindingsTypeOnly, value, peerIsolation type-only stays hard', () => {
    const result = evaluateArchitectureGraph({
      config: { layers: [] },
      rules: [
        { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
        {
          from: 'Features',
          to: 'Features',
          allowed: false,
          peerIsolation: true,
          sliceFolders: ['features'],
        },
      ],
      files: [
        'src/domain/a.ts',
        'src/app/b.ts',
        'src/features/auth/x.ts',
        'src/features/billing/y.ts',
      ],
      contentViolations: [],
      edges: [
        {
          from: 'src/domain/a.ts',
          fromLayer: 'DomainModel',
          to: 'src/app/b.ts',
          toLayer: 'PresentationAdapters',
          line: 1,
          kind: 'import',
          typeOnly: true,
        },
        {
          from: 'src/domain/a.ts',
          fromLayer: 'DomainModel',
          to: 'src/app/b.ts',
          toLayer: 'PresentationAdapters',
          line: 2,
          kind: 'import',
          typeOnly: false,
          namedBindingsTypeOnly: true,
        },
        {
          from: 'src/domain/a.ts',
          fromLayer: 'DomainModel',
          to: 'src/app/b.ts',
          toLayer: 'PresentationAdapters',
          line: 3,
          kind: 'import',
          typeOnly: false,
        },
        {
          from: 'src/features/auth/x.ts',
          fromLayer: 'Features',
          to: 'src/features/billing/y.ts',
          toLayer: 'Features',
          line: 4,
          kind: 'import',
          typeOnly: true,
        },
      ],
    });
    const placement = result.violations.filter((v) => v.failsStrict === false);
    expect(placement.length).toBeGreaterThanOrEqual(2);
    expect(result.violations.some((v) => !v.typeOnly && v.failsStrict !== false && v.line === 3)).toBe(
      true
    );
    const peerType = result.violations.find((v) => v.line === 4);
    expect(peerType?.peerIsolation).toBe(true);
    expect(peerType?.failsStrict).not.toBe(false);
  });
});

describe('P2-N rules inventory quiets UI/Next noise, keeps spaghetti seeds', () => {
  it('skips route labels / theme constants on UI surfaces', () => {
    const inventory = buildRulesInventory({
      fileContents: {
        'src/components/Nav.tsx': `
          const ROUTE_DASHBOARD = '/dashboard/settings';
          const THEME_PRIMARY_COLOR = '#1122334455';
          const NAV_LABEL_SETTINGS = 'Open settings page now';
          export function Nav() { return null; }
        `,
        'src/app/(marketing)/page.tsx': `
          const PAGE_TITLE_HOME = 'Welcome to the product home';
          export default function Page() { return null; }
        `,
      },
    });
    expect(inventory.candidates.filter((c) => c.kind === 'magic-business-constant')).toHaveLength(0);
  });

  it('still finds validation-in-controller and domain magic constants', () => {
    const inventory = buildRulesInventory({
      fileContents: {
        'src/controllers/order.controller.ts': `
          @Controller('orders')
          export class OrderController {
            create(dto: any) {
              if (dto.amount < 0) throw new BadRequest('bad');
              const MIN_ORDER_TOTAL = 100;
            }
          }
        `,
        'src/domain/pricing.ts': `
          export const MINIMUM_INVOICE_BALANCE = 250;
          export const MAX_CART_SIZE = 50;
          export const ORDER_STATUS_OPEN = 'open-order-status';
        `,
      },
    });
    expect(inventory.candidates.some((c) => c.kind === 'validation-in-controller')).toBe(true);
    expect(inventory.candidates.some((c) => c.kind === 'magic-business-constant')).toBe(true);
    expect(
      inventory.candidates.some((c) => c.message.includes('MAX_CART_SIZE'))
    ).toBe(true);
    expect(
      inventory.candidates.some((c) => c.message.includes('ORDER_STATUS_OPEN'))
    ).toBe(true);
  });

  it('finds validation on Next API route and server action paths', () => {
    const inventory = buildRulesInventory({
      fileContents: {
        'src/app/api/orders/route.ts': `
          export async function POST(req: Request) {
            const body = await req.json();
            if (body.amount < 0) throw new Error('bad amount');
            return Response.json({});
          }
        `,
        'src/app/actions/place-order.ts': `
          'use server';
          export async function placeOrder(dto: { amount: number }) {
            if (dto.amount < 0) throw new BadRequest('bad');
          }
        `,
      },
    });
    expect(inventory.candidates.filter((c) => c.kind === 'validation-in-controller').length).toBeGreaterThanOrEqual(2);
  });
});

describe('P1-M mergePlanes honesty shape', () => {
  it('rulesUnderContract inactive note when no arkRules', async () => {
    const { summarizeRulesUnderContract } = await import('../../../bin/lib/rules-under-contract.mjs');
    const root = mk();
    const summary = summarizeRulesUnderContract(root, { include: ['src'], layers: [], rules: [] });
    expect(summary.active).toBe(false);
    expect(summary.notAScore).toBe(true);
  });

  it('active arkRules exposes mergePlanes failMergeWhen + dualPlaneStamp', async () => {
    const { summarizeRulesUnderContract } = await import('../../../bin/lib/rules-under-contract.mjs');
    const root = mk();
    fs.mkdirSync(path.join(root, 'arkrules'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'arkrules/DomainModel.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        layer: 'DomainModel',
        structure: [
          { id: 'agg', sensor: 'aggregate-private-state', mode: 'advisory' },
          { id: 'fac', sensor: 'always-valid-factory', mode: 'enforced' },
        ],
        invariants: [
          {
            id: 'INV-ORDER-TOTAL',
            mode: 'advisory',
            description: 'Order total non-negative',
            coverage: { symbol: 'ensureOrderTotal' },
          },
        ],
      })
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        rules: [],
        arkRules: { DomainModel: 'arkrules/DomainModel.json' },
      })
    );
    const summary = summarizeRulesUnderContract(root, {
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
      arkRules: { DomainModel: 'arkrules/DomainModel.json' },
    });
    expect(summary.active).toBe(true);
    expect(summary.mergePlanes).toBeTruthy();
    expect(summary.mergePlanes.structureSensors.enforced).toBe(1);
    expect(summary.mergePlanes.extraMergeTeeth).toBe(true);
    expect(summary.mergePlanes.failMergeWhen).toMatch(/enforced/i);
    expect(summary.mergePlanes.dualPlaneStamp).toMatch(/heuristics|catalog/i);
    expect(summary.mergePlanes.arkRun).toMatchObject({ present: false, extraMergeTeeth: false });
  });

  it('P1M: empty classification cannot arm extraMergeTeeth', async () => {
    const { summarizeRulesUnderContract } = await import('../../../bin/lib/rules-under-contract.mjs');
    const root = mk();
    fs.mkdirSync(path.join(root, 'arkrules'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'arkrules/DomainModel.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        layer: 'DomainModel',
        structure: [{ id: 'fac', sensor: 'always-valid-factory', mode: 'enforced' }],
        invariants: [],
      })
    );
    const config = {
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
      arkRules: { DomainModel: 'arkrules/DomainModel.json' },
    };
    const empty = summarizeRulesUnderContract(root, config, undefined, {
      governedPercent: 0,
      populatedLayerCount: 0,
      classifiedFiles: 0,
    });
    expect(empty.mergePlanes.structureSensors.enforced).toBe(1);
    expect(empty.mergePlanes.extraMergeTeeth).toBe(false);
    expect(empty.mergePlanes.failMergeWhen).toMatch(/classification|teeth floor|governed/i);
    expect(empty.mergePlanes.classificationGate?.allowsTeeth).toBe(false);

    const ready = summarizeRulesUnderContract(root, config, undefined, {
      governedPercent: 80,
      populatedLayerCount: 1,
      classifiedFiles: 12,
    });
    expect(ready.mergePlanes.extraMergeTeeth).toBe(true);
  });

  it('advisory-only packs never arm extraMergeTeeth (FG-ARKRULES-ADVISORY-ONLY)', async () => {
    const { summarizeRulesUnderContract } = await import('../../../bin/lib/rules-under-contract.mjs');
    const root = mk();
    fs.mkdirSync(path.join(root, 'arkrules'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'arkrules/DomainModel.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        layer: 'DomainModel',
        structure: [
          { id: 'agg', sensor: 'aggregate-private-state', mode: 'advisory' },
          { id: 'fac', sensor: 'always-valid-factory', mode: 'advisory' },
        ],
        invariants: [],
      })
    );
    const summary = summarizeRulesUnderContract(
      root,
      {
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        rules: [],
        arkRules: { DomainModel: 'arkrules/DomainModel.json' },
      },
      undefined,
      { governedPercent: 100, populatedLayerCount: 1 }
    );
    expect(summary.mergePlanes.structureSensors.enforced).toBe(0);
    expect(summary.mergePlanes.extraMergeTeeth).toBe(false);
    expect(summary.mergePlanes.dualPlaneStamp).toMatch(/Advisory ArkRules|never merge/i);
  });
});

describe('S5 dual-plane sensors / inventory residual', () => {
  it('NEW-ARKRULES-UNCLASSIFIED: structure sensors skip unclassified paths', () => {
    const shapes = extractClassShapesFromSource(
      'api/watchdog.js',
      `export class Watchdog { public total = 0; constructor() {} setTotal(n) { this.total = n; } }`
    );
    const classified = extractClassShapesFromSource(
      'src/domain/order.ts',
      `export class Order { public total = 0; constructor() {} setTotal(n) { this.total = n; } }`
    );
    const layerForFile = (file: string) =>
      file.startsWith('src/domain/') ? 'DomainModel' : null;
    const findings = evaluateArkRuleSensors({
      arkRules: effectiveDomain([
        { id: 'private-state', sensor: 'aggregate-private-state', mode: 'enforced' },
        {
          id: 'orch',
          sensor: 'orchestration-only',
          mode: 'enforced',
          appliesTo: ['api/**'],
        },
      ]),
      classShapes: [...shapes, ...classified],
      files: ['api/watchdog.js', 'src/domain/order.ts'],
      layerForFile,
      fileHints: { 'api/watchdog.js': { orchestrationHeavy: true } },
    });
    expect(findings.some((f) => f.file === 'api/watchdog.js')).toBe(false);
    expect(findings.some((f) => f.file === 'src/domain/order.ts' && f.arkruleId === 'private-state')).toBe(
      true
    );
  });

  it('P1L control-flow: .if / match / when are not mutators; true mutators still fire', () => {
    const shapes = extractClassShapesFromSource(
      'src/domain/service-order.ts',
      `
export class ServiceOrder {
  private status = 'open';
  private constructor() {}
  static create() { return new ServiceOrder(); }
  if(cond: boolean) { if (cond) this.status = 'x'; return this; }
  match(fn: Function) { this.status = 'matched'; return this; }
  when(flag: boolean) { this.status = 'when'; return this; }
  cancel() { this.status = 'cancelled'; }
  complete() { this.status = 'done'; this.ensureInvariants(); }
  ensureInvariants() {}
}
`
    );
    const order = shapes.find((s) => s.className === 'ServiceOrder');
    expect(order?.mutatingMethods.map((m) => m.name).sort()).toEqual(['cancel', 'complete']);
    const findings = evaluateArkRuleSensors({
      arkRules: effectiveDomain([
        { id: 'events', sensor: 'domain-event-on-mutation', mode: 'enforced' },
      ]),
      classShapes: shapes,
      files: ['src/domain/service-order.ts'],
    });
    expect(findings.some((f) => f.message.includes('.if'))).toBe(false);
    expect(findings.some((f) => f.message.includes('.match'))).toBe(false);
    expect(findings.some((f) => f.message.includes('.when'))).toBe(false);
    expect(findings.some((f) => f.message.includes('cancel'))).toBe(true);
    expect(findings.some((f) => f.message.includes('complete'))).toBe(false);
  });

  it('P2N wave-2: quiets infra magic + error bags, keeps spaghetti seeds', () => {
    const inventory = buildRulesInventory({
      fileContents: {
        'lib/integrations/hubspot.ts': `
          const DEFAULT_TIMEOUT_MS = 15000;
          const REQUEST_TIMEOUT_MS = 8000;
          const DEFAULT_BASE_URL = 'https://api.hubspot.example.com/v3';
          export async function sync() {}
        `,
        'lib/domain/favorites.ts': `
          const FAVORITES_STORAGE_KEY = 'favorites-storage-key-long';
          export const MAX_FAVORITES_PER_USER = 25;
        `,
        'src/domain/pricing.ts': `
          export const MAX_CART_SIZE = 50;
          export const ORDER_STATUS_OPEN = 'open-order-status';
          export const MAX_PROPERTY_LIMIT = 100;
          export const DEFAULT_ORDER_LIMIT = 25;
        `,
        'src/domain/offer-access.error.ts': `
          export class OfferAccessError extends Error {
            constructor(public code: string) { super(code); this.code = code; }
          }
        `,
        'src/domain/offer.entity.ts': `
          export class Offer {
            private total = 0;
            bump() { this.total = this.total + 1; }
          }
        `,
        'src/controllers/order.controller.ts': `
          @Controller('orders')
          export class OrderController {
            create(dto: any) { if (dto.amount < 0) throw new BadRequest('bad'); }
          }
        `,
      },
    });
    const magic = inventory.candidates.filter((c) => c.kind === 'magic-business-constant');
    expect(magic.some((c) => c.message.includes('DEFAULT_TIMEOUT_MS'))).toBe(false);
    expect(magic.some((c) => c.message.includes('REQUEST_TIMEOUT_MS'))).toBe(false);
    expect(magic.some((c) => c.message.includes('FAVORITES_STORAGE_KEY'))).toBe(false);
    expect(magic.some((c) => c.message.includes('MAX_CART_SIZE'))).toBe(true);
    expect(magic.some((c) => c.message.includes('MAX_PROPERTY_LIMIT'))).toBe(true);
    // Narrow DEFAULT_ filter must not swallow domain seeds
    expect(magic.some((c) => c.message.includes('DEFAULT_ORDER_LIMIT'))).toBe(true);
    expect(
      inventory.candidates.some(
        (c) => c.kind === 'mutation-without-guard' && c.file.includes('offer-access.error')
      )
    ).toBe(false);
    expect(
      inventory.candidates.some(
        (c) => c.kind === 'mutation-without-guard' && c.file.includes('offer.entity')
      )
    ).toBe(true);
    expect(inventory.candidates.some((c) => c.kind === 'validation-in-controller')).toBe(true);
  });

  it('SharedTypes starter template ships optional layer pack', () => {
    const starter = path.resolve('templates/layers/shared-types.starter.json');
    expect(fs.existsSync(starter)).toBe(true);
    const body = JSON.parse(fs.readFileSync(starter, 'utf8'));
    expect(body.layer?.name).toBe('SharedTypes');
    expect(Array.isArray(body.suggestedRules)).toBe(true);
    expect(body.suggestedRules.length).toBeGreaterThan(0);
  });
});

describe('P0-A route-group API shells', () => {
  it('classifies app/(marketing)/api as ApplicationOrchestration', () => {
    const cfg = ARCHITECTURE_PRESETS['ui-surface']([], undefined);
    expect(
      layerForRelativePath('src/app/(marketing)/api/health/route.ts', cfg.layers)
    ).toBe('ApplicationOrchestration');
  });
});

describe('R-round: type-only non-blocking + honesty parity locks', () => {
  it('ark-check exit 0 for type-only-only tree; value still fails', () => {
    const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
    const check = path.resolve('bin/ark-check.mjs');
    const typeOnlyRoot = mk();
    fs.mkdirSync(path.join(typeOnlyRoot, 'src/app'), { recursive: true });
    fs.mkdirSync(path.join(typeOnlyRoot, 'src/kernel'), { recursive: true });
    fs.writeFileSync(
      path.join(typeOnlyRoot, 'src/kernel/api.ts'),
      'export type Api = number;\nexport const api = 1;\n'
    );
    fs.writeFileSync(
      path.join(typeOnlyRoot, 'src/app/types.ts'),
      "import type { Api } from '../kernel/api';\nexport const x: Api = 1;\n"
    );
    fs.writeFileSync(
      path.join(typeOnlyRoot, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'AppOrchestration', patterns: ['src/app/**'] },
          { name: 'Kernel', patterns: ['src/kernel/**'] },
        ],
        rules: [{ from: 'AppOrchestration', to: 'Kernel', allowed: false }],
      })
    );
    const typeOnlyRun = spawnSync(
      process.execPath,
      [check, '--root', typeOnlyRoot, '--config', 'ark.config.json', '--json'],
      { encoding: 'utf8' }
    );
    expect(typeOnlyRun.status, typeOnlyRun.stderr + typeOnlyRun.stdout).toBe(0);
    const typeJson = JSON.parse(typeOnlyRun.stdout);
    expect(typeJson.ok).toBe(true);
    expect(typeJson.violations?.some((v: { typeOnly?: boolean }) => v.typeOnly)).toBe(true);
    // Banner path uses same blocking filter — human mode should not red-X type-only-only.
    const human = spawnSync(
      process.execPath,
      [check, '--root', typeOnlyRoot, '--config', 'ark.config.json'],
      { encoding: 'utf8' }
    );
    expect(human.status).toBe(0);
    expect(human.stdout + human.stderr).toMatch(/passed|type-only placement/i);
    expect(human.stdout + human.stderr).not.toMatch(/✖.*violation/);

    // Value edge still fails.
    fs.writeFileSync(
      path.join(typeOnlyRoot, 'src/app/value.ts'),
      "import { api } from '../kernel/api';\nexport const r = api;\n"
    );
    const valueRun = spawnSync(
      process.execPath,
      [check, '--root', typeOnlyRoot, '--config', 'ark.config.json', '--json'],
      { encoding: 'utf8' }
    );
    expect(valueRun.status).not.toBe(0);
  });

  it('library evaluateArchitectureGraph type-only is failsStrict false; adapter severity warning', async () => {
    const { toAdapterDiagnostic } = await import('../../../src/domain/adapterContract');
    const result = evaluateArchitectureGraph({
      config: { layers: [] },
      rules: [{ from: 'A', to: 'B', allowed: false }],
      files: ['a.ts', 'b.ts'],
      contentViolations: [],
      edges: [
        {
          from: 'a.ts',
          fromLayer: 'A',
          to: 'b.ts',
          toLayer: 'B',
          line: 1,
          kind: 'import',
          typeOnly: true,
        },
      ],
    });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.failsStrict).toBe(false);
    expect(result.violations[0]?.severity).toBe('warning');
    const diag = toAdapterDiagnostic(result.violations[0]!);
    expect(diag.severity).toBe('warning');
  });

  it('HTML productHonesty dirty-freeze uses caller baselineSplit (not recomputed from active-only)', async () => {
    const { buildReportDepthPayload } = await import('../../../bin/lib/html-report-depth.mjs');
    const root = mk();
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/**'] }],
        rules: [],
      })
    );
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/a.ts'), 'export const a = 1;\n');
    // Mid-range freeze (5–9) needs suppressed > 0 to be dirty.
    const payload = buildReportDepthPayload(
      root,
      JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8')),
      [path.join(root, 'src/a.ts')],
      {
        governed: { percent: 100, totalFiles: 1, classifiedFiles: 1 },
        emptyScope: false,
      },
      [], // active already filtered empty
      {
        suppressedCount: 6,
        totalViolationCount: 6,
        frozenKeys: 6,
        activeCount: 0,
      }
    );
    expect(payload.designDepth.productHonesty.reasonIds).toContain('dirty-freeze');
  });

  it('ESLint peerIsolation + type-only stays error severity (hard)', () => {
    const root = mk();
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } })
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [{ name: 'Features', patterns: ['src/features/**'] }],
        rules: [
          {
            from: 'Features',
            to: 'Features',
            allowed: false,
            peerIsolation: true,
            sliceFolders: ['features'],
          },
        ],
      })
    );
    fs.mkdirSync(path.join(root, 'src/features/auth'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/features/billing'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/features/billing/types.ts'), 'export type BillId = string;\n');
    const fromFile = path.join(root, 'src/features/auth/x.ts');
    fs.writeFileSync(fromFile, "import type { BillId } from '@/features/billing/types';\nexport type T = BillId;\n");

    const reports: Array<Record<string, unknown>> = [];
    const listener = noDomainInfraImports.create({
      filename: fromFile,
      report(desc) {
        reports.push(desc);
      },
      sourceCode: { getScope: () => undefined },
    });
    listener.ImportDeclaration?.({
      type: 'ImportDeclaration',
      importKind: 'type',
      source: { value: '@/features/billing/types' },
      specifiers: [{ type: 'ImportSpecifier', importKind: 'type' }],
      loc: { start: { line: 1, column: 0 } },
    });
    expect(reports.length).toBe(1);
    const diagnostic = reports[0]?.diagnostic as {
      severity?: string;
      evidence?: { peerIsolation?: boolean; typeOnly?: boolean };
    };
    expect(diagnostic?.evidence?.peerIsolation).toBe(true);
    expect(diagnostic?.evidence?.typeOnly).toBe(true);
    expect(diagnostic?.severity).toBe('error');
  });
});

describe('residual: type-only planMet + HTML activeBlocking (failsStrict)', () => {
  it('type-only-only tree: doctor planMet blocking-only; HTML has no active-blocking-violations', () => {
    const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
    const check = path.resolve('bin/ark-check.mjs');
    const root = mk();
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/kernel'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src/kernel/api.ts'),
      'export type Api = number;\nexport const api = 1;\n'
    );
    fs.writeFileSync(
      path.join(root, 'src/app/types.ts'),
      "import type { Api } from '../kernel/api';\nexport const x: Api = 1;\n"
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'AppOrchestration', patterns: ['src/app/**'] },
          { name: 'Kernel', patterns: ['src/kernel/**'] },
        ],
        rules: [{ from: 'AppOrchestration', to: 'Kernel', allowed: false }],
      })
    );

    const doctor = spawnSync(
      process.execPath,
      [check, '--root', root, '--config', 'ark.config.json', '--doctor', '--json', '--no-cache'],
      { encoding: 'utf8' }
    );
    expect(doctor.status, doctor.stderr + doctor.stdout).toBe(0);
    const doc = JSON.parse(doctor.stdout);
    // Type-only present but non-blocking — productHonesty must not claim active-blocking.
    const reasonIds = doc.doctor?.productHonesty?.reasonIds ?? [];
    expect(reasonIds).not.toContain('active-blocking-violations');
    // planMet uses blocking only: non-core layers + 100% coverage + zero blocking → enforce
    // (before fix, type-only activeCount forced planMet false → adapt).
    expect(doc.doctor?.violations?.typeOnly).toBeGreaterThan(0);
    expect(doc.doctor?.operatingMode).toBe('enforce');

    // Unit: HTML depth payload with type-only-only active list.
    const typeOnlyV = {
      ruleId: 'LAYER_IMPORT_VIOLATION',
      typeOnly: true,
      failsStrict: false,
      from: 'src/app/types.ts',
      to: 'src/kernel/api.ts',
    };
    const payload = buildReportDepthPayload(
      root,
      JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8')),
      ['src/app/types.ts', 'src/kernel/api.ts'],
      {
        governed: { percent: 100, totalFiles: 2, classifiedFiles: 2 },
        layers: [
          { name: 'AppOrchestration', files: 1 },
          { name: 'Kernel', files: 1 },
        ],
      },
      [typeOnlyV],
      { activeCount: 1, activeBlockingCount: 0, totalViolationCount: 1, suppressedCount: 0, frozenKeys: 0 }
    );
    expect(payload.designDepth.productHonesty.reasonIds).not.toContain(
      'active-blocking-violations'
    );

    // planMet in computeReportFitness ignores type-only (ok + blockingCount 0 → enforce).
    const fitness = computeReportFitness({
      coverage: { governed: { percent: 100, totalFiles: 2, classifiedFiles: 2 }, layers: [] },
      violations: [typeOnlyV],
      ok: true,
      enforcement: [],
      config: {
        layers: [
          { name: 'AppOrchestration', patterns: ['src/app/**'] },
          { name: 'Kernel', patterns: ['src/kernel/**'] },
        ],
        rules: [{ from: 'AppOrchestration', to: 'Kernel', allowed: false }],
      },
    });
    expect(fitness.mode).toBe('enforce');
  });
});
