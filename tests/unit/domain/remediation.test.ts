/**
 * R4: direct unit tests of pure remediation classifier + enrich — no ark-check spawn.
 * Imports the canonical TypeScript domain module.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyRemediation,
  enrichViolationWithFixClass,
  MECHANICAL_SAFE_KINDS,
  REMEDIATION_CLASSES,
} from '../../../src/domain/remediation';

describe('classifyRemediation (src/domain — pure, no CLI spawn)', () => {
  it('exposes the three remediation classes', () => {
    expect([...REMEDIATION_CLASSES]).toEqual(['mechanical-safe', 'judgment', 'deferred']);
  });

  it('exposes four mechanical-safe remediationKinds (R6); W6 port-proof stays judgment', () => {
    expect([...MECHANICAL_SAFE_KINDS]).toEqual([
      'pure-type-file-relocate',
      'type-only-import-move',
      'import-type-from-pure-type-module',
      'import-type-of-type-exports',
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
});
