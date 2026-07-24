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
import { renderProductHonestyCard } from '../../../bin/lib/html-report-depth.mjs';

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
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { next: '15.5.21' } }));
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
      matchedDir: 'app/api',
    });
    expect(suggestLayerForPath('pages/api/users')).toMatchObject({
      layer: 'ApplicationOrchestration',
      matchedDir: 'pages/api',
    });
  });
});

describe('P0-B product honesty anti false-green', () => {
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
    expect(String(reports[0]?.messageId || reports[0]?.diagnostic || '')).toBeTruthy();
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
});

describe('P1-type type-only edges are placement debt, not merge blockers', () => {
  it('moves type-only denied edges to warnings with failsStrict false', () => {
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
    expect(result.violations.some((v) => v.typeOnly)).toBe(false);
    expect(result.violations.some((v) => v.target === 'src/app/ui.ts')).toBe(true);
    expect(result.warnings.some((w) => w.typeOnly && w.failsStrict === false)).toBe(true);
    expect(result.warnings.find((w) => w.typeOnly)?.message).toMatch(/type placement|SharedTypes/i);
  });

  it('matrix: default type import, named import type, mixed value+type', () => {
    const mkEdge = (typeOnly: boolean, line: number) => ({
      from: 'src/domain/a.ts',
      fromLayer: 'DomainModel',
      to: 'src/app/b.ts',
      toLayer: 'PresentationAdapters',
      line,
      kind: 'import' as const,
      typeOnly,
    });
    const result = evaluateArchitectureGraph({
      config: { layers: [] },
      rules: [{ from: 'DomainModel', to: 'PresentationAdapters', allowed: false }],
      files: ['src/domain/a.ts', 'src/app/b.ts'],
      contentViolations: [],
      edges: [mkEdge(true, 1), mkEdge(true, 2), mkEdge(false, 3)],
    });
    expect(result.warnings.filter((w) => w.typeOnly)).toHaveLength(2);
    expect(result.violations.filter((v) => !v.typeOnly)).toHaveLength(1);
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
        `,
      },
    });
    expect(inventory.candidates.some((c) => c.kind === 'validation-in-controller')).toBe(true);
    expect(inventory.candidates.some((c) => c.kind === 'magic-business-constant')).toBe(true);
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
});
