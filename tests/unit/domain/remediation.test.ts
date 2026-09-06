/**
 * R4: direct unit tests of pure remediation classifier + enrich — no ark-check spawn.
 * Imports the canonical TypeScript domain module.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyRemediation,
  deterministicNextAction,
  enrichViolationWithFixClass,
  MECHANICAL_SAFE_KINDS,
  REMEDIATION_CLASSES,
} from '../../../src/domain/remediation';
import {
  classifyRemediation as classifyCliRemediation,
  deterministicNextAction as deterministicCliNextAction,
  enrichViolationWithFixClass as enrichCliViolationWithFixClass,
} from '../../../bin/lib/remediation.mjs';

describe('classifyRemediation (src/domain — pure, no CLI spawn)', () => {
  it('exposes the three remediation classes', () => {
    expect([...REMEDIATION_CLASSES]).toEqual(['mechanical-safe', 'judgment', 'deferred']);
  });

  it('exposes mechanical-safe remediationKinds (R6 + RN05 declaration list); W6 port-proof stays judgment', () => {
    expect([...MECHANICAL_SAFE_KINDS]).toEqual([
      'pure-type-file-relocate',
      'type-only-import-move',
      'import-type-from-pure-type-module',
      'import-type-of-type-exports',
      'arkrun-declaration-list',
    ]);
    expect(MECHANICAL_SAFE_KINDS).not.toContain('port-proof-inject-binding');
  });

  it('marks type-only and pure-type-module edges mechanical-safe', () => {
    expect(classifyRemediation({ ruleId: 'LAYER_IMPORT_VIOLATION', typeOnly: true }).class).toBe(
      'mechanical-safe'
    );
    const pureFile = classifyRemediation({
      ruleId: 'LAYER_IMPORT_VIOLATION',
      typeOnly: true,
      sourcePureTypeModule: true,
    });
    expect(pureFile.class).toBe('mechanical-safe');
    expect(pureFile.remediationKind).toBe('pure-type-file-relocate');
    expect(
      classifyRemediation({ ruleId: 'LAYER_IMPORT_VIOLATION', targetTypeOnlyExports: true }).class
    ).toBe('mechanical-safe');
  });

  it('marks namedBindingsTypeOnly as mechanical-safe import-type-of-type-exports (R6)', () => {
    const v = classifyRemediation({
      ruleId: 'LAYER_IMPORT_VIOLATION',
      namedBindingsTypeOnly: true,
      edgeKind: 'import',
    });
    expect(v.class).toBe('mechanical-safe');
    expect(v.remediationKind).toBe('import-type-of-type-exports');
    const reexport = classifyRemediation({
      ruleId: 'LAYER_IMPORT_VIOLATION',
      namedBindingsTypeOnly: true,
      edgeKind: 'export',
    });
    expect(reexport.class).toBe('mechanical-safe');
    expect(reexport.remediationKind).toBe('import-type-of-type-exports');
  });

  it('keeps require/dynamic-import of type-only modules as judgment', () => {
    expect(
      classifyRemediation({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        targetTypeOnlyExports: true,
        edgeKind: 'require',
      }).class
    ).toBe('judgment');
    expect(
      classifyRemediation({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        targetTypeOnlyExports: true,
        edgeKind: 'dynamic-import',
      }).class
    ).toBe('judgment');
    expect(
      classifyRemediation({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        namedBindingsTypeOnly: true,
        edgeKind: 'require',
      }).class
    ).toBe('judgment');
  });

  it('classifies value imports and other rules as judgment; empty as deferred', () => {
    expect(classifyRemediation({ ruleId: 'LAYER_IMPORT_VIOLATION' }).class).toBe('judgment');
    expect(classifyRemediation({ ruleId: 'FORBIDDEN_GLOBAL' }).class).toBe('judgment');
    expect(classifyRemediation({ ruleId: 'CIRCULAR_DEPENDENCY' }).class).toBe('judgment');
    expect(classifyRemediation({ ruleId: 'UNKNOWN_RULE' }).class).toBe('judgment');
    expect(classifyRemediation({}).class).toBe('deferred');
    expect(classifyRemediation(null).class).toBe('deferred');
  });
});

describe('enrichViolationWithFixClass (src/domain — pure, no CLI spawn)', () => {
  it('labels LAYER_IMPORT_VIOLATION type-only vs value', () => {
    const typeOnly = enrichViolationWithFixClass({
      ruleId: 'LAYER_IMPORT_VIOLATION',
      typeOnly: true,
      file: 'a.ts',
    });
    expect(typeOnly.fixClass).toBe('file-move');
    expect(typeOnly.effort).toBe('small');
    expect(typeOnly.enthusiastHint.length).toBeGreaterThan(10);

    const namedType = enrichViolationWithFixClass({
      ruleId: 'LAYER_IMPORT_VIOLATION',
      namedBindingsTypeOnly: true,
      file: 'b.ts',
    });
    expect(namedType.fixClass).toBe('file-move');
    expect(namedType.enthusiastHint).toMatch(/import type/);

    const value = enrichViolationWithFixClass({
      ruleId: 'LAYER_IMPORT_VIOLATION',
      fromLayer: 'DomainModel',
      toLayer: 'PersistenceAdapters',
    });
    expect(value.fixClass).toBe('port-inversion');
    expect(value.effort).toBe('medium');
    expect(value.enthusiastHint).toMatch(/DomainModel/);
  });

  it('labels forbidden globals, publish rules, and cycles', () => {
    expect(enrichViolationWithFixClass({ ruleId: 'FORBIDDEN_GLOBAL', target: 'fetch' }).fixClass).toBe(
      'inject-port'
    );
    expect(enrichViolationWithFixClass({ ruleId: 'RAW_EVENT_PUBLISH' }).fixClass).toBe(
      'registered-intent'
    );
    expect(enrichViolationWithFixClass({ ruleId: 'PUBLISH_MISSING_SOURCE' }).fixClass).toBe(
      'add-source-metadata'
    );
    expect(enrichViolationWithFixClass({ ruleId: 'CIRCULAR_DEPENDENCY' }).fixClass).toBe(
      'break-cycle'
    );
    expect(enrichViolationWithFixClass({ ruleId: 'SOMETHING_ELSE' }).fixClass).toBe(
      'review-contract'
    );
  });

  it('keeps the generated CLI remediation artifact behaviorally aligned', () => {
    const cases = [
      {
        ruleId: 'LAYER_IMPORT_VIOLATION',
        typeOnly: true,
        file: 'src/domain/order.ts',
      },
      {
        ruleId: 'LAYER_IMPORT_VIOLATION',
        fromLayer: 'DomainModel',
        toLayer: 'PersistenceAdapters',
      },
      { ruleId: 'FORBIDDEN_GLOBAL', target: 'fetch' },
      { ruleId: 'CAPABILITY_VIOLATION', target: 'filesystem' },
      { ruleId: 'CIRCULAR_DEPENDENCY' },
      { ruleId: 'RAW_EVENT_PUBLISH' },
      { ruleId: 'PUBLISH_MISSING_SOURCE' },
      { ruleId: 'UNKNOWN_RULE' },
      { ruleId: 'ARKRUN_UNDECLARED_EMIT', target: 'Domain.Order.Placed' },
      { ruleId: 'ARKRUN_DIRECT_NEW', target: 'OrderService' },
      { ruleId: 'ARKRUN_MISSING_ROOT' },
    ];

    for (const violation of cases) {
      expect(classifyCliRemediation(violation)).toEqual(classifyRemediation(violation));
      expect(deterministicCliNextAction(violation)).toBe(deterministicNextAction(violation));
      expect(enrichCliViolationWithFixClass(violation)).toEqual(
        enrichViolationWithFixClass(violation)
      );
    }
  });

  it('ArkOrder first-contact Next: is human and names the valve', () => {
    expect(deterministicNextAction({ ruleId: 'ARKORDER_GENERIC_UPDATE' })).toMatch(
      /Don't use a generic update/
    );
    expect(
      deterministicNextAction({ ruleId: 'ARKORDER_XI_FIELD_WRITE', target: 'plan' })
    ).toMatch(/Don't write plan from a use-case/);
    expect(deterministicNextAction({ ruleId: 'ARKORDER_XI_FIELD_WRITE' })).toMatch(
      /Don't write a named product choice/
    );
    const hint = enrichViolationWithFixClass({ ruleId: 'ARKORDER_XI_FIELD_WRITE' });
    expect(hint.enthusiastHint).toMatch(/valve, not a generic update/);
    expect(enrichViolationWithFixClass({ ruleId: 'ARKORDER_GENERIC_UPDATE' }).enthusiastHint).toMatch(
      /Don't PATCH the billing plan/
    );
  });

  it('ArkOrder deny Next: and hints cover the remaining first-contact rule ids', () => {
    expect(
      deterministicNextAction({ ruleId: 'ARKORDER_MISSING_PLANE', target: 'src/main.ts' })
    ).toMatch(/plane root src\/main\.ts/);
    expect(deterministicNextAction({ ruleId: 'ARKORDER_MISSING_PLANE' })).toMatch(
      /listed in arkOrder\.planeRoots/
    );
    expect(deterministicNextAction({ ruleId: 'ARKORDER_KERNEL_IN_DOMAIN' })).toMatch(
      /Domain-role layer/
    );
    expect(deterministicNextAction({ ruleId: 'ARKORDER_TOO_MANY_PARAMS' })).toMatch(
      /slow keys that actually slave/
    );
    expect(deterministicNextAction({ ruleId: 'ARKORDER_INGEST_WRITES_XI' })).toMatch(
      /absorb\/escalate_up\/hold/
    );
    expect(deterministicNextAction({ ruleId: 'ARKORDER_UNVALVED_RELEASE' })).toMatch(
      /release\(\) is only the first freeze/
    );

    const hints: Array<[string, RegExp]> = [
      ['ARKORDER_MISSING_PLANE', /createOrderPlane from arkgate\/order/],
      ['ARKORDER_KERNEL_IN_DOMAIN', /Domain stays plane-free/],
      ['ARKORDER_TOO_MANY_PARAMS', /Too many slow keys/],
      ['ARKORDER_INGEST_WRITES_XI', /never writes a new house/],
      ['ARKORDER_INFORMATION_BUDGET', /denied kind/],
      ['ARKORDER_XI_TTL', /TTL is σ, never ξ/],
      ['ARKORDER_STALE_SIGMA', /Refresh σ/],
      ['ARKORDER_UNVALVED_RELEASE', /do not call release\(\) again/],
    ];
    for (const [ruleId, pattern] of hints) {
      const enriched = enrichViolationWithFixClass({ ruleId });
      expect(enriched.fixClass, ruleId).toBe('arkorder-usage');
      expect(enriched.enthusiastHint, ruleId).toMatch(pattern);
    }
  });
});
