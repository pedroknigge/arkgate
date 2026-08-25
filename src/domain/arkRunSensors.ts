/**
 * Pure ArkRun tier-1 sensor evaluation (ADR 0020 / 0022 / RN04).
 *
 * Absence of `arkRun` emits nothing. Advisory never flips `valid`; enforced
 * blocks. Heuristic skip-resolve is not evaluated here (tier 2, RN later).
 */
import {
  isArkRunKernelModuleSpecifier,
  isArkRunTransportBypassSpecifier,
} from './arkRunFacts';
import type { ArkConfigArkRun, ArkConfigLayer } from './configTypes';
import type {
  ResolvedArkRunCompositionRootHitFact,
  ResolvedArkRunDeclarationFact,
  ResolvedArkRunKernelCallFact,
  ResolvedArkRunKernelCallKind,
  ResolvedArkRunManagedNewFact,
  ResolvedDependencyFact,
  ResolvedFactsReason,
} from './resolvedCandidateFactsTypes';

export const ARKRUN_TIER1_SENSOR_IDS = [
  'arkrun-missing-root',
  'arkrun-kernel-in-domain',
  'arkrun-direct-new',
  'arkrun-undeclared-emit',
  'arkrun-undeclared-handle',
  'arkrun-undeclared-depend',
  'arkrun-transport-bypass',
] as const;

export type ArkRunTier1SensorId = (typeof ARKRUN_TIER1_SENSOR_IDS)[number];

export const ARKRUN_RULE_IDS = {
  'arkrun-missing-root': 'ARKRUN_MISSING_ROOT',
  'arkrun-kernel-in-domain': 'ARKRUN_KERNEL_IN_DOMAIN',
  'arkrun-direct-new': 'ARKRUN_DIRECT_NEW',
  'arkrun-undeclared-emit': 'ARKRUN_UNDECLARED_EMIT',
  'arkrun-undeclared-handle': 'ARKRUN_UNDECLARED_HANDLE',
  'arkrun-undeclared-depend': 'ARKRUN_UNDECLARED_DEPEND',
  'arkrun-transport-bypass': 'ARKRUN_TRANSPORT_BYPASS',
} as const;

export type ArkRunRuleId = (typeof ARKRUN_RULE_IDS)[ArkRunTier1SensorId];

export const ARKRUN_INTERACTION_NAME_INCOMPLETE = 'ARKRUN_INTERACTION_NAME_INCOMPLETE';

export type ArkRunSensorFinding = {
  ruleId: ArkRunRuleId;
  sensor: ArkRunTier1SensorId;
  message: string;
  file: string;
  line: number;
  fromLayer?: string;
  target?: string;
  severity: 'error' | 'warning';
  failsStrict: boolean;
  nextAction: string;
};

export type EvaluateArkRunSensorsInput = {
  arkRun: ArkConfigArkRun | undefined;
  layers: readonly ArkConfigLayer[];
  kernelCalls: readonly ResolvedArkRunKernelCallFact[];
  managedNews: readonly ResolvedArkRunManagedNewFact[];
  compositionRootHits: readonly ResolvedArkRunCompositionRootHitFact[];
  declarations: readonly ResolvedArkRunDeclarationFact[];
  dependencies: readonly ResolvedDependencyFact[];
  layerForFile: (path: string) => string | null | undefined;
};

export type EvaluateArkRunSensorsResult = {
  findings: ArkRunSensorFinding[];
  completenessReasons: ResolvedFactsReason[];
};

function isDomainRoleLayer(layer: string, intentPrefixes: readonly string[] = []): boolean {
  const name = layer.trim();
  // Start-anchored Domain/entity/aggregate — unanchored "model" matches ReportingReadModels.
  if (/^domain(?:model)?$/i.test(name) || /^domain(?=[A-Z_\-\s])/i.test(name)) return true;
  if (/^(?:entit(?:y|ies)|aggregates?)(?:$|(?=[A-Z_\-\s]))/i.test(name)) return true;
  return intentPrefixes.some((prefix) => {
    const normalized = prefix.trim().replace(/\.+$/, '');
    return normalized === 'Domain' || normalized.startsWith('Domain.');
  });
}

function nextActionFor(sensor: ArkRunTier1SensorId): string {
  switch (sensor) {
    case 'arkrun-missing-root':
      return 'Call createStrictArkKernel (or createArkKernel) in a composition root listed in arkRun.compositionRoots, then preflight again.';
    case 'arkrun-kernel-in-domain':
      return 'Move the kernel import out of the Domain-role layer into a composition root or adapter, then preflight again.';
    case 'arkrun-direct-new':
      return 'Resolve the type from the kernel instead of constructing it with new, then preflight again.';
    case 'arkrun-undeclared-emit':
      return 'Add the call-site name to raises or sends on the managed component, then preflight again.';
    case 'arkrun-undeclared-handle':
      return 'Add the call-site name to reactsTo on the managed component, then preflight again.';
    case 'arkrun-undeclared-depend':
      return 'Add the call-site name to uses on the managed component, then preflight again.';
    case 'arkrun-transport-bypass':
      return 'Send through the ArkRun kernel transport instead of importing that broker or emitter, then preflight again.';
  }
}

function compareFindings(left: ArkRunSensorFinding, right: ArkRunSensorFinding): number {
  return (
    left.file.localeCompare(right.file) ||
    left.ruleId.localeCompare(right.ruleId) ||
    left.line - right.line ||
    left.message.localeCompare(right.message)
  );
}

function finding(
  extra: ArkConfigArkRun,
  sensor: ArkRunTier1SensorId,
  file: string,
  line: number,
  message: string,
  extras?: { fromLayer?: string; target?: string }
): ArkRunSensorFinding {
  const failsStrict = extra.mode === 'enforced';
  return {
    ruleId: ARKRUN_RULE_IDS[sensor],
    sensor,
    message,
    file,
    line,
    ...(extras?.fromLayer ? { fromLayer: extras.fromLayer } : {}),
    ...(extras?.target ? { target: extras.target } : {}),
    severity: failsStrict ? 'error' : 'warning',
    failsStrict,
    nextAction: nextActionFor(sensor),
  };
}

type DeclarationBag = {
  uses: ReadonlySet<string>;
  reactsTo: ReadonlySet<string>;
  raises: ReadonlySet<string>;
  sends: ReadonlySet<string>;
};

function bagForFile(
  declarations: readonly ResolvedArkRunDeclarationFact[],
  file: string
): DeclarationBag {
  const uses: string[] = [];
  const reactsTo: string[] = [];
  const raises: string[] = [];
  const sends: string[] = [];
  for (const entry of declarations) {
    if (entry.file !== file) continue;
    uses.push(...entry.uses);
    reactsTo.push(...entry.reactsTo);
    raises.push(...entry.raises);
    sends.push(...entry.sends);
  }
  return {
    uses: new Set(uses),
    reactsTo: new Set(reactsTo),
    raises: new Set(raises),
    sends: new Set(sends),
  };
}

function emitKinds(kind: ResolvedArkRunKernelCallKind): boolean {
  return kind === 'publisher' || kind === 'publish' || kind === 'raise' || kind === 'send';
}

function handleKinds(kind: ResolvedArkRunKernelCallKind): boolean {
  return kind === 'subscribe' || kind === 'register-handler';
}

function dependKinds(kind: ResolvedArkRunKernelCallKind): boolean {
  return kind === 'resolve' || kind === 'resolve-singleton';
}

function evaluateMissingRoot(
  extra: ArkConfigArkRun,
  hits: readonly ResolvedArkRunCompositionRootHitFact[]
): ArkRunSensorFinding[] {
  const out: ArkRunSensorFinding[] = [];
  const roots = extra.compositionRoots;
  if (roots.length === 0) {
    out.push(
      finding(
        extra,
        'arkrun-missing-root',
        'ark.config.json',
        1,
        'ArkRun compositionRoots is empty; no createArkKernel factory site is declared.'
      )
    );
    return out;
  }
  const hitsByRoot = new Map<string, ResolvedArkRunCompositionRootHitFact[]>();
  for (const hit of hits) {
    const list = hitsByRoot.get(hit.matchedRoot) ?? [];
    list.push(hit);
    hitsByRoot.set(hit.matchedRoot, list);
  }
  for (const pattern of roots) {
    const matched = [...(hitsByRoot.get(pattern) ?? [])].sort((left, right) =>
      left.file.localeCompare(right.file)
    );
    if (matched.length === 0) {
      out.push(
        finding(
          extra,
          'arkrun-missing-root',
          'ark.config.json',
          1,
          `ArkRun composition root ${JSON.stringify(pattern)} matched no governed files and has no createArkKernel factory.`,
          { target: pattern }
        )
      );
      continue;
    }
    // Factory required in the root set, not in every glob hit.
    if (matched.some((hit) => hit.hasKernelFactory)) continue;
    const first = matched[0]!;
    out.push(
      finding(
        extra,
        'arkrun-missing-root',
        first.file,
        1,
        `ArkRun composition root ${JSON.stringify(pattern)} has no createArkKernel / createStrictArkKernel factory.`,
        { target: pattern }
      )
    );
  }
  return out;
}

function evaluateKernelInDomain(
  extra: ArkConfigArkRun,
  layers: readonly ArkConfigLayer[],
  dependencies: readonly ResolvedDependencyFact[],
  layerForFile: EvaluateArkRunSensorsInput['layerForFile']
): ArkRunSensorFinding[] {
  const prefixes = new Map(
    layers.map((layer) => [layer.name, layer.intentPrefixes ?? []] as const)
  );
  const out: ArkRunSensorFinding[] = [];
  for (const dependency of dependencies) {
    const specifier = dependency.specifier;
    if (!specifier || !isArkRunKernelModuleSpecifier(specifier)) continue;
    const fromLayer = layerForFile(dependency.from);
    if (!fromLayer) continue;
    if (!isDomainRoleLayer(fromLayer, prefixes.get(fromLayer) ?? [])) continue;
    out.push(
      finding(
        extra,
        'arkrun-kernel-in-domain',
        dependency.from,
        dependency.line,
        `${fromLayer} must not import kernel module ${JSON.stringify(specifier)}.`,
        { fromLayer, target: specifier }
      )
    );
  }
  return out;
}

function evaluateDirectNew(
  extra: ArkConfigArkRun,
  layers: readonly ArkConfigLayer[],
  managedNews: readonly ResolvedArkRunManagedNewFact[],
  hits: readonly ResolvedArkRunCompositionRootHitFact[],
  layerForFile: EvaluateArkRunSensorsInput['layerForFile']
): ArkRunSensorFinding[] {
  const managed = new Set(extra.managedLayers);
  if (managed.size === 0) return [];
  const prefixes = new Map(
    layers.map((layer) => [layer.name, layer.intentPrefixes ?? []] as const)
  );
  const admittedFactories = new Set(
    hits.filter((hit) => hit.hasKernelFactory).map((hit) => hit.file)
  );
  const out: ArkRunSensorFinding[] = [];
  for (const constructed of managedNews) {
    if (admittedFactories.has(constructed.file)) continue;
    const fromLayer = layerForFile(constructed.file);
    if (!fromLayer || !managed.has(fromLayer)) continue;
    if (isDomainRoleLayer(fromLayer, prefixes.get(fromLayer) ?? [])) continue;
    out.push(
      finding(
        extra,
        'arkrun-direct-new',
        constructed.file,
        constructed.line,
        `${fromLayer} must not construct ${constructed.typeName} with new outside an ArkRun composition-root factory.`,
        { fromLayer, target: constructed.typeName }
      )
    );
  }
  return out;
}

function evaluateUndeclared(
  extra: ArkConfigArkRun,
  kernelCalls: readonly ResolvedArkRunKernelCallFact[],
  declarations: readonly ResolvedArkRunDeclarationFact[],
  layerForFile: EvaluateArkRunSensorsInput['layerForFile']
): { findings: ArkRunSensorFinding[]; completenessReasons: ResolvedFactsReason[] } {
  const findings: ArkRunSensorFinding[] = [];
  const completenessReasons: ResolvedFactsReason[] = [];
  if (extra.requireDeclarations !== true) {
    return { findings, completenessReasons };
  }
  const managed = new Set(extra.managedLayers);
  if (managed.size === 0) return { findings, completenessReasons };

  for (const call of kernelCalls) {
    if (!emitKinds(call.kind) && !handleKinds(call.kind) && !dependKinds(call.kind)) continue;
    const fromLayer = layerForFile(call.file);
    if (!fromLayer || !managed.has(fromLayer)) continue;
    if (!call.nameLiteral) {
      if (extra.mode === 'enforced') {
        completenessReasons.push({
          code: ARKRUN_INTERACTION_NAME_INCOMPLETE,
          file: call.file,
          message: `ArkRun ${call.kind} call in ${call.file} has no string-literal name; enforced extra cannot prove the declaration.`,
        });
      }
      continue;
    }
    const bag = bagForFile(declarations, call.file);
    if (emitKinds(call.kind)) {
      if (bag.raises.has(call.nameLiteral) || bag.sends.has(call.nameLiteral)) continue;
      findings.push(
        finding(
          extra,
          'arkrun-undeclared-emit',
          call.file,
          call.line,
          `Emit ${JSON.stringify(call.nameLiteral)} is not declared in raises or sends.`,
          { fromLayer, target: call.nameLiteral }
        )
      );
      continue;
    }
    if (handleKinds(call.kind)) {
      if (bag.reactsTo.has(call.nameLiteral)) continue;
      findings.push(
        finding(
          extra,
          'arkrun-undeclared-handle',
          call.file,
          call.line,
          `Handle ${JSON.stringify(call.nameLiteral)} is not declared in reactsTo.`,
          { fromLayer, target: call.nameLiteral }
        )
      );
      continue;
    }
    if (bag.uses.has(call.nameLiteral)) continue;
    findings.push(
      finding(
        extra,
        'arkrun-undeclared-depend',
        call.file,
        call.line,
        `Depend ${JSON.stringify(call.nameLiteral)} is not declared in uses.`,
        { fromLayer, target: call.nameLiteral }
      )
    );
  }
  return { findings, completenessReasons };
}

function evaluateTransportBypass(
  extra: ArkConfigArkRun,
  dependencies: readonly ResolvedDependencyFact[],
  layerForFile: EvaluateArkRunSensorsInput['layerForFile']
): ArkRunSensorFinding[] {
  const managed = new Set(extra.managedLayers);
  if (managed.size === 0) return [];
  const out: ArkRunSensorFinding[] = [];
  for (const dependency of dependencies) {
    if (dependency.typeOnly) continue;
    const specifier = dependency.specifier;
    if (!specifier || !isArkRunTransportBypassSpecifier(specifier)) continue;
    const fromLayer = layerForFile(dependency.from);
    if (!fromLayer || !managed.has(fromLayer)) continue;
    out.push(
      finding(
        extra,
        'arkrun-transport-bypass',
        dependency.from,
        dependency.line,
        `${fromLayer} must not import broker/queue/emitter ${JSON.stringify(specifier)}; use the ArkRun kernel transport.`,
        { fromLayer, target: specifier }
      )
    );
  }
  return out;
}

/**
 * Evaluate closed tier-1 ArkRun sensors. Empty extra → no findings (silent).
 */
export function evaluateArkRunSensors(
  input: EvaluateArkRunSensorsInput
): EvaluateArkRunSensorsResult {
  const extra = input.arkRun;
  if (!extra) return { findings: [], completenessReasons: [] };

  const undeclared = evaluateUndeclared(
    extra,
    input.kernelCalls,
    input.declarations,
    input.layerForFile
  );
  const findings = [
    ...evaluateMissingRoot(extra, input.compositionRootHits),
    ...evaluateKernelInDomain(extra, input.layers, input.dependencies, input.layerForFile),
    ...evaluateDirectNew(
      extra,
      input.layers,
      input.managedNews,
      input.compositionRootHits,
      input.layerForFile
    ),
    ...undeclared.findings,
    ...evaluateTransportBypass(extra, input.dependencies, input.layerForFile),
  ].sort(compareFindings);

  const completenessReasons = [...undeclared.completenessReasons].sort((left, right) => {
    const leftKey = `${left.code}\0${left.file ?? ''}\0${left.message}`;
    const rightKey = `${right.code}\0${right.file ?? ''}\0${right.message}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });

  return { findings, completenessReasons };
}
