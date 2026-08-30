/**
 * Sensor promotability, as a declaration you can read before you pay for a run.
 *
 * Field measurement: on a real repository `ark-check` takes ~160s, and the only
 * way to learn whether a rule could be enforced was to edit the ArkRules JSON,
 * wait, read the result and `git checkout` it back. That loop ran four times
 * before the map was clear, and it still ended in a rejection that named a
 * vocabulary id the author had never typed: a rule called `types-only` on the
 * `no-anemic-model` sensor is refused with *"sensor \"no-anemic-model\" is
 * Tier-2 advisory-only"*, which does not say which of your rules is the
 * problem, which file it lives in, or that the answer was knowable before you
 * started.
 *
 * Everything here is a projection of two declarations — the closed sensor
 * vocabulary and the project's own ArkRules — plus, for invariants, the
 * coverage evidence that `canPromoteInvariant` already judges. Nothing is
 * executed, nothing is guessed, and every verdict carries the rule id, the
 * sensor it delegates to, the file it was declared in, and the reason.
 */

import { ARK_RULE_SENSORS, ARK_RULE_TIER2_SENSORS } from './arkRulesContract';
import { canPromoteInvariant } from './invariantCoverage';
import type { InvariantCoverageEvidence } from './invariantCoverage';
import { ARKRUN_TIER1_SENSOR_IDS } from './arkRunSensors';
import { ARKORDER_TIER1_SENSOR_IDS } from './arkOrderSensors';

export type ArkRuleModeName = 'advisory' | 'enforced';

/** Which contract plane a sensor belongs to. */
export type SensorPlane = 'arkrules' | 'arkrun' | 'arkorder' | 'unknown';

/**
 * Why a rule cannot be promoted. `null` means it can.
 *
 * - `tier-2-advisory-only` — the sensor is a Tier-2 heuristic (ADR 0013). The
 *   contract rejects `mode: "enforced"` for it, forever.
 * - `no-structure-teeth` — the sensor is declared in the closed vocabulary but
 *   emits no structure violations, so enforcing the structure entry would
 *   change nothing observable.
 * - `unknown-sensor` — not in the closed vocabulary. The loader fails closed on
 *   this, so it is unreachable through a valid contract; kept because a caller
 *   may hold an unvalidated entry.
 * - `no-coverage-evidence` — an invariant whose coverage evidence does not
 *   support promotion. The text comes from `canPromoteInvariant`, so this
 *   surface and the promotion gate can never disagree.
 */
export type PromotionBlocker =
  | 'tier-2-advisory-only'
  | 'no-structure-teeth'
  | 'unknown-sensor'
  | 'no-coverage-evidence';

export type SensorDescription = {
  sensor: string;
  plane: SensorPlane;
  tier: 1 | 2;
  promotable: boolean;
  blocker: PromotionBlocker | null;
  /** One line, always populated — for a promotable sensor too. */
  reason: string;
};

/**
 * The Tier-2 heuristic on the ArkRun plane (ADR 0022 D2).
 *
 * It is not in `ARKRUN_TIER1_SENSOR_IDS` because it is not evaluated at all —
 * `arkRunSensors.ts` says so in its header. Listing it here is the whole point
 * of this surface: a sensor you cannot promote should appear in the map, not go
 * missing from it, or the reader concludes it does not exist rather than that
 * it can never bite.
 */
const ARKRUN_TIER2_SENSOR_IDS: readonly string[] = ['arkrun-skip-resolve'];

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
const NO_TEETH_SENSORS: readonly string[] = ['invariant-coverage'];

function planeOf(sensor: string): SensorPlane | null {
  if ((ARK_RULE_SENSORS as readonly string[]).includes(sensor)) return 'arkrules';
  if (
    (ARKRUN_TIER1_SENSOR_IDS as readonly string[]).includes(sensor) ||
    ARKRUN_TIER2_SENSOR_IDS.includes(sensor)
  ) {
    return 'arkrun';
  }
  if ((ARKORDER_TIER1_SENSOR_IDS as readonly string[]).includes(sensor)) return 'arkorder';
  return null;
}

function isTier2(sensor: string): boolean {
  return (
    (ARK_RULE_TIER2_SENSORS as readonly string[]).includes(sensor) ||
    ARKRUN_TIER2_SENSOR_IDS.includes(sensor)
  );
}

const TIER2_ADR: Readonly<Record<string, string>> = {
  arkrules: 'ADR 0013',
  arkrun: 'ADR 0022',
  arkorder: 'ADR 0029',
};

/** The promotability of one sensor id, known before any rule is written. */
export function describeSensor(sensor: string): SensorDescription {
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
      reason: `Sensor ${JSON.stringify(sensor)} is Tier-2 (${
        TIER2_ADR[plane]
      }): a heuristic, advisory forever. No rule on this sensor can ever be promoted to enforced.`,
    };
  }
  if (NO_TEETH_SENSORS.includes(sensor)) {
    return {
      sensor,
      plane,
      tier: 1,
      promotable: false,
      blocker: 'no-structure-teeth',
      reason: `Sensor ${JSON.stringify(
        sensor
      )} emits no structure violations — invariant coverage is judged per entry in "invariants", not by a structure rule — so enforcing a structure rule on it buys no coverage tooth (only a zero-match "appliesTo" would still fail). Promote the invariant entry instead.`,
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
    reason:
      plane === 'arkrules'
        ? `Sensor ${JSON.stringify(
            sensor
          )} is Tier-1 (direct evidence) and can be enforced: set mode "enforced" on a rule that names it.`
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
export function sensorVocabulary(): SensorDescription[] {
  const ids: string[] = [
    ...(ARK_RULE_SENSORS as readonly string[]),
    ...(ARKRUN_TIER1_SENSOR_IDS as readonly string[]),
    ...ARKRUN_TIER2_SENSOR_IDS,
    ...(ARKORDER_TIER1_SENSOR_IDS as readonly string[]),
  ];
  return ids.map((sensor) => describeSensor(sensor));
}

export type DeclaredStructureRule = {
  id: string;
  sensor: string;
  mode: ArkRuleModeName;
  layer?: string | null;
  sourceFile?: string | null;
  description?: string | null;
};

export type DeclaredInvariantRule = {
  id: string;
  mode: ArkRuleModeName;
  layer?: string | null;
  sourceFile?: string | null;
  description?: string | null;
  /** From the coverage pass. Absent means coverage was never evaluated. */
  coverage?: InvariantCoverageEvidence;
};

/**
 * Rule ids are unique per ArkRules DOCUMENT, not across them: `validateSemantics`
 * keeps its `seen` set per file and `buildEffectiveArkRules` concatenates the
 * layers without a second check. Two layer files may therefore both declare
 * `shared-id`, and then a count keyed on the id alone belongs to neither of them
 * and a write targeting the id has two candidates. Every row says how many
 * declarations share its id so no caller can miss it.
 */
export type AmbiguityFields = {
  /** How many declared rules share this id. 1 for the ordinary case. */
  declarationsWithThisId: number;
  /** True when more than one does — the count and any write are ambiguous. */
  ambiguousId: boolean;
};

export type StructureRuleRow = AmbiguityFields & {
  kind: 'structure';
  id: string;
  sensor: string;
  tier: 1 | 2;
  mode: ArkRuleModeName;
  layer: string | null;
  sourceFile: string | null;
  description: string | null;
  promotable: boolean;
  blocker: PromotionBlocker | null;
  reason: string;
};

export type InvariantRuleRow = AmbiguityFields & {
  kind: 'invariant';
  id: string;
  mode: ArkRuleModeName;
  layer: string | null;
  sourceFile: string | null;
  description: string | null;
  promotable: boolean;
  blocker: PromotionBlocker | null;
  reason: string;
  /** True when no coverage evidence was supplied to this projection at all. */
  coverageEvaluated: boolean;
};

export type SensorMapRow = StructureRuleRow | InvariantRuleRow;

export type SensorMap = {
  vocabulary: SensorDescription[];
  structure: StructureRuleRow[];
  invariants: InvariantRuleRow[];
  totals: {
    declared: number;
    enforced: number;
    advisoryPromotable: number;
    advisoryBlocked: number;
    /** Ids declared more than once across the layer files. */
    ambiguousIds: number;
  };
  notAScore: true;
};

function nullable(value: string | null | undefined): string | null {
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
function locate(id: string, sourceFile: string | null): string {
  return sourceFile ? `Rule ${JSON.stringify(id)} (declared in ${sourceFile})` : `Rule ${JSON.stringify(id)}`;
}

export function buildSensorMap(input: {
  structure?: readonly DeclaredStructureRule[];
  invariants?: readonly DeclaredInvariantRule[];
}): SensorMap {
  const declaredStructure = input.structure ?? [];
  const declaredInvariants = input.invariants ?? [];
  // One pass to learn which ids are shared before any row is built: a row that
  // does not know it is one of two cannot warn anybody.
  const idCounts = new Map<string, number>();
  for (const rule of [...declaredStructure, ...declaredInvariants]) {
    idCounts.set(rule.id, (idCounts.get(rule.id) ?? 0) + 1);
  }
  const ambiguity = (id: string): AmbiguityFields => {
    const declarationsWithThisId = idCounts.get(id) ?? 1;
    return { declarationsWithThisId, ambiguousId: declarationsWithThisId > 1 };
  };

  const structure: StructureRuleRow[] = declaredStructure.map((rule) => {
    const sourceFile = nullable(rule.sourceFile);
    const sensor = describeSensor(rule.sensor);
    const reason = sensor.promotable
      ? `${locate(rule.id, sourceFile)} delegates to sensor ${JSON.stringify(
          rule.sensor
        )}, which is Tier-1 (direct evidence) and can be enforced.`
      : `${locate(rule.id, sourceFile)} delegates to sensor ${JSON.stringify(rule.sensor)}. ${
          sensor.reason
        }`;
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

  const invariants: InvariantRuleRow[] = declaredInvariants.map((rule) => {
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

  const all: SensorMapRow[] = [...structure, ...invariants];
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

export type PromotionPreviewRow = SensorMapRow & {
  /**
   * Findings this rule produces on the tree as it stands. Advisory rules are
   * already evaluated on every run, so the count comes from the SAME analysis
   * the caller just paid for — one run answers for every rule at once, which is
   * the point: the old loop was one full ~160s run per attempted promotion.
   */
  currentFindings: number;
  /**
   * What enforcing would cost: the findings that stop being warnings and start
   * failing the gate. Zero for a rule that is already enforced (they fail now),
   * zero for one that cannot be promoted, and zero while the classification
   * floor demotes every enforced ArkRules tooth — a promotion that cannot bite
   * yet must not be priced as though it would.
   */
  wouldBlock: number;
  /**
   * The count is not a fact about this rule alone. Set when the id is shared by
   * more than one declaration (the findings of all of them are pooled under it)
   * or when the analysis it came from was not complete.
   */
  countIsUnreliable: boolean;
};

/**
 * What the run that produced the counts could and could not see.
 *
 * A price computed from a partial analysis is not a price; printing it without
 * this is ArkGate's own limitation reported as a fact about the user's code,
 * which is the defect class this whole patch exists to remove.
 */
export type PromotionAnalysisContext = {
  /** `analyzed.completeness`. Anything but 'complete' undercounts. */
  completeness?: string;
  /** Why it was not complete, verbatim from the run. */
  completenessReasons?: readonly string[];
  /**
   * True when the classification floor is demoting enforced extra-plane teeth
   * (`extraMergeTeethAllowed` is false). Promotion then changes the label on a
   * finding, not whether the gate fails.
   */
  teethDemotedByFloor?: boolean;
  /** The scope was narrowed (e.g. --changed), so counts are not the whole tree. */
  scopeNarrowed?: boolean;
};

export type PromotionPreview = {
  focus: string | null;
  /** The focus id matched no declared rule. */
  unknownFocus: boolean;
  /** The focus id matched more than one declared rule. */
  ambiguousFocus: boolean;
  /** Declared ids offered back when the focus did not match. */
  suggestions: string[];
  rows: PromotionPreviewRow[];
  /** Echoed back so a JSON consumer sees what the numbers rest on. */
  analysis: PromotionAnalysisContext;
  /** True when nothing qualifies the counts: complete analysis, no floor, full scope. */
  countsTrustworthy: boolean;
  totals: {
    rules: number;
    wouldBlock: number;
    /** Rules that are advisory, promotable and currently produce nothing. */
    cleanPromotions: number;
  };
  notAScore: true;
};

/**
 * Ids close enough to be what the caller meant: a substring either way, so a
 * typo'd `types-onl` and an over-qualified `domain/types-only` both land.
 */
function suggestionsFor(focus: string, ids: readonly string[]): string[] {
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
export function ruleCountKey(sourceFile: string | null | undefined, ruleId: string): string {
  return `${sourceFile ?? ''}#${ruleId}`;
}

export function buildPromotionPreview(input: {
  map: SensorMap;
  /**
   * `<sourceFile>#<ruleId>` → findings that rule produced in the run just
   * completed. The bare id is NOT a key: ids are unique per document, so two
   * layer files declaring `shared-id` would pool their findings and each row
   * would report the other's as its own (measured: a 2x overstatement).
   */
  countsByRuleKey?: Readonly<Record<string, number>>;
  /** Restrict to one declared rule id. */
  focus?: string | null;
  analysis?: PromotionAnalysisContext;
}): PromotionPreview {
  const counts = input.countsByRuleKey ?? {};
  const analysis: PromotionAnalysisContext = input.analysis ?? {};
  const complete = analysis.completeness === undefined || analysis.completeness === 'complete';
  const countsTrustworthy =
    complete && analysis.teethDemotedByFloor !== true && analysis.scopeNarrowed !== true;
  const all: SensorMapRow[] = [...input.map.structure, ...input.map.invariants];
  const focus = typeof input.focus === 'string' && input.focus.length > 0 ? input.focus : null;
  const selected = focus ? all.filter((row) => row.id === focus) : all;
  const unknownFocus = focus != null && selected.length === 0;

  const rows: PromotionPreviewRow[] = selected.map((row) => {
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
    suggestions: unknownFocus ? suggestionsFor(focus as string, all.map((row) => row.id)) : [],
    rows,
    analysis,
    countsTrustworthy,
    totals: {
      rules: rows.length,
      wouldBlock: rows.reduce((sum, row) => sum + row.wouldBlock, 0),
      cleanPromotions: rows.filter(
        (row) =>
          row.mode === 'advisory' &&
          row.promotable &&
          row.currentFindings === 0 &&
          !row.countIsUnreliable
      ).length,
    },
    notAScore: true,
  };
}

export type PromoteTextResult = {
  ok: boolean;
  /** The file content to write. Absent when `ok` is false. */
  text?: string;
  reason: string;
};

/**
 * Indentation the author used, so an indented document keeps its shape.
 *
 * A minified single-line document has none to detect and comes back
 * pretty-printed at two spaces: the write is a JSON round-trip, not a targeted
 * text edit, so "the file is untouched apart from one field" is only true of a
 * document that was already indented.
 */
function detectIndent(text: string): string | number {
  const match = /\n([ \t]+)"/.exec(text);
  if (!match) return 2;
  const found = match[1] as string;
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
export function promoteRuleInArkRulesText(
  text: string,
  ruleId: string,
  /**
   * The sensor this rule had when its promotion was priced. The file is read
   * again here, so a concurrent edit between the preview and the write could
   * have turned a Tier-1 rule into a Tier-2 one — and writing `enforced` onto
   * that produces a contract the loader then refuses, while the command reports
   * success. Passing it binds the write to the rule that was actually judged.
   */
  expectedSensor?: string
): PromoteTextResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      reason: `ArkRules document is not valid JSON (${
        error instanceof Error ? error.message : String(error)
      }).`,
    };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'ArkRules document is not a JSON object.' };
  }
  const doc = parsed as Record<string, unknown>;
  const matches: Record<string, unknown>[] = [];
  for (const key of ['structure', 'invariants']) {
    const list = doc[key];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
        if ((entry as Record<string, unknown>).id === ruleId) {
          matches.push(entry as Record<string, unknown>);
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
      reason: `Rule ${JSON.stringify(
        ruleId
      )} appears ${matches.length} times in this file; refusing to guess which one to promote.`,
    };
  }
  const entry = matches[0] as Record<string, unknown>;
  if (expectedSensor !== undefined && entry.sensor !== expectedSensor) {
    return {
      ok: false,
      reason: `Rule ${JSON.stringify(ruleId)} now uses sensor ${JSON.stringify(
        entry.sensor
      )}, not the ${JSON.stringify(
        expectedSensor
      )} its promotion was judged against — the file changed since the preview. Re-run the preview.`,
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
