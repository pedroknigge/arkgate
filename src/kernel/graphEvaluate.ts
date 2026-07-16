/**
 * Canonical graph and layer-policy evaluation (U02 pilot 2).
 *
 * Shared by library, CLI, and MCP adapters through the src/kernel/analysis.ts
 * facade; consumer import paths never change.
 */
import { findDeniedEdgeRule } from '../domain/layerMatch';
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
    .sort((left, right) => left[0].localeCompare(right[0]))
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
    if (!edge.to || !edge.toLayer) continue;
    const rule = findDeniedEdgeRule(input.rules, edge.fromLayer, edge.toLayer, {
      fromPath: edge.from,
      toPath: edge.to,
      layers: input.config.layers,
    });
    if (!rule) continue;

    const peerIsolation = Boolean(rule.peerIsolation);
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
      message:
        rule.message ??
        (peerIsolation
          ? `${edge.fromLayer} must not ${edge.kind} another slice of ${edge.toLayer} (${edge.from} → ${edge.to}). Extract shared code or use events/ports across slices.`
          : `${edge.fromLayer} must not ${edge.kind} ${edge.toLayer}.`),
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
