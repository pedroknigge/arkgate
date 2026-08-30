/**
 * ACS02 — public diagnostic code catalog + remediation/docs parity.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DIAGNOSTIC_CATALOG,
  DIAGNOSTIC_CATALOG_SCHEMA_VERSION,
  DIAGNOSTIC_DOCS_RELATIVE_PATH,
  DIAGNOSTIC_RULE_IDS,
  catalogFixForRuleId,
  catalogWhyForRuleId,
  diagnosticDocsFragment,
  diagnosticDocsPath,
  getDiagnosticCatalogEntry,
  isCataloguedOrArkRuleFamily,
  isKnownDiagnosticCode,
  serializeDiagnosticCatalog,
} from '../../../src/domain/diagnosticCatalog';
import {
  classifyRemediation,
  deterministicNextAction,
  enrichViolationWithFixClass,
} from '../../../src/domain/remediation';
import { ARKRUN_RULE_IDS } from '../../../src/domain/arkRunSensors';
import { ARKORDER_RULE_IDS } from '../../../src/domain/arkOrderSensors';
import {
  DIAGNOSTIC_CATALOG as cliCatalog,
  DIAGNOSTIC_RULE_IDS as cliRuleIds,
  getDiagnosticCatalogEntry as cliGetEntry,
  isKnownDiagnosticCode as cliIsKnown,
  serializeDiagnosticCatalog as cliSerialize,
} from '../../../bin/lib/diagnostic-catalog.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/** ruleIds with dedicated branches in remediation / adapter nextAction. */
const REMEDIATION_SPECIALIZED_RULE_IDS = [
  'LAYER_IMPORT_VIOLATION',
  'FORBIDDEN_GLOBAL',
  'CAPABILITY_VIOLATION',
  'CIRCULAR_DEPENDENCY',
  'RAW_EVENT_PUBLISH',
  'PUBLISH_MISSING_SOURCE',
  'PUBLISH_SOURCE_LAYER_MISMATCH',
  'LAYER_INTENT_REFERENCE_VIOLATION',
  'ARKRULE_STRUCTURE',
  'ARKRULE_INVARIANT',
  'INVARIANT_UNCOVERED',
  'ARKRUN_MISSING_ROOT',
  'ARKRUN_KERNEL_IN_DOMAIN',
  'ARKRUN_DIRECT_NEW',
  'ARKRUN_UNDECLARED_EMIT',
  'ARKRUN_UNDECLARED_HANDLE',
  'ARKRUN_UNDECLARED_DEPEND',
  'ARKRUN_TRANSPORT_BYPASS',
  'ARKORDER_MISSING_PLANE',
  'ARKORDER_KERNEL_IN_DOMAIN',
  'ARKORDER_GENERIC_UPDATE',
  'ARKORDER_TOO_MANY_PARAMS',
  'ARKORDER_INGEST_WRITES_XI',
  'ARKORDER_XI_FIELD_WRITE',
] as const;

const ARKRUN_CATALOG_RULE_IDS = [
  'ARKRUN_MISSING_ROOT',
  'ARKRUN_KERNEL_IN_DOMAIN',
  'ARKRUN_DIRECT_NEW',
  'ARKRUN_UNDECLARED_EMIT',
  'ARKRUN_UNDECLARED_HANDLE',
  'ARKRUN_UNDECLARED_DEPEND',
  'ARKRUN_TRANSPORT_BYPASS',
] as const;

describe('diagnosticCatalog (Domain — ACS02)', () => {
  it('exposes schema 1.0 and a non-empty closed catalog', () => {
    expect(DIAGNOSTIC_CATALOG_SCHEMA_VERSION).toBe('1.0');
    expect(DIAGNOSTIC_DOCS_RELATIVE_PATH).toBe('docs/diagnostics.md');
    expect(DIAGNOSTIC_CATALOG.length).toBeGreaterThan(40);
    expect(DIAGNOSTIC_RULE_IDS).toHaveLength(DIAGNOSTIC_CATALOG.length);
  });

  it('has unique ruleIds and docsAnchors equal to ruleId', () => {
    const seen = new Set<string>();
    for (const entry of DIAGNOSTIC_CATALOG) {
      expect(entry.ruleId.length).toBeGreaterThan(0);
      expect(entry.docsAnchor).toBe(entry.ruleId);
      expect(entry.why.length).toBeGreaterThan(20);
      expect(entry.fix.length).toBeGreaterThan(20);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(seen.has(entry.ruleId)).toBe(false);
      seen.add(entry.ruleId);
    }
  });

  it('looks up entries and docs paths', () => {
    expect(isKnownDiagnosticCode('LAYER_IMPORT_VIOLATION')).toBe(true);
    expect(isKnownDiagnosticCode('NOT_A_REAL_CODE')).toBe(false);
    expect(isKnownDiagnosticCode('')).toBe(false);
    expect(isKnownDiagnosticCode(undefined)).toBe(false);

    const entry = getDiagnosticCatalogEntry('FORBIDDEN_GLOBAL');
    expect(entry?.category).toBe('capability');
    expect(catalogWhyForRuleId('FORBIDDEN_GLOBAL')).toContain('forbiddenGlobals');
    expect(catalogFixForRuleId('FORBIDDEN_GLOBAL')).toMatch(/port/i);

    expect(diagnosticDocsFragment('LAYER_IMPORT_VIOLATION')).toBe('#LAYER_IMPORT_VIOLATION');
    expect(diagnosticDocsPath('LAYER_IMPORT_VIOLATION')).toBe(
      'docs/diagnostics.md#LAYER_IMPORT_VIOLATION'
    );
  });

  it('treats ARKRULE_* family as catalogued-or-family for agent routing', () => {
    expect(isCataloguedOrArkRuleFamily('ARKRULE_STRUCTURE')).toBe(true);
    expect(isCataloguedOrArkRuleFamily('ARKRULE_FUTURE_SENSOR')).toBe(true);
    expect(isCataloguedOrArkRuleFamily('ARKRUN_MISSING_ROOT')).toBe(true);
    expect(isCataloguedOrArkRuleFamily('ARKRUN_FUTURE_SENSOR')).toBe(false);
    expect(isCataloguedOrArkRuleFamily('LAYER_IMPORT_VIOLATION')).toBe(true);
    expect(isCataloguedOrArkRuleFamily('MADE_UP')).toBe(false);
  });

  it('serializes a stable snapshot shape', () => {
    const snap = serializeDiagnosticCatalog();
    expect(snap.schemaVersion).toBe('1.0');
    expect(snap.docsPath).toBe('docs/diagnostics.md');
    expect(snap.codes).toHaveLength(DIAGNOSTIC_CATALOG.length);
    expect(snap.codes[0]?.ruleId).toBe(DIAGNOSTIC_CATALOG[0]?.ruleId);
  });

  it('CLI pure artifact matches Domain catalog ruleIds', () => {
    expect([...cliRuleIds]).toEqual([...DIAGNOSTIC_RULE_IDS]);
    expect(cliCatalog).toHaveLength(DIAGNOSTIC_CATALOG.length);
    expect(cliIsKnown('CAPABILITY_VIOLATION')).toBe(true);
    expect(cliGetEntry('CIRCULAR_DEPENDENCY')?.ruleId).toBe('CIRCULAR_DEPENDENCY');
    expect(cliSerialize().schemaVersion).toBe(DIAGNOSTIC_CATALOG_SCHEMA_VERSION);
  });
});

describe('diagnosticCatalog ↔ remediation parity', () => {
  it('every remediation-specialized ruleId is catalogued', () => {
    for (const ruleId of REMEDIATION_SPECIALIZED_RULE_IDS) {
      expect(isKnownDiagnosticCode(ruleId), ruleId).toBe(true);
    }
  });

  it('deterministicNextAction for simple codes stays aligned with catalog intent', () => {
    // Exact string match for codes whose nextAction is not template-heavy.
    const exact: Array<{ ruleId: string; nextAction: string }> = [
      {
        ruleId: 'RAW_EVENT_PUBLISH',
        nextAction: 'Publish through a registered intent creator, then run Ark again.',
      },
      {
        ruleId: 'PUBLISH_MISSING_SOURCE',
        nextAction: 'Add metadata.source to the publish call, then run Ark again.',
      },
      {
        ruleId: 'CIRCULAR_DEPENDENCY',
        nextAction:
          'Extract the shared dependency into a third module, test at the public interface, then preflight again.',
      },
    ];
    for (const row of exact) {
      expect(deterministicNextAction({ ruleId: row.ruleId })).toBe(row.nextAction);
      // Catalog fix must mention the same primary verb/topic as live nextAction.
      const fix = catalogFixForRuleId(row.ruleId)!;
      expect(fix.toLowerCase()).toContain(
        row.ruleId === 'CIRCULAR_DEPENDENCY' ? 'extract' : row.ruleId === 'RAW_EVENT_PUBLISH' ? 'publish' : 'metadata.source'
      );
    }

    expect(deterministicNextAction({ ruleId: 'FORBIDDEN_GLOBAL', target: 'fetch' })).toContain(
      'fetch'
    );
    expect(catalogFixForRuleId('FORBIDDEN_GLOBAL')).toMatch(/port/i);

    expect(
      deterministicNextAction({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        fromLayer: 'DomainModel',
        toLayer: 'PersistenceAdapters',
      })
    ).toMatch(/port/i);
    expect(catalogFixForRuleId('LAYER_IMPORT_VIOLATION')).toMatch(/port/i);
  });

  it('enrich + classify still run for every specialized ruleId (no throw)', () => {
    for (const ruleId of REMEDIATION_SPECIALIZED_RULE_IDS) {
      const v = { ruleId };
      expect(classifyRemediation(v).class).toMatch(/mechanical-safe|judgment|deferred/);
      const enriched = enrichViolationWithFixClass(v);
      expect(enriched.nextAction.length).toBeGreaterThan(0);
      expect(enriched.fixClass.length).toBeGreaterThan(0);
    }
  });

  it('unknown free-form codes are not catalogued; remediation still returns a nextAction', () => {
    expect(isKnownDiagnosticCode('INVENTED_AGENT_CODE')).toBe(false);
    const next = deterministicNextAction({ ruleId: 'INVENTED_AGENT_CODE' });
    expect(next).toContain('INVENTED_AGENT_CODE');
  });
});

describe('RN05 ArkRun catalog ↔ remediation parity', () => {
  it('catalogues the closed ARKRUN_* set (no prefix family)', () => {
    expect(Object.values(ARKRUN_RULE_IDS)).toEqual([...ARKRUN_CATALOG_RULE_IDS]);
    const arkrun = DIAGNOSTIC_CATALOG.filter((entry) => entry.category === 'arkrun');
    expect(arkrun.map((entry) => entry.ruleId)).toEqual([...ARKRUN_CATALOG_RULE_IDS]);
    expect(isCataloguedOrArkRuleFamily('ARKRUN_FUTURE_SENSOR')).toBe(false);
    for (const ruleId of ARKRUN_CATALOG_RULE_IDS) {
      expect(isKnownDiagnosticCode(ruleId), ruleId).toBe(true);
      expect(catalogWhyForRuleId(ruleId)?.length ?? 0).toBeGreaterThan(20);
      expect(catalogFixForRuleId(ruleId)?.length ?? 0).toBeGreaterThan(20);
    }
  });

  it('no-target nextAction matches catalog fix exactly', () => {
    for (const ruleId of ARKRUN_CATALOG_RULE_IDS) {
      expect(deterministicNextAction({ ruleId }), ruleId).toBe(catalogFixForRuleId(ruleId));
    }
  });

  it('live nextAction interpolates target without dropping catalog intent', () => {
    const cases: Array<{ ruleId: string; target: string; verb: string }> = [
      { ruleId: 'ARKRUN_MISSING_ROOT', target: 'src/main.ts', verb: 'createStrictArkKernel' },
      { ruleId: 'ARKRUN_KERNEL_IN_DOMAIN', target: '@arkgate/runtime', verb: '@arkgate/runtime' },
      { ruleId: 'ARKRUN_DIRECT_NEW', target: 'OrderService', verb: 'Resolve' },
      { ruleId: 'ARKRUN_UNDECLARED_EMIT', target: 'Domain.Order.Placed', verb: 'raises' },
      { ruleId: 'ARKRUN_UNDECLARED_HANDLE', target: 'Domain.Order.Placed', verb: 'reactsTo' },
      { ruleId: 'ARKRUN_UNDECLARED_DEPEND', target: 'OrderService', verb: 'uses' },
      { ruleId: 'ARKRUN_TRANSPORT_BYPASS', target: 'events', verb: 'kernel transport' },
    ];
    for (const row of cases) {
      const next = deterministicNextAction({ ruleId: row.ruleId, target: row.target });
      expect(next, row.ruleId).toContain(row.target);
      expect(next.toLowerCase(), row.ruleId).toContain(row.verb.toLowerCase());
      expect(next, row.ruleId).not.toBe(catalogFixForRuleId(row.ruleId));
    }
  });

  it('undeclared call-site literals are mechanical-safe; missing target and other sensors stay judgment', () => {
    for (const ruleId of [
      'ARKRUN_UNDECLARED_EMIT',
      'ARKRUN_UNDECLARED_HANDLE',
      'ARKRUN_UNDECLARED_DEPEND',
    ] as const) {
      const safe = classifyRemediation({ ruleId, target: 'Domain.Order.Placed' });
      expect(safe.class, ruleId).toBe('mechanical-safe');
      expect(safe.remediationKind, ruleId).toBe('arkrun-declaration-list');
      expect(classifyRemediation({ ruleId }).class, `${ruleId} no target`).toBe('judgment');
    }
    for (const ruleId of [
      'ARKRUN_MISSING_ROOT',
      'ARKRUN_KERNEL_IN_DOMAIN',
      'ARKRUN_DIRECT_NEW',
      'ARKRUN_TRANSPORT_BYPASS',
    ] as const) {
      expect(classifyRemediation({ ruleId, target: 'src/main.ts' }).class, ruleId).toBe('judgment');
      expect(classifyRemediation({ ruleId }).remediationKind, ruleId).toBeUndefined();
    }
  });

  it('enrich dual-depth: enthusiastHint (casual) + nextAction (engineer) + arkrun-usage', () => {
    for (const ruleId of ARKRUN_CATALOG_RULE_IDS) {
      const enriched = enrichViolationWithFixClass({
        ruleId,
        target: 'Domain.Order.Placed',
        fromLayer: 'ApplicationOrchestration',
      });
      expect(enriched.fixClass, ruleId).toBe('arkrun-usage');
      expect(enriched.enthusiastHint.length, ruleId).toBeGreaterThan(20);
      expect(enriched.nextAction, ruleId).toBe(
        deterministicNextAction({
          ruleId,
          target: 'Domain.Order.Placed',
          fromLayer: 'ApplicationOrchestration',
        })
      );
      expect(enriched.enthusiastHint, ruleId).not.toBe(enriched.nextAction);
      expect(enriched.nextAction.toLowerCase(), ruleId).not.toMatch(/\bscore\b|excellent|good rank/);
      expect(enriched.enthusiastHint.toLowerCase(), ruleId).not.toMatch(/\bscore\b/);
    }
    expect(
      enrichViolationWithFixClass({ ruleId: 'ARKRUN_UNDECLARED_EMIT', target: 'X' }).effort
    ).toBe('small');
    expect(enrichViolationWithFixClass({ ruleId: 'ARKRUN_DIRECT_NEW' }).effort).toBe('medium');
  });

  it('catalog copy teaches arkgate/runtime and deprecates the companion', () => {
    expect(catalogFixForRuleId('ARKRUN_MISSING_ROOT')).toContain('arkgate/runtime');
    expect(catalogFixForRuleId('ARKRUN_MISSING_ROOT')).toContain('@arkgate/runtime is deprecated');
    expect(catalogFixForRuleId('ARKRUN_KERNEL_IN_DOMAIN')).toContain('arkgate/runtime');
  });
});

describe('diagnosticCatalog ↔ docs anchors', () => {
  it('docs/diagnostics.md contains an HTML id anchor for every catalog entry', () => {
    const docs = readFileSync(join(repoRoot, DIAGNOSTIC_DOCS_RELATIVE_PATH), 'utf8');
    for (const entry of DIAGNOSTIC_CATALOG) {
      expect(docs, entry.ruleId).toContain(`id="${entry.docsAnchor}"`);
      expect(docs, entry.ruleId).toContain(entry.ruleId);
    }
  });
});

const PRODUCTION_FIXTURE_PATH = 'tests/fixtures/diagnostic-catalog/production-rule-ids.json';

/** ruleIds the fixture claims are production-emitted. */
function productionFixtureRuleIds(): string[] {
  const fixture = JSON.parse(readFileSync(join(repoRoot, PRODUCTION_FIXTURE_PATH), 'utf8')) as {
    ruleIds: string[];
  };
  return fixture.ruleIds;
}

describe('diagnosticCatalog ↔ production ruleId fixture', () => {
  it('forbids unknown codes on the production fixture list', () => {
    const ruleIds = productionFixtureRuleIds();
    expect(ruleIds.length).toBeGreaterThan(30);

    const missing = ruleIds.filter((ruleId) => !isKnownDiagnosticCode(ruleId));
    expect(missing, `unknown production ruleIds: ${missing.join(', ')}`).toEqual([]);
  });

  it('fixture does not silently drop catalog codes (every catalogued id listed)', () => {
    // Both pre-existing assertions run fixture → catalog, so a production-emitted id
    // added to the catalog and forgotten in the fixture could not fail anything.
    // ARKORDER_XI_FIELD_WRITE sat in exactly that hole. This closes the direction.
    const listed = new Set(productionFixtureRuleIds());
    const unlisted = DIAGNOSTIC_RULE_IDS.filter((ruleId) => !listed.has(ruleId));
    expect(
      unlisted,
      `catalogued ruleIds missing from the production fixture: ${unlisted.join(', ')}`
    ).toEqual([]);
  });

  it('every sensor-mapped ruleId is on the production fixture list', () => {
    // This is the direction that speaks about EMISSION rather than about the catalog
    // mirroring itself: a sensor that maps to a ruleId is a production emitter.
    const listed = new Set(productionFixtureRuleIds());
    const emitted = [...Object.values(ARKORDER_RULE_IDS), ...Object.values(ARKRUN_RULE_IDS)];
    // Floor guards against Object.values() going empty after a refactor of either map.
    expect(emitted.length).toBeGreaterThan(10);
    const missing = emitted.filter((ruleId) => !listed.has(ruleId));
    expect(missing, `sensor ruleIds missing from the fixture: ${missing.join(', ')}`).toEqual([]);
  });

  it('catalog does not silently drop fixture codes (every fixture id present)', () => {
    const catalogSet = new Set(DIAGNOSTIC_RULE_IDS);
    for (const id of productionFixtureRuleIds()) {
      expect(catalogSet.has(id), id).toBe(true);
    }
  });
});
