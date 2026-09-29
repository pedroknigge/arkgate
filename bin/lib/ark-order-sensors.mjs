/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/arkOrderSensors.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/ark-order-sensors.mjs). Zero Node I/O.
 */

import { extractArkOrderBudgetLeaksFromSource, extractArkOrderGenericUpdatesFromSource, extractArkOrderIngestWritesXiFromSource, extractArkOrderModuleImportsFromSource, extractArkOrderPlaneCallsFromSource, extractArkOrderReleaseKeyCountsFromSource, extractArkOrderXiFieldWritesFromSource, extractArkOrderXiTtlKeysFromSource, arkOrderGlobToRegExp as globToRegExp, isArkOrderModuleSpecifier, } from './ark-order-facts.mjs';
import { extraMergeTeethAllowed, } from './extra-merge-teeth.mjs';
import { deterministicNextAction } from './remediation.mjs';
export const ARKORDER_TIER1_SENSOR_IDS = [
    'arkorder-missing-plane',
    'arkorder-kernel-in-domain',
    'arkorder-generic-update',
    'arkorder-too-many-params',
    'arkorder-ingest-writes-xi',
    'arkorder-xi-field-write',
    'arkorder-information-budget',
    'arkorder-xi-ttl',
];
export const ARKORDER_RULE_IDS = {
    'arkorder-missing-plane': 'ARKORDER_MISSING_PLANE',
    'arkorder-kernel-in-domain': 'ARKORDER_KERNEL_IN_DOMAIN',
    'arkorder-generic-update': 'ARKORDER_GENERIC_UPDATE',
    'arkorder-too-many-params': 'ARKORDER_TOO_MANY_PARAMS',
    'arkorder-ingest-writes-xi': 'ARKORDER_INGEST_WRITES_XI',
    'arkorder-xi-field-write': 'ARKORDER_XI_FIELD_WRITE',
    'arkorder-information-budget': 'ARKORDER_INFORMATION_BUDGET',
    'arkorder-xi-ttl': 'ARKORDER_XI_TTL',
};
function matchesArkOrderAppliesTo(file, appliesTo) {
    if (!appliesTo || appliesTo.length === 0)
        return true;
    return appliesTo.some((pattern) => globToRegExp(pattern).test(file));
}
function isDomainRoleLayer(layer, intentPrefixes = []) {
    const name = layer.trim();
    if (/^domain(?:model)?$/i.test(name) || /^domain(?=[A-Z_\-\s])/i.test(name))
        return true;
    return intentPrefixes.some((prefix) => {
        const normalized = prefix.trim().replace(/\.+$/, '');
        return normalized === 'Domain' || normalized.startsWith('Domain.');
    });
}
function finding(extra, sensor, file, line, message, extras, teethAllowed) {
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
export function evaluateArkOrderSensors(input) {
    const extra = input.arkOrder;
    if (!extra)
        return { findings: [], completenessReasons: [] };
    const teethAllowed = extraMergeTeethAllowed(input.classification);
    const findings = [];
    const roots = extra.planeRoots;
    if (extra.mode === 'enforced' && roots.length === 0) {
        findings.push(finding(extra, 'arkorder-missing-plane', 'ark.config.json', 1, 'ArkOrder planeRoots is empty; no createOrderPlane site is declared.', undefined, teethAllowed));
    }
    else {
        const hitsByRoot = new Map();
        for (const hit of input.planeRootHits) {
            const list = hitsByRoot.get(hit.matchedRoot) ?? [];
            list.push(hit);
            hitsByRoot.set(hit.matchedRoot, list);
        }
        for (const pattern of roots) {
            const matched = hitsByRoot.get(pattern) ?? [];
            if (matched.length === 0) {
                findings.push(finding(extra, 'arkorder-missing-plane', 'ark.config.json', 1, `ArkOrder plane root ${JSON.stringify(pattern)} matched no governed files and has no createOrderPlane factory.`, { target: pattern }, teethAllowed));
                continue;
            }
            if (matched.some((hit) => hit.hasPlaneFactory))
                continue;
            findings.push(finding(extra, 'arkorder-missing-plane', matched[0].file, 1, `ArkOrder plane root ${JSON.stringify(pattern)} has no createOrderPlane factory.`, { target: pattern }, teethAllowed));
        }
    }
    const prefixes = new Map(input.layers.map((layer) => [layer.name, layer.intentPrefixes ?? []]));
    for (const dependency of input.dependencies) {
        const specifier = dependency.specifier;
        if (!specifier || !isArkOrderModuleSpecifier(specifier))
            continue;
        const fromLayer = input.layerForFile(dependency.from);
        if (!fromLayer)
            continue;
        if (!isDomainRoleLayer(fromLayer, prefixes.get(fromLayer) ?? []))
            continue;
        findings.push(finding(extra, 'arkorder-kernel-in-domain', dependency.from, dependency.line, 'Domain-role layer imports arkgate/order; Domain stays plane-free.', { fromLayer, target: specifier }, teethAllowed));
    }
    for (const update of input.genericUpdates) {
        findings.push(finding(extra, 'arkorder-generic-update', update.file, update.line, `Generic ${update.method}() on the order plane rewrites ξ; Haken forbids it.`, { target: update.method }, teethAllowed));
    }
    const xiKeys = extra.xiKeys ?? [];
    for (const release of input.releaseKeyCounts ?? []) {
        if (release.keyCount <= extra.maxXiKeys)
            continue;
        findings.push(finding(extra, 'arkorder-too-many-params', release.file, release.line, `release() freezes ${release.keyCount} keys; maxXiKeys is ${extra.maxXiKeys} (few slow modes).`, { target: String(release.keyCount) }, teethAllowed));
    }
    for (const ingest of input.ingestWritesXi ?? []) {
        findings.push(finding(extra, 'arkorder-ingest-writes-xi', ingest.file, ingest.line, 'ingest() result is assigned into a Release or ξ store; ingest may absorb or escalate, never mint a pattern.', undefined, teethAllowed));
    }
    for (const ttl of input.xiTtlKeys ?? []) {
        findings.push(finding(extra, 'arkorder-xi-ttl', ttl.file, ttl.line, `ξ key ${JSON.stringify(ttl.key)} is a freshness field; freshness belongs on σ (freshUntil), never on ξ.`, { target: ttl.key }, teethAllowed));
    }
    for (const leak of input.budgetLeaks ?? []) {
        findings.push(finding(extra, 'arkorder-information-budget', leak.file, leak.line, `Projection allowedKinds lists ${JSON.stringify(leak.kind)}, which informationBudget.cannotObserve denies.`, { target: leak.kind }, teethAllowed));
    }
    const managed = new Set(extra.managedLayers);
    for (const write of xiKeys.length === 0 ? [] : input.xiFieldWrites ?? []) {
        const fromLayer = input.layerForFile(write.file);
        if (!fromLayer || !managed.has(fromLayer))
            continue;
        if (!matchesArkOrderAppliesTo(write.file, extra.appliesTo))
            continue;
        findings.push(finding(extra, 'arkorder-xi-field-write', write.file, write.line, `This file writes ${JSON.stringify(write.key)} the same way it would write a seat count. Take the event in, or change that choice through the valve (propose, then apply).`, { fromLayer, target: write.key }, teethAllowed));
    }
    findings.sort((left, right) => left.file.localeCompare(right.file) ||
        left.ruleId.localeCompare(right.ruleId) ||
        left.line - right.line);
    return { findings, completenessReasons: [] };
}
export function evaluateArkOrderEditorSensors(input) {
    if (!input.arkOrder)
        return [];
    const planeCalls = extractArkOrderPlaneCallsFromSource(input.file, input.source);
    const receivers = { planeRoots: input.arkOrder.planeRoots ?? [] };
    const genericUpdates = extractArkOrderGenericUpdatesFromSource(input.file, input.source, receivers);
    const xiKeys = input.arkOrder.xiKeys ?? [];
    // kernel-in-domain needs the file's own layer (name + intent prefixes) and the
    // arkgate/order specifiers of this one source — the write-path twin of CI facts.
    const layers = input.fromLayer
        ? [
            {
                name: input.fromLayer,
                patterns: [],
                intentPrefixes: [...(input.intentPrefixes ?? [])],
            },
        ]
        : [];
    return evaluateArkOrderSensors({
        arkOrder: input.arkOrder,
        layers,
        planeCalls,
        genericUpdates,
        planeRootHits: [],
        xiFieldWrites: extractArkOrderXiFieldWritesFromSource(input.file, input.source, xiKeys),
        ingestWritesXi: extractArkOrderIngestWritesXiFromSource(input.file, input.source),
        releaseKeyCounts: extractArkOrderReleaseKeyCountsFromSource(input.file, input.source),
        xiTtlKeys: extractArkOrderXiTtlKeysFromSource(input.file, input.source, receivers),
        budgetLeaks: extractArkOrderBudgetLeaksFromSource(input.file, input.source),
        dependencies: extractArkOrderModuleImportsFromSource(input.file, input.source),
        layerForFile: () => input.fromLayer,
        ...(input.classification ? { classification: input.classification } : {}),
    }).findings.filter((item) => item.sensor === 'arkorder-generic-update' ||
        item.sensor === 'arkorder-kernel-in-domain' ||
        item.sensor === 'arkorder-xi-field-write' ||
        item.sensor === 'arkorder-ingest-writes-xi' ||
        item.sensor === 'arkorder-too-many-params' ||
        item.sensor === 'arkorder-xi-ttl' ||
        item.sensor === 'arkorder-information-budget');
}
