/**
 * Write-path / gate-path wiring for ArkRules (classShapes, coverage, sensors).
 * Proves partial uncommitted fixes + residual wiring stay connected end-to-end.
 */
import { describe, expect, it } from 'vitest';
import {
  buildEffectiveArkRules,
  loadArkRulesContract,
} from '../../../src/domain/arkRulesContract';
import {
  evaluateArkRuleSensors,
  extractClassShapesFromSource,
} from '../../../src/domain/arkRuleSensors';
import { evaluateInvariantCoverage } from '../../../src/domain/invariantCoverage';
import {
  RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION,
  createResolvedCandidateFacts,
  loadContract,
  resolvedFactsEvidenceRequirementsHash,
  type ResolvedCandidateFactsInput,
} from '../../../src/gate';
import { analyzeCanonicalResolvedProject } from '../../../src/kernel/resolvedAnalysis';

const BASE_CONFIG = {
  schemaVersion: '1.1' as const,
  include: ['src'],
  layers: [
    { name: 'DomainModel', patterns: ['src/domain/**'] },
    { name: 'ApplicationOrchestration', patterns: ['src/application/**'] },
  ],
  rules: [
    {
      from: 'DomainModel',
      to: 'ApplicationOrchestration',
      allowed: false,
    },
  ],
};

function structureRules(structure: unknown[]) {
  const file = loadArkRulesContract({
    schemaVersion: '1.0',
    layer: 'DomainModel',
    structure,
  }).config;
  return buildEffectiveArkRules([
    { layer: 'DomainModel', sourceFile: 'arkrules/DomainModel.json', file },
  ]);
}

function invariantRules(
  invariants: unknown[],
  layer = 'DomainModel',
  sourceFile = 'arkrules/DomainModel.json'
) {
  const file = loadArkRulesContract({
    schemaVersion: '1.0',
    layer,
    invariants,
  }).config;
  return buildEffectiveArkRules([{ layer, sourceFile, file }]);
}

function fileFact(path: string): ResolvedCandidateFactsInput['files'][number] {
  return {
    path,
    contentHash: `hash-${path}`,
    parseStatus: 'parsed',
    parseDiagnosticCount: 0,
    exportsOnlyTypes: false,
    typeOnlyExportNames: [],
    hasTopLevelSideEffects: false,
  };
}

function minimalFacts(
  contractConfig: typeof BASE_CONFIG,
  extra: {
    files?: string[];
    classShapes?: ReturnType<typeof extractClassShapesFromSource>;
  } = {}
) {
  const contract = loadContract(contractConfig as never, 'ark.config.json');
  const files = (extra.files ?? ['src/domain/order.ts']).map(fileFact);
  return createResolvedCandidateFacts({
    schemaVersion: RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION,
    completeness: 'complete',
    completenessReasons: [],
    resolverIdentity: 'test-resolver',
    compilerIdentity: 'test-compiler',
    compilerOptionsHash: 'opts',
    tsconfigHash: 'tsconfig',
    evidenceRequirementsHash: resolvedFactsEvidenceRequirementsHash(contract.config),
    files,
    dependencies: [],
    capabilityUses: [],
    ambientUses: [],
    publishCalls: [],
    intentReferences: [],
    safetyUses: [],
    classShapes: extra.classShapes ?? [],
  });
}

describe('ArkRules write-path wiring', () => {
  it('includes classShapes in facts when source has an exported class', () => {
    const source = `
export class Order {
  public total = 0;
  constructor() {}
  setTotal(n: number) { this.total = n; }
}
`;
    const shapes = extractClassShapesFromSource('src/domain/order.ts', source);
    expect(shapes.some((s) => s.className === 'Order' && s.exported)).toBe(true);

    const facts = minimalFacts(BASE_CONFIG, { classShapes: shapes });
    expect(facts.schemaVersion).toBe('1.1');
    expect(facts.classShapes.some((s) => s.className === 'Order')).toBe(true);
  });

  it('emits enforced structure sensors when classShapes are present on the gate path', () => {
    const shapes = extractClassShapesFromSource(
      'src/domain/order.ts',
      `export class Order { public total = 0; constructor() {} }`
    );
    const arkRules = structureRules([
      { id: 'private-state', sensor: 'aggregate-private-state', mode: 'enforced' },
      { id: 'factory', sensor: 'always-valid-factory', mode: 'enforced' },
    ]);
    const contract = loadContract(BASE_CONFIG as never, 'ark.config.json', { arkRules });
    const facts = minimalFacts(BASE_CONFIG, { classShapes: shapes });
    const result = analyzeCanonicalResolvedProject({ contract, facts });

    expect(result.ir.violations.some((v) => v.arkruleId === 'private-state')).toBe(true);
    expect(result.ir.violations.some((v) => v.arkruleId === 'factory')).toBe(true);
    expect(result.valid).toBe(false);
  });

  it('evaluates invariant coverage with real fixture contents (never empty stub green)', () => {
    const arkRules = invariantRules([
      {
        id: 'INV-ORDER-001',
        description: 'Order total never negative',
        aggregate: 'Order',
        coverage: { test: true, symbol: 'Order.ensureInvariants' },
        mode: 'enforced',
      },
    ]);
    const covered = evaluateInvariantCoverage({
      arkRules,
      fileContents: {
        'src/domain/order.ts':
          'export class Order { ensureInvariants() { if (this.total < 0) throw new Error(); } }',
        'tests/order.test.ts': "it('INV-ORDER-001 keeps total non-negative', () => {})",
      },
      testFiles: ['tests/order.test.ts'],
    });
    expect(covered.coverage[0]?.covered).toBe(true);
    expect(covered.violations).toHaveLength(0);

    const cfg = {
      ...BASE_CONFIG,
      arkRules: { DomainModel: 'arkrules/DomainModel.json' },
    };
    const contract = loadContract(cfg as never, 'ark.config.json', { arkRules });
    const facts = minimalFacts(cfg);
    const partial = analyzeCanonicalResolvedProject({
      contract,
      facts,
      // missing coverageInputs → partial for enforced invariants
    });
    expect(partial.completeness).toBe('partial');
    expect(
      partial.completenessReasons.some((r) => r.code === 'INVARIANT_COVERAGE_PARTIAL')
    ).toBe(true);

    const withCoverage = analyzeCanonicalResolvedProject({
      contract,
      facts,
      coverageInputs: {
        fileContents: {
          'src/domain/order.ts':
            'export class Order { ensureInvariants() { if (this.total < 0) throw new Error(); } }',
          'tests/order.test.ts': "it('INV-ORDER-001 keeps total non-negative', () => {})",
        },
        testFiles: ['tests/order.test.ts'],
        testGlobsMissing: false,
      },
    });
    expect(withCoverage.completeness).toBe('complete');
    expect(withCoverage.ir.violations.some((v) => v.ruleId === 'INVARIANT_UNCOVERED')).toBe(
      false
    );
  });

  it('fires orchestration-only / thin-adapter when fileHints are supplied on the gate path', () => {
    const appFile = loadArkRulesContract({
      schemaVersion: '1.0',
      layer: 'ApplicationOrchestration',
      structure: [{ id: 'orch', sensor: 'orchestration-only', mode: 'advisory' }],
    }).config;
    const arkRules = buildEffectiveArkRules([
      {
        layer: 'ApplicationOrchestration',
        sourceFile: 'arkrules/ApplicationOrchestration.json',
        file: appFile,
      },
    ]);
    const cfg = {
      ...BASE_CONFIG,
      arkRules: { ApplicationOrchestration: 'arkrules/ApplicationOrchestration.json' },
    };
    const contract = loadContract(cfg as never, 'ark.config.json', { arkRules });
    const facts = minimalFacts(cfg, {
      files: ['src/application/place-order.ts'],
    });
    const result = analyzeCanonicalResolvedProject({
      contract,
      facts,
      fileHints: {
        'src/application/place-order.ts': { orchestrationHeavy: true },
      },
    });
    expect(
      result.ir.warnings.some(
        (w) => w.arkruleId === 'orch' && w.file === 'src/application/place-order.ts'
      )
    ).toBe(true);
  });

  it('does not change verdicts when arkRules are absent (opt-in)', () => {
    const contract = loadContract(BASE_CONFIG as never, 'ark.config.json');
    const facts = minimalFacts(BASE_CONFIG, {
      classShapes: extractClassShapesFromSource(
        'src/domain/order.ts',
        `export class Order { public total = 0; constructor() {} }`
      ),
    });
    const result = analyzeCanonicalResolvedProject({ contract, facts });
    expect(result.valid).toBe(true);
    expect(result.ir.violations.every((v) => !v.arkruleId)).toBe(true);
  });

  it('sensor path alone still works when evaluateArkRuleSensors gets classShapes', () => {
    const shapes = extractClassShapesFromSource(
      'src/domain/order.ts',
      `export class Order { public total = 0; constructor() {} }`
    );
    const findings = evaluateArkRuleSensors({
      arkRules: structureRules([
        { id: 'private-state', sensor: 'aggregate-private-state', mode: 'enforced' },
      ]),
      classShapes: shapes,
      files: ['src/domain/order.ts'],
    });
    expect(findings.some((f) => f.failsStrict)).toBe(true);
  });

  it('emits ARKRULE_SCOPE_EMPTY on write path for zero-match appliesTo', () => {
    const arkRules = structureRules([
      {
        id: 'enforced-miss',
        sensor: 'aggregate-private-state',
        mode: 'enforced',
        appliesTo: ['src/nowhere/**'],
      },
      {
        id: 'advisory-miss',
        sensor: 'always-valid-factory',
        mode: 'advisory',
        appliesTo: ['src/also-nowhere/**'],
      },
    ]);
    const contract = loadContract(BASE_CONFIG as never, 'ark.config.json', { arkRules });
    const facts = minimalFacts(BASE_CONFIG, { files: ['src/domain/order.ts'] });
    const result = analyzeCanonicalResolvedProject({ contract, facts });

    expect(result.ir.violations.some((v) => v.ruleId === 'ARKRULE_SCOPE_EMPTY')).toBe(true);
    expect(
      result.ir.violations.some(
        (v) => v.ruleId === 'ARKRULE_SCOPE_EMPTY' && v.arkruleId === 'enforced-miss'
      )
    ).toBe(true);
    expect(result.valid).toBe(false);
    expect(
      result.ir.warnings.some(
        (w) => w.ruleId === 'ARKRULE_SCOPE_EMPTY' && w.arkruleId === 'advisory-miss'
      )
    ).toBe(true);
  });
});
