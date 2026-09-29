/**
 * Canonical graph and layer-policy evaluation (U02 pilot 2).
 *
 * Shared by library, CLI, and MCP adapters through the src/kernel/analysis.ts
 * facade; consumer import paths never change.
 */
import {
  composeSliceDenialMessage,
  crossSliceEdgeAllowed,
  findDeniedEdgeDecision,
  findSharedImportsSliceBridge,
  pathMatchesSharedWalkStop,
  pathUnderSharedRoot,
  peerSliceFolders,
  sharedImportsSliceMode,
  sharedImportsSliceStopAt,
  sliceFindingExtras,
  resolveGovernedSlice,
  resolveGovernedSlicePair,
  universePairLabel,
  type EdgeRule,
} from '../domain/layerMatch';
import type {
  ArchitectureEngineEdge,
  ArchitectureEngineResult,
  ArchitectureEngineViolation,
  EvaluateArchitectureGraphInput,
} from './analysisTypes';

export function detectArchitectureCycles(
  graph: ReadonlyMap<string, ReadonlySet<string>>
): ArchitectureEngineViolation[] {
  let index = 0;
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];

  const connect = (file: string): void => {
    indices.set(file, index);
    low.set(file, index);
    index += 1;
    stack.push(file);
    onStack.add(file);

    for (const target of [...(graph.get(file) ?? [])].sort()) {
      if (!graph.has(target)) continue;
      if (!indices.has(target)) {
        connect(target);
        low.set(file, Math.min(low.get(file) ?? 0, low.get(target) ?? 0));
      } else if (onStack.has(target)) {
        low.set(file, Math.min(low.get(file) ?? 0, indices.get(target) ?? 0));
      }
    }

    if (low.get(file) !== indices.get(file)) return;
    const component: string[] = [];
    let member: string | undefined;
    do {
      member = stack.pop();
      if (member === undefined) break;
      onStack.delete(member);
      component.push(member);
    } while (member !== file);
    if (component.length > 1) components.push(component.sort());
  };

  for (const file of [...graph.keys()].sort()) {
    if (!indices.has(file)) connect(file);
  }

  return components
    .sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0))
    .map((members) => ({
      ruleId: 'CIRCULAR_DEPENDENCY',
      file: members[0],
      line: 1,
      target: members.join(' → '),
      message: `Circular dependency among ${members.length} files: ${members.join(' → ')} → ${members[0]}.`,
      cycleKind: 'value',
    }));
}

/** Canonical graph and layer-policy evaluator shared by library, CLI, and MCP adapters. */
export function evaluateArchitectureGraph(
  input: EvaluateArchitectureGraphInput
): ArchitectureEngineResult {
  const violations = input.contentViolations.map((violation) => ({ ...violation }));
  const warnings = (input.warnings ?? []).map((warning) => ({ ...warning }));
  const graph = new Map<string, Set<string>>(
    input.files.map((file) => [file, new Set<string>()])
  );

  for (const edge of input.edges) {
    if (edge.to && edge.to !== edge.from && !edge.typeOnly && graph.has(edge.from)) {
      graph.get(edge.from)?.add(edge.to);
    }
    if (!edge.to || !edge.fromLayer || !edge.toLayer) continue;
    const decision = findDeniedEdgeDecision(input.rules, edge.fromLayer, edge.toLayer, {
      fromPath: edge.from,
      toPath: edge.to,
      layers: input.config.layers,
    });
    if (!decision) {
      const bridge = findSharedImportsSliceBridge(input.rules, edge.fromLayer, edge.toLayer, {
        fromPath: edge.from,
        toPath: edge.to,
        layers: input.config.layers,
      });
      if (bridge) {
        warnings.push({
          ruleId: 'SHARED_IMPORTS_SLICE',
          file: bridge.fromPath,
          line: edge.line,
          fromLayer: edge.fromLayer,
          toLayer: edge.toLayer,
          target: bridge.toPath,
          toSlice: bridge.toSlice,
          failsStrict: false,
          severity: 'warning',
          message: `shared root ${bridge.fromPath} → slice ${bridge.toSlice} (${bridge.toPath}). The wall is direct-only.`,
        });
      }
      continue;
    }
    const rule = decision.rule;

    const peerIsolation = Boolean(rule.peerIsolation);
    // P1-type: pure type-only edges are placement debt (SharedTypes / owning layer), not
    // runtime coupling. Report on the violations list (doctor/HTML typeOnly counts) with
    // failsStrict:false so exit/merge treats them as non-blocking — except peerIsolation.
    // sourcePureTypeModule alone must NOT soft-skip a value import of a pure-type barrel.
    // Type placement debt: import-type syntax OR value-syntax of type-only exports.
    // Keep `typeOnly` = import-type *syntax* only so remediation can distinguish R6
    // (convert value → import type) from relocate (already import type).
    const typePlacementDebt =
      !peerIsolation && Boolean(edge.typeOnly || edge.namedBindingsTypeOnly);
    const verdict = decision.sliceVerdict;
    const baseMessage = verdict
      ? composeSliceDenialMessage({
          surface: 'import',
          verdict,
          fromLayer: edge.fromLayer,
          toLayer: edge.toLayer,
          kind: edge.kind,
          fromPath: edge.from,
          toPath: edge.to,
          ruleMessage: rule.message,
          childMessage: rule.childSlices?.message,
        })
      : rule.message ?? `${edge.fromLayer} must not ${edge.kind} ${edge.toLayer}.`;
    violations.push({
      ruleId: 'LAYER_IMPORT_VIOLATION',
      file: edge.from,
      line: edge.line,
      fromLayer: edge.fromLayer,
      toLayer: edge.toLayer,
      target: edge.to,
      ...(edge.typeOnly ? { typeOnly: true } : {}),
      ...(edge.targetTypeOnlyExports ? { targetTypeOnlyExports: true } : {}),
      ...(edge.sourcePureTypeModule ? { sourcePureTypeModule: true } : {}),
      ...(edge.namedBindingsTypeOnly ? { namedBindingsTypeOnly: true } : {}),
      ...(!peerIsolation && edge.portProofEligible ? { portProofEligible: true } : {}),
      ...(edge.kind ? { edgeKind: edge.kind } : {}),
      ...(peerIsolation ? { peerIsolation: true } : {}),
      ...sliceFindingExtras(verdict),
      message: typePlacementDebt
        ? `${baseMessage} (type-only — type placement debt; prefer SharedTypes / owning layer; not runtime coupling)`
        : baseMessage,
      ...(typePlacementDebt
        ? { failsStrict: false as const, severity: 'warning' as const }
        : {}),
    });
  }

  violations.push(...crossParentViaSharedViolations(input));

  const cyclePolicy = String(input.config.cyclePolicy ?? 'strict').toLowerCase();
  if (cyclePolicy !== 'off') {
    const cycles = detectArchitectureCycles(graph);
    if (cyclePolicy === 'soft' || cyclePolicy === 'framework-soft') {
      warnings.push(
        ...cycles.map((cycle) => ({
          ...cycle,
          message: `${cycle.message} (soft cycle policy — advisory only; set cyclePolicy: "strict" to fail the check)`,
          failsStrict: false,
        }))
      );
    } else {
      violations.push(...cycles);
    }
  }

  return { violations, warnings, safety: input.safety };
}

const CROSS_PARENT_VIA_SHARED = 'CROSS_PARENT_VIA_SHARED';
const CROSS_PARENT_VIA_SHARED_HOOK =
  'ark-check and CI report this path. The write hook and ESLint see one edge at a time and do not block it.';

type PlacedFile = { kind: 'slice'; id: string } | { kind: 'shared' } | { kind: 'other' };

type ValueHop = {
  from: string;
  to: string;
  line: number;
  fromLayer: string;
  toLayer: string;
};

function denyingCrossParentRule(
  rules: EvaluateArchitectureGraphInput['rules'],
  fromLayer: string,
  toLayer: string
): EdgeRule | undefined {
  for (const rule of rules ?? []) {
    if (rule.from !== fromLayer || rule.to !== toLayer) continue;
    if (rule.allowed !== false || !rule.peerIsolation) continue;
    if (sharedImportsSliceMode(rule.sharedImportsSlice) !== 'deny-cross-parent') continue;
    return rule;
  }
  return undefined;
}

function placeFile(
  rule: EdgeRule,
  fromLayer: string,
  path: string,
  layers: EvaluateArchitectureGraphInput['config']['layers']
): PlacedFile {
  const id = resolveGovernedSlice(path, rule, peerSliceFolders(rule, fromLayer, layers)).universeId;
  if (id) return { kind: 'slice', id };
  if (pathUnderSharedRoot(path, rule.sharedRoots)) return { kind: 'shared' };
  return { kind: 'other' };
}

/** A shared file the walk must not start at or pass through (a declared composition root). */
function isWalkStop(rule: EdgeRule, path: string): boolean {
  return pathMatchesSharedWalkStop(path, sharedImportsSliceStopAt(rule.sharedImportsSlice));
}

/**
 * Whole-graph pass. A slice reaches another universe only by walking shared
 * roots. One edge cannot see that, so the write hook and ESLint do not run it.
 * `sharedImportsSlice: "deny"` is unchanged and does not enter here.
 * A shared file listed in `stopAt` is a composition root: the walk neither
 * starts at nor passes through it. A universe edge the importer's rule declares
 * in `allowedCrossSlice` is not reported either; it is the same dependency the
 * direct wall already allows.
 */
function crossParentViaSharedViolations(
  input: EvaluateArchitectureGraphInput
): ArchitectureEngineViolation[] {
  const rules = input.rules ?? [];
  if (!rules.some((rule) => sharedImportsSliceMode(rule.sharedImportsSlice) === 'deny-cross-parent')) {
    return [];
  }

  const outgoing = new Map<string, ValueHop[]>();
  for (const edge of input.edges) {
    const hop = valueHop(edge);
    if (!hop) continue;
    const list = outgoing.get(hop.from);
    if (list) list.push(hop);
    else outgoing.set(hop.from, [hop]);
  }
  for (const list of outgoing.values()) {
    list.sort((left, right) => (left.to < right.to ? -1 : left.to > right.to ? 1 : left.line - right.line));
  }

  type Hit = {
    file: string;
    target: string;
    line: number;
    fromLayer: string;
    toLayer: string;
    fromSlice: string;
    toSlice: string;
    path: string[];
  };
  const hits = new Map<string, Hit>();
  const starts = [...outgoing.values()].flat();
  starts.sort((left, right) =>
    left.from < right.from ? -1 : left.from > right.from ? 1 : left.to < right.to ? -1 : left.to > right.to ? 1 : 0
  );

  for (const hop of starts) {
    const rule = denyingCrossParentRule(rules, hop.fromLayer, hop.toLayer);
    if (!rule) continue;
    const origin = placeFile(rule, hop.fromLayer, hop.from, input.config.layers);
    const next = placeFile(rule, hop.fromLayer, hop.to, input.config.layers);
    if (origin.kind !== 'slice' || next.kind !== 'shared') continue;
    if (isWalkStop(rule, hop.to)) continue;

    const queue: { file: string; path: string[] }[] = [{ file: hop.to, path: [hop.from, hop.to] }];
    const seen = new Set<string>([hop.to]);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      for (const step of outgoing.get(current.file) ?? []) {
        const stepRule = denyingCrossParentRule(rules, step.fromLayer, step.toLayer);
        if (!stepRule) continue;
        const dest = placeFile(stepRule, step.fromLayer, step.to, input.config.layers);
        if (dest.kind === 'shared') {
          if (seen.has(step.to) || isWalkStop(stepRule, step.to)) continue;
          seen.add(step.to);
          queue.push({ file: step.to, path: [...current.path, step.to] });
          continue;
        }
        if (dest.kind !== 'slice' || dest.id.toLowerCase() === origin.id.toLowerCase()) continue;
        // Declared on purpose by the importer's rule (directed); childSlices.allowedCrossSlice never counts.
        if (crossSliceEdgeAllowed(rule.allowedCrossSlice, origin.id, dest.id)) continue;
        if (rule.sliceIdentity === 'stars') {
          // One-release 4.8.23 stars compatibility (legacy alias targets / allowances).
          const pair = resolveGovernedSlicePair(
            rule,
            peerSliceFolders(rule, hop.fromLayer, input.config.layers),
            hop.from,
            step.to
          );
          if (pair.crossSliceAllowed) continue;
          if (pair.from.universeId && pair.from.universeId === pair.to.universeId) continue;
        }
        const path = [...current.path, step.to];
        const key = `${hop.from}\0${step.to}`;
        const candidate: Hit = {
          file: hop.from,
          target: step.to,
          line: hop.line,
          fromLayer: hop.fromLayer,
          toLayer: step.toLayer,
          fromSlice: origin.id,
          toSlice: dest.id,
          path,
        };
        const previous = hits.get(key);
        if (
          !previous ||
          path.length < previous.path.length ||
          (path.length === previous.path.length && path.join('\0') < previous.path.join('\0'))
        ) {
          hits.set(key, candidate);
        }
      }
    }
  }

  return [...hits.values()]
    .sort((left, right) =>
      left.file < right.file ? -1 : left.file > right.file ? 1 : left.target < right.target ? -1 : left.target > right.target ? 1 : 0
    )
    .map((hit) => {
      const fromUniverse = universePairLabel(hit.fromSlice);
      const toUniverse = universePairLabel(hit.toSlice);
      return {
        ruleId: 'LAYER_IMPORT_VIOLATION',
        reasonId: CROSS_PARENT_VIA_SHARED,
        file: hit.file,
        line: hit.line,
        fromLayer: hit.fromLayer,
        toLayer: hit.toLayer,
        target: hit.target,
        peerIsolation: true,
        ...(fromUniverse && toUniverse ? { universeFrom: fromUniverse, universeTo: toUniverse } : {}),
        via: hit.path.slice(1, -1),
        message: `${hit.fromLayer} reaches ${hit.toLayer} in another universe through a shared root (${hit.path.join(' → ')}): cross-parent via shared ${hit.fromSlice} → ${hit.toSlice}. ${CROSS_PARENT_VIA_SHARED_HOOK}`,
      };
    });
}

function valueHop(edge: ArchitectureEngineEdge): ValueHop | undefined {
  if (!edge.to || edge.to === edge.from || !edge.fromLayer || !edge.toLayer) return undefined;
  return {
    from: edge.from,
    to: edge.to,
    line: edge.line,
    fromLayer: edge.fromLayer,
    toLayer: edge.toLayer,
  };
}
