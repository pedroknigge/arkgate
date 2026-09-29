/**
 * docs/arkorder.md names these types as shipped API; they must be importable from
 * the public `arkgate/order` entry (src/kernel/order/index.ts), not only by indexed
 * access. Vitest strips types, so this compiles a probe with the TypeScript API.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const entry = path.join(root, 'src/kernel/order/index.ts').replace(/\.ts$/, '');

const PROBE = `
import type {
  ArkOrderErrorCode,
  IngestAbsorb,
  IngestResult,
  ProposeResult,
  XiPrimitive,
  XiPropertySchema,
  XiSchema,
} from ${JSON.stringify(entry)};
import { ArkOrderError } from ${JSON.stringify(entry)};

type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const schemaProperty: Eq<XiPropertySchema, NonNullable<XiSchema['properties']>[string]> = true;
const absorb: Eq<IngestAbsorb, Extract<IngestResult, { kind: 'absorb' }>> = true;
const primitive: Eq<XiPrimitive, string | number | boolean | null> = true;
const code: Eq<ArkOrderError['code'], ArkOrderErrorCode> = true;
const stale: ArkOrderErrorCode = 'ARKORDER_STALE_PROPOSAL';
const base: Eq<Pick<ProposeResult, 'baseXiHash' | 'baseVersion'>, { readonly baseXiHash: string; readonly baseVersion: number }> = true;
export { schemaProperty, absorb, primitive, code, stale, base };
`;

describe('arkgate/order public type exports', () => {
  it('exports the documented schema, residual, and error-code types', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-order-types-'));
    try {
      const probe = path.join(dir, 'probe.ts');
      fs.writeFileSync(probe, PROBE, 'utf8');
      const program = ts.createProgram([probe], {
        noEmit: true,
        strict: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        skipLibCheck: true,
        types: [],
      });
      const diagnostics = ts
        .getPreEmitDiagnostics(program)
        .filter((diagnostic) => diagnostic.file?.fileName === probe)
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
      expect(diagnostics).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
