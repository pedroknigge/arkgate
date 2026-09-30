import { loweredLayerCoverage } from './capabilities';
import { sharedImportsSliceMode, sharedImportsSliceStopAt, siblingRatchetMode } from './layerMatch';
import type { ArkConfig, ArkConfigLayer, ArkConfigRule } from './configContract';
import type { EffectiveArkRules, EffectiveInvariantRule, EffectiveStructureRule } from './arkRulesTypes';
import {
  canPromoteInvariant,
  type InvariantCoverageEvidence,
} from './invariantCoverage';

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
  /**
   * Relative decision-note path under a conventional home (`docs/adr/`,
   * `docs/decisions/`, or the AP01 single-file homes). Tooling checks the file.
   * Hash matching does not require it.
   */
  adrPath?: string;
};

type FindingInput = Omit<PolicyDeltaFinding, 'id'> & { kind: string };

const ADR_PATH_NEXT_ACTION =
  'add a short note under docs/adr/ (or docs/decisions/) and put that file path in --policy-ack as adrPath.';

function addFinding(findings: PolicyDeltaFinding[], input: FindingInput): void {
  const defaultNext =
    input.classification === 'weakening' || input.classification === 'judgment-required'
      ? `Restore the previous protection at ${input.path}, or ${ADR_PATH_NEXT_ACTION}`
      : undefined;
  const nextAction = input.nextAction ?? defaultNext;
  findings.push({
    id: `${input.classification}:${input.path}:${input.kind}`,
    path: input.path,
    classification: input.classification,
    message: input.message,
    ...(nextAction ? { nextAction } : {}),
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
        nextAction:
          'Write a short note under docs/adr/ (or docs/decisions/) for this new layer and put that file path in --policy-ack as adrPath.',
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
      previousCoverage.atoms,
      candidateCoverage.atoms,
      {
        added: 'strengthening',
        removed: 'weakening',
        addedMessage:
          'Additional ambient/import protection is enforced in this layer (coverage atoms).',
        removedMessage:
          'An ambient/import protection was lost from this layer (coverage atoms).',
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
      } else {
        addFinding(findings, {
          kind: 'allow-added',
          path,
          classification: 'judgment-required',
          message: 'A new import edge was added; confirm this house should import that one.',
          nextAction:
            'Write a short note under docs/adr/ (or docs/decisions/) for this new import edge and put that file path in --policy-ack as adrPath.',
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

    const previousIdentity = previous.sliceIdentity ?? 'path';
    const candidateIdentity = candidate.sliceIdentity ?? 'path';
    if (previousIdentity !== candidateIdentity) {
      addFinding(findings, {
        kind: 'slice-identity-changed',
        path: `${path}.sliceIdentity`,
        classification: 'judgment-required',
        message:
          'Slice identity changed and can reclassify existing slice ids. Baselines and allowedCrossSlice use those ids.',
        before: previousIdentity,
        after: candidateIdentity,
      });
    }

    // sharedRoots / allowedCrossSlice are inert on a rule without peerIsolation;
    // a change there is not a policy change until the wall exists.
    if (!previousPeer && !candidatePeer) continue;

    compareDeclaredExceptions(
      findings,
      `${path}.sharedRoots`,
      'shared-roots',
      sortedUnique(previous.sharedRoots),
      sortedUnique(candidate.sharedRoots),
      'Roots declared shared are exempt from the peerIsolation unclassifiable denial.',
      'Roots are no longer declared shared and fall back to the peerIsolation denial.'
    );

    compareDeclaredExceptions(
      findings,
      `${path}.allowedCrossSlice`,
      'cross-slice-allowance',
      sortedUnique((previous.allowedCrossSlice ?? []).map(crossSliceKey)),
      sortedUnique((candidate.allowedCrossSlice ?? []).map(crossSliceKey)),
      'Directed cross-slice edges are now allowed by declaration.',
      'Directed cross-slice edges are no longer declared and deny again.'
    );

    // Normalize first: the object form carries the mode plus composition-root stops.
    const beforeMode = sharedImportsSliceMode(previous.sharedImportsSlice) ?? null;
    const afterMode = sharedImportsSliceMode(candidate.sharedImportsSlice) ?? null;
    if (beforeMode !== afterMode) {
      const strengthening = sharedImportsSliceRank(afterMode) > sharedImportsSliceRank(beforeMode);
      addFinding(findings, {
        kind: 'shared-imports-slice',
        path: `${path}.sharedImportsSlice`,
        classification: strengthening ? 'strengthening' : 'weakening',
        message: sharedImportsSliceMessage(beforeMode, afterMode),
        before: beforeMode,
        after: afterMode,
      });
    } else if (afterMode === 'deny-cross-parent') {
      compareDeclaredExceptions(
        findings,
        `${path}.sharedImportsSlice.stopAt`,
        'shared-walk-stop',
        stopAtKeys(previous.sharedImportsSlice),
        stopAtKeys(candidate.sharedImportsSlice),
        'Composition roots now stop the cross-parent walk. Paths through them are no longer reported.',
        'Composition roots no longer stop the cross-parent walk. Paths through them are reported again.'
      );
    }

    compareChildSlices(findings, path, previous, candidate);
  }
}

function childSliceFoldersKey(rule: ArkConfigRule): string {
  const child = rule.childSlices;
  if (!child) return '';
  return JSON.stringify([
    sortedUnique(child.sliceFolders ?? []),
    child.sliceIdentity ?? 'path',
    sortedUnique(child.commonFolders ?? []),
  ]);
}

type SiblingPolicy = {
  mode: 'deny' | 'advisory';
  enforce: string[];
  ratchet: 'auto' | 'always' | 'never';
};

function stopAtKeys(setting: unknown): string[] {
  return sortedUnique(
    sharedImportsSliceStopAt(setting).map((entry) =>
      trimTrailingSlashes(entry.trim().replace(/\\/g, '/')).toLowerCase()
    )
  );
}

/** Ratchet strength order for advisory siblings: never < auto < always. */
function siblingRatchetRank(mode: SiblingPolicy['ratchet']): number {
  return mode === 'always' ? 2 : mode === 'auto' ? 1 : 0;
}

function enforceKeys(entries: readonly string[] | undefined): string[] {
  return sortedUnique(
    (entries ?? []).map((entry) =>
      trimTrailingSlashes(entry.trim().replace(/\\/g, '/')).toLowerCase()
    )
  );
}

/**
 * Omitted and `"deny"` are deny-all. `"advisory"` is advisory-all.
 * Under `default: "deny"` the enforce list does not change verdicts, so it is empty here.
 */
function childSliceSiblingPolicy(rule: ArkConfigRule): SiblingPolicy | null {
  if (!rule.childSlices) return null;
  const siblings = rule.childSlices.siblings;
  if (siblings == null || siblings === 'deny') return { mode: 'deny', enforce: [], ratchet: 'auto' };
  if (siblings === 'advisory') return { mode: 'advisory', enforce: [], ratchet: 'auto' };
  if (siblings.default === 'deny') return { mode: 'deny', enforce: [], ratchet: 'auto' };
  return {
    mode: 'advisory',
    enforce: enforceKeys(siblings.enforce),
    ratchet: siblingRatchetMode(siblings),
  };
}

/**
 * Adding a denying child wall strengthens. Advisory siblings and
 * parentMayImportChild weaken. Folder edits need a human.
 */
function compareChildSlices(
  findings: PolicyDeltaFinding[],
  path: string,
  previous: ArkConfigRule,
  candidate: ArkConfigRule
): void {
  const before = childSliceSiblingPolicy(previous);
  const after = childSliceSiblingPolicy(candidate);
  if (before === null && after === null) return;
  if (before === null && after !== null) {
    addFinding(findings, {
      kind: 'child-slices-added',
      path: `${path}.childSlices`,
      classification: after.mode === 'advisory' ? 'judgment-required' : 'strengthening',
      message:
        after.mode === 'advisory'
          ? 'A child slice wall was added with advisory sibling crossings.'
          : 'A child slice wall was added. Sibling crossings inside a universe are now denied.',
      after: candidate.childSlices,
    });
    return;
  }
  if (before !== null && after === null) {
    addFinding(findings, {
      kind: 'child-slices-removed',
      path: `${path}.childSlices`,
      classification: 'weakening',
      message: 'The child slice wall was removed. Sibling crossings inside a universe are allowed again.',
      before: previous.childSlices,
    });
    return;
  }
  if (childSliceFoldersKey(previous) !== childSliceFoldersKey(candidate)) {
    addFinding(findings, {
      kind: 'child-slices-changed',
      path: `${path}.childSlices`,
      classification: 'judgment-required',
      message: 'Child slice folders changed and can reclassify edges inside a universe.',
      before: previous.childSlices,
      after: candidate.childSlices,
    });
    return;
  }
  if (before === null || after === null) return;
  if (before.mode !== after.mode) {
    const weakening = after.mode === 'advisory';
    addFinding(findings, {
      kind: 'child-slices-siblings',
      path: `${path}.childSlices.siblings`,
      classification: weakening ? 'weakening' : 'strengthening',
      message: weakening
        ? after.enforce.length > 0
          ? 'Sibling crossings outside the enforce list are now advisory.'
          : 'Sibling crossings inside a universe are now advisory.'
        : 'Sibling crossings inside a universe are now denied.',
      before: before.mode,
      after: after.mode,
    });
  } else if (before.mode === 'advisory') {
    compareSiblingEnforceList(
      findings,
      `${path}.childSlices.siblings.enforce`,
      before.enforce,
      after.enforce
    );
    if (before.ratchet !== after.ratchet) {
      const strengthening = siblingRatchetRank(after.ratchet) > siblingRatchetRank(before.ratchet);
      addFinding(findings, {
        kind: 'child-slices-siblings-ratchet',
        path: `${path}.childSlices.siblings.ratchet`,
        classification: strengthening ? 'strengthening' : 'weakening',
        message: strengthening
          ? 'New advisory sibling crossings past the baseline fail in more cases.'
          : after.ratchet === 'never'
            ? 'Advisory sibling crossings are measured only and never fail.'
            : 'New advisory sibling crossings past the baseline fail in fewer cases.',
        before: before.ratchet,
        after: after.ratchet,
      });
    }
  }
  const previousParent = previous.childSlices?.parentMayImportChild === true;
  const candidateParent = candidate.childSlices?.parentMayImportChild === true;
  if (previousParent !== candidateParent) {
    addFinding(findings, {
      kind: 'child-slices-parent-import',
      path: `${path}.childSlices.parentMayImportChild`,
      classification: candidateParent ? 'weakening' : 'strengthening',
      message: candidateParent
        ? 'Universe common may now import a child slice.'
        : 'Universe common may no longer import a child slice.',
      before: previousParent,
      after: candidateParent,
    });
  }
  compareChildCrossSliceAllowances(findings, path, previous, candidate);
  compareSliceAliases(findings, path, previous, candidate);
}

/** Entries added / removed between two ordered string lists; null when identical. */
function stringListDelta(
  previous: string[],
  candidate: string[]
): { added: string[]; removed: string[]; bothWays: boolean } | null {
  if (JSON.stringify(previous) === JSON.stringify(candidate)) return null;
  const added = candidate.filter((value) => !previous.includes(value));
  const removed = previous.filter((value) => !candidate.includes(value));
  return { added, removed, bothWays: added.length > 0 && removed.length > 0 };
}

function compareSiblingEnforceList(
  findings: PolicyDeltaFinding[],
  path: string,
  previous: string[],
  candidate: string[]
): void {
  const delta = stringListDelta(previous, candidate);
  if (!delta) return;
  const { added, bothWays } = delta;
  addFinding(findings, {
    kind: bothWays ? 'child-slices-siblings-enforce-changed' : 'child-slices-siblings-enforce',
    path,
    classification: bothWays ? 'judgment-required' : added.length > 0 ? 'strengthening' : 'weakening',
    message: bothWays
      ? 'Enforced sibling subtrees were added and removed in the same change.'
      : added.length > 0
        ? 'Sibling crossings from these subtrees are now errors.'
        : 'Sibling crossings from these subtrees are advisory again.',
    before: previous,
    after: candidate,
  });
}

function crossSliceKey(edge: { from: string; to: string }): string {
  // JSON, not `from->to`: a slice id containing the separator would collide.
  return JSON.stringify([edge.from, edge.to]);
}

function childCrossSliceKeys(rule: ArkConfigRule): string[] {
  return sortedUnique((rule.childSlices?.allowedCrossSlice ?? []).map(crossSliceKey));
}

function allowanceSegments(raw: string): string[] {
  return trimTrailingSlashes(raw.trim().replace(/\\/g, '/')).toLowerCase().split('/').filter((part) => part.length > 0);
}

/** True when `wider` is the same pattern with at least one literal segment opened to `*`. */
function patternWidens(wider: string, narrower: string): boolean {
  const wide = allowanceSegments(wider);
  const narrow = allowanceSegments(narrower);
  if (wide.length === 0 || wide.length !== narrow.length) return false;
  let opened = false;
  for (let index = 0; index < wide.length; index += 1) {
    if (wide[index] === narrow[index]) continue;
    if (wide[index] === '*' && narrow[index] !== '*') {
      opened = true;
      continue;
    }
    return false;
  }
  return opened;
}

function allowanceWidens(addedKey: string, removedKey: string): boolean {
  const added = JSON.parse(addedKey) as [string, string];
  const removed = JSON.parse(removedKey) as [string, string];
  const fromSame = allowanceSegments(added[0]).join('/') === allowanceSegments(removed[0]).join('/');
  const toSame = allowanceSegments(added[1]).join('/') === allowanceSegments(removed[1]).join('/');
  const fromOpens = patternWidens(added[0], removed[0]);
  const toOpens = patternWidens(added[1], removed[1]);
  if (!(fromSame || fromOpens) || !(toSame || toOpens)) return false;
  return fromOpens || toOpens;
}

function aliasEntryKey(alias: { from: string; to: string }): string {
  return JSON.stringify([
    trimTrailingSlashes(alias.from.trim().replace(/\\/g, '/')).toLowerCase(),
    trimTrailingSlashes(alias.to.trim().replace(/\\/g, '/')).toLowerCase(),
  ]);
}

function sliceAliasKeys(rule: ArkConfigRule): string[] {
  return sortedUnique((rule.childSlices?.sliceAliases ?? []).map(aliasEntryKey));
}

/**
 * Adding an alias puts unclassified files under both walls (strengthening).
 * Removing one takes them back out (weakening). Both in one change, including
 * a retarget, needs a human. A child-folder edit already returned above.
 */
function compareSliceAliases(
  findings: PolicyDeltaFinding[],
  path: string,
  previous: ArkConfigRule,
  candidate: ArkConfigRule
): void {
  const before = sliceAliasKeys(previous);
  const after = sliceAliasKeys(candidate);
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const added = after.filter((value) => !before.includes(value));
  const removed = before.filter((value) => !after.includes(value));
  const bothWays = added.length > 0 && removed.length > 0;
  addFinding(findings, {
    kind: bothWays ? 'slice-aliases-changed' : added.length > 0 ? 'slice-aliases-added' : 'slice-aliases-removed',
    path: `${path}.childSlices.sliceAliases`,
    classification: bothWays ? 'judgment-required' : added.length > 0 ? 'strengthening' : 'weakening',
    message: bothWays
      ? 'Slice aliases were added and removed in the same change.'
      : added.length > 0
        ? 'Unclassified files are now under the slice walls.'
        : 'Aliased files leave the slice walls.',
    before,
    after,
  });
}

/**
 * Child-list allowances. A wildcard that only opens a literal entry is
 * weakening. Unrelated additions and removals together need a human.
 * The universe list does not use this widening rule.
 */
function compareChildCrossSliceAllowances(
  findings: PolicyDeltaFinding[],
  path: string,
  previous: ArkConfigRule,
  candidate: ArkConfigRule
): void {
  const before = childCrossSliceKeys(previous);
  const after = childCrossSliceKeys(candidate);
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const added = after.filter((value) => !before.includes(value));
  const removed = before.filter((value) => !after.includes(value));
  if (added.length > 0 && removed.length > 0) {
    const uncovered = removed.filter((oldEdge) => !added.some((next) => allowanceWidens(next, oldEdge)));
    if (uncovered.length === 0) {
      addFinding(findings, {
        kind: 'child-slices-cross-slice-allowance-added',
        path: `${path}.childSlices.allowedCrossSlice`,
        classification: 'weakening',
        message: 'A wildcard widened a declared sibling allowance.',
        before,
        after,
      });
      return;
    }
  }
  compareDeclaredExceptions(
    findings,
    `${path}.childSlices.allowedCrossSlice`,
    'child-slices-cross-slice-allowance',
    before,
    after,
    'Sibling crossings inside a universe are now allowed by declaration.',
    'Declared sibling crossings inside a universe deny again.'
  );
}

/**
 * A declared peerIsolation exception (sharedRoots / allowedCrossSlice): entries
 * added weaken the wall, entries only removed strengthen it, both at once needs
 * a human.
 */
function compareDeclaredExceptions(
  findings: PolicyDeltaFinding[],
  path: string,
  kindPrefix: string,
  previous: string[],
  candidate: string[],
  addedMessage: string,
  removedMessage: string
): void {
  const delta = stringListDelta(previous, candidate);
  if (!delta) return;
  const { added, bothWays } = delta;
  addFinding(findings, {
    kind: bothWays
      ? `${kindPrefix}-changed`
      : added.length > 0
        ? `${kindPrefix}-added`
        : `${kindPrefix}-removed`,
    path,
    classification: bothWays ? 'judgment-required' : added.length > 0 ? 'weakening' : 'strengthening',
    message: bothWays
      ? `${addedMessage} Entries were added and removed in the same change.`
      : added.length > 0
        ? addedMessage
        : removedMessage,
    before: previous,
    after: candidate,
  });
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

function arkRunMode(extra: NonNullable<ArkConfig['arkRun']>): 'advisory' | 'enforced' {
  return extra.mode === 'enforced' ? 'enforced' : 'advisory';
}

function arkOrderMode(extra: NonNullable<ArkConfig['arkOrder']>): 'advisory' | 'enforced' {
  return extra.mode === 'enforced' ? 'enforced' : 'advisory';
}

/** ADR 0027 D3 — demotion or deletion of the extra is weakening. */
function compareArkOrder(
  findings: PolicyDeltaFinding[],
  base: ArkConfig,
  candidate: ArkConfig
): void {
  const before = base.arkOrder;
  const after = candidate.arkOrder;
  const path = '$.arkOrder';
  if (!before && !after) return;
  if (!before && after) {
    addFinding(findings, {
      kind: 'arkorder-added',
      path,
      classification: 'strengthening',
      message: `ArkOrder extra was added (${arkOrderMode(after)}).`,
      after,
    });
    return;
  }
  if (before && !after) {
    addFinding(findings, {
      kind: 'arkorder-removed',
      path,
      classification: 'weakening',
      message: 'ArkOrder extra was removed.',
      before,
    });
    return;
  }
  if (!before || !after) return;

  const previousMode = arkOrderMode(before);
  const nextMode = arkOrderMode(after);
  if (previousMode !== nextMode) {
    const promotion = previousMode === 'advisory' && nextMode === 'enforced';
    addFinding(findings, {
      kind: promotion ? 'arkorder-promoted' : 'arkorder-demoted',
      path: `${path}.mode`,
      classification: promotion ? 'strengthening' : 'weakening',
      message: promotion
        ? 'ArkOrder extra was promoted to enforced.'
        : 'ArkOrder extra was demoted to advisory.',
      before: previousMode,
      after: nextMode,
    });
  }

  compareStringSets(findings, `${path}.planeRoots`, before.planeRoots, after.planeRoots, {
    added: 'strengthening',
    removed: 'weakening',
    addedMessage: 'Additional ArkOrder plane roots are governed.',
    removedMessage: 'ArkOrder plane roots were removed and may skip the plane.',
  });
  compareStringSets(
    findings,
    `${path}.managedLayers`,
    before.managedLayers,
    after.managedLayers,
    {
      added: 'strengthening',
      removed: 'weakening',
      addedMessage: 'Additional layers are managed by ArkOrder.',
      removedMessage: 'Layers were removed from ArkOrder management.',
    }
  );
}

/** ADR 0020 D3 — demotion or deletion of the extra is weakening. */
function compareArkRun(
  findings: PolicyDeltaFinding[],
  base: ArkConfig,
  candidate: ArkConfig
): void {
  const before = base.arkRun;
  const after = candidate.arkRun;
  const path = '$.arkRun';
  if (!before && !after) return;
  if (!before && after) {
    addFinding(findings, {
      kind: 'arkrun-added',
      path,
      classification: 'strengthening',
      message: `ArkRun extra was added (${arkRunMode(after)}).`,
      after,
    });
    return;
  }
  if (before && !after) {
    addFinding(findings, {
      kind: 'arkrun-removed',
      path,
      classification: 'weakening',
      message: 'ArkRun extra was removed.',
      before,
    });
    return;
  }
  if (!before || !after) return;

  const previousMode = arkRunMode(before);
  const nextMode = arkRunMode(after);
  if (previousMode !== nextMode) {
    const promotion = previousMode === 'advisory' && nextMode === 'enforced';
    addFinding(findings, {
      kind: promotion ? 'arkrun-promoted' : 'arkrun-demoted',
      path: `${path}.mode`,
      classification: promotion ? 'strengthening' : 'weakening',
      message: promotion
        ? 'ArkRun extra was promoted to enforced.'
        : 'ArkRun extra was demoted to advisory.',
      before: previousMode,
      after: nextMode,
    });
  }

  compareStringSets(
    findings,
    `${path}.compositionRoots`,
    before.compositionRoots,
    after.compositionRoots,
    {
      added: 'strengthening',
      removed: 'weakening',
      addedMessage: 'Additional ArkRun composition roots are governed.',
      removedMessage: 'ArkRun composition roots were removed and may skip the kernel.',
    }
  );
  compareStringSets(
    findings,
    `${path}.managedLayers`,
    before.managedLayers,
    after.managedLayers,
    {
      added: 'strengthening',
      removed: 'weakening',
      addedMessage: 'Additional layers are managed by ArkRun.',
      removedMessage: 'Layers were removed from ArkRun management.',
    }
  );
  compareBoolean(
    findings,
    `${path}.requireDeclarations`,
    before.requireDeclarations !== false,
    after.requireDeclarations !== false,
    'strengthening',
    'ArkRun now requires interaction declarations.',
    'ArkRun no longer requires interaction declarations.'
  );
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

function ruleKey(layer: string, id: string): string {
  return `${layer}::${id}`;
}

function indexEffectiveRules(arkRules: EffectiveArkRules | undefined): {
  structure: Map<string, EffectiveStructureRule>;
  invariants: Map<string, EffectiveInvariantRule>;
} {
  const structure = new Map<string, EffectiveStructureRule>();
  const invariants = new Map<string, EffectiveInvariantRule>();
  if (!arkRules) return { structure, invariants };
  for (const rule of arkRules.structure) {
    structure.set(ruleKey(rule.provenance.layer, rule.id), rule);
  }
  for (const rule of arkRules.invariants) {
    invariants.set(ruleKey(rule.provenance.layer, rule.id), rule);
  }
  return { structure, invariants };
}

function arkRulesRefPaths(value: unknown): string[] {
  if (typeof value === 'string') return value.length > 0 ? [value] : [];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function arkRulesLayerSources(arkRules: EffectiveArkRules | undefined, layer: string): string[] {
  if (!arkRules) return [];
  const paths = new Set<string>();
  for (const rule of [...arkRules.structure, ...arkRules.invariants]) {
    if (rule.provenance?.layer === layer && rule.provenance.sourceFile) paths.add(rule.provenance.sourceFile);
  }
  return [...paths];
}

/** Config paths plus discovered source files for one layer. */
function arkRulesCatalogPaths(
  configValue: unknown,
  arkRules: EffectiveArkRules | undefined,
  layer: string
): string[] {
  return [...new Set([...arkRulesRefPaths(configValue), ...arkRulesLayerSources(arkRules, layer)])].sort();
}

/**
 * ADR 0012 / AR02 — classify ArkRules reference map and effective rule transitions.
 * add/promote → strengthening; demote/delete → weakening; path/sensor rewrite → judgment.
 * A discovered slice file is one arkrules-ref-added or arkrules-ref-removed, keyed by its path.
 */
function compareArkRules(
  findings: PolicyDeltaFinding[],
  base: ArkConfig,
  candidate: ArkConfig,
  baseArkRules?: EffectiveArkRules,
  candidateArkRules?: EffectiveArkRules,
  candidateInvariantCoverage?: readonly InvariantCoverageEvidence[]
): void {
  const coverageById = new Map(
    (candidateInvariantCoverage ?? []).map((entry) => [entry.invariantId, entry] as const)
  );
  const baseRefs = base.arkRules ?? {};
  const candidateRefs = candidate.arkRules ?? {};
  const layers = new Set<string>([...Object.keys(baseRefs), ...Object.keys(candidateRefs)]);
  for (const rule of [
    ...(baseArkRules?.structure ?? []),
    ...(baseArkRules?.invariants ?? []),
    ...(candidateArkRules?.structure ?? []),
    ...(candidateArkRules?.invariants ?? []),
  ]) {
    if (rule.provenance?.layer) layers.add(rule.provenance.layer);
  }
  for (const layer of [...layers].sort()) {
    const before = baseRefs[layer];
    const after = candidateRefs[layer];
    const path = `$.arkRules[${layer}]`;
    const beforePaths = arkRulesCatalogPaths(before, baseArkRules, layer);
    const afterPaths = arkRulesCatalogPaths(after, candidateArkRules, layer);
    if (beforePaths.join('\0') === afterPaths.join('\0')) continue;
    if (
      typeof before === 'string' &&
      typeof after === 'string' &&
      before !== after &&
      beforePaths.length === 1 &&
      afterPaths.length === 1 &&
      beforePaths[0] === before &&
      afterPaths[0] === after
    ) {
      addFinding(findings, {
        kind: 'arkrules-ref-path-changed',
        path,
        classification: 'judgment-required',
        message: `ArkRules file path for layer ${layer} changed; verify the effective rules still match intent.`,
        before,
        after,
      });
      continue;
    }
    const beforeSet = new Set(beforePaths);
    const afterSet = new Set(afterPaths);
    for (const added of afterPaths) {
      if (beforeSet.has(added)) continue;
      addFinding(findings, {
        kind: 'arkrules-ref-added',
        path: added,
        classification: 'strengthening',
        message: `ArkRules reference for layer ${layer} was added (${added}).`,
        after: added,
      });
    }
    for (const removed of beforePaths) {
      if (afterSet.has(removed)) continue;
      addFinding(findings, {
        kind: 'arkrules-ref-removed',
        path: removed,
        classification: 'weakening',
        message: `ArkRules reference for layer ${layer} was removed (${removed}).`,
        before: removed,
      });
    }
  }

  const beforeRules = indexEffectiveRules(baseArkRules);
  const afterRules = indexEffectiveRules(candidateArkRules);

  for (const key of [...new Set([...beforeRules.structure.keys(), ...afterRules.structure.keys()])].sort()) {
    const previous = beforeRules.structure.get(key);
    const next = afterRules.structure.get(key);
    const path = `$.arkRules.structure[${key}]`;
    if (!previous && next) {
      addFinding(findings, {
        kind: 'arkrule-structure-added',
        path,
        classification: 'strengthening',
        message: `Structure ArkRule ${next.id} was added (${next.mode}).`,
        after: next,
      });
      continue;
    }
    if (previous && !next) {
      addFinding(findings, {
        kind: 'arkrule-structure-removed',
        path,
        classification: 'weakening',
        message: `Structure ArkRule ${previous.id} was removed.`,
        before: previous,
      });
      continue;
    }
    if (!previous || !next) continue;
    if (previous.mode !== next.mode) {
      const promotion = previous.mode === 'advisory' && next.mode === 'enforced';
      addFinding(findings, {
        kind: promotion ? 'arkrule-promoted' : 'arkrule-demoted',
        path: `${path}.mode`,
        classification: promotion ? 'strengthening' : 'weakening',
        message: promotion
          ? `Structure ArkRule ${next.id} was promoted to enforced.`
          : `Structure ArkRule ${next.id} was demoted to advisory.`,
        before: previous.mode,
        after: next.mode,
      });
    }
    if (previous.sensor !== next.sensor) {
      addFinding(findings, {
        kind: 'arkrule-sensor-changed',
        path: `${path}.sensor`,
        classification: 'judgment-required',
        message: `Structure ArkRule ${next.id} changed sensor identity.`,
        before: previous.sensor,
        after: next.sensor,
      });
    }
  }

  for (const key of [
    ...new Set([...beforeRules.invariants.keys(), ...afterRules.invariants.keys()]),
  ].sort()) {
    const previous = beforeRules.invariants.get(key);
    const next = afterRules.invariants.get(key);
    const path = `$.arkRules.invariants[${key}]`;
    if (!previous && next) {
      addFinding(findings, {
        kind: 'arkrule-invariant-added',
        path,
        classification: 'strengthening',
        message: `Invariant ${next.id} was added (${next.mode}).`,
        after: next,
      });
      continue;
    }
    if (previous && !next) {
      addFinding(findings, {
        kind: 'arkrule-invariant-removed',
        path,
        classification: 'weakening',
        message: `Invariant ${previous.id} was removed.`,
        before: previous,
      });
      continue;
    }
    if (!previous || !next) continue;
    if (previous.mode !== next.mode) {
      const promotion = previous.mode === 'advisory' && next.mode === 'enforced';
      if (promotion) {
        // AR11: refuse auto-allow when uncovered / partial. Without coverage evidence,
        // promotion is judgment-required (cannot silently strengthen).
        const coverage = coverageById?.get(next.id);
        const gate = canPromoteInvariant(coverage);
        if (gate.ok) {
          addFinding(findings, {
            kind: 'arkrule-invariant-promoted',
            path: `${path}.mode`,
            classification: 'strengthening',
            message: `Invariant ${next.id} was promoted to enforced (coverage evidence present).`,
            before: previous.mode,
            after: next.mode,
          });
        } else {
          addFinding(findings, {
            kind: 'arkrule-invariant-promote-refused',
            path: `${path}.mode`,
            classification: 'judgment-required',
            message: `Invariant ${next.id} cannot be promoted to enforced: ${gate.reason}`,
            before: previous.mode,
            after: next.mode,
          });
        }
      } else {
        addFinding(findings, {
          kind: 'arkrule-invariant-demoted',
          path: `${path}.mode`,
          classification: 'weakening',
          message: `Invariant ${next.id} was demoted to advisory.`,
          before: previous.mode,
          after: next.mode,
        });
      }
    }
  }
}

export type ClassifyArkPolicyDeltaOptions = {
  baseArkRules?: EffectiveArkRules;
  candidateArkRules?: EffectiveArkRules;
  /**
   * AR11 — coverage evidence for candidate invariants. Required to auto-allow
   * advisory→enforced promotion; without it (or when uncovered), promotion is
   * judgment-required / refused.
   */
  candidateInvariantCoverage?: readonly InvariantCoverageEvidence[];
};

export function classifyArkPolicyDelta(
  base: ArkConfig,
  candidate: ArkConfig,
  options?: ClassifyArkPolicyDeltaOptions
): PolicyDelta {
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
  compareArkRules(
    findings,
    base,
    candidate,
    options?.baseArkRules,
    options?.candidateArkRules,
    options?.candidateInvariantCoverage
  );
  compareArkRun(findings, base, candidate);
  compareArkOrder(findings, base, candidate);
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

/**
 * Trim trailing slashes without a regex.
 *
 * `/\/+$/` is a polynomial ReDoS on a value that comes from the repo's own
 * contract but is still library input. A scan is linear and says the same thing.
 */
function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
}

/** Absent < deny-cross-parent < deny. Up the rank strengthens. Down weakens. */
function sharedImportsSliceRank(value: string | null): number {
  if (value === 'deny') return 2;
  if (value === 'deny-cross-parent') return 1;
  return 0;
}

function sharedImportsSliceMessage(before: string | null, after: string | null): string {
  if (after === 'deny') return 'A shared root may no longer import a slice.';
  if (before === 'deny' && after === 'deny-cross-parent') {
    return 'A shared root may import a slice again, except when that hop carries another universe.';
  }
  if (before === 'deny') return 'A shared root may import a slice again.';
  if (after === 'deny-cross-parent') {
    return 'A slice may no longer reach another universe through a shared root. ark-check and CI report that path. The write hook and ESLint see one edge at a time and do not block it.';
  }
  return 'A slice may reach another universe through a shared root again.';
}
