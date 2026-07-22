import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RESOLVED_CANDIDATE_FACTS_SCHEMA,
  RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION,
  analyzeResolvedProject,
  createResolvedCandidateFacts,
  loadContract,
  loadResolvedCandidateFacts,
  resolvedFactsEvidenceRequirementsHash,
  type ResolvedCandidateFactsInput,
} from '../../../src/gate';
import {
  RESOLVED_CAPABILITY_IDS,
  RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION as TYPES_FACTS_SCHEMA_VERSION,
} from '../../../src/domain/resolvedCandidateFactsTypes';
import { RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION as SCHEMA_MODULE_VERSION } from '../../../src/domain/resolvedCandidateFactsSchema';

const baseContract = loadContract({
  include: ['src'],
  layers: [
    { name: 'DomainModel', patterns: ['src/domain/**'] },
    { name: 'Kernel', patterns: ['src/kernel/**'] },
  ],
  rules: [{ from: 'DomainModel', to: 'Kernel', allowed: false }],
});

function factsInput(
  evidenceRequirementsHash = resolvedFactsEvidenceRequirementsHash(baseContract.config)
): ResolvedCandidateFactsInput {
  return {
    schemaVersion: RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION,
    completeness: 'complete',
    completenessReasons: [],
    resolverIdentity: 'arkgate-typescript-resolver@1',
    compilerIdentity: 'typescript@6.0.3',
    compilerOptionsHash: 'fnv1a-options',
    tsconfigHash: 'fnv1a-tsconfig',
    evidenceRequirementsHash,
    files: [
      {
        path: 'src/kernel/service.ts',
        contentHash: 'fnv1a-kernel',
        parseStatus: 'parsed',
        parseDiagnosticCount: 0,
        exportsOnlyTypes: false,
        typeOnlyExportNames: [],
        hasTopLevelSideEffects: false,
      },
      {
        path: 'src/domain/order.ts',
        contentHash: 'fnv1a-domain',
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
        namedBindings: ['service'],
      },
    ],
    capabilityUses: [],
    ambientUses: [],
    publishCalls: [],
    intentReferences: [],
    safetyUses: [],
  };
}

describe('Z04 resolved candidate facts contract', () => {
  it('keeps import-free schema version and capability enum aligned with types', () => {
    // Schema module stays import-free for generate-cli-pure; guard against dual-literal drift.
    expect(TYPES_FACTS_SCHEMA_VERSION).toBe(SCHEMA_MODULE_VERSION);
    expect(RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION).toBe(TYPES_FACTS_SCHEMA_VERSION);
    expect(RESOLVED_CANDIDATE_FACTS_SCHEMA.properties.schemaVersion.const).toBe(
      RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION
    );
    expect(
      RESOLVED_CANDIDATE_FACTS_SCHEMA.properties.capabilityUses.items.properties.capability.enum
    ).toEqual([...RESOLVED_CAPABILITY_IDS]);
  });

  it('publishes the generated schema through stable package subpaths', () => {
    const packaged = JSON.parse(
      fs.readFileSync(path.resolve('schemas/ark.resolved-candidate-facts.schema.json'), 'utf8')
    );
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
    };

    expect(packaged).toEqual(RESOLVED_CANDIDATE_FACTS_SCHEMA);
    expect(pkg.exports['./schema/resolved-candidate-facts']).toBe(
      './schemas/ark.resolved-candidate-facts.schema.json'
    );
    expect(pkg.exports['./schema/ark.resolved-candidate-facts.schema.json']).toBe(
      './schemas/ark.resolved-candidate-facts.schema.json'
    );
  });

  it('creates a versioned, canonical, hash-bound payload without policy verdicts', () => {
    const input = factsInput();
    const first = createResolvedCandidateFacts(input);
    const second = createResolvedCandidateFacts({
      ...input,
      files: [...input.files].reverse(),
    });

    expect(first).toEqual(second);
    expect(first.schemaVersion).toBe('1.0');
    expect(first.factsHash).toMatch(/^fnv1a-/);
    expect(RESOLVED_CANDIDATE_FACTS_SCHEMA.required).toContain('factsHash');
    expect(JSON.stringify(first)).not.toMatch(/fromLayer|toLayer|violations|ruleId/);
    expect(loadResolvedCandidateFacts(first)).toEqual(first);
  });

  it('binds candidateTreeHash only to the canonical path/content tree', () => {
    const input = factsInput();
    const first = createResolvedCandidateFacts(input);
    const metadataChanged = createResolvedCandidateFacts({
      ...input,
      files: input.files.map((file) => ({
        ...file,
        exportsOnlyTypes: !file.exportsOnlyTypes,
        typeOnlyExportNames: ['Changed'],
        hasTopLevelSideEffects: !file.hasTopLevelSideEffects,
      })),
    });

    expect(metadataChanged.candidateTreeHash).toBe(first.candidateTreeHash);
    expect(metadataChanged.factsHash).not.toBe(first.factsHash);
  });

  it('keeps completeness reason paths aligned between schema and runtime validation', () => {
    const reasonFileSchema = RESOLVED_CANDIDATE_FACTS_SCHEMA.properties.completenessReasons
      .items.properties.file;

    expect(reasonFileSchema).toEqual(
      RESOLVED_CANDIDATE_FACTS_SCHEMA.properties.files.items.properties.path
    );
    expect(() =>
      createResolvedCandidateFacts({
        ...factsInput(),
        completeness: 'partial',
        completenessReasons: [
          { code: 'PARSE_FAILURE', message: 'invalid path', file: '../outside.ts' },
        ],
      })
    ).toThrow(/project-relative path/i);
  });

  it('rejects altered facts before Kernel evaluation', () => {
    const facts = createResolvedCandidateFacts(factsInput());
    expect(() =>
      loadResolvedCandidateFacts({
        ...facts,
        dependencies: facts.dependencies.map((dependency) => ({
          ...dependency,
          target: 'src/domain/order.ts',
        })),
      })
    ).toThrow(/factsHash/);
  });

  it('refuses to create facts that violate the public contract', () => {
    expect(() =>
      createResolvedCandidateFacts({
        ...factsInput(),
        dependencies: [{ ...factsInput().dependencies[0], line: 0 }],
      })
    ).toThrow(/line.*positive integer/i);

    expect(() =>
      createResolvedCandidateFacts({
        ...factsInput(),
        completenessReasons: [{ code: 'IMPOSSIBLE', message: 'complete cannot have reasons' }],
      })
    ).toThrow(/completenessReasons.*empty/i);

    expect(() =>
      createResolvedCandidateFacts({
        ...factsInput(),
        files: [{ ...factsInput().files[0], path: '../escape.ts' }],
      })
    ).toThrow(/project-relative path/i);
  });

  it('uses a total portable order and survives JSON transport', () => {
    const input = factsInput();
    const dependencies = [
      { ...input.dependencies[0], typeOnly: true, namedBindings: ['Beta', 'Alpha'] },
      { ...input.dependencies[0], typeOnly: false, namedBindings: undefined },
    ];
    const first = createResolvedCandidateFacts({ ...input, dependencies });
    const second = createResolvedCandidateFacts({
      ...input,
      dependencies: [...dependencies].reverse(),
    });

    expect(second).toEqual(first);
    expect(loadResolvedCandidateFacts(JSON.parse(JSON.stringify(first)))).toEqual(first);
    expect(first.dependencies.some((dependency) => 'namedBindings' in dependency && dependency.namedBindings === undefined)).toBe(false);
  });

  it('preserves repeated syntax facts whose line-level evidence is identical', () => {
    const repeated = factsInput().dependencies[0];
    const facts = createResolvedCandidateFacts({
      ...factsInput(),
      dependencies: [repeated, repeated],
    });

    expect(facts.dependencies).toHaveLength(2);
    expect(loadResolvedCandidateFacts(facts)).toEqual(facts);
  });

  it('rejects unknown fields and duplicate files while preserving out-of-scope targets', () => {
    expect(() =>
      createResolvedCandidateFacts({
        ...factsInput(),
        files: [{ ...factsInput().files[0], rogue: true }],
      } as never)
    ).toThrow(/rogue.*not part of schema/i);

    expect(() =>
      createResolvedCandidateFacts({
        ...factsInput(),
        files: [factsInput().files[0], factsInput().files[0]],
        dependencies: [],
      })
    ).toThrow(/duplicate facts/i);

    const outOfScope = createResolvedCandidateFacts({
      ...factsInput(),
      dependencies: [
        { ...factsInput().dependencies[0], target: 'src/kernel/excluded.ts' },
      ],
    });
    expect(outOfScope.dependencies[0]).toMatchObject({
      resolution: 'resolved-project',
      target: 'src/kernel/excluded.ts',
    });
    expect(analyzeResolvedProject({ contract: baseContract, facts: outOfScope }).ir.violations).toEqual([
      expect.objectContaining({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        target: 'src/kernel/excluded.ts',
      }),
    ]);
  });

  it('lets the declared contract, including same-layer rules, own the verdict', () => {
    const facts = createResolvedCandidateFacts(factsInput());
    const result = analyzeResolvedProject({ contract: baseContract, facts });

    expect(result).toMatchObject({
      mode: 'resolved-candidate-facts',
      completeness: 'complete',
      valid: false,
      factsHash: facts.factsHash,
      resolverIdentity: facts.resolverIdentity,
    });
    expect(result.ir.violations).toEqual([
      expect.objectContaining({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        file: 'src/domain/order.ts',
        target: 'src/kernel/service.ts',
        fromLayer: 'DomainModel',
        toLayer: 'Kernel',
      }),
    ]);

    const allowed = loadContract({
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    });
    const explicitlyDenied = loadContract({
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [
        {
          from: 'DomainModel',
          to: 'DomainModel',
          allowed: false,
          peerIsolation: true,
          sliceFolders: ['domain'],
        },
      ],
    });
    const sameLayerFacts = createResolvedCandidateFacts({
      ...factsInput(resolvedFactsEvidenceRequirementsHash(allowed.config)),
      dependencies: [
        {
          ...factsInput().dependencies[0],
          specifier: './infra-helper',
          target: 'src/domain/payments/infra-helper.ts',
        },
      ],
      files: [
        ...factsInput().files,
        {
          path: 'src/domain/payments/infra-helper.ts',
          contentHash: 'fnv1a-helper',
          parseStatus: 'parsed',
          parseDiagnosticCount: 0,
          exportsOnlyTypes: false,
          typeOnlyExportNames: [],
          hasTopLevelSideEffects: false,
        },
      ],
    });
    expect(analyzeResolvedProject({ contract: allowed, facts: sameLayerFacts }).valid).toBe(true);
    expect(
      analyzeResolvedProject({ contract: explicitlyDenied, facts: sameLayerFacts }).ir.violations
    ).toEqual([
      expect.objectContaining({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        fromLayer: 'DomainModel',
        toLayer: 'DomainModel',
      }),
    ]);
  });

  it('fails closed when the resolver reports partial evidence', () => {
    const contract = loadContract({
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    });
    const facts = createResolvedCandidateFacts({
      ...factsInput(resolvedFactsEvidenceRequirementsHash(contract.config)),
      completeness: 'partial',
      completenessReasons: [
        { code: 'PARSE_FAILURE', file: 'src/domain/order.ts', message: 'parse failed' },
      ],
    });
    expect(analyzeResolvedProject({ contract, facts })).toMatchObject({
      valid: false,
      completeness: 'partial',
      completenessReasons: [expect.objectContaining({ code: 'PARSE_FAILURE' })],
    });
  });

  it('fails closed when facts were collected for different evidence requirements', () => {
    const facts = createResolvedCandidateFacts({
      ...factsInput(),
      evidenceRequirementsHash: 'fnv1a-wrong-policy',
    });

    expect(analyzeResolvedProject({ contract: baseContract, facts })).toMatchObject({
      valid: false,
      completeness: 'unavailable',
      completenessReasons: [
        expect.objectContaining({ code: 'EVIDENCE_REQUIREMENTS_MISMATCH' }),
      ],
    });
  });

  it('reports unclassified files without enforcing their cycles or source policy', () => {
    const contract = loadContract({
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    });
    const file = (filePath: string) => ({
      path: filePath,
      contentHash: `fnv1a-${filePath}`,
      parseStatus: 'parsed' as const,
      parseDiagnosticCount: 0,
      exportsOnlyTypes: false,
      typeOnlyExportNames: [],
      hasTopLevelSideEffects: false,
    });
    const facts = createResolvedCandidateFacts({
      ...factsInput(resolvedFactsEvidenceRequirementsHash(contract.config)),
      files: [file('src/free/a.ts'), file('src/free/b.ts')],
      dependencies: [
        {
          from: 'src/free/a.ts',
          specifier: './b',
          kind: 'import',
          typeOnly: false,
          line: 1,
          resolution: 'resolved-project',
          target: 'src/free/b.ts',
        },
        {
          from: 'src/free/b.ts',
          specifier: './a',
          kind: 'import',
          typeOnly: false,
          line: 1,
          resolution: 'resolved-project',
          target: 'src/free/a.ts',
        },
      ],
      publishCalls: [
        {
          file: 'src/free/a.ts',
          line: 2,
          rawIntentName: 'Domain.Raw',
          objectHasIntent: false,
          arkPublishCandidate: true,
          hasSource: false,
        },
      ],
    });

    const result = analyzeResolvedProject({ contract, facts });
    expect(result.valid).toBe(true);
    expect(result.ir.violations).toEqual([]);
    expect(result.ir.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'CONFIG_UNCLASSIFIED_FILES' }),
      ])
    );
  });

  it('uses canonical longest-prefix intent classification with the built-in fallback', () => {
    const fallbackContract = loadContract({
      include: ['src'],
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'] },
        { name: 'Kernel', patterns: ['src/kernel/**'] },
      ],
      rules: [{ from: 'DomainModel', to: 'Kernel', allowed: false }],
    });
    const fallbackFacts = createResolvedCandidateFacts({
      ...factsInput(resolvedFactsEvidenceRequirementsHash(fallbackContract.config)),
      dependencies: [],
      intentReferences: [
        { file: 'src/domain/order.ts', line: 1, intent: 'Kernel.DoWork' },
      ],
    });
    expect(
      analyzeResolvedProject({ contract: fallbackContract, facts: fallbackFacts }).ir.violations
    ).toEqual([
      expect.objectContaining({
        ruleId: 'LAYER_INTENT_REFERENCE_VIOLATION',
        fromLayer: 'DomainModel',
        toLayer: 'Kernel',
      }),
    ]);

    const longestContract = loadContract({
      include: ['src'],
      layers: [
        {
          name: 'Source',
          patterns: ['src/domain/**'],
          intentPrefixes: ['Source.'],
        },
        {
          name: 'A',
          patterns: ['src/a/**'],
          intentPrefixes: ['A.', 'VeryLong.Unrelated.'],
        },
        { name: 'B', patterns: ['src/b/**'], intentPrefixes: ['A.B.'] },
      ],
      rules: [{ from: 'Source', to: 'B', allowed: false }],
    });
    const longestFacts = createResolvedCandidateFacts({
      ...factsInput(resolvedFactsEvidenceRequirementsHash(longestContract.config)),
      files: [factsInput().files[1]],
      dependencies: [],
      intentReferences: [
        { file: 'src/domain/order.ts', line: 1, intent: 'A.B.DoWork' },
      ],
    });
    expect(
      analyzeResolvedProject({ contract: longestContract, facts: longestFacts }).ir.violations
    ).toEqual([
      expect.objectContaining({
        ruleId: 'LAYER_INTENT_REFERENCE_VIOLATION',
        fromLayer: 'Source',
        toLayer: 'B',
      }),
    ]);
  });
});
