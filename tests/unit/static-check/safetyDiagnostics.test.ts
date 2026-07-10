import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';

import { collectSafetyDiagnostics } from '../../../bin/lib/safety-diagnostics.mjs';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture(source: string, config: Record<string, unknown> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-safety-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'consumer' }));
  const file = path.join(root, 'src.ts');
  fs.writeFileSync(file, source);
  return collectSafetyDiagnostics(ts, root, config, [file]);
}

describe('safety diagnostics', () => {
  it('reports non-literal dynamic imports unless the file is allowlisted', () => {
    expect(fixture('import(name)').warnings[0]?.ruleId).toBe('DYNAMIC_IMPORT_NOT_ALLOWLISTED');
    expect(fixture('import(name)', { dynamicImportAllowlist: ['src.ts'] }).warnings).toEqual([]);
  });

  it('enforces suppression and any-cast thresholds', () => {
    const result = fixture('// @ts-ignore\nconst value = input as any;');
    expect(result.warnings.map((warning) => warning.ruleId)).toEqual([
      'TS_SUPPRESSION_THRESHOLD_EXCEEDED',
      'ANY_CAST_THRESHOLD_EXCEEDED',
    ]);
  });

  it('reads real TypeScript directives without matching strings', () => {
    const result = fixture(
      [
        '// @ts-nocheck',
        'export const documentation = "// @ts-ignore";',
        '/* @ts-ignore */',
        'missingBlockDirective();',
      ].join('\n'),
      { safety: { maxTsSuppressions: 2 } }
    );
    expect(result.report.tsSuppressions).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });

  it('reports ArkGate InMemory store imports in consumer production source', () => {
    const result = fixture("import { InMemoryOutboxStore } from 'arkgate';");
    expect(result.warnings[0]?.ruleId).toBe('IN_MEMORY_STORE_IN_PRODUCTION_SOURCE');
  });

  it('reports factories that definitely fall back to InMemory stores', () => {
    const defaulted = fixture(
      "import { createArkKernel } from 'arkgate';\ncreateArkKernel();"
    );
    expect(defaulted.warnings[0]?.ruleId).toBe('IN_MEMORY_STORE_IN_PRODUCTION_SOURCE');

    const durable = fixture(
      [
        "import { createArkKernel } from 'arkgate';",
        'createArkKernel({ outbox, auditTrail, projections });',
      ].join('\n')
    );
    expect(durable.warnings).toEqual([]);
  });

  it('reports rules that explicitly disable peer isolation', () => {
    const result = fixture('export const ok = true;', {
      rules: [{ from: 'Feature', to: 'Feature', allowed: false, peerIsolation: false }],
    });
    expect(result.warnings[0]?.ruleId).toBe('PEER_ISOLATION_DISABLED');
  });

  it('reports same-layer deny rules when peerIsolation was removed', () => {
    const result = fixture('export const ok = true;', {
      rules: [{ from: 'Feature', to: 'Feature', allowed: false }],
    });
    expect(result.warnings[0]?.ruleId).toBe('PEER_ISOLATION_DISABLED');
  });
});
