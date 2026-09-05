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

/**
 * XIWRITE-001: same engine as `globToRegExp` in src/domain/layerMatch.ts.
 * Inlined so generate:cli-pure emits a self-contained bin/lib/ark-order-sensors.mjs
 * (layerMatch is derived to bin/ark-layer-match.mjs, not a bin/lib sibling).
 */
const appliesToRegexpCache = new Map<string, RegExp>();

function escapeAppliesToLiteral(ch: string): string {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

function normalizeAppliesToGlob(pattern: string): string {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) {
      const next = pattern[i + 1]!;
      if ('*?{}[],'.includes(next) || next === '\\') {
        out += '\\' + next;
        i += 1;
        continue;
      }
      out += '/';
      continue;
    }
    out += c;
  }
  return out;
}

function appliesToBracesBalanced(glob: string): boolean {
  let depth = 0;
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '\\') {
      i += 1;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

function globToRegExp(pattern: string): RegExp {
  const cached = appliesToRegexpCache.get(pattern);
  if (cached) return cached;
  const glob = normalizeAppliesToGlob(pattern);
  const useBraces = appliesToBracesBalanced(glob);
  let out = '';
  let braceDepth = 0;
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '\\' && i + 1 < glob.length) {
      out += escapeAppliesToLiteral(glob[i + 1]!);
      i += 1;
    } else if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else if (c === '{' && useBraces) {
      out += '(?:';
      braceDepth += 1;
    } else if (c === '}' && useBraces && braceDepth > 0) {
      out += ')';
      braceDepth -= 1;
    } else if (c === ',' && useBraces && braceDepth > 0) {
      out += '|';
    } else {
      out += escapeAppliesToLiteral(c);
    }
  }
  const re = new RegExp(`^${out}$`);
  appliesToRegexpCache.set(pattern, re);
  return re;
}

export const ARKORDER_TIER1_SENSOR_IDS = [
  'arkorder-missing-plane',
  'arkorder-kernel-in-domain',
  'arkorder-generic-update',
  'arkorder-too-many-params',
  'arkorder-ingest-writes-xi',
  'arkorder-xi-field-write',
  'arkorder-information-budget',
  'arkorder-xi-ttl',
] as const;

export type ArkOrderTier1SensorId = (typeof ARKORDER_TIER1_SENSOR_IDS)[number];

export const ARKORDER_RULE_IDS = {
  'arkorder-missing-plane': 'ARKORDER_MISSING_PLANE',
  'arkorder-kernel-in-domain': 'ARKORDER_KERNEL_IN_DOMAIN',
  'arkorder-generic-update': 'ARKORDER_GENERIC_UPDATE',
  'arkorder-too-many-params': 'ARKORDER_TOO_MANY_PARAMS',
  'arkorder-ingest-writes-xi': 'ARKORDER_INGEST_WRITES_XI',
  'arkorder-xi-field-write': 'ARKORDER_XI_FIELD_WRITE',
  'arkorder-information-budget': 'ARKORDER_INFORMATION_BUDGET',
  'arkorder-xi-ttl': 'ARKORDER_XI_TTL',
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

function matchesArkOrderAppliesTo(
  file: string,
  appliesTo: readonly string[] | undefined
): boolean {
  if (!appliesTo || appliesTo.length === 0) return true;
  return appliesTo.some((pattern) => globToRegExp(pattern).test(file));
}

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
    if (!matchesArkOrderAppliesTo(write.file, extra.appliesTo)) continue;
    findings.push(
      finding(
        extra,
        'arkorder-xi-field-write',
        write.file,
        write.line,
        `This file writes ${JSON.stringify(write.key)} the same way it would write a seat count. Take the event in, or change that choice through the valve (propose, then apply).`,
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
