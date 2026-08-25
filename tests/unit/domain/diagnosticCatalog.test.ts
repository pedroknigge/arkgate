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

describe('diagnosticCatalog ↔ docs anchors', () => {
  it('docs/diagnostics.md contains an HTML id anchor for every catalog entry', () => {
    const docs = readFileSync(join(repoRoot, DIAGNOSTIC_DOCS_RELATIVE_PATH), 'utf8');
    for (const entry of DIAGNOSTIC_CATALOG) {
      expect(docs, entry.ruleId).toContain(`id="${entry.docsAnchor}"`);
      expect(docs, entry.ruleId).toContain(entry.ruleId);
    }
  });
});

describe('diagnosticCatalog ↔ production ruleId fixture', () => {
  it('forbids unknown codes on the production fixture list', () => {
    const fixturePath = join(
      repoRoot,
      'tests/fixtures/diagnostic-catalog/production-rule-ids.json'
    );
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as { ruleIds: string[] };
    expect(fixture.ruleIds.length).toBeGreaterThan(30);

    const missing: string[] = [];
    for (const ruleId of fixture.ruleIds) {
      if (!isKnownDiagnosticCode(ruleId)) missing.push(ruleId);
    }
    expect(missing, `unknown production ruleIds: ${missing.join(', ')}`).toEqual([]);
  });

  it('catalog does not silently drop fixture codes (every fixture id present)', () => {
    const fixture = JSON.parse(
      readFileSync(
        join(repoRoot, 'tests/fixtures/diagnostic-catalog/production-rule-ids.json'),
        'utf8'
      )
    ) as { ruleIds: string[] };
    const catalogSet = new Set(DIAGNOSTIC_RULE_IDS);
    for (const id of fixture.ruleIds) {
      expect(catalogSet.has(id), id).toBe(true);
    }
  });
});
