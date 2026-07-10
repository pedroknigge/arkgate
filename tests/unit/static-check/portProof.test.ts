/**
 * W6 — port-proof inject binding (static proof + transform).
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  applyPortProofInject,
  provePortProofInject,
} from '../../../bin/lib/port-proof.mjs';
import { classifyRemediation, MECHANICAL_SAFE_KINDS } from '../../../src/domain/remediation';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ELIGIBLE = `import { db } from '../infra/db';

export function placeOrder(id: string) {
  return db.save(id);
}
`;

describe('port-proof inject (W6)', () => {
  it('proves eligible for single named import used only as binding.method(...)', () => {
    const proof = provePortProofInject(ts, ELIGIBLE);
    expect(proof.eligible).toBe(true);
    expect(proof.bindingName).toBe('db');
    expect(proof.methods).toEqual(['save']);
    expect(proof.functionNames).toEqual(['placeOrder']);
  });

  it('rejects free binding use, default import, multi-import, module-level call', () => {
    expect(
      provePortProofInject(ts, `import { db } from '../infra/db';\nexport const x = db;\n`).eligible
    ).toBe(false);
    expect(
      provePortProofInject(ts, `import db from '../infra/db';\nexport function f() { return db.save(1); }\n`)
        .eligible
    ).toBe(false);
    expect(
      provePortProofInject(
        ts,
        `import { db } from '../infra/db';\nimport { x } from '../infra/x';\nexport function f() { return db.save(1); }\n`
      ).eligible
    ).toBe(false);
    expect(
      provePortProofInject(ts, `import { db } from '../infra/db';\ndb.save('x');\n`).eligible
    ).toBe(false);
    expect(
      provePortProofInject(
        ts,
        `import { db } from '../infra/db';\nexport function f(id: string) { return db; }\n`
      ).eligible
    ).toBe(false);
  });

  it('applies inject: removes import, adds port type, injects param, preserves calls', () => {
    const out = applyPortProofInject(ts, ELIGIBLE);
    expect(out).not.toBeNull();
    expect(out!.remediationKind).toBe('port-proof-inject-binding');
    expect(out!.source).toContain('export type DbPort');
    expect(out!.source).toContain('db: DbPort');
    expect(out!.source).toContain('return db.save(id)');
    expect(out!.source).not.toMatch(/import\s*\{\s*db\s*\}/);
  });

  it('classifyRemediation marks portProofEligible as judgment (suggested kind, not auto-safe)', () => {
    expect(MECHANICAL_SAFE_KINDS).not.toContain('port-proof-inject-binding');
    const v = classifyRemediation({
      ruleId: 'LAYER_IMPORT_VIOLATION',
      edgeKind: 'import',
      portProofEligible: true,
      fromLayer: 'DomainModel',
      toLayer: 'PersistenceAdapters',
    });
    expect(v.class).toBe('judgment');
    expect(v.remediationKind).toBe('port-proof-inject-binding');
  });

  it('apply refuses rest-parameter functions (illegal syntax)', () => {
    const src = `import { db } from '../infra/db';\nexport function f(...args: string[]) {\n  return db.save(args[0]);\n}\n`;
    // prove may still see binding.method form; apply must fail closed
    expect(applyPortProofInject(ts, src)).toBeNull();
  });

  it('peerIsolation + typeOnly stays judgment (not type-only-import-move)', () => {
    const v = classifyRemediation({
      ruleId: 'LAYER_IMPORT_VIOLATION',
      peerIsolation: true,
      typeOnly: true,
    });
    expect(v.class).toBe('judgment');
    expect(v.remediationKind).toBeUndefined();
  });

  it('classifyRemediation keeps value import without proof as judgment', () => {
    expect(
      classifyRemediation({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        edgeKind: 'import',
        fromLayer: 'DomainModel',
        toLayer: 'PersistenceAdapters',
      }).class
    ).toBe('judgment');
  });

  it('require/dynamic never port-proof even with flag', () => {
    expect(
      classifyRemediation({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        edgeKind: 'require',
        portProofEligible: true,
      }).class
    ).toBe('judgment');
  });
});
