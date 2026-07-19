import { describe, expect, it } from 'vitest';
import * as publicGate from '../../../src/gate';
import {
  analyzeArchitectureConvergence as analyzeConvergenceFromKernel,
  analyzeChange as analyzeChangeFromKernel,
  analyzePolicyDelta as analyzePolicyDeltaFromKernel,
  analyzeProject as analyzeProjectFromKernel,
  collectAnalysisConfigWarnings as collectWarningsFromKernel,
  detectArchitectureCycles,
  evaluateArchitectureGraph as evaluateGraphFromKernel,
  loadContract as loadContractFromKernel,
  preflightChange as preflightChangeFromKernel,
} from '../../../src/index';
import {
  RESOLVED_CANDIDATE_FACTS_SCHEMA as resolvedFactsSchemaFromKernel,
  RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION as resolvedFactsVersionFromKernel,
  analyzeResolvedProject as analyzeResolvedProjectFromKernel,
  createResolvedCandidateFacts as createResolvedFactsFromKernel,
  loadResolvedCandidateFacts as loadResolvedFactsFromKernel,
  preflightResolvedChange as preflightResolvedChangeFromKernel,
  resolvedFactsEvidenceRequirementsHash as resolvedRequirementsHashFromKernel,
  type ResolvedCandidateFactsInput,
} from '../../../src/gate';
import { loadArchitectureChangeMap as loadChangeMapFromKernel } from '../../../src/domain/changeMap';
import { forbiddenGlobalForModuleSpecifier as forbiddenGlobalFromDomain } from '../../../src/domain/capabilities';
import {
  analyzeChange as analyzeChangeFromBundle,
  analyzeArchitectureConvergence as analyzeConvergenceFromBundle,
  analyzePolicyDelta as analyzePolicyDeltaFromBundle,
  analyzeProject as analyzeProjectFromBundle,
  collectAnalysisConfigWarnings as collectWarningsFromBundle,
  detectArchitectureCycles as detectCyclesFromBundle,
  evaluateArchitectureGraph as evaluateGraphFromBundle,
  loadContract as loadContractFromBundle,
  loadArchitectureChangeMap as loadChangeMapFromBundle,
  preflightChange as preflightChangeFromBundle,
  forbiddenGlobalForModuleSpecifier as forbiddenGlobalFromBundle,
  RESOLVED_CANDIDATE_FACTS_SCHEMA as resolvedFactsSchemaFromBundle,
  RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION as resolvedFactsVersionFromBundle,
  analyzeResolvedProject as analyzeResolvedProjectFromBundle,
  analyzeTrustedResolvedProject,
  createResolvedCandidateFacts as createResolvedFactsFromBundle,
  createTrustedResolvedCandidateFacts,
  loadResolvedCandidateFacts as loadResolvedFactsFromBundle,
  preflightResolvedChange as preflightResolvedChangeFromBundle,
} from '../../../bin/lib/analysis-engine.mjs';

const config = {
  include: ['src'],
  layers: [
    { name: 'DomainModel', patterns: ['src/domain/**'] },
    { name: 'Kernel', patterns: ['src/kernel/**'] },
  ],
  rules: [{ from: 'DomainModel', to: 'Kernel', allowed: false }],
};

const files = [
  {
    path: 'src/domain/order.ts',
    content: "import { service } from '../kernel/service';\nexport const order = service;\n",
  },
  { path: 'src/kernel/service.ts', content: 'export const service = 1;\n' },
];

describe('generated CLI analysis engine', () => {
  it('matches the public facts contract and resolved verdict API', () => {
    const input: ResolvedCandidateFactsInput = {
      schemaVersion: resolvedFactsVersionFromKernel,
      completeness: 'complete',
      completenessReasons: [],
      resolverIdentity: 'z04-test-resolver@1',
      compilerIdentity: 'typescript@test',
      compilerOptionsHash: 'fnv1a-options',
      tsconfigHash: 'fnv1a-tsconfig',
      evidenceRequirementsHash: resolvedRequirementsHashFromKernel(
        loadContractFromKernel(config).config
      ),
      files: [
        {
          path: 'src/domain/order.ts',
          contentHash: 'fnv1a-domain',
          parseStatus: 'parsed',
          parseDiagnosticCount: 0,
          exportsOnlyTypes: false,
          typeOnlyExportNames: [],
          hasTopLevelSideEffects: false,
        },
        {
          path: 'src/kernel/service.ts',
          contentHash: 'fnv1a-kernel',
          parseStatus: 'parsed',
          parseDiagnosticCount: 0,
          exportsOnlyTypes: false,
          typeOnlyExportNames: [],
          hasTopLevelSideEffects: false,
        },
      ],
      dependencies: [
        {
          from: 'src/domain/order.ts',
          specifier: '@alias/kernel',
          kind: 'import',
          typeOnly: false,
          line: 1,
          resolution: 'resolved-project',
          target: 'src/kernel/service.ts',
        },
      ],
      capabilityUses: [],
      ambientUses: [],
      publishCalls: [],
      intentReferences: [],
      safetyUses: [],
    };
    const kernelFacts = createResolvedFactsFromKernel(input);
    const bundleFacts = createResolvedFactsFromBundle(input);
    const trustedFacts = createTrustedResolvedCandidateFacts(input);
    const kernelContract = loadContractFromKernel(config);
    const bundleContract = loadContractFromBundle(config);

    expect(resolvedFactsVersionFromBundle).toBe(resolvedFactsVersionFromKernel);
    expect(resolvedFactsSchemaFromBundle).toEqual(resolvedFactsSchemaFromKernel);
    expect(bundleFacts).toEqual(kernelFacts);
    expect(trustedFacts).toEqual(kernelFacts);
    expect(Object.isFrozen(trustedFacts)).toBe(true);
    expect(Object.isFrozen(trustedFacts.files)).toBe(true);
    expect(Object.isFrozen(trustedFacts.files[0])).toBe(true);
    expect(Object.isFrozen(bundleFacts)).toBe(false);
    expect(publicGate).not.toHaveProperty('analyzeTrustedResolvedProject');
    expect(publicGate).not.toHaveProperty('createTrustedResolvedCandidateFacts');
    expect(() => {
      trustedFacts.files[0].contentHash = 'forged';
    }).toThrow(TypeError);
    expect(() =>
      analyzeTrustedResolvedProject({ contract: bundleContract, facts: bundleFacts })
    ).toThrow(/immutable in-process canonical facts/);
    expect(() =>
      analyzeTrustedResolvedProject({
        contract: bundleContract,
        facts: structuredClone(trustedFacts),
      })
    ).toThrow(/immutable in-process canonical facts/);
    expect(loadResolvedFactsFromBundle(bundleFacts)).toEqual(
      loadResolvedFactsFromKernel(kernelFacts)
    );
    expect(
      analyzeResolvedProjectFromBundle({ contract: bundleContract, facts: bundleFacts })
    ).toEqual(analyzeResolvedProjectFromKernel({ contract: kernelContract, facts: kernelFacts }));
    expect(
      analyzeTrustedResolvedProject({ contract: bundleContract, facts: trustedFacts })
    ).toEqual(analyzeResolvedProjectFromKernel({ contract: kernelContract, facts: kernelFacts }));
    expect(
      preflightResolvedChangeFromBundle({
        contract: bundleContract,
        baseFacts: bundleFacts,
        candidateFacts: bundleFacts,
        changes: [],
      })
    ).toEqual(
      preflightResolvedChangeFromKernel({
        contract: kernelContract,
        baseFacts: kernelFacts,
        candidateFacts: kernelFacts,
        changes: [],
      })
    );
  });

  it('matches the canonical exact process module-dual vocabulary (Y08)', () => {
    for (const specifier of ['process', 'node:process', 'child_process', 'node:process/subpath']) {
      expect(forbiddenGlobalFromBundle(specifier, ['process'])).toBe(
        forbiddenGlobalFromDomain(specifier, ['process'])
      );
    }
  });

  it('matches the canonical Kernel API for project analysis', () => {
    const kernelContract = loadContractFromKernel(config);
    const bundleContract = loadContractFromBundle(config);

    expect(bundleContract).toEqual(kernelContract);
    expect(
      analyzeProjectFromBundle({ contract: bundleContract, files, compilerOptions: { strict: true } })
    ).toEqual(
      analyzeProjectFromKernel({ contract: kernelContract, files, compilerOptions: { strict: true } })
    );
  });

  it('matches the canonical Kernel API for in-memory changes', () => {
    const kernelContract = loadContractFromKernel(config);
    const bundleContract = loadContractFromBundle(config);
    const changes = [
      { path: 'src/domain/order.ts', content: 'export const order = 2;\n' },
    ] as const;

    expect(analyzeChangeFromBundle({ contract: bundleContract, files, changes })).toEqual(
      analyzeChangeFromKernel({ contract: kernelContract, files, changes })
    );
    expect(preflightChangeFromBundle({ contract: bundleContract, files, changes })).toEqual(
      preflightChangeFromKernel({ contract: kernelContract, files, changes })
    );
  });

  it('matches the canonical change-map contract and hash', () => {
    const kernelContract = loadContractFromKernel(config);
    const bundleContract = loadContractFromBundle(config);
    const map = {
      $schema: 'https://unpkg.com/arkgate@3/schemas/ark.change-map.schema.json',
      schemaVersion: '1.0',
      files: [{ path: 'src/domain/order.ts', operation: 'update', layer: 'DomainModel' }],
      dependencies: [],
    };

    const bundleMap = loadChangeMapFromBundle(map, bundleContract.config);
    const kernelMap = loadChangeMapFromKernel(map, kernelContract.config);
    expect(bundleMap).toEqual(kernelMap);
    const changes = [{ path: 'src/domain/order.ts', content: 'export const order = 2;\n' }] as const;
    expect(
      preflightChangeFromBundle({ contract: bundleContract, files, changes, changeMap: bundleMap })
    ).toEqual(
      preflightChangeFromKernel({ contract: kernelContract, files, changes, changeMap: kernelMap })
    );
    const convergenceInput = {
      changeMap: kernelMap,
      changes: [{ path: 'src/domain/order.ts', operation: 'update' as const }],
      baseDependencies: [],
      candidateDependencies: [],
    };
    expect(analyzeConvergenceFromBundle(convergenceInput)).toEqual(
      analyzeConvergenceFromKernel(convergenceInput)
    );
  });

  it('matches the canonical Kernel API for policy transitions', () => {
    const candidate = {
      ...config,
      dynamicImportAllowlist: ['src/domain/dynamic.ts'],
    };

    expect(
      analyzePolicyDeltaFromBundle({ baseConfig: config, candidateConfig: candidate })
    ).toEqual(analyzePolicyDeltaFromKernel({ baseConfig: config, candidateConfig: candidate }));
  });

  it.each(['strict', 'soft', 'off'] as const)(
    'matches graph policy and cycle evaluation for cyclePolicy=%s',
    (cyclePolicy) => {
      const contract = loadContractFromKernel({ ...config, cyclePolicy });
      const input = {
        config: contract.config,
        rules: contract.config.rules,
        files: ['src/domain/a.ts', 'src/kernel/b.ts'],
        contentViolations: [],
        edges: [
          {
            from: 'src/domain/a.ts',
            fromLayer: 'DomainModel',
            to: 'src/kernel/b.ts',
            toLayer: 'Kernel',
            line: 3,
            kind: 'import',
            portProofEligible: true,
          },
          {
            from: 'src/kernel/b.ts',
            fromLayer: 'Kernel',
            to: 'src/domain/a.ts',
            toLayer: 'DomainModel',
            line: 1,
            kind: 'import',
          },
        ],
      };

      expect(evaluateGraphFromBundle(input)).toEqual(evaluateGraphFromKernel(input));
      const result = evaluateGraphFromKernel(input);
      expect(result.violations.some(({ ruleId }) => ruleId === 'LAYER_IMPORT_VIOLATION')).toBe(true);
      expect(result.violations.some(({ ruleId }) => ruleId === 'CIRCULAR_DEPENDENCY')).toBe(
        cyclePolicy === 'strict'
      );
      expect(result.warnings.some(({ ruleId }) => ruleId === 'CIRCULAR_DEPENDENCY')).toBe(
        cyclePolicy === 'soft'
      );
    }
  );

  it('matches canonical configuration diagnostics', () => {
    const contract = loadContractFromKernel({
      include: ['src'],
      layers: [
        { name: 'One', patterns: ['src/**'] },
        { name: 'Two', patterns: ['src/**'] },
        { name: 'Missing', patterns: ['missing/**'] },
      ],
      rules: [{ from: 'Unknown', to: 'Two', allowed: false }],
    });
    const input = {
      config: contract.config,
      rules: contract.config.rules,
      files: ['src/a.ts', 'other/unclassified.ts'],
    };

    const kernelWarnings = collectWarningsFromKernel(input);
    expect(collectWarningsFromBundle(input)).toEqual(kernelWarnings);
    expect(kernelWarnings.map(({ ruleId }) => ruleId)).toEqual(
      expect.arrayContaining([
        'CONFIG_LAYER_PATTERN_NO_MATCHES',
        'CONFIG_RULE_UNKNOWN_FROM_LAYER',
        'CONFIG_AMBIGUOUS_LAYERS',
        'CONFIG_UNCLASSIFIED_FILES',
      ])
    );
  });

  it('covers graph edge metadata, peer isolation, and disconnected cycle branches', () => {
    const graph = new Map([
      ['a.ts', new Set(['a.ts', 'b.ts', 'outside.ts'])],
      ['b.ts', new Set(['a.ts'])],
      ['single.ts', new Set<string>()],
    ]);
    expect(detectArchitectureCycles(graph)).toEqual([
      expect.objectContaining({ ruleId: 'CIRCULAR_DEPENDENCY', target: 'a.ts → b.ts' }),
    ]);
    expect(detectCyclesFromBundle(graph)).toEqual(detectArchitectureCycles(graph));

    const contract = loadContractFromKernel({
      include: ['src'],
      cyclePolicy: 'off',
      layers: [{ name: 'Slice', patterns: ['src/**'] }],
      rules: [
        {
          from: 'Slice',
          to: 'Slice',
          allowed: false,
          peerIsolation: true,
          sliceFolders: ['features'],
        },
      ],
    });
    const input = {
      config: contract.config,
      rules: contract.config.rules,
      files: ['src/features/a/index.ts', 'src/features/b/index.ts'],
      contentViolations: [{ ruleId: 'CONTENT', message: 'content' }],
      warnings: [{ ruleId: 'WARNING', message: 'warning' }],
      safety: { checked: true },
      edges: [
        {
          from: 'src/features/a/index.ts',
          fromLayer: 'Slice',
          to: 'src/features/b/index.ts',
          toLayer: 'Slice',
          line: 2,
          kind: 'export',
          typeOnly: true,
          targetTypeOnlyExports: true,
          sourcePureTypeModule: true,
          namedBindingsTypeOnly: true,
          portProofEligible: true,
        },
        {
          from: 'src/features/a/index.ts',
          fromLayer: 'Slice',
          line: 3,
          kind: 'dynamic-import',
        },
      ],
    };
    const result = evaluateGraphFromKernel(input);
    expect(evaluateGraphFromBundle(input)).toEqual(result);

    expect(result.safety).toEqual({ checked: true });
    expect(result.warnings).toEqual([{ ruleId: 'WARNING', message: 'warning' }]);
    expect(result.violations).toEqual([
      { ruleId: 'CONTENT', message: 'content' },
      expect.objectContaining({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        peerIsolation: true,
        typeOnly: true,
        targetTypeOnlyExports: true,
        sourcePureTypeModule: true,
        namedBindingsTypeOnly: true,
        edgeKind: 'export',
      }),
    ]);
    expect(result.violations[1]).not.toHaveProperty('portProofEligible');
  });

  it('covers malformed and incomplete configuration diagnostics', () => {
    const input = {
      config: {
        include: ['src'],
        dynamicImportAllowlist: 'invalid',
        safety: { maxTsSuppressions: -1, maxAnyCasts: 1.5 },
        layers: [
          { name: '', patterns: ['src/**'] },
          { name: 'Empty', patterns: [], forbiddenGlobals: 'fetch' },
          { name: 'Duplicate', patterns: ['missing/**'] },
          { name: 'Duplicate', patterns: ['src/**'] },
          { name: 'Optional', patterns: ['optional/**'], optional: true },
        ],
        rules: [
          { from: 'UnknownFrom', to: 'Duplicate', allowed: false },
          { from: 'Duplicate', to: 'UnknownTo', allowed: false },
        ],
      } as never,
      rules: [
        { from: 'UnknownFrom', to: 'Duplicate', allowed: false },
        { from: 'Duplicate', to: 'UnknownTo', allowed: false },
      ],
      files: ['src/file.ts'],
      manifest: { architecture: { layers: [{ name: 'ManifestLayer' }, {}] } },
    };
    const warnings = collectWarningsFromKernel(input);
    expect(collectWarningsFromBundle(input)).toEqual(warnings);
    const ids = warnings.map(({ ruleId }) => ruleId);

    expect(ids).toEqual(
      expect.arrayContaining([
        'CONFIG_INVALID_DYNAMIC_IMPORT_ALLOWLIST',
        'CONFIG_INVALID_SAFETY_THRESHOLD',
        'CONFIG_LAYER_WITHOUT_NAME',
        'CONFIG_LAYER_WITHOUT_PATTERNS',
        'CONFIG_INVALID_FORBIDDEN_GLOBALS',
        'CONFIG_LAYER_PATTERN_NO_MATCHES',
        'CONFIG_DUPLICATE_LAYER',
        'CONFIG_RULE_UNKNOWN_FROM_LAYER',
        'CONFIG_RULE_UNKNOWN_TO_LAYER',
      ])
    );
    expect(
      warnings.some(
        ({ ruleId, layer }) => ruleId === 'CONFIG_LAYER_PATTERN_NO_MATCHES' && layer === 'Optional'
      )
    ).toBe(false);

    const emptyInput = {
      config: { include: ['src'], layers: [], rules: [], safety: null } as never,
      rules: [],
      files: [],
    };
    const emptyWarnings = collectWarningsFromKernel(emptyInput);
    expect(collectWarningsFromBundle(emptyInput)).toEqual(emptyWarnings);
    expect(emptyWarnings.map(({ ruleId }) => ruleId)).toEqual(
      expect.arrayContaining(['CONFIG_INVALID_SAFETY', 'CONFIG_NO_LAYERS'])
    );
  });
});
