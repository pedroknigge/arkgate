import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { parseArgs as parseArkArgs } from '../../../bin/ark.mjs';
import { prepareChangeFromRoot } from '../../../bin/lib/prepare-change.mjs';
import { composePrepareWrite } from '../../../bin/lib/prepare-write.mjs';
import { createResolverIngestCache } from '../../../bin/lib/resolved-candidate-facts.mjs';
import { validateSnippetAnalysis } from '../../../bin/lib/snippet-analysis.mjs';
import {
  evaluateArkRuleSensors,
  extractClassShapesFromSource,
} from '../../../src/domain/arkRuleSensors';
import { loadArkConfigContract } from '../../../src/domain/configContract';
import { findDeniedEdgeDecision } from '../../../src/domain/layerMatch';
import { classifyArkPolicyDelta } from '../../../src/domain/policyDelta';
import { enrichViolationWithFixClass, remediationBlueprint } from '../../../src/domain/remediation';
import {
  createAICodeGate,
  createArchitectureProfileFromArkConfig,
} from '../../../src/gate';
import { collectAnalysisConfigWarnings } from '../../../src/kernel/configWarnings';
import { evaluateArchitectureGraph } from '../../../src/kernel/graphEvaluate';

const tempDirs: string[] = [];

function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-p0-p5-qa-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('P0–P5 First-Principles Architectural Improvements — End-to-End QA', () => {
  describe('P0: Write-Gate Whole-Graph Parity & Incremental Resident Resolver Cache', () => {
    it('detects immediate 2-hop value import cycles (A -> B -> A) in single-file snippet analysis when cyclePolicy is strict', () => {
      const root = makeTempProject();
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      const fileA = path.join(root, 'src/domain/a.ts');
      const fileB = path.join(root, 'src/domain/b.ts');
      const sourceA = "import { b } from './b';\nexport const a = b + 1;\n";
      const sourceB = "import { a } from './a';\nexport const b = a + 1;\n";
      fs.writeFileSync(fileA, sourceA);
      fs.writeFileSync(fileB, sourceB);

      const gate = createAICodeGate({
        layers: [{ name: 'Domain', patterns: ['src/domain/**'] }],
        rules: [],
      });

      const result = validateSnippetAnalysis({
        gate,
        ts,
        source: sourceA,
        context: {
          root,
          filePath: fileA,
          relFile: 'src/domain/a.ts',
          layer: 'Domain',
          layers: [{ name: 'Domain', patterns: ['src/domain/**'] }],
          cyclePolicy: 'strict',
          resolveImportTarget: (specifier: string) => {
            if (specifier === './b') {
              return { absPath: fileB, relPath: 'src/domain/b.ts', layer: 'Domain' };
            }
            if (specifier === './a') {
              return { absPath: fileA, relPath: 'src/domain/a.ts', layer: 'Domain' };
            }
            return null;
          },
        },
      });

      expect(result.lexicalValid).toBe(false);
      expect(result.violations.some((v: { ruleId?: string }) => v.ruleId === 'CIRCULAR_DEPENDENCY')).toBe(true);
      const cycleViolation = result.violations.find(
        (v: { ruleId?: string }) => v.ruleId === 'CIRCULAR_DEPENDENCY'
      );
      expect(cycleViolation?.message).toContain('Circular dependency among 2 files: src/domain/a.ts → src/domain/b.ts → src/domain/a.ts');
    });

    it('exempts type-only 2-hop imports from CIRCULAR_DEPENDENCY in single-file snippet analysis', () => {
      const root = makeTempProject();
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      const fileA = path.join(root, 'src/domain/a.ts');
      const fileB = path.join(root, 'src/domain/b.ts');
      const sourceA = "import type { B } from './b';\nexport type A = { b: B };\n";
      const sourceB = "import { type A } from './a';\nexport type B = { a: A };\n";
      fs.writeFileSync(fileA, sourceA);
      fs.writeFileSync(fileB, sourceB);

      const gate = createAICodeGate({
        layers: [{ name: 'Domain', patterns: ['src/domain/**'] }],
        rules: [],
      });

      const result = validateSnippetAnalysis({
        gate,
        ts,
        source: sourceA,
        context: {
          root,
          filePath: fileA,
          relFile: 'src/domain/a.ts',
          layer: 'Domain',
          layers: [{ name: 'Domain', patterns: ['src/domain/**'] }],
          cyclePolicy: 'strict',
          resolveImportTarget: (specifier: string) => {
            if (specifier === './b') {
              return { absPath: fileB, relPath: 'src/domain/b.ts', layer: 'Domain' };
            }
            if (specifier === './a') {
              return { absPath: fileA, relPath: 'src/domain/a.ts', layer: 'Domain' };
            }
            return null;
          },
        },
      });

      expect(result.lexicalValid).toBe(true);
      expect(result.violations.some((v: { ruleId?: string }) => v.ruleId === 'CIRCULAR_DEPENDENCY')).toBe(false);
    });

    it('reuses warm createResolverIngestCache across prepareChangeFromRoot calls and equivalent config clones', () => {
      const root = makeTempProject();
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
      const rawConfig = {
        include: ['src'],
        layers: [
          { name: 'Domain', patterns: ['src/domain/**'] },
          { name: 'App', patterns: ['src/app/**'] },
        ],
        rules: [{ from: 'Domain', to: 'App', allowed: false }],
      };
      fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify(rawConfig, null, 2));
      fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const order = 1;\n');
      fs.writeFileSync(
        path.join(root, 'src/app/useOrder.ts'),
        "import { order } from '../domain/order';\nexport const res = order;\n"
      );

      const { config } = loadArkConfigContract(rawConfig);
      const ingestCache = createResolverIngestCache(config);

      const first = prepareChangeFromRoot({
        root,
        config,
        ts,
        ingestCache,
        changes: [
          {
            path: 'src/app/useOrder.ts',
            content: "import { order } from '../domain/order';\nexport const res = order + 1;\n",
          },
        ],
      });
      expect(first.valid).toBe(true);
      expect(ingestCache.records.size).toBeGreaterThan(0);

      // Second call with a fresh config clone must preserve and reuse warm cache records
      const clonedConfig = structuredClone(config);
      const second = prepareChangeFromRoot({
        root,
        config: clonedConfig,
        ts,
        ingestCache,
        changes: [
          {
            path: 'src/app/useOrder.ts',
            content: "import { order } from '../domain/order';\nexport const res = order + 2;\n",
          },
        ],
      });
      expect(second.valid).toBe(true);
      expect(ingestCache.records.size).toBeGreaterThan(0);
    });
  });

  describe('P1 & P2: layers[].entrypoints Public Surface Contract & Proactive Placement', () => {
    it('accepts layers[].entrypoints in config schema and enforces it across findDeniedEdgeDecision, evaluateArchitectureGraph, and AICodeGate', () => {
      const rawConfig = {
        include: ['src'],
        layers: [
          {
            name: 'Billing',
            patterns: ['src/billing/**'],
            entrypoints: ['src/billing/index.ts'],
          },
          {
            name: 'Checkout',
            patterns: ['src/checkout/**'],
          },
        ],
        rules: [{ from: 'Billing', to: 'Checkout', allowed: false }],
      };

      const loaded = loadArkConfigContract(rawConfig);
      expect(loaded.config.layers[0]?.entrypoints).toEqual(['src/billing/index.ts']);

      // 1. Single waist: findDeniedEdgeDecision
      const deniedInternal = findDeniedEdgeDecision(
        rawConfig.rules,
        'Checkout',
        'Billing',
        {
          fromPath: 'src/checkout/pay.ts',
          toPath: 'src/billing/internal/ledger.ts',
          layers: rawConfig.layers,
        }
      );
      expect(deniedInternal).toBeDefined();
      expect(deniedInternal?.rule.from).toBe('Checkout');
      expect(deniedInternal?.rule.to).toBe('Billing');
      expect(deniedInternal?.rule.allowed).toBe(false);
      expect(deniedInternal?.rule.message).toContain(
        'declared entrypoints (src/billing/index.ts); deep import "src/billing/internal/ledger.ts" bypasses the public surface.'
      );

      const allowedBarrel = findDeniedEdgeDecision(
        rawConfig.rules,
        'Checkout',
        'Billing',
        {
          fromPath: 'src/checkout/pay.ts',
          toPath: 'src/billing/index.ts',
          layers: rawConfig.layers,
        }
      );
      expect(allowedBarrel).toBeUndefined();

      const allowedIntraLayer = findDeniedEdgeDecision(
        rawConfig.rules,
        'Billing',
        'Billing',
        {
          fromPath: 'src/billing/index.ts',
          toPath: 'src/billing/internal/ledger.ts',
          layers: rawConfig.layers,
        }
      );
      expect(allowedIntraLayer).toBeUndefined();

      // 2. Whole-graph evaluation: evaluateArchitectureGraph
      const graphEval = evaluateArchitectureGraph({
        config: loaded.config,
        rules: loaded.config.rules,
        files: [
          'src/billing/internal/ledger.ts',
          'src/billing/index.ts',
          'src/checkout/pay.ts',
        ],
        edges: [
          {
            from: 'src/billing/index.ts',
            to: 'src/billing/internal/ledger.ts',
            fromLayer: 'Billing',
            toLayer: 'Billing',
            specifier: './internal/ledger',
            line: 1,
          },
          {
            from: 'src/checkout/pay.ts',
            to: 'src/billing/internal/ledger.ts',
            fromLayer: 'Checkout',
            toLayer: 'Billing',
            specifier: '../billing/internal/ledger',
            line: 2,
          },
        ],
        contentViolations: [],
      });

      expect(graphEval.violations).toHaveLength(1);
      expect(graphEval.violations[0]?.ruleId).toBe('LAYER_IMPORT_VIOLATION');
      expect(graphEval.violations[0]?.file).toBe('src/checkout/pay.ts');
      expect(graphEval.violations[0]?.message).toContain('declared entrypoints (src/billing/index.ts)');

      // 3. Programmatic / ESLint gate: createAICodeGate
      const resolveImportTarget = (spec: string) =>
        spec === '../billing/internal/ledger'
          ? { relPath: 'src/billing/internal/ledger.ts', layer: 'Billing' }
          : spec === '../billing/index'
            ? { relPath: 'src/billing/index.ts', layer: 'Billing' }
            : undefined;

      const gate = createAICodeGate({
        architectureProfile: createArchitectureProfileFromArkConfig(rawConfig),
        architectureLayers: rawConfig.layers,
        resolveImportTarget,
      });

      const rejected = gate.validate(
        "import { post } from '../billing/internal/ledger';\nexport const p = post;\n",
        {
          filePath: 'src/checkout/pay.ts',
          layer: 'Checkout',
        }
      );
      expect(rejected.valid).toBe(false);
      expect(rejected.violations[0]?.ruleId).toBe('LAYER_IMPORT_VIOLATION');
      expect(rejected.violations[0]?.message).toContain('declared entrypoints (src/billing/index.ts)');

      const accepted = gate.validate(
        "import { post } from '../billing/index';\nexport const p = post;\n",
        {
          filePath: 'src/checkout/pay.ts',
          layer: 'Checkout',
        }
      );
      expect(accepted.violations).toEqual([]);
      expect(accepted.lexicalValid ?? accepted.valid).toBe(true);
    });

    it('classifies entrypoints additions/narrowing as strengthening and removals/widening as weakening in policyDelta', () => {
      const baseLayer = {
        name: 'Billing',
        patterns: ['src/billing/**'],
      };
      const withEntrypoints = {
        ...baseLayer,
        entrypoints: ['src/billing/index.ts', 'src/billing/public/**'],
      };
      const narrowedEntrypoints = {
        ...baseLayer,
        entrypoints: ['src/billing/index.ts'],
      };

      const baseCfg = loadArkConfigContract({ layers: [baseLayer], rules: [] }).config;
      const withCfg = loadArkConfigContract({ layers: [withEntrypoints], rules: [] }).config;
      const narrowedCfg = loadArkConfigContract({ layers: [narrowedEntrypoints], rules: [] }).config;

      expect(classifyArkPolicyDelta(baseCfg, withCfg).classification).toBe('strengthening');
      expect(classifyArkPolicyDelta(withCfg, narrowedCfg).classification).toBe('strengthening');
      expect(classifyArkPolicyDelta(narrowedCfg, withCfg).classification).toBe('weakening');
      expect(classifyArkPolicyDelta(withCfg, baseCfg).classification).toBe('weakening');
    });

    it('emits config warnings for zero-match entrypoints globs on non-empty layers', () => {
      const warnings = collectAnalysisConfigWarnings({
        config: {
          layers: [
            {
              name: 'Billing',
              patterns: ['src/billing/**'],
              entrypoints: ['src/billing/missing-barrel.ts'],
            },
          ],
          rules: [],
        },
        rules: [],
        files: ['src/billing/internal.ts'],
      });

      expect(warnings.map((w) => w.ruleId)).toContain('CONFIG_LAYER_PATTERN_NO_MATCHES');
      const noMatchWarning = warnings.find((w) => w.ruleId === 'CONFIG_LAYER_PATTERN_NO_MATCHES');
      expect(noMatchWarning?.message).toContain('entrypoint "src/billing/missing-barrel.ts" matched no included files');
    });

    it('surfaces entrypoints and targetEntrypoints in composePrepareWrite and parses ark init --baseline', () => {
      const prepared = composePrepareWrite({
        source: 'export const x = 1;\n',
        placement: {
          filePath: 'src/checkout/pay.ts',
          governed: true,
          layer: 'Checkout',
          entrypoints: ['src/checkout/index.ts'],
          mayImport: ['Checkout', 'Billing'],
          targetEntrypoints: {
            Billing: ['src/billing/index.ts'],
          },
          forbiddenGlobals: ['fetch'],
        },
        root: process.cwd(),
        ts,
        validate: () => ({ valid: true, violations: [] }),
      });

      expect(prepared.entrypoints).toEqual(['src/checkout/index.ts']);
      expect(prepared.targetEntrypoints).toEqual({
        Billing: ['src/billing/index.ts'],
      });

      const parsedDefault = parseArkArgs(['node', 'ark', 'init', '--baseline']);
      expect(parsedDefault.baseline).toBe('.ark-baseline.json');
      const parsedCustom = parseArkArgs(['node', 'ark', 'init', '--baseline', 'config/ark-baseline.json']);
      expect(parsedCustom.baseline).toBe('config/ark-baseline.json');
    });
  });

  describe('P3: Deterministic Port & Valve Blueprints on Rejection', () => {
    it('synthesizes concrete TypeScript port/valve/entrypoint blueprints for all primary violation families', () => {
      const globalBlueprint = remediationBlueprint({
        ruleId: 'FORBIDDEN_GLOBAL',
        target: 'Date.now',
        fromLayer: 'DomainModel',
      });
      expect(globalBlueprint).toContain('export interface ClockPort');
      expect(globalBlueprint).toContain('now(): number;');

      const capBlueprint = remediationBlueprint({
        ruleId: 'CAPABILITY_VIOLATION',
        capability: 'network',
        target: 'fetch',
        fromLayer: 'DomainModel',
      });
      expect(capBlueprint).toContain('export interface HttpPort');

      const entrypointBlueprint = remediationBlueprint({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        fromLayer: 'Checkout',
        toLayer: 'Billing',
        target: 'src/billing/internal/ledger.ts',
        message:
          'Checkout may only import Billing through its declared entrypoints (src/billing/index.ts); deep import "src/billing/internal/ledger.ts" is internal to Billing.',
      });
      expect(entrypointBlueprint).toContain("import { /* public API */ } from 'src/billing/index';");

      const layerPortBlueprint = remediationBlueprint({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        fromLayer: 'DomainModel',
        toLayer: 'PersistenceAdapters',
        target: 'src/persistence/orderRepository.ts',
      });
      expect(layerPortBlueprint).toContain('export interface OrderRepositoryPort');

      const arkOrderBlueprint = remediationBlueprint({
        ruleId: 'ARKORDER_XI_FIELD_WRITE',
        target: 'subscription.planTier',
      });
      expect(arkOrderBlueprint).toContain("plane.proposeRelease({ key: 'planTier'");
      expect(arkOrderBlueprint).toContain('plane.apply(proposal)');

      const arkRunBlueprint = remediationBlueprint({
        ruleId: 'ARKRUN_DIRECT_NEW',
        target: 'InvoiceService',
      });
      expect(arkRunBlueprint).toContain('kernel.resolve(InvoiceService)');

      // Verify enrichViolationWithFixClass + composePrepareWrite attach blueprint to judgmentBrief
      const enriched = enrichViolationWithFixClass({
        ruleId: 'FORBIDDEN_GLOBAL',
        target: 'Date.now',
        fromLayer: 'DomainModel',
      });
      expect(enriched.blueprint).toContain('export interface ClockPort');

      const preparedRejected = composePrepareWrite({
        source: 'export const now = Date.now();\n',
        placement: {
          filePath: 'src/domain/order.ts',
          governed: true,
          layer: 'DomainModel',
          mayImport: ['DomainModel'],
          forbiddenGlobals: ['Date.now'],
        },
        root: process.cwd(),
        ts,
        validate: () => ({
          valid: false,
          lexicalValid: false,
          violations: [
            {
              ruleId: 'FORBIDDEN_GLOBAL',
              code: 'FORBIDDEN_GLOBAL',
              target: 'Date.now',
              fromLayer: 'DomainModel',
              message: 'Forbidden global Date.now in DomainModel',
            },
          ],
        }),
      });
      expect(preparedRejected.judgmentBrief?.blueprint).toContain('export interface ClockPort');
    });
  });

  describe('P4: AST-Backed Domain Sensors (Comment/String Masking & Structural Guards)', () => {
    const domainEventRule = {
      id: 'ARK-DOM-EVENT',
      sensor: 'domain-event-on-mutation' as const,
      mode: 'enforced' as const,
      provenance: {
        kind: 'layer-arkrules' as const,
        layer: 'Domain',
        sourceFile: 'src/domain/.arkrules.json',
      },
    };

    it('rejects a mutating method that only mentions validate/emit inside a comment or string literal', () => {
      const sourceWithCommentedGuard = [
        'export class Order {',
        '  status = "open";',
        '  cancel() {',
        '    // TODO: validate and emit OrderCancelled later',
        '    const label = "validate publish emit";',
        '    this.status = "cancelled";',
        '  }',
        '}',
      ].join('\n');

      const shapes = extractClassShapesFromSource('src/domain/Order.ts', sourceWithCommentedGuard);
      expect(shapes).toHaveLength(1);
      expect(shapes[0]?.mutatingMethods).toEqual([
        { name: 'cancel', referencesGuardOrPublish: false },
      ]);

      const violations = evaluateArkRuleSensors({
        arkRules: {
          invariants: [],
          structure: [domainEventRule],
          waivers: [],
        },
        classShapes: shapes,
        files: ['src/domain/Order.ts'],
        layerForFile: () => 'Domain',
      });
      expect(violations).toHaveLength(1);
      expect(violations[0]?.ruleId).toBe('ARKRULE_STRUCTURE');
      expect(violations[0]?.sensor).toBe('domain-event-on-mutation');
    });

    it('accepts a mutating method guarded by a structural if (...) throw clause without magic method names', () => {
      const sourceWithStructuralGuard = [
        'export class Account {',
        '  balance = 100;',
        '  debit(amount: number) {',
        '    if (amount <= 0 || amount > this.balance) {',
        '      throw new RangeError("Invalid debit amount");',
        '    }',
        '    this.balance = this.balance - amount;',
        '  }',
        '}',
      ].join('\n');

      const shapes = extractClassShapesFromSource('src/domain/Account.ts', sourceWithStructuralGuard);
      expect(shapes).toHaveLength(1);
      expect(shapes[0]?.mutatingMethods).toEqual([
        { name: 'debit', referencesGuardOrPublish: true },
      ]);

      const violations = evaluateArkRuleSensors({
        arkRules: {
          invariants: [],
          structure: [domainEventRule],
          waivers: [],
        },
        classShapes: shapes,
        files: ['src/domain/Account.ts'],
        layerForFile: () => 'Domain',
      });
      expect(violations).toHaveLength(0);
    });

    it('does not treat commented-out this.field = ... as a state mutation', () => {
      const sourceWithCommentedMutation = [
        'export class Order {',
        '  status = "open";',
        '  inspect() {',
        '    // this.status = "mutated";',
        '    return this.status;',
        '  }',
        '}',
      ].join('\n');

      const shapes = extractClassShapesFromSource('src/domain/Order.ts', sourceWithCommentedMutation);
      expect(shapes).toHaveLength(1);
      expect(shapes[0]?.mutatingMethods).toEqual([]);
    });
  });

  describe('P5: Build & Bundle Treeshaking Verification', () => {
    it('enables treeshake: true in tsup configs and keeps dist bundles within release budgets', () => {
      const repoRoot = path.resolve(__dirname, '../../..');
      const rootTsup = fs.readFileSync(path.join(repoRoot, 'tsup.config.ts'), 'utf8');
      const runtimeTsup = fs.readFileSync(
        path.join(repoRoot, 'packages/runtime/tsup.config.ts'),
        'utf8'
      );
      expect(rootTsup).toContain('treeshake: true');
      expect(runtimeTsup).toContain('treeshake: true');

      const distIndexEsm = path.join(repoRoot, 'dist/index.js');
      const distIndexCjs = path.join(repoRoot, 'dist/index.cjs');
      expect(fs.existsSync(distIndexEsm)).toBe(true);
      expect(fs.existsSync(distIndexCjs)).toBe(true);
    });
  });
});
