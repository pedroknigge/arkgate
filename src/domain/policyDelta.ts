import { loweredLayerCoverage } from './capabilities';
import type { ArkConfig, ArkConfigLayer, ArkConfigRule } from './configContract';

export const POLICY_DELTA_SCHEMA_VERSION = '1.0' as const;

export type PolicyDeltaClassification =
  | 'strengthening'
  | 'neutral'
  | 'judgment-required'
  | 'weakening';

export type PolicyDeltaFinding = {
  id: string;
  path: string;
  classification: Exclude<PolicyDeltaClassification, 'neutral'>;
  message: string;
  nextAction?: string;
  before?: unknown;
  after?: unknown;
};

export type PolicyDelta = {
  schemaVersion: typeof POLICY_DELTA_SCHEMA_VERSION;
  classification: PolicyDeltaClassification;
  findings: PolicyDeltaFinding[];
};

export type PolicyDeltaAcknowledgement = {
  schemaVersion: typeof POLICY_DELTA_SCHEMA_VERSION;
  basePolicyHash: string;
  candidatePolicyHash: string;
  findingIds: readonly string[];
  reason: string;
};

type FindingInput = Omit<PolicyDeltaFinding, 'id'> & { kind: string };

function addFinding(findings: PolicyDeltaFinding[], input: FindingInput): void {
  findings.push({
    id: `${input.classification}:${input.path}:${input.kind}`,
    path: input.path,
    classification: input.classification,
    message: input.message,
    ...(input.classification === 'weakening' || input.classification === 'judgment-required'
      ? {
          nextAction: `Restore the previous protection at ${input.path}, then run ArkGate again.`,
        }
      : {}),
    ...(input.before === undefined ? {} : { before: input.before }),
    ...(input.after === undefined ? {} : { after: input.after }),
  });
}

function sortedUnique(values: readonly string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort();
}

function compareStringSets(
  findings: PolicyDeltaFinding[],
  path: string,
  beforeValues: readonly string[] | undefined,
  afterValues: readonly string[] | undefined,
  options: {
    added: PolicyDeltaFinding['classification'];
    removed: PolicyDeltaFinding['classification'];
    addedMessage: string;
    removedMessage: string;
  }
): void {
  const before = sortedUnique(beforeValues);
  const after = sortedUnique(afterValues);
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const added = after.filter((value) => !beforeSet.has(value));
  const removed = before.filter((value) => !afterSet.has(value));
  if (added.length === 0 && removed.length === 0) return;

  if (added.length > 0) {
    addFinding(findings, {
      kind: 'added',
      path,
      classification: options.added,
      message: options.addedMessage,
      before,
      after,
    });
  }

  if (removed.length > 0) {
    addFinding(findings, {
      kind: 'removed',
      path,
      classification: options.removed,
      message: options.removedMessage,
      before,
      after,
    });
  }
}

function compareBoolean(
  findings: PolicyDeltaFinding[],
  path: string,
  before: boolean,
  after: boolean,
  whenEnabled: 'strengthening' | 'weakening',
  enabledMessage: string,
  disabledMessage: string
): void {
  if (before === after) return;
  const classification = after
    ? whenEnabled
    : whenEnabled === 'strengthening'
      ? 'weakening'
      : 'strengthening';
  addFinding(findings, {
    kind: after ? 'enabled' : 'disabled',
    path,
    classification,
    message: after ? enabledMessage : disabledMessage,
    before,
    after,
  });
}

function keyed<T>(
  values: readonly T[],
  keyOf: (value: T) => string
): { values: Map<string, T>; duplicates: string[] } {
  const result = new Map<string, T>();
  const duplicates = new Set<string>();
  for (const value of values) {
    const key = keyOf(value);
    if (result.has(key)) duplicates.add(key);
    else result.set(key, value);
  }
  return { values: result, duplicates: [...duplicates].sort() };
}

function compareLayers(
  findings: PolicyDeltaFinding[],
  beforeLayers: readonly ArkConfigLayer[],
  afterLayers: readonly ArkConfigLayer[]
): void {
  const before = keyed(beforeLayers, (layer) => layer.name);
  const after = keyed(afterLayers, (layer) => layer.name);
  if (before.duplicates.length > 0 || after.duplicates.length > 0) {
    addFinding(findings, {
      kind: 'duplicate-layer',
      path: '$.layers',
      classification: 'judgment-required',
      message: 'Duplicate layer names make policy ownership ambiguous.',
      before: before.duplicates,
      after: after.duplicates,
    });
  }

  for (const name of [...new Set([...before.values.keys(), ...after.values.keys()])].sort()) {
    const previous = before.values.get(name);
    const candidate = after.values.get(name);
    const path = `$.layers[${name}]`;
    if (!previous && candidate) {
      addFinding(findings, {
        kind: 'layer-added',
        path,
        classification: 'judgment-required',
        message: 'A layer was added; verify overlap, ownership, and rule coverage.',
        after: candidate,
      });
      continue;
    }
    if (previous && !candidate) {
      addFinding(findings, {
        kind: 'layer-removed',
        path,
        classification: 'weakening',
        message: 'Removing a layer can leave its source paths ungoverned.',
        before: previous,
      });
      continue;
    }
    if (!previous || !candidate) continue;

    compareStringSets(findings, `${path}.patterns`, previous.patterns, candidate.patterns, {
      added: 'strengthening',
      removed: 'weakening',
      addedMessage: 'Additional paths are governed by this layer.',
      removedMessage: 'Paths were removed from this layer and may become ungoverned.',
    });
    compareStringSets(findings, `${path}.exclude`, previous.exclude, candidate.exclude, {
      added: 'weakening',
      removed: 'strengthening',
      addedMessage: 'Additional paths are excluded from this layer.',
      removedMessage: 'Fewer paths are excluded from this layer.',
    });
    // ADR 0009 D6: classify ambient/capability protection on the LOWERED semantic
    // space, never key-by-key — migrating forbiddenGlobals to an equivalent (or
    // stronger) capability wall is neutral. Unlowerable custom globals keep the
    // raw key comparison so no protection silently escapes classification.
    const previousCoverage = loweredLayerCoverage(previous);
    const candidateCoverage = loweredLayerCoverage(candidate);
    compareStringSets(
      findings,
      `${path}.forbiddenGlobals`,
      previousCoverage.rawGlobals,
      candidateCoverage.rawGlobals,
      {
        added: 'strengthening',
        removed: 'weakening',
        addedMessage: 'Additional forbidden globals are enforced in this layer.',
        removedMessage: 'A forbidden-global protection was removed from this layer.',
      }
    );
    compareStringSets(
      findings,
      `${path}.capabilities`,
      previousCoverage.capabilities,
      candidateCoverage.capabilities,
      {
        added: 'strengthening',
        removed: 'weakening',
        addedMessage: 'Additional effect capabilities are denied in this layer (lowered space).',
        removedMessage:
          'An effect-capability protection was lost from this layer (lowered space).',
      }
    );

    if (
      sortedUnique(previous.intentPrefixes).join('\0') !==
      sortedUnique(candidate.intentPrefixes).join('\0')
    ) {
      addFinding(findings, {
        kind: 'intent-prefixes-changed',
        path: `${path}.intentPrefixes`,
        classification: 'judgment-required',
        message: 'Intent ownership changed and must be reviewed against publishers and consumers.',
        before: sortedUnique(previous.intentPrefixes),
        after: sortedUnique(candidate.intentPrefixes),
      });
    }
    compareBoolean(
      findings,
      `${path}.mayImportInfrastructure`,
      previous.mayImportInfrastructure === true,
      candidate.mayImportInfrastructure === true,
      'weakening',
      'The layer may now import infrastructure directly.',
      'Direct infrastructure imports are no longer allowed for this layer.'
    );
    compareBoolean(
      findings,
      `${path}.optional`,
      previous.optional === true,
      candidate.optional === true,
      'weakening',
      'The layer is now optional and can be absent without a strict warning.',
      'The layer is now required when its contract is active.'
    );
  }
}

function compareRules(
  findings: PolicyDeltaFinding[],
  beforeRules: readonly ArkConfigRule[],
  afterRules: readonly ArkConfigRule[]
): void {
  const keyOf = (rule: ArkConfigRule) => `${rule.from}->${rule.to}`;
  const before = keyed(beforeRules, keyOf);
  const after = keyed(afterRules, keyOf);
  if (before.duplicates.length > 0 || after.duplicates.length > 0) {
    addFinding(findings, {
      kind: 'duplicate-rule',
      path: '$.rules',
      classification: 'judgment-required',
      message: 'Duplicate rule edges make the effective verdict order-dependent.',
      before: before.duplicates,
      after: after.duplicates,
    });
  }

  for (const key of [...new Set([...before.values.keys(), ...after.values.keys()])].sort()) {
    const previous = before.values.get(key);
    const candidate = after.values.get(key);
    const path = `$.rules[${key}]`;
    if (!previous && candidate) {
      if (candidate.allowed === false) {
        addFinding(findings, {
          kind: 'deny-added',
          path,
          classification: 'strengthening',
          message: 'A denied dependency edge was added.',
          after: candidate,
        });
      }
      continue;
    }
    if (previous && !candidate) {
      if (previous.allowed === false) {
        addFinding(findings, {
          kind: 'deny-removed',
          path,
          classification: 'weakening',
          message: 'A denied dependency edge was removed.',
          before: previous,
        });
      }
      continue;
    }
    if (!previous || !candidate) continue;

    if (previous.allowed !== candidate.allowed) {
      addFinding(findings, {
        kind: candidate.allowed ? 'deny-disabled' : 'deny-enabled',
        path: `${path}.allowed`,
        classification: candidate.allowed ? 'weakening' : 'strengthening',
        message: candidate.allowed
          ? 'A previously denied dependency edge is now allowed.'
          : 'A dependency edge is now denied.',
        before: previous.allowed,
        after: candidate.allowed,
      });
    }

    const previousPeer = previous.peerIsolation === true;
    const candidatePeer = candidate.peerIsolation === true;
    if (previousPeer !== candidatePeer) {
      const sameLayer = previous.from === previous.to && candidate.from === candidate.to;
      addFinding(findings, {
        kind: candidatePeer ? 'peer-isolation-enabled' : 'peer-isolation-disabled',
        path: `${path}.peerIsolation`,
        classification: sameLayer
          ? candidatePeer
            ? 'strengthening'
            : 'weakening'
          : 'judgment-required',
        message: sameLayer
          ? candidatePeer
            ? 'Cross-slice dependencies inside this layer are now denied.'
            : 'Cross-slice dependencies inside this layer are no longer denied.'
          : 'Changing peer isolation on a cross-layer edge changes the denial scope.',
        before: previousPeer,
        after: candidatePeer,
      });
    }

    if (
      sortedUnique(previous.sliceFolders).join('\0') !==
      sortedUnique(candidate.sliceFolders).join('\0')
    ) {
      addFinding(findings, {
        kind: 'slice-folders-changed',
        path: `${path}.sliceFolders`,
        classification: 'judgment-required',
        message: 'Slice ownership folders changed and can reclassify existing dependencies.',
        before: sortedUnique(previous.sliceFolders),
        after: sortedUnique(candidate.sliceFolders),
      });
    }
  }
}

function compareSafety(findings: PolicyDeltaFinding[], before: ArkConfig, after: ArkConfig): void {
  const beforeSafety = before.safety ?? {};
  const afterSafety = after.safety ?? {};
  for (const key of ['maxTsSuppressions', 'maxAnyCasts'] as const) {
    const previous = beforeSafety[key] ?? 0;
    const candidate = afterSafety[key] ?? 0;
    if (previous === candidate) continue;
    addFinding(findings, {
      kind: candidate > previous ? 'threshold-raised' : 'threshold-lowered',
      path: `$.safety.${key}`,
      classification: candidate > previous ? 'weakening' : 'strengthening',
      message:
        candidate > previous
          ? 'The safety threshold allows more violations.'
          : 'The safety threshold allows fewer violations.',
      before: previous,
      after: candidate,
    });
  }
  for (const key of ['allowInMemory', 'allowDisabledPeerIsolation'] as const) {
    compareBoolean(
      findings,
      `$.safety.${key}`,
      beforeSafety[key] === true,
      afterSafety[key] === true,
      'weakening',
      'A safety exception was enabled.',
      'A safety exception was disabled.'
    );
  }
}

function overallClassification(findings: readonly PolicyDeltaFinding[]): PolicyDeltaClassification {
  if (findings.some((finding) => finding.classification === 'weakening')) return 'weakening';
  if (findings.some((finding) => finding.classification === 'judgment-required')) {
    return 'judgment-required';
  }
  if (findings.some((finding) => finding.classification === 'strengthening')) {
    return 'strengthening';
  }
  return 'neutral';
}

export function classifyArkPolicyDelta(base: ArkConfig, candidate: ArkConfig): PolicyDelta {
  const findings: PolicyDeltaFinding[] = [];
  compareStringSets(findings, '$.include', base.include, candidate.include, {
    added: 'strengthening',
    removed: 'weakening',
    addedMessage: 'Additional project roots are governed.',
    removedMessage: 'Project roots were removed from governance.',
  });
  compareStringSets(findings, '$.exclude', base.exclude, candidate.exclude, {
    added: 'weakening',
    removed: 'strengthening',
    addedMessage: 'Additional project paths are excluded from governance.',
    removedMessage: 'Fewer project paths are excluded from governance.',
  });
  compareStringSets(
    findings,
    '$.dynamicImportAllowlist',
    base.dynamicImportAllowlist,
    candidate.dynamicImportAllowlist,
    {
      added: 'weakening',
      removed: 'strengthening',
      addedMessage: 'Additional files may use non-literal dynamic imports.',
      removedMessage: 'Fewer files may use non-literal dynamic imports.',
    }
  );

  compareBoolean(
    findings,
    '$.excludeGenerated',
    base.excludeGenerated !== false,
    candidate.excludeGenerated !== false,
    'weakening',
    'Generated source is now excluded from governance.',
    'Generated source is now governed.'
  );

  const cycleRank = { off: 0, soft: 1, 'framework-soft': 1, strict: 2 } as const;
  const previousCycle = base.cyclePolicy ?? 'strict';
  const candidateCycle = candidate.cyclePolicy ?? 'strict';
  if (previousCycle !== candidateCycle) {
    const classification =
      cycleRank[candidateCycle] === cycleRank[previousCycle]
        ? 'judgment-required'
        : cycleRank[candidateCycle] > cycleRank[previousCycle]
          ? 'strengthening'
          : 'weakening';
    addFinding(findings, {
      kind: 'cycle-policy-changed',
      path: '$.cyclePolicy',
      classification,
      message: 'The cycle enforcement level changed.',
      before: previousCycle,
      after: candidateCycle,
    });
  }

  if ((base.frameworkOverlay ?? null) !== (candidate.frameworkOverlay ?? null)) {
    addFinding(findings, {
      kind: 'framework-overlay-changed',
      path: '$.frameworkOverlay',
      classification: 'judgment-required',
      message: 'The framework overlay changed and may alter effective layer matching.',
      before: base.frameworkOverlay ?? null,
      after: candidate.frameworkOverlay ?? null,
    });
  }

  compareLayers(findings, base.layers, candidate.layers);
  compareRules(findings, base.rules, candidate.rules);
  compareSafety(findings, base, candidate);
  findings.sort((left, right) => left.path.localeCompare(right.path) || left.id.localeCompare(right.id));

  return {
    schemaVersion: POLICY_DELTA_SCHEMA_VERSION,
    classification: overallClassification(findings),
    findings,
  };
}

export function policyDeltaAcknowledgementMatches(
  acknowledgement: PolicyDeltaAcknowledgement | undefined,
  expected: {
    basePolicyHash: string;
    candidatePolicyHash: string;
    findingIds: readonly string[];
  }
): boolean {
  if (
    !acknowledgement ||
    acknowledgement.schemaVersion !== POLICY_DELTA_SCHEMA_VERSION ||
    typeof acknowledgement.basePolicyHash !== 'string' ||
    typeof acknowledgement.candidatePolicyHash !== 'string' ||
    typeof acknowledgement.reason !== 'string' ||
    !Array.isArray(acknowledgement.findingIds) ||
    acknowledgement.findingIds.some((id) => typeof id !== 'string')
  ) {
    return false;
  }
  if (acknowledgement.reason.trim().length === 0) return false;
  if (
    acknowledgement.basePolicyHash !== expected.basePolicyHash ||
    acknowledgement.candidatePolicyHash !== expected.candidatePolicyHash
  ) {
    return false;
  }
  const actualIds = sortedUnique(acknowledgement.findingIds);
  const expectedIds = sortedUnique(expected.findingIds);
  return actualIds.length === expectedIds.length && actualIds.every((id, index) => id === expectedIds[index]);
}
