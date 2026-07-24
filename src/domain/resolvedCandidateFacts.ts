/**
 * Canonical create/load for versioned resolved candidate facts.
 *
 * Types: resolvedCandidateFactsTypes.ts · Schema: resolvedCandidateFactsSchema.ts ·
 * Hash: stableHash.ts. Plan-B god-module pilot cluster (pattern-b:god-module).
 */
import type { ArkConfig } from './configTypes';
import { deterministicHash, stableSerialize } from './stableHash';
import {
  RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION,
  RESOLVED_CAPABILITY_IDS,
  type ResolvedAmbientFact,
  type ResolvedCandidateFacts,
  type ResolvedCandidateFactsInput,
  type ResolvedCapabilityFact,
  type ResolvedClassShapeFact,
  type ResolvedDependencyFact,
  type ResolvedFactsReason,
  type ResolvedFileFact,
  type ResolvedIntentReferenceFact,
  type ResolvedPublishFact,
  type ResolvedSafetyFact,
} from './resolvedCandidateFactsTypes';

function compareCanonical(left: unknown, right: unknown): number {
  const leftKey = stableSerialize(left);
  const rightKey = stableSerialize(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

/** Identity of the policy-controlled evidence a resolver must attempt to collect. */
export function resolvedFactsEvidenceRequirementsHash(config: ArkConfig): string {
  const requirements = {
    schemaVersion: RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION,
    include: sortedUnique(config.include ?? []),
    exclude: sortedUnique(config.exclude ?? []),
    excludeGenerated: config.excludeGenerated !== false,
    dynamicImportAllowlist: sortedUnique(config.dynamicImportAllowlist ?? []),
    layers: config.layers
      .map((layer) => ({
        name: layer.name,
        patterns: sortedUnique(layer.patterns ?? []),
        exclude: sortedUnique(layer.exclude ?? []),
        forbiddenGlobals: sortedUnique(layer.forbiddenGlobals ?? []),
        intentPrefixes: sortedUnique(layer.intentPrefixes ?? []),
        capabilityDeny: sortedUnique(layer.capabilities?.deny ?? []),
        pure: layer.pure === true,
      }))
      .sort(compareCanonical),
    safety: {
      maxTsSuppressions: config.safety?.maxTsSuppressions ?? 0,
      maxAnyCasts: config.safety?.maxAnyCasts ?? 0,
      allowInMemory: config.safety?.allowInMemory === true,
      allowDisabledPeerIsolation: config.safety?.allowDisabledPeerIsolation === true,
    },
  };
  return deterministicHash(stableSerialize(requirements));
}

function canonicalResolvedFactsInput(
  input: ResolvedCandidateFactsInput
): Omit<ResolvedCandidateFacts, 'factsHash'> {
  const completenessReasons = input.completenessReasons
    .map((reason) => ({
      code: reason.code,
      message: reason.message,
      ...(reason.file ? { file: reason.file } : {}),
    }))
    .sort(compareCanonical);
  const files = input.files
    .map((file) => ({
      ...file,
      typeOnlyExportNames: sortedUnique(file.typeOnlyExportNames),
    }))
    .sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0
    );
  const dependencies = input.dependencies
    .map((dependency) => ({
      ...dependency,
      ...(dependency.namedBindings
        ? { namedBindings: sortedUnique(dependency.namedBindings) }
        : {}),
    }))
    .sort(compareCanonical);
  const capabilityUses = input.capabilityUses
    .map((fact) => ({ ...fact }))
    .sort(compareCanonical);
  const ambientUses = input.ambientUses
    .map((fact) => ({ ...fact }))
    .sort(compareCanonical);
  const publishCalls = input.publishCalls
    .map((fact) => ({ ...fact }))
    .sort(compareCanonical);
  const intentReferences = input.intentReferences
    .map((fact) => ({ ...fact }))
    .sort(compareCanonical);
  const safetyUses = input.safetyUses
    .map((fact) => ({ ...fact }))
    .sort(compareCanonical);
  const classShapes = (input.classShapes ?? [])
    .map((fact) => ({
      ...fact,
      mutatingMethods: [...(fact.mutatingMethods ?? [])].map((method) => ({ ...method })),
    }))
    .sort(compareCanonical);
  const candidateTree = input.files
    .map(({ path, contentHash }) => ({ path, contentHash }))
    .sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0
    );
  const candidateTreeHash = deterministicHash(
    stableSerialize(candidateTree)
  );
  return {
    schemaVersion: RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION,
    completeness: input.completeness,
    completenessReasons,
    resolverIdentity: input.resolverIdentity,
    compilerIdentity: input.compilerIdentity,
    compilerOptionsHash: input.compilerOptionsHash,
    tsconfigHash: input.tsconfigHash,
    candidateTreeHash,
    evidenceRequirementsHash: input.evidenceRequirementsHash,
    ...(input.projectPackageName ? { projectPackageName: input.projectPackageName } : {}),
    files,
    dependencies,
    capabilityUses,
    ambientUses,
    publishCalls,
    intentReferences,
    safetyUses,
    classShapes,
  };
}

function createCanonicalResolvedCandidateFacts(
  input: ResolvedCandidateFactsInput
): ResolvedCandidateFacts {
  const canonical = canonicalResolvedFactsInput(input);
  return {
    ...canonical,
    factsHash: deterministicHash(stableSerialize(canonical)),
  };
}

export function createResolvedCandidateFacts(
  input: ResolvedCandidateFactsInput
): ResolvedCandidateFacts {
  return createCanonicalResolvedCandidateFacts(parseResolvedFactsInput(asRecord(input, '$'), false));
}

function asRecord(value: unknown, at: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${at} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(record: Record<string, unknown>, allowed: readonly string[], at: string): void {
  const known = new Set(allowed);
  const unexpected = Object.keys(record).find((key) => !known.has(key));
  if (unexpected) {
    throw new Error(
      `${at}.${unexpected} is not part of schema ${RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION}.`
    );
  }
}

function requiredText(record: Record<string, unknown>, key: string, at: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${at}.${key} must be a non-empty string.`);
  }
  return value;
}

function optionalText(record: Record<string, unknown>, key: string, at: string): string | undefined {
  if (record[key] === undefined) return undefined;
  return requiredText(record, key, at);
}

function requiredProjectPath(record: Record<string, unknown>, key: string, at: string): string {
  const value = requiredText(record, key, at);
  const portable = value.replace(/\\/g, '/');
  if (
    !portable ||
    portable.startsWith('/') ||
    /^[A-Za-z]:\//.test(portable) ||
    /[\u0000-\u001f\u007f]/.test(portable)
  ) {
    throw new Error(`${at}.${key} must be a canonical project-relative path.`);
  }
  const segments: string[] = [];
  for (const segment of portable.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) {
        throw new Error(`${at}.${key} must be a canonical project-relative path.`);
      }
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  const normalized = segments.join('/');
  if (!normalized || normalized !== value) {
    throw new Error(`${at}.${key} must be a canonical project-relative path.`);
  }
  return normalized;
}

function requiredBoolean(record: Record<string, unknown>, key: string, at: string): boolean {
  if (typeof record[key] !== 'boolean') throw new Error(`${at}.${key} must be a boolean.`);
  return record[key] as boolean;
}

function requiredInteger(record: Record<string, unknown>, key: string, at: string): number {
  const value = record[key];
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`${at}.${key} must be a non-negative integer.`);
  }
  return Number(value);
}

function requiredPositiveInteger(record: Record<string, unknown>, key: string, at: string): number {
  const value = requiredInteger(record, key, at);
  if (value === 0) throw new Error(`${at}.${key} must be a positive integer.`);
  return value;
}

function requiredArray(record: Record<string, unknown>, key: string, at: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) throw new Error(`${at}.${key} must be an array.`);
  return value;
}

function enumValue<T extends string>(
  record: Record<string, unknown>,
  key: string,
  values: readonly T[],
  at: string
): T {
  const value = record[key];
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new Error(`${at}.${key} must be one of ${values.join(', ')}.`);
  }
  return value as T;
}

function parseStringArray(value: unknown, at: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry)) {
    throw new Error(`${at} must be an array of non-empty strings.`);
  }
  return [...value] as string[];
}

function assertUnique<T>(values: readonly T[], identity: (value: T) => string, at: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    const key = identity(value);
    if (seen.has(key)) throw new Error(`${at} must not contain duplicate facts (${key}).`);
    seen.add(key);
  }
}

function parseResolvedFactsInput(
  record: Record<string, unknown>,
  withDerivedIdentities: boolean
): ResolvedCandidateFactsInput {
  assertOnlyKeys(
    record,
    [
      'schemaVersion',
      'completeness',
      'completenessReasons',
      'resolverIdentity',
      'compilerIdentity',
      'compilerOptionsHash',
      'tsconfigHash',
      'evidenceRequirementsHash',
      'projectPackageName',
      'files',
      'dependencies',
      'capabilityUses',
      'ambientUses',
      'publishCalls',
      'intentReferences',
      'safetyUses',
      'classShapes',
      ...(withDerivedIdentities ? ['candidateTreeHash', 'factsHash'] : []),
    ],
    '$'
  );
  // Accept 1.0 (pre-classShapes) and current 1.1; normalize on create/load.
  const schemaVersion = enumValue(record, 'schemaVersion', ['1.0', '1.1'] as const, '$');
  const completeness = enumValue(
    record,
    'completeness',
    ['complete', 'partial', 'unavailable'] as const,
    '$'
  );
  const completenessReasons = requiredArray(record, 'completenessReasons', '$').map(
    (value, index): ResolvedFactsReason => {
      const at = `$.completenessReasons[${index}]`;
      const reason = asRecord(value, at);
      assertOnlyKeys(reason, ['code', 'message', 'file'], at);
      const file =
        reason.file === undefined ? undefined : requiredProjectPath(reason, 'file', at);
      return {
        code: requiredText(reason, 'code', at),
        message: requiredText(reason, 'message', at),
        ...(file ? { file } : {}),
      };
    }
  );
  if (completeness === 'complete' && completenessReasons.length > 0) {
    throw new Error('$.completenessReasons must be empty when completeness is complete.');
  }
  if (completeness !== 'complete' && completenessReasons.length === 0) {
    throw new Error('$.completenessReasons must explain partial or unavailable facts.');
  }
  const files = requiredArray(record, 'files', '$').map((value, index): ResolvedFileFact => {
    const at = `$.files[${index}]`;
    const file = asRecord(value, at);
    assertOnlyKeys(
      file,
      [
        'path',
        'contentHash',
        'parseStatus',
        'parseDiagnosticCount',
        'exportsOnlyTypes',
        'typeOnlyExportNames',
        'hasTopLevelSideEffects',
      ],
      at
    );
    return {
      path: requiredProjectPath(file, 'path', at),
      contentHash: requiredText(file, 'contentHash', at),
      parseStatus: enumValue(file, 'parseStatus', ['parsed', 'invalid'] as const, at),
      parseDiagnosticCount: requiredInteger(file, 'parseDiagnosticCount', at),
      exportsOnlyTypes: requiredBoolean(file, 'exportsOnlyTypes', at),
      typeOnlyExportNames: parseStringArray(file.typeOnlyExportNames, `${at}.typeOnlyExportNames`),
      hasTopLevelSideEffects: requiredBoolean(file, 'hasTopLevelSideEffects', at),
    };
  });
  const dependencies = requiredArray(record, 'dependencies', '$').map(
    (value, index): ResolvedDependencyFact => {
      const at = `$.dependencies[${index}]`;
      const dependency = asRecord(value, at);
      assertOnlyKeys(
        dependency,
        [
          'from',
          'specifier',
          'kind',
          'typeOnly',
          'line',
          'resolution',
          'target',
          'namedBindings',
          'targetTypeOnlyExports',
          'sourcePureTypeModule',
          'namedBindingsTypeOnly',
          'portProofEligible',
        ],
        at
      );
      const specifier = optionalText(dependency, 'specifier', at);
      const target = optionalText(dependency, 'target', at);
      const resolution = enumValue(
        dependency,
        'resolution',
        ['resolved-project', 'resolved-external', 'unresolved', 'dynamic'] as const,
        at
      );
      if (resolution === 'resolved-project' && !target) {
        throw new Error(`${at}.target is required for resolved-project dependencies.`);
      }
      if (resolution !== 'resolved-project' && target) {
        throw new Error(`${at}.target is only allowed for resolved-project dependencies.`);
      }
      if (resolution !== 'dynamic' && !specifier) {
        throw new Error(`${at}.specifier is required unless resolution is dynamic.`);
      }
      return {
        from: requiredProjectPath(dependency, 'from', at),
        ...(specifier ? { specifier } : {}),
        kind: enumValue(
          dependency,
          'kind',
          ['import', 'export', 'dynamic-import', 'require'] as const,
          at
        ),
        typeOnly: requiredBoolean(dependency, 'typeOnly', at),
        line: requiredPositiveInteger(dependency, 'line', at),
        resolution,
        ...(target ? { target: requiredProjectPath(dependency, 'target', at) } : {}),
        ...(dependency.namedBindings !== undefined
          ? { namedBindings: parseStringArray(dependency.namedBindings, `${at}.namedBindings`) }
          : {}),
        ...(dependency.targetTypeOnlyExports !== undefined
          ? {
              targetTypeOnlyExports: requiredBoolean(
                dependency,
                'targetTypeOnlyExports',
                at
              ),
            }
          : {}),
        ...(dependency.sourcePureTypeModule !== undefined
          ? {
              sourcePureTypeModule: requiredBoolean(
                dependency,
                'sourcePureTypeModule',
                at
              ),
            }
          : {}),
        ...(dependency.namedBindingsTypeOnly !== undefined
          ? {
              namedBindingsTypeOnly: requiredBoolean(
                dependency,
                'namedBindingsTypeOnly',
                at
              ),
            }
          : {}),
        ...(dependency.portProofEligible !== undefined
          ? {
              portProofEligible: requiredBoolean(dependency, 'portProofEligible', at),
            }
          : {}),
      };
    }
  );
  const capabilityUses = requiredArray(record, 'capabilityUses', '$').map(
    (value, index): ResolvedCapabilityFact => {
      const at = `$.capabilityUses[${index}]`;
      const fact = asRecord(value, at);
      assertOnlyKeys(fact, ['file', 'line', 'symbol', 'capability', 'source'], at);
      return {
        file: requiredProjectPath(fact, 'file', at),
        line: requiredPositiveInteger(fact, 'line', at),
        symbol: requiredText(fact, 'symbol', at),
        capability: enumValue(fact, 'capability', RESOLVED_CAPABILITY_IDS, at),
        source: enumValue(fact, 'source', ['ambient-global', 'import-based'] as const, at),
      };
    }
  );
  const ambientUses = requiredArray(record, 'ambientUses', '$').map(
    (value, index): ResolvedAmbientFact => {
      const at = `$.ambientUses[${index}]`;
      const fact = asRecord(value, at);
      assertOnlyKeys(fact, ['file', 'line', 'symbol'], at);
      return {
        file: requiredProjectPath(fact, 'file', at),
        line: requiredPositiveInteger(fact, 'line', at),
        symbol: requiredText(fact, 'symbol', at),
      };
    }
  );
  const publishCalls = requiredArray(record, 'publishCalls', '$').map(
    (value, index): ResolvedPublishFact => {
      const at = `$.publishCalls[${index}]`;
      const fact = asRecord(value, at);
      assertOnlyKeys(
        fact,
        [
          'file',
          'line',
          'rawIntentName',
          'objectHasIntent',
          'arkPublishCandidate',
          'hasSource',
          'sourceIntent',
        ],
        at
      );
      const rawIntentName = optionalText(fact, 'rawIntentName', at);
      const sourceIntent = optionalText(fact, 'sourceIntent', at);
      return {
        file: requiredProjectPath(fact, 'file', at),
        line: requiredPositiveInteger(fact, 'line', at),
        ...(rawIntentName ? { rawIntentName } : {}),
        objectHasIntent: requiredBoolean(fact, 'objectHasIntent', at),
        arkPublishCandidate: requiredBoolean(fact, 'arkPublishCandidate', at),
        hasSource: requiredBoolean(fact, 'hasSource', at),
        ...(sourceIntent ? { sourceIntent } : {}),
      };
    }
  );
  const intentReferences = requiredArray(record, 'intentReferences', '$').map(
    (value, index): ResolvedIntentReferenceFact => {
      const at = `$.intentReferences[${index}]`;
      const fact = asRecord(value, at);
      assertOnlyKeys(fact, ['file', 'line', 'intent'], at);
      return {
        file: requiredProjectPath(fact, 'file', at),
        line: requiredPositiveInteger(fact, 'line', at),
        intent: requiredText(fact, 'intent', at),
      };
    }
  );
  const safetyUses = requiredArray(record, 'safetyUses', '$').map(
    (value, index): ResolvedSafetyFact => {
      const at = `$.safetyUses[${index}]`;
      const fact = asRecord(value, at);
      assertOnlyKeys(fact, ['file', 'line', 'kind', 'symbol'], at);
      const symbol = optionalText(fact, 'symbol', at);
      const kind = enumValue(
        fact,
        'kind',
        [
          'ts-suppression',
          'any-cast',
          'dynamic-import',
          'dynamic-require',
          'in-memory-store',
        ] as const,
        at
      );
      if (kind === 'in-memory-store' && !symbol) {
        throw new Error(`${at}.symbol is required for in-memory-store facts.`);
      }
      if (kind !== 'in-memory-store' && symbol) {
        throw new Error(`${at}.symbol is only allowed for in-memory-store facts.`);
      }
      return {
        file: requiredProjectPath(fact, 'file', at),
        line: requiredPositiveInteger(fact, 'line', at),
        kind,
        ...(symbol ? { symbol } : {}),
      };
    }
  );
  assertUnique(files, (file) => file.path, '$.files');

  const filePaths = new Set(files.map((file) => file.path));
  for (const file of files) {
    if (file.parseStatus === 'parsed' && file.parseDiagnosticCount !== 0) {
      throw new Error(
        `$.files[${file.path}].parseDiagnosticCount must be 0 when parseStatus is parsed.`
      );
    }
    if (file.parseStatus === 'invalid' && file.parseDiagnosticCount === 0) {
      throw new Error(
        `$.files[${file.path}].parseDiagnosticCount must be positive when parseStatus is invalid.`
      );
    }
  }
  if (completeness === 'complete' && files.some((file) => file.parseStatus === 'invalid')) {
    throw new Error('$.completeness cannot be complete when a candidate file failed to parse.');
  }
  for (const dependency of dependencies) {
    if (!filePaths.has(dependency.from)) {
      throw new Error(`$.dependencies references missing source file ${dependency.from}.`);
    }
  }
  for (const [at, facts] of [
    ['$.capabilityUses', capabilityUses],
    ['$.ambientUses', ambientUses],
    ['$.publishCalls', publishCalls],
    ['$.intentReferences', intentReferences],
    ['$.safetyUses', safetyUses],
  ] as const) {
    for (const fact of facts) {
      if (!filePaths.has(fact.file)) {
        throw new Error(`${at} references missing file ${fact.file}.`);
      }
    }
  }
  const projectPackageName = optionalText(record, 'projectPackageName', '$');
  const classShapesRaw = record.classShapes === undefined ? [] : requiredArray(record, 'classShapes', '$');
  const classShapes: ResolvedClassShapeFact[] = classShapesRaw.map((value, index) => {
    const at = `$.classShapes[${index}]`;
    const entry = asRecord(value, at);
    assertOnlyKeys(
      entry,
      [
        'file',
        'className',
        'exported',
        'hasPublicMutableFields',
        'hasPublicSetters',
        'hasPublicConstructor',
        'hasStaticFactory',
        'mutatingMethods',
        'dataOnly',
      ],
      at
    );
    const mutatingMethods = requiredArray(entry, 'mutatingMethods', at).map((method, methodIndex) => {
      const methodAt = `${at}.mutatingMethods[${methodIndex}]`;
      const methodRecord = asRecord(method, methodAt);
      assertOnlyKeys(methodRecord, ['name', 'referencesGuardOrPublish'], methodAt);
      return {
        name: requiredText(methodRecord, 'name', methodAt),
        referencesGuardOrPublish: requiredBoolean(methodRecord, 'referencesGuardOrPublish', methodAt),
      };
    });
    return {
      file: requiredProjectPath(entry, 'file', at),
      className: requiredText(entry, 'className', at),
      exported: requiredBoolean(entry, 'exported', at),
      hasPublicMutableFields: requiredBoolean(entry, 'hasPublicMutableFields', at),
      hasPublicSetters: requiredBoolean(entry, 'hasPublicSetters', at),
      hasPublicConstructor: requiredBoolean(entry, 'hasPublicConstructor', at),
      hasStaticFactory: requiredBoolean(entry, 'hasStaticFactory', at),
      mutatingMethods,
      ...(entry.dataOnly === undefined ? {} : { dataOnly: requiredBoolean(entry, 'dataOnly', at) }),
    };
  });
  return {
    schemaVersion,
    completeness,
    completenessReasons,
    resolverIdentity: requiredText(record, 'resolverIdentity', '$'),
    compilerIdentity: requiredText(record, 'compilerIdentity', '$'),
    compilerOptionsHash: requiredText(record, 'compilerOptionsHash', '$'),
    tsconfigHash: requiredText(record, 'tsconfigHash', '$'),
    evidenceRequirementsHash: requiredText(record, 'evidenceRequirementsHash', '$'),
    ...(projectPackageName ? { projectPackageName } : {}),
    files,
    dependencies,
    capabilityUses,
    ambientUses,
    publishCalls,
    intentReferences,
    safetyUses,
    classShapes,
  };
}

export function loadResolvedCandidateFacts(input: unknown): ResolvedCandidateFacts {
  const record = asRecord(input, '$');
  const factsHash = requiredText(record, 'factsHash', '$');
  const candidateTreeHash = requiredText(record, 'candidateTreeHash', '$');
  const canonical = createCanonicalResolvedCandidateFacts(
    parseResolvedFactsInput(record, true)
  );
  if (canonical.factsHash !== factsHash) {
    throw new Error(`$.factsHash does not match the canonical payload (${canonical.factsHash}).`);
  }
  if (candidateTreeHash !== canonical.candidateTreeHash) {
    throw new Error(
      `$.candidateTreeHash does not match the canonical file tree (${canonical.candidateTreeHash}).`
    );
  }
  return canonical;
}

