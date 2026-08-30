/**
 * Pure ArkOrder tier-1 sensors (ADR 0027 / 0029). Absence of arkOrder emits nothing.
 */
import {
  extractArkOrderGenericUpdatesFromSource,
  extractArkOrderIngestWritesXiFromSource,
  extractArkOrderPlaneCallsFromSource,
  extractArkOrderReleaseKeyCountsFromSource,
  extractArkOrderXiFieldWritesFromSource,
  isArkOrderModuleSpecifier,
  type ResolvedArkOrderGenericUpdateFact,
  type ResolvedArkOrderIngestWriteFact,
  type ResolvedArkOrderPlaneCallFact,
  type ResolvedArkOrderRootHitFact,
  type ResolvedArkOrderXiFieldWriteFact,
} from './arkOrderFacts';
import type { ArkConfigArkOrder, ArkConfigLayer } from './configTypes';
import {
  extraMergeTeethAllowed,
  type ExtraMergeTeethClassification,
} from './extraMergeTeeth';
import { deterministicNextAction } from './remediation';
import type { ResolvedDependencyFact, ResolvedFactsReason } from './resolvedCandidateFactsTypes';

export const ARKORDER_TIER1_SENSOR_IDS = [
  'arkorder-missing-plane',
  'arkorder-kernel-in-domain',
  'arkorder-generic-update',
  'arkorder-too-many-params',
  'arkorder-ingest-writes-xi',
  'arkorder-xi-field-write',
] as const;

export type ArkOrderTier1SensorId = (typeof ARKORDER_TIER1_SENSOR_IDS)[number];

export const ARKORDER_RULE_IDS = {
  'arkorder-missing-plane': 'ARKORDER_MISSING_PLANE',
  'arkorder-kernel-in-domain': 'ARKORDER_KERNEL_IN_DOMAIN',
  'arkorder-generic-update': 'ARKORDER_GENERIC_UPDATE',
  'arkorder-too-many-params': 'ARKORDER_TOO_MANY_PARAMS',
  'arkorder-ingest-writes-xi': 'ARKORDER_INGEST_WRITES_XI',
  'arkorder-xi-field-write': 'ARKORDER_XI_FIELD_WRITE',
} as const;

export type ArkOrderRuleId = (typeof ARKORDER_RULE_IDS)[ArkOrderTier1SensorId];

export type ArkOrderSensorFinding = {
  ruleId: ArkOrderRuleId;
  sensor: ArkOrderTier1SensorId;
  message: string;
  file: string;
  line: number;
  fromLayer?: string;
  target?: string;
  severity: 'error' | 'warning';
  failsStrict: boolean;
  nextAction: string;
};

export type EvaluateArkOrderSensorsInput = {
  arkOrder: ArkConfigArkOrder | undefined;
  layers: readonly ArkConfigLayer[];
  planeCalls: readonly ResolvedArkOrderPlaneCallFact[];
  genericUpdates: readonly ResolvedArkOrderGenericUpdateFact[];
  planeRootHits: readonly ResolvedArkOrderRootHitFact[];
  xiFieldWrites?: readonly ResolvedArkOrderXiFieldWriteFact[];
  ingestWritesXi?: readonly ResolvedArkOrderIngestWriteFact[];
  releaseKeyCounts?: readonly { file: string; line: number; keyCount: number }[];
  dependencies: readonly ResolvedDependencyFact[];
  layerForFile: (path: string) => string | null | undefined;
  classification?: ExtraMergeTeethClassification;
};

export type EvaluateArkOrderSensorsResult = {
  findings: ArkOrderSensorFinding[];
  completenessReasons: ResolvedFactsReason[];
};

function isDomainRoleLayer(layer: string, intentPrefixes: readonly string[] = []): boolean {
  const name = layer.trim();
  if (/^domain(?:model)?$/i.test(name) || /^domain(?=[A-Z_\-\s])/i.test(name)) return true;
  return intentPrefixes.some((prefix) => {
    const normalized = prefix.trim().replace(/\.+$/, '');
    return normalized === 'Domain' || normalized.startsWith('Domain.');
  });
}

function finding(
  extra: ArkConfigArkOrder,
  sensor: ArkOrderTier1SensorId,
  file: string,
  line: number,
  message: string,
  extras: { fromLayer?: string; target?: string } | undefined,
  teethAllowed: boolean
): ArkOrderSensorFinding {
  const failsStrict = extra.mode === 'enforced' && teethAllowed;
  return {
    ruleId: ARKORDER_RULE_IDS[sensor],
    sensor,
    message,
    file,
    line,
    ...(extras?.fromLayer ? { fromLayer: extras.fromLayer } : {}),
    ...(extras?.target ? { target: extras.target } : {}),
    severity: failsStrict ? 'error' : 'warning',
    failsStrict,
    nextAction: deterministicNextAction({
      ruleId: ARKORDER_RULE_IDS[sensor],
      fromLayer: extras?.fromLayer,
      target: extras?.target,
    }),
  };
}

export function evaluateArkOrderSensors(
  input: EvaluateArkOrderSensorsInput
): EvaluateArkOrderSensorsResult {
  const extra = input.arkOrder;
  if (!extra) return { findings: [], completenessReasons: [] };
  const teethAllowed = extraMergeTeethAllowed(input.classification);
  const findings: ArkOrderSensorFinding[] = [];

  const roots = extra.planeRoots;
  if (extra.mode === 'enforced' && roots.length === 0) {
    findings.push(
      finding(
        extra,
        'arkorder-missing-plane',
        'ark.config.json',
        1,
        'ArkOrder planeRoots is empty; no createOrderPlane site is declared.',
        undefined,
        teethAllowed
      )
    );
  } else {
    const hitsByRoot = new Map<string, ResolvedArkOrderRootHitFact[]>();
    for (const hit of input.planeRootHits) {
      const list = hitsByRoot.get(hit.matchedRoot) ?? [];
      list.push(hit);
      hitsByRoot.set(hit.matchedRoot, list);
    }
    for (const pattern of roots) {
      const matched = hitsByRoot.get(pattern) ?? [];
      if (matched.length === 0) {
        findings.push(
          finding(
            extra,
            'arkorder-missing-plane',
            'ark.config.json',
            1,
            `ArkOrder plane root ${JSON.stringify(pattern)} matched no governed files and has no createOrderPlane factory.`,
            { target: pattern },
            teethAllowed
          )
        );
        continue;
      }
      if (matched.some((hit) => hit.hasPlaneFactory)) continue;
      findings.push(
        finding(
          extra,
          'arkorder-missing-plane',
          matched[0]!.file,
          1,
          `ArkOrder plane root ${JSON.stringify(pattern)} has no createOrderPlane factory.`,
          { target: pattern },
          teethAllowed
        )
      );
    }
  }

  const prefixes = new Map(
    input.layers.map((layer) => [layer.name, layer.intentPrefixes ?? []] as const)
  );
  for (const dependency of input.dependencies) {
    const specifier = dependency.specifier;
    if (!specifier || !isArkOrderModuleSpecifier(specifier)) continue;
    const fromLayer = input.layerForFile(dependency.from);
    if (!fromLayer) continue;
    if (!isDomainRoleLayer(fromLayer, prefixes.get(fromLayer) ?? [])) continue;
    findings.push(
      finding(
        extra,
        'arkorder-kernel-in-domain',
        dependency.from,
        dependency.line,
        'Domain-role layer imports arkgate/order; Domain stays plane-free.',
        { fromLayer, target: specifier },
        teethAllowed
      )
    );
  }

  for (const update of input.genericUpdates) {
    findings.push(
      finding(
        extra,
        'arkorder-generic-update',
        update.file,
        update.line,
        `Generic ${update.method}() on the order plane rewrites ξ; Haken forbids it.`,
        { target: update.method },
        teethAllowed
      )
    );
  }

  const xiKeys = extra.xiKeys ?? [];
  if (xiKeys.length > extra.maxXiKeys) {
    findings.push(
      finding(
        extra,
        'arkorder-too-many-params',
        'ark.config.json',
        1,
        `arkOrder.xiKeys has ${xiKeys.length} keys; maxXiKeys is ${extra.maxXiKeys} (few slow modes).`,
        { target: String(xiKeys.length) },
        teethAllowed
      )
    );
  }
  for (const release of input.releaseKeyCounts ?? []) {
    if (release.keyCount <= extra.maxXiKeys) continue;
    findings.push(
      finding(
        extra,
        'arkorder-too-many-params',
        release.file,
        release.line,
        `release() freezes ${release.keyCount} keys; maxXiKeys is ${extra.maxXiKeys} (few slow modes).`,
        { target: String(release.keyCount) },
        teethAllowed
      )
    );
  }

  for (const ingest of input.ingestWritesXi ?? []) {
    findings.push(
      finding(
        extra,
        'arkorder-ingest-writes-xi',
        ingest.file,
        ingest.line,
        'ingest() result is assigned into a Release or ξ store; ingest may absorb or escalate, never mint a pattern.',
        undefined,
        teethAllowed
      )
    );
  }

  const managed = new Set(extra.managedLayers);
  for (const write of xiKeys.length === 0 ? [] : input.xiFieldWrites ?? []) {
    const fromLayer = input.layerForFile(write.file);
    if (!fromLayer || !managed.has(fromLayer)) continue;
    findings.push(
      finding(
        extra,
        'arkorder-xi-field-write',
        write.file,
        write.line,
        `File writes slow key ${JSON.stringify(write.key)} through a persistence driver; route the field through ingest or a pattern change through proposeRelease.`,
        { fromLayer, target: write.key },
        teethAllowed
      )
    );
  }

  findings.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.ruleId.localeCompare(right.ruleId) ||
      left.line - right.line
  );
  return { findings, completenessReasons: [] };
}

export function evaluateArkOrderEditorSensors(input: {
  arkOrder: ArkConfigArkOrder | undefined;
  file: string;
  source: string;
  fromLayer: string | null | undefined;
  intentPrefixes?: readonly string[];
}): ArkOrderSensorFinding[] {
  if (!input.arkOrder) return [];
  const planeCalls = extractArkOrderPlaneCallsFromSource(input.file, input.source);
  const genericUpdates = extractArkOrderGenericUpdatesFromSource(input.file, input.source);
  const xiKeys = input.arkOrder.xiKeys ?? [];
  return evaluateArkOrderSensors({
    arkOrder: input.arkOrder,
    layers: [],
    planeCalls,
    genericUpdates,
    planeRootHits: [],
    xiFieldWrites: extractArkOrderXiFieldWritesFromSource(input.file, input.source, xiKeys),
    ingestWritesXi: extractArkOrderIngestWritesXiFromSource(input.file, input.source),
    releaseKeyCounts: extractArkOrderReleaseKeyCountsFromSource(input.file, input.source),
    dependencies: [],
    layerForFile: () => input.fromLayer,
  }).findings.filter(
    (item) =>
      item.sensor === 'arkorder-generic-update' ||
      item.sensor === 'arkorder-kernel-in-domain' ||
      item.sensor === 'arkorder-xi-field-write' ||
      item.sensor === 'arkorder-ingest-writes-xi' ||
      item.sensor === 'arkorder-too-many-params'
  );
}
