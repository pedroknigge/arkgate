/**
 * Canonical graph and layer-policy evaluation (U02 pilot 2).
 *
 * Shared by library, CLI, and MCP adapters through the src/kernel/analysis.ts
 * facade; consumer import paths never change.
 */
import {
  findDeniedEdgeDecision,
  peerIsolationDenyExplanation,
} from '../domain/layerMatch';
import type {
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
    if (!decision) continue;
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
    const baseMessage =
      rule.message ??
      (peerIsolation
        ? `${edge.fromLayer} must not ${edge.kind} another slice of ${edge.toLayer} (${edge.from} → ${edge.to}): ${peerIsolationDenyExplanation(
            decision.peerIsolationReason ?? 'cross-slice',
            {
              fromPath: edge.from,
              toPath: edge.to,
              fromSlice: decision.fromSlice,
              toSlice: decision.toSlice,
            }
          )}`
        : `${edge.fromLayer} must not ${edge.kind} ${edge.toLayer}.`);
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
      message: typePlacementDebt
        ? `${baseMessage} (type-only — type placement debt; prefer SharedTypes / owning layer; not runtime coupling)`
        : baseMessage,
      ...(typePlacementDebt
        ? { failsStrict: false as const, severity: 'warning' as const }
        : {}),
    });
  }

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
