/**
 * U05 — ambient mutable-state sensor (ADR 0009 D4 / A5).
 *
 * Advisory, doctor-only, and opt-in: it looks ONLY at layers declared
 * `pure: true`. Module-scope `let`/`var` is the supported MVP shape; the fixed
 * false-positive matrix (const bindings, function-local state, non-pure
 * layers, acknowledged registries) must stay silent. Never a strict default.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import {
  AMBIENT_STATE_ACKS_PATH,
  detectAmbientState,
  loadAmbientStateAcks,
  summarizeAmbientState,
} from '../../../bin/lib/ambient-state.mjs';
import { runDoctor } from '../../../bin/lib/doctor-plan.mjs';

const temps: string[] = [];

function mk(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-u05-'));
  temps.push(root);
  return root;
}

afterEach(() => {
  for (const root of temps.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function write(root: string, rel: string, body: string) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
  return abs;
}

const CONFIG = {
  include: ['src'],
  layers: [
    { name: 'DomainModel', patterns: ['src/domain/**'], pure: true },
    { name: 'PersistenceAdapters', patterns: ['src/adapters/**'] },
  ],
  rules: [],
};

describe('U05 sensor — detection in pure layers only', () => {
  it('flags module-scope let/var in a pure layer with stable ordering', () => {
    const root = mk();
    write(
      root,
      'src/domain/state.ts',
      "let counter = 0;\nvar flag = false;\nexport function bump(): number {\n  counter += 1;\n  return counter;\n}\nexport const read = () => flag;\n"
    );
    const files = [path.join(root, 'src/domain/state.ts')];
    const result = detectAmbientState(ts, root, CONFIG, files, loadAmbientStateAcks(root));
    expect(result.active).toBe(true);
    expect(result.findings.map((f) => `${f.name}:${f.kind}`)).toEqual([
      'counter:module-let',
      'flag:module-var',
    ]);
    expect(result.findings[0].file).toBe('src/domain/state.ts');
    expect(result.findings[0].line).toBe(1);
  });

  it('fixed false-positive matrix stays silent', () => {
    const root = mk();
    // const bindings (even mutable objects) are out of the MVP shape.
    write(root, 'src/domain/consts.ts', "export const registry = new Map<string, string>();\nconst helper = 1;\nexport const use = () => helper;\n");
    // Function-local state is not module scope.
    write(root, 'src/domain/local.ts', 'export function f(): number {\n  let acc = 0;\n  acc += 1;\n  return acc;\n}\n');
    // Stateful adapters live outside pure layers — never scanned.
    write(root, 'src/adapters/cache.ts', 'let cache: string | null = null;\nexport const setCache = (v: string) => (cache = v);\n');
    const files = [
      path.join(root, 'src/domain/consts.ts'),
      path.join(root, 'src/domain/local.ts'),
      path.join(root, 'src/adapters/cache.ts'),
    ];
    const result = detectAmbientState(ts, root, CONFIG, files, loadAmbientStateAcks(root));
    expect(result.findings).toEqual([]);
  });

  it('is inactive without any pure layer (opt-in only)', () => {
    const root = mk();
    write(root, 'src/domain/state.ts', 'let x = 1;\nexport const f = () => x;\n');
    const config = {
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    };
    const result = detectAmbientState(
      ts,
      root,
      config,
      [path.join(root, 'src/domain/state.ts')],
      loadAmbientStateAcks(root)
    );
    expect(result.active).toBe(false);
    expect(result.findings).toEqual([]);
  });

  it('acknowledged registries are suppressed and counted; malformed acks suppress nothing', () => {
    const root = mk();
    write(root, 'src/domain/state.ts', 'let counter = 0;\nlet other = 1;\nexport const f = () => counter + other;\n');
    write(
      root,
      AMBIENT_STATE_ACKS_PATH,
      JSON.stringify({
        acks: [{ file: 'src/domain/state.ts', name: 'counter', reason: 'deliberate memo, reset per request' }],
      })
    );
    const files = [path.join(root, 'src/domain/state.ts')];
    const acks = loadAmbientStateAcks(root);
    const result = detectAmbientState(ts, root, CONFIG, files, acks);
    expect(result.findings.map((f) => f.name)).toEqual(['other']);
    const summary = summarizeAmbientState(result, acks);
    expect(summary.acknowledged).toBe(1);
    expect(summary.advisory).toBe(true);

    write(root, AMBIENT_STATE_ACKS_PATH, '{ broken');
    const badAcks = loadAmbientStateAcks(root);
    expect(badAcks.invalid).toBe(true);
    const unsuppressed = detectAmbientState(ts, root, CONFIG, files, badAcks);
    expect(unsuppressed.findings.map((f) => f.name)).toEqual(['counter', 'other']);
  });
});

describe('U05 doctor surface — advisory only', () => {
  function doctorJson(root: string, config: object, relFiles: string[]) {
    const files = relFiles.map((rel) => path.join(root, rel));
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    try {
      runDoctor(root, config, files, (config as { rules: object[] }).rules, [], true, { ts });
    } finally {
      console.log = orig;
    }
    return JSON.parse(logs.join('\n'));
  }

  it('doctor JSON exposes ambientState without touching the verdict or design fitness', () => {
    const root = mk();
    write(root, 'src/domain/state.ts', 'let counter = 0;\nexport const f = () => counter;\n');
    // A rule edge keeps the fixture clear of the unrelated soft-contract smell,
    // so the assertion isolates U05's advisory claim.
    const config = {
      ...CONFIG,
      rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
    };
    const payload = doctorJson(root, config, ['src/domain/state.ts']);
    expect(payload.doctor.ambientState.active).toBe(true);
    expect(payload.doctor.ambientState.advisory).toBe(true);
    expect(payload.doctor.ambientState.findings).toHaveLength(1);
    expect(payload.doctor.designFitness.designWeak).toBe(false);
  });

  it('without ts in options the sensor reports unavailable instead of guessing', () => {
    const root = mk();
    write(root, 'src/domain/state.ts', 'let counter = 0;\nexport const f = () => counter;\n');
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    try {
      runDoctor(root, CONFIG, [path.join(root, 'src/domain/state.ts')], [], [], true, {});
    } finally {
      console.log = orig;
    }
    const payload = JSON.parse(logs.join('\n'));
    expect(payload.doctor.ambientState.available).toBe(false);
    expect(payload.doctor.ambientState.findings).toEqual([]);
  });
});
