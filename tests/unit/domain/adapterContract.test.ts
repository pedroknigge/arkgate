import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ARK_ANALYSIS_RESULT_SCHEMA,
  ARK_ANALYSIS_RESULT_SCHEMA_VERSION,
  adapterDocsCodePath,
  adapterFindingOccurrenceTargetKeys,
  adapterFindingRefFromTargetKey,
  adapterFindingTargetKey,
  createAdapterResult,
  toAdapterDiagnostic,
} from '../../../src/domain/adapterContract';
import {
  baselineKey,
  baselineOccurrenceKeys,
  findingRefFromTargetKey,
  isFreezableBaselineViolation,
  structureFreezeTarget,
} from '../../../src/domain/baselineKey';
import {
  baselineKey as cliBaselineKey,
  baselineOccurrenceKeys as cliBaselineOccurrenceKeys,
  findingRefFromTargetKey as cliBaselineFindingRef,
  isFreezableBaselineViolation as cliIsFreezableBaselineViolation,
  structureFreezeTarget as cliStructureFreezeTarget,
} from '../../../bin/lib/baseline-key.mjs';
import { deterministicNextAction } from '../../../src/domain/remediation';
import { classifyPublishFacts, looksLikeArkIntent } from '../../../src/domain/sourcePolicy';
import {
  buildEffectiveArkRules,
  loadArkRulesContract,
} from '../../../src/domain/arkRulesContract';
import {
  RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION,
  createResolvedCandidateFacts,
  loadContract,
  resolvedFactsEvidenceRequirementsHash,
} from '../../../src/gate';
import { analyzeCanonicalResolvedProject } from '../../../src/kernel/resolvedAnalysis';

describe('cross-adapter result contract v1.5', () => {
  it('facade stays under god-module floors (Shape pilot)', () => {
    const source = fs.readFileSync(path.resolve('src/domain/adapterContract.ts'), 'utf8');
    const loc = source.split(/\r?\n/).length;
    const exports =
      source.match(
        /\bexport\s+(?:async\s+)?(?:function|class|const|let|var|type|interface|enum|default)\b|\bexport\s*\{/g
      ) ?? [];
    expect(
      loc < 400 || exports.length < 12,
      `god-module floors: ${loc} LOC, ${exports.length} exports`
    ).toBe(true);
  });

  it('keeps 1.2 as a legacy value and emits resolved evidence + finding refs in 1.5', () => {
    const legacyFixture = JSON.parse(
      fs.readFileSync(
        path.resolve('tests/fixtures/contracts/ark.analysis-result.v1.2.json'),
        'utf8'
      )
    );
    expect(legacyFixture.schemaVersion).toBe('1.2');
    const violation = {
      ruleId: 'LAYER_IMPORT_VIOLATION',
      message: 'DomainModel must not import PersistenceAdapters.',
      file: 'src/domain/order.ts',
      line: 1,
      target: 'src/infra/db.ts',
      fromLayer: 'DomainModel',
      toLayer: 'PersistenceAdapters',
    };
    const targetKey = adapterFindingTargetKey(violation);
    const findingRef = adapterFindingRefFromTargetKey(targetKey);
    expect(
      createAdapterResult({
        completeness: 'complete',
        mode: 'resolved-candidate-facts',
        policyHash: 'fnv1a-policy',
        resolverIdentity: 'arkgate-typescript-resolver@1',
        factsHash: 'fnv1a-facts',
        candidateTreeHash: 'fnv1a-tree',
        valid: false,
        violations: [violation],
      })
    ).toEqual({
      ...legacyFixture,
      schemaVersion: '1.5',
      mode: 'resolved-candidate-facts',
      completenessReasons: [],
      policyHash: 'fnv1a-policy',
      resolverIdentity: 'arkgate-typescript-resolver@1',
      factsHash: 'fnv1a-facts',
      candidateTreeHash: 'fnv1a-tree',
      diagnostics: [
        {
          ...legacyFixture.diagnostics[0],
          findingRef,
          targetKey,
          docsCodePath: adapterDocsCodePath('LAYER_IMPORT_VIOLATION'),
        },
      ],
    });
    expect(ARK_ANALYSIS_RESULT_SCHEMA_VERSION).toBe('1.5');
    expect(ARK_ANALYSIS_RESULT_SCHEMA.$id).toBe(
      'https://unpkg.com/arkgate@3/schemas/ark.analysis-result.schema.json'
    );
    expect(ARK_ANALYSIS_RESULT_SCHEMA.properties.schemaVersion.const).toBe('1.5');
    expect(ARK_ANALYSIS_RESULT_SCHEMA.required).toContain('mode');
    expect(ARK_ANALYSIS_RESULT_SCHEMA.required).toContain('completeness');
    expect(ARK_ANALYSIS_RESULT_SCHEMA.properties.completeness).toEqual({
      enum: ['complete', 'partial', 'unavailable'],
    });
    expect(ARK_ANALYSIS_RESULT_SCHEMA.allOf[1].then.required).toEqual([
      'policyHash',
      'resolverIdentity',
      'factsHash',
      'candidateTreeHash',
    ]);
    expect(
      ARK_ANALYSIS_RESULT_SCHEMA.properties.diagnostics.items.properties.findingRef
    ).toMatchObject({ type: 'string', minLength: 1 });
    expect(
      ARK_ANALYSIS_RESULT_SCHEMA.properties.diagnostics.items.properties.targetKey
    ).toMatchObject({ type: 'string', minLength: 1 });
  });

  it('carries arkrule provenance on every diagnostic (AR03)', () => {
    const diagnostic = toAdapterDiagnostic({
      ruleId: 'ARKRULE_STRUCTURE',
      message: 'Aggregate exposes public mutable state.',
      file: 'src/domain/order.ts',
      line: 12,
      fromLayer: 'DomainModel',
      arkruleId: 'always-valid-aggregates',
      arkruleSource: 'arkrules/DomainModel.json',
    });
    expect(diagnostic.evidence.arkruleId).toBe('always-valid-aggregates');
    expect(diagnostic.evidence.arkruleSource).toBe('arkrules/DomainModel.json');
    expect(diagnostic.nextAction).toContain('always-valid-aggregates');
    expect(diagnostic.nextAction).toContain('arkrules/DomainModel.json');
    expect(deterministicNextAction({
      ruleId: 'ARKRULE_STRUCTURE',
      arkruleId: 'always-valid-aggregates',
      arkruleSource: 'arkrules/DomainModel.json',
    })).toContain('always-valid-aggregates');

    const result = createAdapterResult({
      valid: false,
      violations: [
        {
          ruleId: 'ARKRULE_STRUCTURE',
          message: 'Aggregate exposes public mutable state.',
          file: 'src/domain/order.ts',
          line: 12,
          arkruleId: 'always-valid-aggregates',
          arkruleSource: 'arkrules/DomainModel.json',
        },
      ],
    });
    expect(result.schemaVersion).toBe('1.5');
    expect(result.diagnostics[0]?.evidence.arkruleId).toBe('always-valid-aggregates');
    expect(result.diagnostics[0]?.findingRef).toMatch(/^fnv1a-[0-9a-f]{8}$/);
    // createAdapterResult input omits fromLayer — targetKey stays baseline-compatible.
    expect(result.diagnostics[0]?.targetKey).toBe(
      'ARKRULE_STRUCTURE|src/domain/order.ts|||'
    );
  });

  it('retains the 1.0 and 1.1 fixtures without the additive completeness field', () => {
    const fixtures = ['ark.analysis-result.v1.json', 'ark.analysis-result.v1.1.json'].map((name) =>
      JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/contracts', name), 'utf8'))
    );
    expect(fixtures.map((fixture) => fixture.schemaVersion)).toEqual(['1.0', '1.1']);
    expect(fixtures.every((fixture) => !Object.hasOwn(fixture, 'completeness'))).toBe(true);
    expect(fixtures[0].diagnostics[0]).not.toHaveProperty('nextAction');
    expect(fixtures[0].diagnostics[0]).not.toHaveProperty('findingRef');
  });

  it('typechecks consumer-owned 1.0 and 1.1 results without completeness', () => {
    const result = spawnSync(
      path.resolve('node_modules/.bin/tsc'),
      ['-p', 'tests/fixtures/public-api-compat/tsconfig.json'],
      { cwd: process.cwd(), encoding: 'utf8' }
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('preserves legacy factory calls as complete and fails closed explicit incomplete analysis', () => {
    expect(createAdapterResult({ valid: true })).toEqual({
      schemaVersion: '1.5',
      mode: 'lexical-compatibility',
      completeness: 'complete',
      completenessReasons: [],
      valid: true,
      diagnostics: [],
    });
    expect(createAdapterResult({ valid: true, completeness: 'partial' })).toMatchObject({
      completeness: 'partial',
      valid: false,
    });
    expect(createAdapterResult({ valid: true, completeness: 'unavailable' })).toMatchObject({
      completeness: 'unavailable',
      valid: false,
    });
    expect(createAdapterResult({ valid: true, completeness: 'complete' })).toMatchObject({
      completeness: 'complete',
      completenessReasons: [],
      valid: true,
    });
  });

  it('normalizes legacy code fields, warnings, and invalid locations deterministically', () => {
    const warning = { code: 'LEGACY_WARNING', severity: 'warning', line: 0, column: -1 };
    const targetKey = adapterFindingTargetKey(warning);
    expect(
      createAdapterResult({
        completeness: 'complete',
        valid: true,
        warnings: [warning],
      })
    ).toEqual({
      schemaVersion: '1.5',
      mode: 'lexical-compatibility',
      completeness: 'complete',
      completenessReasons: [],
      valid: true,
      diagnostics: [
        {
          ruleId: 'LEGACY_WARNING',
          severity: 'warning',
          message: 'LEGACY_WARNING',
          location: { file: '<unknown>', line: 1, column: 1 },
          evidence: {},
          nextAction:
            'Resolve LEGACY_WARNING without weakening ark.config.json, then run Ark again.',
          findingRef: adapterFindingRefFromTargetKey(targetKey),
          targetKey,
          docsCodePath: 'docs/diagnostics.md#LEGACY_WARNING',
        },
      ],
    });
    expect(toAdapterDiagnostic({})).toMatchObject({
      ruleId: 'ARK_UNKNOWN',
      severity: 'error',
      nextAction: 'Resolve ARK_UNKNOWN without weakening ark.config.json, then run Ark again.',
      findingRef: expect.stringMatching(/^fnv1a-[0-9a-f]{8}$/),
      targetKey: '||||',
      docsCodePath: 'docs/diagnostics.md#ARK_UNKNOWN',
    });
    expect(
      ARK_ANALYSIS_RESULT_SCHEMA.properties.diagnostics.items.properties.nextAction
    ).toEqual({ type: 'string', minLength: 1 });
  });

  it('preserves canonical rule evidence in the shared diagnostic', () => {
    expect(
      toAdapterDiagnostic({
        ruleId: 'CAPABILITY_VIOLATION',
        target: 'node:fs',
        fromLayer: 'DomainModel',
        toLayer: 'Tooling',
        typeOnly: false,
        targetTypeOnlyExports: false,
        sourcePureTypeModule: false,
        namedBindingsTypeOnly: false,
        portProofEligible: true,
        peerIsolation: true,
        capability: 'filesystem',
        edgeKind: 'import',
      }).evidence
    ).toEqual({
      target: 'node:fs',
      fromLayer: 'DomainModel',
      toLayer: 'Tooling',
      typeOnly: false,
      targetTypeOnlyExports: false,
      sourcePureTypeModule: false,
      namedBindingsTypeOnly: false,
      portProofEligible: true,
      peerIsolation: true,
      capability: 'filesystem',
      edgeKind: 'import',
    });
  });

  it('gives type-only boundary findings one deterministic mechanical next action', () => {
    expect(
      toAdapterDiagnostic({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        fromLayer: 'DomainModel',
        toLayer: 'Kernel',
        typeOnly: true,
      }).nextAction
    ).toBe(
      'Move the referenced type to a mutually allowed layer, use `import type`, then preflight again.'
    );
  });

  it('keeps adapter fallback actions aligned with preflight remediation actions', () => {
    const violations = [
      {
        ruleId: 'LAYER_IMPORT_VIOLATION',
        fromLayer: 'DomainModel',
        toLayer: 'Kernel',
      },
      { ruleId: 'LAYER_IMPORT_VIOLATION', typeOnly: true },
      { ruleId: 'LAYER_IMPORT_VIOLATION', peerIsolation: true },
      { ruleId: 'FORBIDDEN_GLOBAL', target: 'fetch' },
      { ruleId: 'CIRCULAR_DEPENDENCY' },
      { ruleId: 'RAW_EVENT_PUBLISH' },
      { ruleId: 'PUBLISH_MISSING_SOURCE' },
      { ruleId: 'CUSTOM_RULE' },
      { ruleId: 'ARKRUN_UNDECLARED_EMIT', target: 'Domain.Order.Placed' },
      { ruleId: 'ARKRUN_DIRECT_NEW', target: 'OrderService', fromLayer: 'ApplicationOrchestration' },
      { ruleId: 'ARKRUN_MISSING_ROOT' },
      {},
    ];

    for (const violation of violations) {
      expect(toAdapterDiagnostic(violation).nextAction).toBe(
        deterministicNextAction(violation)
      );
    }
  });
});

describe('ACS06 stable finding refs', () => {
  it('binds findingRef to baseline-compatible targetKey (never orphans freeze identity)', () => {
    const violation = {
      ruleId: 'FORBIDDEN_GLOBAL',
      file: 'src/domain/clock.ts',
      fromLayer: 'DomainModel',
      target: 'Date',
    };
    expect(adapterFindingTargetKey(violation)).toBe(baselineKey(violation));
    expect(adapterFindingRefFromTargetKey(adapterFindingTargetKey(violation))).toBe(
      findingRefFromTargetKey(baselineKey(violation))
    );
    const diagnostic = toAdapterDiagnostic(violation);
    expect(diagnostic.targetKey).toBe(baselineKey(violation));
    expect(diagnostic.findingRef).toBe(findingRefFromTargetKey(baselineKey(violation)));
    expect(diagnostic.docsCodePath).toBe('docs/diagnostics.md#FORBIDDEN_GLOBAL');
  });

  it('uses occurrence suffixes matching baselineOccurrenceKeys so duplicates stay distinct', () => {
    const first = { ruleId: 'FORBIDDEN_GLOBAL', file: 'a.ts', target: 'fetch' };
    const second = { ruleId: 'FORBIDDEN_GLOBAL', file: 'b.ts', target: 'fetch' };
    const list = [first, first, second, first];
    expect(adapterFindingOccurrenceTargetKeys(list)).toEqual(baselineOccurrenceKeys(list));

    const result = createAdapterResult({ valid: false, violations: list });
    expect(result.diagnostics.map((d) => d.targetKey)).toEqual(baselineOccurrenceKeys(list));
    // first×3 (base/#2/#3) + second×1 → four distinct occurrence refs.
    expect(new Set(result.diagnostics.map((d) => d.findingRef)).size).toBe(4);
  });

  it('stays stable across multi-turn re-address (line/message drift does not change ref)', () => {
    const fixture = JSON.parse(
      fs.readFileSync(
        path.resolve('tests/fixtures/finding-refs/multi-turn-stability.json'),
        'utf8'
      )
    );
    expect(fixture.schemaVersion).toBe('1.0');

    const turnResults = fixture.turns.map(
      (turn: {
        turn: number;
        violations: Array<Record<string, unknown>>;
      }) =>
        createAdapterResult({
          valid: false,
          violations: turn.violations,
        })
    );

    // Same identity across turns → same findingRef + targetKey.
    const refATurn1 = turnResults[0].diagnostics[0];
    const refATurn2 = turnResults[1].diagnostics[0];
    expect(refATurn1.findingRef).toBe(refATurn2.findingRef);
    expect(refATurn1.targetKey).toBe(refATurn2.targetKey);
    expect(refATurn1.findingRef).toBe(fixture.expectedStableRefs.primary);
    expect(refATurn1.targetKey).toBe(fixture.expectedStableRefs.primaryTargetKey);

    // Message and line may change between turns without breaking the ref.
    expect(refATurn1.message).not.toBe(refATurn2.message);
    expect(refATurn1.location.line).not.toBe(refATurn2.location.line);

    // Second finding (duplicate identity) keeps occurrence suffix across turns.
    expect(turnResults[0].diagnostics[1].targetKey).toBe(
      turnResults[1].diagnostics[1].targetKey
    );
    expect(turnResults[0].diagnostics[1].findingRef).toBe(
      turnResults[1].diagnostics[1].findingRef
    );
    expect(turnResults[0].diagnostics[1].findingRef).toBe(
      fixture.expectedStableRefs.duplicateOccurrence
    );
    expect(turnResults[0].diagnostics[1].targetKey).toContain('#2');

    // Repair-shaped payload (hook ARK_REPAIR_JSON envelope) carries the same diagnostics.
    const repairPayload = {
      ...turnResults[1],
      repair: true,
      decision: 'deny',
      filePath: 'src/domain/order.ts',
    };
    expect(repairPayload.diagnostics[0].findingRef).toBe(fixture.expectedStableRefs.primary);
    expect(repairPayload.schemaVersion).toBe('1.5');
  });

  it('matches baseline freeze keys and generated CLI pure helpers (never orphans baselines)', () => {
    const v = {
      ruleId: 'CIRCULAR_DEPENDENCY',
      file: 'a.ts',
      target: 'a.ts → b.ts',
    };
    // Adapter targetKey plane === baselineKey plane (CLI + Domain).
    expect(adapterFindingTargetKey(v)).toBe(baselineKey(v));
    expect(adapterFindingTargetKey(v)).toBe(cliBaselineKey(v));
    expect(adapterFindingRefFromTargetKey(adapterFindingTargetKey(v))).toBe(
      findingRefFromTargetKey(baselineKey(v))
    );
    expect(adapterFindingRefFromTargetKey(adapterFindingTargetKey(v))).toBe(
      cliBaselineFindingRef(cliBaselineKey(v))
    );
    expect(adapterFindingOccurrenceTargetKeys([v, v])).toEqual(baselineOccurrenceKeys([v, v]));
    expect(adapterFindingOccurrenceTargetKeys([v, v])).toEqual(cliBaselineOccurrenceKeys([v, v]));

    // Generated analysis-result schema carries finding-ref fields (string check — no import of path with "adapter" token).
    const schemaPath = path.resolve('schemas/ark.analysis-result.schema.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    expect(schema.properties.schemaVersion.const).toBe('1.5');
    expect(schema.properties.diagnostics.items.properties.findingRef).toBeDefined();
    expect(schema.properties.diagnostics.items.properties.targetKey).toBeDefined();
    expect(schema.properties.diagnostics.items.properties.docsCodePath).toBeDefined();
  });
});

describe('SCOPE-001 ARKRULE_SCOPE_EMPTY is not freezable', () => {
  it('treats ARKRULE_SCOPE_EMPTY as a config diagnostic, not code debt', () => {
    const emptyScope = {
      ruleId: 'ARKRULE_SCOPE_EMPTY',
      file: 'arkrules/ApplicationOrchestration.json',
      fromLayer: 'ApplicationOrchestration',
    };
    expect(isFreezableBaselineViolation(emptyScope)).toBe(false);
    expect(cliIsFreezableBaselineViolation(emptyScope)).toBe(false);
    expect(baselineOccurrenceKeys([emptyScope])).toEqual(['']);
    expect(isFreezableBaselineViolation({ ...emptyScope, freezable: false })).toBe(false);
    expect(
      isFreezableBaselineViolation({
        ruleId: 'ARKRULE_STRUCTURE',
        file: 'src/app/foo.ts',
        fromLayer: 'ApplicationOrchestration',
        target: 'orchestration-only',
      })
    ).toBe(true);
  });

  it('omits non-freezable findings from freeze occurrence keys even with --force-shaped lists', () => {
    const scopeEmpty = {
      ruleId: 'ARKRULE_SCOPE_EMPTY',
      file: 'arkrules/ApplicationOrchestration.json',
      fromLayer: 'ApplicationOrchestration',
      freezable: false,
    };
    const structure = {
      ruleId: 'ARKRULE_STRUCTURE',
      file: 'src/app/foo.ts',
      fromLayer: 'ApplicationOrchestration',
      target: 'orchestration-only',
    };
    expect(baselineOccurrenceKeys([scopeEmpty, structure, scopeEmpty])).toEqual([
      '',
      baselineKey(structure),
      '',
    ]);
    expect(cliBaselineOccurrenceKeys([scopeEmpty, structure, scopeEmpty])).toEqual([
      '',
      cliBaselineKey(structure),
      '',
    ]);
  });
});

describe('BASEKEY-001 STRUCTURE freeze keys include sensor', () => {
  it('folds sensor (+ symbol) into the target field for new STRUCTURE freezes', () => {
    expect(structureFreezeTarget({ sensor: 'orchestration-only' })).toBe('orchestration-only');
    expect(
      structureFreezeTarget({ sensor: 'domain-event-on-mutation', symbol: 'Order.close' })
    ).toBe('domain-event-on-mutation:Order.close');
    expect(cliStructureFreezeTarget({ sensor: 'thin-adapter' })).toBe('thin-adapter');
    expect(
      baselineKey({
        ruleId: 'ARKRULE_STRUCTURE',
        file: 'src/app/foo.ts',
        fromLayer: 'ApplicationOrchestration',
        target: structureFreezeTarget({ sensor: 'orchestration-only' }),
      })
    ).toBe('ARKRULE_STRUCTURE|src/app/foo.ts|ApplicationOrchestration||orchestration-only');
    expect(
      baselineKey({
        ruleId: 'ARKRULE_STRUCTURE',
        file: 'src/app/foo.ts',
        fromLayer: 'ApplicationOrchestration',
        message:
          'File appears to embed domain branching beyond guard-and-delegate orchestration (sensor orchestration-only).',
      })
    ).toBe('ARKRULE_STRUCTURE|src/app/foo.ts|ApplicationOrchestration||orchestration-only');
  });

  it('does not let a v1 empty-target key silence a later sensor on the same file', () => {
    const file = 'src/app/foo.ts';
    const layer = 'ApplicationOrchestration';
    const v1 = baselineKey({
      ruleId: 'ARKRULE_STRUCTURE',
      file,
      fromLayer: layer,
    });
    const orchestration = baselineKey({
      ruleId: 'ARKRULE_STRUCTURE',
      file,
      fromLayer: layer,
      target: structureFreezeTarget({ sensor: 'orchestration-only' }),
    });
    const thin = baselineKey({
      ruleId: 'ARKRULE_STRUCTURE',
      file,
      fromLayer: layer,
      target: structureFreezeTarget({ sensor: 'thin-adapter' }),
    });
    expect(v1).toBe('ARKRULE_STRUCTURE|src/app/foo.ts|ApplicationOrchestration||');
    expect(orchestration).not.toBe(v1);
    expect(thin).not.toBe(v1);
    expect(orchestration).not.toBe(thin);
    const frozen = new Set([v1]);
    expect(frozen.has(orchestration)).toBe(false);
    expect(frozen.has(thin)).toBe(false);
  });

  it('Kernel copies sensor into STRUCTURE target and refuses SCOPE_EMPTY freeze identity', () => {
    const config = {
      schemaVersion: '1.1' as const,
      include: ['src'],
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'] },
        { name: 'ApplicationOrchestration', patterns: ['src/application/**'] },
      ],
      rules: [{ from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false }],
    };
    const domainFile = loadArkRulesContract({
      schemaVersion: '1.0',
      layer: 'DomainModel',
      structure: [
        { id: 'private-state', sensor: 'aggregate-private-state', mode: 'enforced' },
      ],
    }).config;
    const appFile = loadArkRulesContract({
      schemaVersion: '1.0',
      layer: 'ApplicationOrchestration',
      structure: [
        {
          id: 'writes',
          sensor: 'writes-via-aggregate',
          mode: 'enforced',
          appliesTo: ['src/lib/features/management/domain/activity-progress/**'],
        },
      ],
    }).config;
    const arkRules = buildEffectiveArkRules([
      { layer: 'DomainModel', sourceFile: 'arkrules/DomainModel.json', file: domainFile },
      {
        layer: 'ApplicationOrchestration',
        sourceFile: 'arkrules/ApplicationOrchestration.json',
        file: appFile,
      },
    ]);
    const contract = loadContract(config as never, 'ark.config.json', { arkRules });
    const facts = createResolvedCandidateFacts({
      schemaVersion: RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION,
      completeness: 'complete',
      completenessReasons: [],
      resolverIdentity: 'test-resolver',
      compilerIdentity: 'test-compiler',
      compilerOptionsHash: 'opts',
      tsconfigHash: 'tsconfig',
      evidenceRequirementsHash: resolvedFactsEvidenceRequirementsHash(contract.config),
      files: [
        {
          path: 'src/domain/order.ts',
          contentHash: 'hash-order',
          parseStatus: 'parsed',
          parseDiagnosticCount: 0,
          exportsOnlyTypes: false,
          typeOnlyExportNames: [],
          hasTopLevelSideEffects: false,
        },
      ],
      dependencies: [],
      capabilityUses: [],
      ambientUses: [],
      publishCalls: [],
      intentReferences: [],
      safetyUses: [],
      classShapes: [
        {
          file: 'src/domain/order.ts',
          className: 'Order',
          exported: true,
          hasPublicMutableFields: true,
          hasPublicSetters: false,
          hasPublicConstructor: true,
          hasStaticFactory: false,
          mutatingMethods: [],
        },
      ],
    });
    const result = analyzeCanonicalResolvedProject({ contract, facts });
    const structure = result.ir.violations.find((v) => v.ruleId === 'ARKRULE_STRUCTURE');
    expect(structure?.target).toBe('aggregate-private-state');
    expect(structure?.sensor).toBe('aggregate-private-state');
    expect(baselineKey(structure as never)).toBe(
      'ARKRULE_STRUCTURE|src/domain/order.ts|DomainModel||aggregate-private-state'
    );
    const scopeEmpty = result.ir.violations.find((v) => v.ruleId === 'ARKRULE_SCOPE_EMPTY');
    expect(scopeEmpty).toBeDefined();
    expect(scopeEmpty?.freezable).toBe(false);
    expect(isFreezableBaselineViolation(scopeEmpty as never)).toBe(false);
    expect(baselineOccurrenceKeys([scopeEmpty as never])).toEqual(['']);
    expect(result.valid).toBe(false);
  });
});

describe('shared source policy', () => {
  it('classifies raw and missing-source publish facts once for every adapter', () => {
    expect(looksLikeArkIntent('Domain.Order.Placed')).toBe(true);
    expect(looksLikeArkIntent('not-an-intent')).toBe(false);
    expect(
      classifyPublishFacts({
        publishCall: true,
        rawIntentName: 'Domain.Order.Placed',
        objectHasIntent: false,
        arkPublishCandidate: true,
        hasSource: false,
      }).map((finding) => finding.ruleId)
    ).toEqual(['RAW_EVENT_PUBLISH', 'PUBLISH_MISSING_SOURCE']);
    expect(
      classifyPublishFacts({
        publishCall: false,
        objectHasIntent: true,
        arkPublishCandidate: true,
        hasSource: false,
      })
    ).toEqual([]);
    expect(
      classifyPublishFacts({
        publishCall: true,
        objectHasIntent: false,
        arkPublishCandidate: false,
        hasSource: true,
      })
    ).toEqual([]);
  });
});
