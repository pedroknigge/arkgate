import { describe, expect, it } from 'vitest';

import {
  buildPromotionPreview,
  buildSensorMap,
  describeSensor,
  promoteRuleInArkRulesText,
  ruleCountKey,
  sensorVocabulary,
} from '../../../src/domain/sensorPromotion';
import { ARK_RULE_SENSORS, ARK_RULE_TIER2_SENSORS } from '../../../src/domain/arkRulesContract';
import { ARKRUN_TIER1_SENSOR_IDS } from '../../../src/domain/arkRunSensors';
import { ARKORDER_TIER1_SENSOR_IDS } from '../../../src/domain/arkOrderSensors';
import type { InvariantCoverageEvidence } from '../../../src/domain/invariantCoverage';

const covered: InvariantCoverageEvidence = {
  invariantId: 'INV-ONE',
  layer: 'DomainModel',
  sourceFile: 'arkrules/DomainModel.json',
  mode: 'advisory',
  covered: true,
  evidence: ['test-title'],
  partial: false,
  description: 'one',
};

describe('sensorPromotion vocabulary', () => {
  it('covers every sensor of every plane, so nothing is missing from the map', () => {
    const ids = sensorVocabulary().map((entry) => entry.sensor);
    for (const sensor of ARK_RULE_SENSORS) expect(ids).toContain(sensor);
    for (const sensor of ARKRUN_TIER1_SENSOR_IDS) expect(ids).toContain(sensor);
    for (const sensor of ARKORDER_TIER1_SENSOR_IDS) expect(ids).toContain(sensor);
    // The unevaluated ArkRun tier-2 heuristic must appear too: absent from the
    // map, a reader concludes it does not exist rather than that it can never
    // bite.
    expect(ids).toContain('arkrun-skip-resolve');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks every Tier-2 sensor never-promotable and says why', () => {
    for (const sensor of ARK_RULE_TIER2_SENSORS) {
      const entry = describeSensor(sensor);
      expect(entry.tier).toBe(2);
      expect(entry.promotable).toBe(false);
      expect(entry.blocker).toBe('tier-2-advisory-only');
      expect(entry.reason).toContain(sensor);
    }
    expect(describeSensor('arkrun-skip-resolve').blocker).toBe('tier-2-advisory-only');
  });

  it('refuses to sell a tooth that does not exist for invariant-coverage', () => {
    // The schema accepts mode "enforced" on a structure entry naming this
    // sensor, but evaluateArkRuleSensors has no case that emits for it.
    const entry = describeSensor('invariant-coverage');
    expect(entry.promotable).toBe(false);
    expect(entry.blocker).toBe('no-structure-teeth');
  });

  it('reports a sensor outside every vocabulary as unknown, not as promotable', () => {
    const entry = describeSensor('not-a-sensor');
    expect(entry.promotable).toBe(false);
    expect(entry.blocker).toBe('unknown-sensor');
  });

  it('pins the exact blocked set, so a sensor cannot quietly lose its teeth', () => {
    // toBeGreaterThan(10) would still pass with eight sensors regressed to
    // blocked — the exact regression this surface exists to catch.
    const vocabulary = sensorVocabulary();
    expect(vocabulary.filter((entry) => !entry.promotable).map((entry) => entry.sensor)).toEqual([
      'no-anemic-model',
      'invariant-coverage',
      'arkrun-skip-resolve',
    ]);
    expect(vocabulary).toHaveLength(
      ARK_RULE_SENSORS.length + ARKRUN_TIER1_SENSOR_IDS.length + 1 + ARKORDER_TIER1_SENSOR_IDS.length
    );
    expect(vocabulary.filter((entry) => entry.promotable).every((entry) => entry.tier === 1)).toBe(
      true
    );
  });

  it('says HOW each plane is promoted, not just that it can be', () => {
    // ArkRun and ArkOrder are switched by one plane-level `mode`; --promote
    // --apply writes ArkRules documents only. "can be enforced" alone answers
    // in a currency this surface cannot spend.
    expect(describeSensor('thin-adapter').reason).toContain('set mode "enforced" on a rule');
    expect(describeSensor('arkrun-direct-new').reason).toContain('arkrun.mode');
    expect(describeSensor('arkorder-generic-update').reason).toContain('arkorder.mode');
  });

  it('does not file an unknown sensor under a real plane', () => {
    const entry = describeSensor('not-a-sensor');
    expect(entry.plane).toBe('unknown');
    expect(entry.tier).toBe(2);
  });
});

describe('sensorPromotion buildSensorMap', () => {
  it('names the rule the author wrote, not only the sensor it delegates to', () => {
    // The field defect: a rule called "types-only" was refused with an error
    // naming "no-anemic-model", an id the author never typed.
    const map = buildSensorMap({
      structure: [
        {
          id: 'types-only',
          sensor: 'no-anemic-model',
          mode: 'advisory',
          layer: 'DomainModel',
          sourceFile: 'arkrules/DomainModel.json',
        },
      ],
    });
    const row = map.structure[0]!;
    expect(row.promotable).toBe(false);
    expect(row.reason).toContain('"types-only"');
    expect(row.reason).toContain('arkrules/DomainModel.json');
    expect(row.reason).toContain('no-anemic-model');
  });

  it('delegates invariant promotability to canPromoteInvariant, verbatim', () => {
    const map = buildSensorMap({
      invariants: [
        { id: 'INV-ONE', mode: 'advisory', sourceFile: 'a.json', coverage: covered },
        { id: 'INV-TWO', mode: 'advisory', sourceFile: 'a.json' },
        {
          id: 'INV-THREE',
          mode: 'advisory',
          sourceFile: 'a.json',
          coverage: {
            ...covered,
            invariantId: 'INV-THREE',
            outsideDeclaredRoots: true,
            testEvidenceFile: 'scratch/x.test.ts',
          },
        },
      ],
    });
    expect(map.invariants[0]!.promotable).toBe(true);
    expect(map.invariants[1]!.promotable).toBe(false);
    expect(map.invariants[1]!.coverageEvaluated).toBe(false);
    expect(map.invariants[2]!.promotable).toBe(false);
    expect(map.invariants[2]!.reason).toContain('outside the declared coverage roots');
  });

  it('counts advisory-promotable against advisory-blocked without scoring', () => {
    const map = buildSensorMap({
      structure: [
        { id: 'a', sensor: 'thin-adapter', mode: 'advisory' },
        { id: 'b', sensor: 'no-anemic-model', mode: 'advisory' },
        { id: 'c', sensor: 'thin-adapter', mode: 'enforced' },
      ],
    });
    expect(map.totals).toEqual({
      declared: 3,
      enforced: 1,
      advisoryPromotable: 1,
      advisoryBlocked: 1,
      ambiguousIds: 0,
    });
    expect(map.notAScore).toBe(true);
  });

  it('flags an id declared in more than one document', () => {
    // Ids are unique per ArkRules DOCUMENT: validateSemantics keeps its `seen`
    // set per file and buildEffectiveArkRules concatenates the layers without a
    // second check, so two files may both declare `dup`.
    const map = buildSensorMap({
      structure: [
        { id: 'dup', sensor: 'thin-adapter', mode: 'advisory', sourceFile: 'a.json' },
        { id: 'dup', sensor: 'thin-adapter', mode: 'advisory', sourceFile: 'b.json' },
        { id: 'solo', sensor: 'thin-adapter', mode: 'advisory', sourceFile: 'a.json' },
      ],
    });
    expect(map.structure.map((row) => row.ambiguousId)).toEqual([true, true, false]);
    expect(map.structure[0]!.declarationsWithThisId).toBe(2);
    expect(map.totals.ambiguousIds).toBe(1);
  });
});

describe('sensorPromotion buildPromotionPreview', () => {
  const map = buildSensorMap({
    structure: [
      { id: 'thin', sensor: 'thin-adapter', mode: 'advisory', sourceFile: 'a.json' },
      { id: 'tier2', sensor: 'no-anemic-model', mode: 'advisory', sourceFile: 'a.json' },
      { id: 'already', sensor: 'thin-adapter', mode: 'enforced', sourceFile: 'a.json' },
    ],
  });

  it('charges promotion only for a rule that is advisory AND promotable', () => {
    const preview = buildPromotionPreview({
      map,
      countsByRuleKey: {
        [ruleCountKey('a.json', 'thin')]: 7,
        [ruleCountKey('a.json', 'tier2')]: 4,
        [ruleCountKey('a.json', 'already')]: 3,
      },
    });
    const byId = Object.fromEntries(preview.rows.map((row) => [row.id, row]));
    expect(byId.thin!.wouldBlock).toBe(7);
    // A Tier-2 rule keeps producing warnings forever; promoting it is not on
    // offer, so it costs nothing to promote.
    expect(byId.tier2!.wouldBlock).toBe(0);
    expect(byId.tier2!.currentFindings).toBe(4);
    // An enforced rule already fails the gate; its findings are not a future cost.
    expect(byId.already!.wouldBlock).toBe(0);
    expect(preview.totals.wouldBlock).toBe(7);
  });

  it('counts a promotable rule with no findings as a free promotion', () => {
    const preview = buildPromotionPreview({ map, countsByRuleKey: {} });
    expect(preview.totals.cleanPromotions).toBe(1);
  });

  it('keys the count per document, so a shared id does not pool two rules', () => {
    // Measured before the fix: two files declaring `dup` with one finding each
    // reported 2 on BOTH rows and a total of 4 — each row showing the other's
    // findings as its own.
    const shared = buildSensorMap({
      structure: [
        { id: 'dup', sensor: 'thin-adapter', mode: 'advisory', sourceFile: 'a.json' },
        { id: 'dup', sensor: 'thin-adapter', mode: 'advisory', sourceFile: 'b.json' },
      ],
    });
    const preview = buildPromotionPreview({
      map: shared,
      countsByRuleKey: {
        [ruleCountKey('a.json', 'dup')]: 1,
        [ruleCountKey('b.json', 'dup')]: 1,
      },
    });
    expect(preview.rows.map((row) => row.currentFindings)).toEqual([1, 1]);
    expect(preview.totals.wouldBlock).toBe(2);
    expect(preview.ambiguousFocus).toBe(false);
    expect(buildPromotionPreview({ map: shared, focus: 'dup' }).ambiguousFocus).toBe(true);
  });

  it('prices nothing while the classification floor demotes every enforced tooth', () => {
    // Reproduced end to end before the fix: the preview promised "1 advisory
    // finding would start failing the gate", --apply wrote enforced, and the
    // very next run printed the violation AND "Ark check passed", exit 0.
    const preview = buildPromotionPreview({
      map,
      countsByRuleKey: { [ruleCountKey('a.json', 'thin')]: 7 },
      analysis: { teethDemotedByFloor: true },
    });
    const thin = preview.rows.find((row) => row.id === 'thin')!;
    expect(thin.currentFindings).toBe(7);
    expect(thin.wouldBlock).toBe(0);
    expect(preview.countsTrustworthy).toBe(false);
  });

  it('refuses to call a partial analysis a price', () => {
    const preview = buildPromotionPreview({
      map,
      countsByRuleKey: {},
      analysis: { completeness: 'partial', completenessReasons: ['parse diagnostics'] },
    });
    expect(preview.countsTrustworthy).toBe(false);
    expect(preview.rows.every((row) => row.countIsUnreliable)).toBe(true);
    // A zero out of a run that could not see everything is not a free promotion.
    expect(preview.totals.cleanPromotions).toBe(0);
  });

  it('treats a complete, unnarrowed, unfloored run as trustworthy', () => {
    const preview = buildPromotionPreview({
      map,
      countsByRuleKey: {},
      analysis: { completeness: 'complete' },
    });
    expect(preview.countsTrustworthy).toBe(true);
    expect(preview.rows.every((row) => !row.countIsUnreliable)).toBe(true);
  });

  it('offers the whole id list when nothing is near the focus', () => {
    const preview = buildPromotionPreview({ map, focus: 'zzzz' });
    expect(preview.unknownFocus).toBe(true);
    expect(preview.suggestions).toEqual(['thin', 'tier2', 'already']);
  });

  it('reads a non-numeric count as zero rather than NaN', () => {
    const preview = buildPromotionPreview({
      map,
      countsByRuleKey: { [ruleCountKey('a.json', 'thin')]: Number.NaN },
      focus: 'thin',
    });
    expect(preview.rows[0]!.currentFindings).toBe(0);
  });

  it('offers near ids back rather than a bare miss', () => {
    const preview = buildPromotionPreview({ map, focus: 'thi' });
    expect(preview.unknownFocus).toBe(true);
    expect(preview.suggestions).toContain('thin');
    expect(preview.rows).toEqual([]);
  });

  it('narrows to one rule when focused', () => {
    const preview = buildPromotionPreview({
      map,
      focus: 'thin',
      countsByRuleKey: { [ruleCountKey('a.json', 'thin')]: 2 },
    });
    expect(preview.unknownFocus).toBe(false);
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]!.wouldBlock).toBe(2);
  });
});

describe('sensorPromotion promoteRuleInArkRulesText', () => {
  const doc = JSON.stringify(
    {
      schemaVersion: '1.0',
      layer: 'DomainModel',
      structure: [{ id: 'thin', sensor: 'thin-adapter', mode: 'advisory' }],
      invariants: [{ id: 'INV-ONE', description: 'one' }],
    },
    null,
    2
  );

  it('sets mode enforced and keeps the trailing newline the author had', () => {
    const result = promoteRuleInArkRulesText(`${doc}\n`, 'thin');
    expect(result.ok).toBe(true);
    expect(result.text!.endsWith('\n')).toBe(true);
    expect(JSON.parse(result.text!).structure[0].mode).toBe('enforced');
  });

  it('promotes an invariant entry that never declared a mode', () => {
    const result = promoteRuleInArkRulesText(doc, 'INV-ONE');
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.text!).invariants[0].mode).toBe('enforced');
  });

  it('refuses an id it cannot find, an id already enforced, and an unparseable file', () => {
    expect(promoteRuleInArkRulesText(doc, 'nope').ok).toBe(false);
    expect(promoteRuleInArkRulesText(doc, 'nope').reason).toContain('not declared');
    const enforced = promoteRuleInArkRulesText(doc, 'thin').text!;
    expect(promoteRuleInArkRulesText(enforced, 'thin').reason).toContain('already enforced');
    expect(promoteRuleInArkRulesText('{oops', 'thin').ok).toBe(false);
    expect(promoteRuleInArkRulesText('[]', 'thin').ok).toBe(false);
  });

  it('refuses a duplicated id rather than guess which entry to promote', () => {
    const dup = JSON.stringify({
      structure: [
        { id: 'thin', sensor: 'thin-adapter' },
        { id: 'thin', sensor: 'orchestration-only' },
      ],
    });
    const result = promoteRuleInArkRulesText(dup, 'thin');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('appears 2 times');
  });

  it('refuses to write onto a rule whose sensor changed since it was priced', () => {
    // The file is read again inside the writer, so an edit landing between the
    // preview and the write could turn a Tier-1 rule into a Tier-2 one — and
    // "enforced" on that is a contract the loader then refuses, while the
    // command reports success.
    const result = promoteRuleInArkRulesText(doc, 'thin', 'no-anemic-model');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('the file changed since the preview');
    expect(promoteRuleInArkRulesText(doc, 'thin', 'thin-adapter').ok).toBe(true);
  });

  it('does not reformat a tab-indented document into spaces', () => {
    const tabbed = '{\n\t"structure": [\n\t\t{ "id": "thin", "sensor": "thin-adapter" }\n\t]\n}';
    const result = promoteRuleInArkRulesText(tabbed, 'thin');
    expect(result.ok).toBe(true);
    expect(result.text!).toContain('\n\t"structure"');
  });
});
