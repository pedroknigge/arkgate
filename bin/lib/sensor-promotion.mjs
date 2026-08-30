/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/sensorPromotion.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/sensor-promotion.mjs). Zero Node I/O.
 */

import { ARK_RULE_SENSORS, ARK_RULE_TIER2_SENSORS } from './arkrules-contract.mjs';
import { canPromoteInvariant } from './invariant-coverage.mjs';
import { ARKRUN_TIER1_SENSOR_IDS } from './ark-run-sensors.mjs';
import { ARKORDER_TIER1_SENSOR_IDS } from './ark-order-sensors.mjs';
/**
 * The Tier-2 heuristic on the ArkRun plane (ADR 0022 D2).
 *
 * It is not in `ARKRUN_TIER1_SENSOR_IDS` because it is not evaluated at all —
 * `arkRunSensors.ts` says so in its header. Listing it here is the whole point
 * of this surface: a sensor you cannot promote should appear in the map, not go
 * missing from it, or the reader concludes it does not exist rather than that
 * it can never bite.
 */
const ARKRUN_TIER2_SENSOR_IDS = ['arkrun-skip-resolve'];
/**
 * `invariant-coverage` is in the closed vocabulary and the schema will accept
 * `mode: "enforced"` on a structure entry that names it, but
 * `evaluateArkRuleSensors` has no case that emits for it: coverage is judged
 * per invariant by the AR10 pass. Enforcing the structure entry buys no sensor
 * findings, and reporting it as "promotable" would sell a tooth that does not
 * exist.
 *
 * One sensor-independent effect survives promotion and the reason text says so:
 * `collectEmptyAppliesToFindings` raises `ARKRULE_SCOPE_EMPTY` for ANY structure
 * rule whose `appliesTo` matches zero governed files, and enforced makes that
 * fail strict. That is a misconfiguration signal, not the coverage tooth the
 * author was reaching for.
 */
const NO_TEETH_SENSORS = ['invariant-coverage'];
function planeOf(sensor) {
    if (ARK_RULE_SENSORS.includes(sensor))
        return 'arkrules';
    if (ARKRUN_TIER1_SENSOR_IDS.includes(sensor) ||
        ARKRUN_TIER2_SENSOR_IDS.includes(sensor)) {
        return 'arkrun';
    }
    if (ARKORDER_TIER1_SENSOR_IDS.includes(sensor))
        return 'arkorder';
    return null;
}
function isTier2(sensor) {
    return (ARK_RULE_TIER2_SENSORS.includes(sensor) ||
        ARKRUN_TIER2_SENSOR_IDS.includes(sensor));
}
const TIER2_ADR = {
    arkrules: 'ADR 0013',
    arkrun: 'ADR 0022',
    arkorder: 'ADR 0029',
};
/** The promotability of one sensor id, known before any rule is written. */
export function describeSensor(sensor) {
    const plane = planeOf(sensor);
    if (plane === null) {
        return {
            sensor,
            // Not 'arkrules' with tier 1: a fabricated plane files an unknown id
            // under a real one, and tier 1 reads as "direct evidence".
            plane: 'unknown',
            tier: 2,
            promotable: false,
            blocker: 'unknown-sensor',
            reason: `Sensor ${JSON.stringify(sensor)} is in no closed sensor vocabulary; the loader rejects it.`,
        };
    }
    if (isTier2(sensor)) {
        return {
            sensor,
            plane,
            tier: 2,
            promotable: false,
            blocker: 'tier-2-advisory-only',
            reason: `Sensor ${JSON.stringify(sensor)} is Tier-2 (${TIER2_ADR[plane]}): a heuristic, advisory forever. No rule on this sensor can ever be promoted to enforced.`,
        };
    }
    if (NO_TEETH_SENSORS.includes(sensor)) {
        return {
            sensor,
            plane,
            tier: 1,
            promotable: false,
            blocker: 'no-structure-teeth',
            reason: `Sensor ${JSON.stringify(sensor)} emits no structure violations — invariant coverage is judged per entry in "invariants", not by a structure rule — so enforcing a structure rule on it buys no coverage tooth (only a zero-match "appliesTo" would still fail). Promote the invariant entry instead.`,
        };
    }
    return {
        sensor,
        plane,
        tier: 1,
        promotable: true,
        blocker: null,
        // Naming the mechanism, not just the verdict. Only the ArkRules plane is
        // promoted per rule; ArkRun and ArkOrder are switched by one plane-level
        // `mode`, and `--promote --apply` writes ArkRules documents only. Saying
        // "can be enforced" for all three would answer the question in a currency
        // this surface cannot spend.
        reason: plane === 'arkrules'
            ? `Sensor ${JSON.stringify(sensor)} is Tier-1 (direct evidence) and can be enforced: set mode "enforced" on a rule that names it.`
            : `Sensor ${JSON.stringify(sensor)} is Tier-1 (direct evidence) and can be enforced, but via the plane switch \`${plane}.mode\` in ark.config.json — not per rule, and not by --promote --apply.`,
    };
}
/**
 * Every sensor ArkGate ships, across all three planes, in declaration order.
 *
 * On the field repository almost every declared rule turned out to be
 * promotable and nobody knew, because the only way to find out was to try one
 * at a time. The whole vocabulary is a constant: printing it costs nothing and
 * answers the question before the first attempt. The shipped counts are
 * asserted in tests/unit/domain/sensorPromotion.test.ts, so this comment can
 * never drift into a number the code does not produce.
 */
export function sensorVocabulary() {
    const ids = [
        ...ARK_RULE_SENSORS,
        ...ARKRUN_TIER1_SENSOR_IDS,
        ...ARKRUN_TIER2_SENSOR_IDS,
        ...ARKORDER_TIER1_SENSOR_IDS,
    ];
    return ids.map((sensor) => describeSensor(sensor));
}
function nullable(value) {
    return typeof value === 'string' && value.length > 0 ? value : null;
}
/**
 * The identity of a rule, spelled the way the author wrote it.
 *
 * The Tier-2 rejection names the sensor and nothing else, so an author whose
 * rule is called `types-only` reads an error about `no-anemic-model` and has to
 * work out that the two are the same thing. Every reason string built here
 * leads with the local id and names the file it came from.
 */
function locate(id, sourceFile) {
    return sourceFile ? `Rule ${JSON.stringify(id)} (declared in ${sourceFile})` : `Rule ${JSON.stringify(id)}`;
}
export function buildSensorMap(input) {
    const declaredStructure = input.structure ?? [];
    const declaredInvariants = input.invariants ?? [];
    // One pass to learn which ids are shared before any row is built: a row that
    // does not know it is one of two cannot warn anybody.
    const idCounts = new Map();
    for (const rule of [...declaredStructure, ...declaredInvariants]) {
        idCounts.set(rule.id, (idCounts.get(rule.id) ?? 0) + 1);
    }
    const ambiguity = (id) => {
        const declarationsWithThisId = idCounts.get(id) ?? 1;
        return { declarationsWithThisId, ambiguousId: declarationsWithThisId > 1 };
    };
    const structure = declaredStructure.map((rule) => {
        const sourceFile = nullable(rule.sourceFile);
        const sensor = describeSensor(rule.sensor);
        const reason = sensor.promotable
            ? `${locate(rule.id, sourceFile)} delegates to sensor ${JSON.stringify(rule.sensor)}, which is Tier-1 (direct evidence) and can be enforced.`
            : `${locate(rule.id, sourceFile)} delegates to sensor ${JSON.stringify(rule.sensor)}. ${sensor.reason}`;
        return {
            kind: 'structure',
            id: rule.id,
            sensor: rule.sensor,
            tier: sensor.tier,
            mode: rule.mode,
            layer: nullable(rule.layer),
            sourceFile,
            description: nullable(rule.description),
            promotable: sensor.promotable,
            blocker: sensor.blocker,
            reason,
            ...ambiguity(rule.id),
        };
    });
    const invariants = declaredInvariants.map((rule) => {
        const sourceFile = nullable(rule.sourceFile);
        // One judge for promotion, shared with the policy-delta gate: a second
        // opinion here would let this surface promise what the gate then refuses.
        const verdict = canPromoteInvariant(rule.coverage);
        return {
            kind: 'invariant',
            id: rule.id,
            mode: rule.mode,
            layer: nullable(rule.layer),
            sourceFile,
            description: nullable(rule.description),
            promotable: verdict.ok,
            blocker: verdict.ok ? null : 'no-coverage-evidence',
            reason: `${locate(rule.id, sourceFile)}: ${verdict.reason}`,
            coverageEvaluated: rule.coverage != null,
            ...ambiguity(rule.id),
        };
    });
    const all = [...structure, ...invariants];
    return {
        vocabulary: sensorVocabulary(),
        structure,
        invariants,
        totals: {
            declared: all.length,
            enforced: all.filter((row) => row.mode === 'enforced').length,
            advisoryPromotable: all.filter((row) => row.mode === 'advisory' && row.promotable).length,
            advisoryBlocked: all.filter((row) => row.mode === 'advisory' && !row.promotable).length,
            ambiguousIds: [...idCounts.values()].filter((count) => count > 1).length,
        },
        notAScore: true,
    };
}
/**
 * Ids close enough to be what the caller meant: a substring either way, so a
 * typo'd `types-onl` and an over-qualified `domain/types-only` both land.
 */
function suggestionsFor(focus, ids) {
    const needle = focus.toLowerCase();
    const near = ids.filter((id) => {
        const hay = id.toLowerCase();
        return hay.includes(needle) || needle.includes(hay);
    });
    return (near.length > 0 ? near : [...ids]).slice(0, 10);
}
/**
 * The key a finding is counted under: the document that declared the rule plus
 * the rule id. Both are stamped on every ArkRules finding (`arkruleSource` /
 * `arkruleId`), so this is the identity the gate itself uses.
 */
export function ruleCountKey(sourceFile, ruleId) {
    return `${sourceFile ?? ''}#${ruleId}`;
}
export function buildPromotionPreview(input) {
    const counts = input.countsByRuleKey ?? {};
    const analysis = input.analysis ?? {};
    const complete = analysis.completeness === undefined || analysis.completeness === 'complete';
    const countsTrustworthy = complete && analysis.teethDemotedByFloor !== true && analysis.scopeNarrowed !== true;
    const all = [...input.map.structure, ...input.map.invariants];
    const focus = typeof input.focus === 'string' && input.focus.length > 0 ? input.focus : null;
    const selected = focus ? all.filter((row) => row.id === focus) : all;
    const unknownFocus = focus != null && selected.length === 0;
    const rows = selected.map((row) => {
        const key = ruleCountKey(row.sourceFile, row.id);
        const currentFindings = Number.isFinite(counts[key]) ? Number(counts[key]) : 0;
        // The floor demotes every enforced extra-plane finding to a warning, so a
        // promotion made under it buys a label, not a tooth. Pricing it at N
        // "would start failing the gate" would be a promise the gate does not keep.
        const canBite = analysis.teethDemotedByFloor !== true;
        const wouldBlock = row.mode === 'advisory' && row.promotable && canBite ? currentFindings : 0;
        return {
            ...row,
            currentFindings,
            wouldBlock,
            // ambiguousId no longer poisons the COUNT (the key is per document), but
            // it still makes a write ambiguous, which applyPromotion refuses.
            countIsUnreliable: !complete || analysis.scopeNarrowed === true,
        };
    });
    return {
        focus,
        unknownFocus,
        ambiguousFocus: focus != null && selected.length > 1,
        suggestions: unknownFocus ? suggestionsFor(focus, all.map((row) => row.id)) : [],
        rows,
        analysis,
        countsTrustworthy,
        totals: {
            rules: rows.length,
            wouldBlock: rows.reduce((sum, row) => sum + row.wouldBlock, 0),
            cleanPromotions: rows.filter((row) => row.mode === 'advisory' &&
                row.promotable &&
                row.currentFindings === 0 &&
                !row.countIsUnreliable).length,
        },
        notAScore: true,
    };
}
/**
 * Indentation the author used, so an indented document keeps its shape.
 *
 * A minified single-line document has none to detect and comes back
 * pretty-printed at two spaces: the write is a JSON round-trip, not a targeted
 * text edit, so "the file is untouched apart from one field" is only true of a
 * document that was already indented.
 */
function detectIndent(text) {
    const match = /\n([ \t]+)"/.exec(text);
    if (!match)
        return 2;
    const found = match[1];
    return found.includes('\t') ? '\t' : found.length;
}
/**
 * Set `mode: "enforced"` on one rule inside an ArkRules document.
 *
 * Pure text in, pure text out: the caller owns the descriptor and the
 * containment checks. The write refuses anything it cannot do exactly — an
 * unparseable document, an id that is not there, an id that appears twice (the
 * contract rejects duplicates, so this only fires on a file that was never
 * loaded) — because a half-applied promotion is worse than none.
 */
export function promoteRuleInArkRulesText(text, ruleId, 
/**
 * The sensor this rule had when its promotion was priced. The file is read
 * again here, so a concurrent edit between the preview and the write could
 * have turned a Tier-1 rule into a Tier-2 one — and writing `enforced` onto
 * that produces a contract the loader then refuses, while the command reports
 * success. Passing it binds the write to the rule that was actually judged.
 */
expectedSensor) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (error) {
        return {
            ok: false,
            reason: `ArkRules document is not valid JSON (${error instanceof Error ? error.message : String(error)}).`,
        };
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, reason: 'ArkRules document is not a JSON object.' };
    }
    const doc = parsed;
    const matches = [];
    for (const key of ['structure', 'invariants']) {
        const list = doc[key];
        if (!Array.isArray(list))
            continue;
        for (const entry of list) {
            if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
                if (entry.id === ruleId) {
                    matches.push(entry);
                }
            }
        }
    }
    if (matches.length === 0) {
        return { ok: false, reason: `Rule ${JSON.stringify(ruleId)} is not declared in this file.` };
    }
    if (matches.length > 1) {
        return {
            ok: false,
            reason: `Rule ${JSON.stringify(ruleId)} appears ${matches.length} times in this file; refusing to guess which one to promote.`,
        };
    }
    const entry = matches[0];
    if (expectedSensor !== undefined && entry.sensor !== expectedSensor) {
        return {
            ok: false,
            reason: `Rule ${JSON.stringify(ruleId)} now uses sensor ${JSON.stringify(entry.sensor)}, not the ${JSON.stringify(expectedSensor)} its promotion was judged against — the file changed since the preview. Re-run the preview.`,
        };
    }
    if (entry.mode === 'enforced') {
        return { ok: false, reason: `Rule ${JSON.stringify(ruleId)} is already enforced.` };
    }
    entry.mode = 'enforced';
    const trailingNewline = text.endsWith('\n') ? '\n' : '';
    return {
        ok: true,
        text: `${JSON.stringify(doc, null, detectIndent(text))}${trailingNewline}`,
        reason: `Rule ${JSON.stringify(ruleId)} set to mode "enforced".`,
    };
}
