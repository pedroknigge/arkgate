/**
 * In-process tests for the `--sensors` / `--promote` presentation module.
 *
 * The end-to-end file next door spawns `ark-check`, which proves the wiring but
 * attributes no coverage (V8 does not follow a child process) and cannot reach
 * a branch that needs a synthetic analysis — a partial run, or a floor that
 * demotes every tooth, is awkward to seed through a real repository. These
 * call the module directly with the run context supplied.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  analysisCaveat,
  applyPromotion,
  runPromote,
  runSensors,
} from '../../../bin/lib/sensor-promote-cli.mjs';
import { buildPromotionPreview, buildSensorMap } from '../../../src/domain/sensorPromotion';

type Captured = { out: string; err: string; exitCode: number | undefined };

/** Run one call with stdout, stderr and the process exit code captured. */
async function capture(fn: () => unknown | Promise<unknown>): Promise<Captured> {
  const out: string[] = [];
  const err: string[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation((...args) => {
    out.push(args.join(' '));
  });
  const error = vi.spyOn(console, 'error').mockImplementation((...args) => {
    err.push(args.join(' '));
  });
  const previousExit = process.exitCode;
  process.exitCode = undefined;
  try {
    await fn();
    return { out: out.join('\n'), err: err.join('\n'), exitCode: process.exitCode };
  } finally {
    process.exitCode = previousExit;
    log.mockRestore();
    error.mockRestore();
  }
}

const ARKRULES = {
  schemaVersion: '1.0',
  layer: 'DomainModel',
  structure: [
    { id: 'types-only', sensor: 'no-anemic-model', mode: 'advisory' },
    { id: 'private-state', sensor: 'aggregate-private-state', mode: 'advisory' },
  ],
  invariants: [{ id: 'INV-NONE', description: 'nothing covers this one', mode: 'advisory' }],
};

const roots: string[] = [];

function seed(withArkRules = true): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-sensors-unit-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'arkrules'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src/domain/Order.ts'),
    'export class Order {\n  public total = 0;\n}\n'
  );
  fs.writeFileSync(
    path.join(root, 'arkrules/DomainModel.json'),
    `${JSON.stringify(ARKRULES, null, 2)}\n`
  );
  return root;
}

function config(root: string, withArkRules = true) {
  return {
    schemaVersion: '1.1',
    include: ['src'],
    layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
    rules: [],
    ...(withArkRules ? { arkRules: { DomainModel: 'arkrules/DomainModel.json' } } : {}),
  };
}

afterEach(() => {
  while (roots.length > 0) {
    fs.rmSync(roots.pop() as string, { recursive: true, force: true });
  }
});

describe('runSensors', () => {
  it('prints the vocabulary, the declared rules and each blocked reason', async () => {
    const root = seed();
    const result = await capture(() =>
      runSensors({ root, config: 'ark.config.json', json: false }, () => config(root))
    );
    expect(result.exitCode).toBe(0);
    expect(result.out).toContain('types-only');
    expect(result.out).toContain('Tier-2');
    // How, not just whether: only ArkRules is promoted per rule.
    expect(result.out).toContain('promotable per rule');
    expect(result.out).toContain('promotable via arkrun.mode');
    expect(result.out).toContain('INV-NONE');
    expect(result.out).toContain('advisory and blocked');
  });

  it('emits the map as JSON with the totals and the not-a-score stamp', async () => {
    const root = seed();
    const result = await capture(() =>
      runSensors({ root, config: 'ark.config.json', json: true }, () => config(root))
    );
    const payload = JSON.parse(result.out).sensors;
    expect(payload.notAScore).toBe(true);
    expect(payload.totals.declared).toBe(3);
    expect(payload.arkRulesActive).toBe(true);
  });

  it('says the plane is opt-in when the contract declares no arkRules', async () => {
    const root = seed();
    const result = await capture(() =>
      runSensors({ root, config: 'ark.config.json', json: false }, () => config(root, false))
    );
    expect(result.exitCode).toBe(0);
    expect(result.out).toContain('intra-layer ArkRules are opt-in');
  });

  it('exits 2 when the contract itself will not read', async () => {
    const root = seed();
    const result = await capture(() =>
      runSensors({ root, config: 'ark.config.json', json: false }, () => {
        throw new Error('contract is unreadable');
      })
    );
    expect(result.exitCode).toBe(2);
    expect(result.err).toContain('contract is unreadable');
  });

  it('exits 2, in JSON too, when the ArkRules references fail to load', async () => {
    const root = seed();
    fs.writeFileSync(path.join(root, 'arkrules/DomainModel.json'), '{ not json');
    const result = await capture(() =>
      runSensors({ root, config: 'ark.config.json', json: true }, () => config(root))
    );
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.out).sensors.ok).toBe(false);
  });
});

describe('runPromote', () => {
  const runContext = (root: string, extra: Record<string, unknown> = {}) => ({
    files: [path.join(root, 'src/domain/Order.ts')],
    all: [
      {
        arkruleId: 'private-state',
        arkruleSource: 'arkrules/DomainModel.json',
        ruleId: 'ARKRULE_STRUCTURE',
      },
    ],
    completeness: 'complete',
    completenessReasons: [],
    teethDemotedByFloor: false,
    ...extra,
  });

  it('prices each rule and writes nothing without --apply', async () => {
    const root = seed();
    const before = fs.readFileSync(path.join(root, 'arkrules/DomainModel.json'), 'utf8');
    const result = await capture(() =>
      runPromote(root, config(root), { promote: true, json: false }, runContext(root))
    );
    expect(result.exitCode).toBe(0);
    expect(result.out).toContain('1 advisory finding(s) would start failing the gate');
    expect(result.out).toContain('Preview only');
    expect(fs.readFileSync(path.join(root, 'arkrules/DomainModel.json'), 'utf8')).toBe(before);
  });

  it('names the floor above the numbers and prices nothing under it', async () => {
    const root = seed();
    const result = await capture(() =>
      runPromote(
        root,
        config(root),
        { promote: true, json: false },
        runContext(root, { teethDemotedByFloor: true })
      )
    );
    expect(result.out).toContain('classification floor');
    expect(result.out).toContain('no teeth yet');
    expect(result.out).toContain('0 finding(s) would become blocking in total');
  });

  it('calls a partial analysis a floor, not a price', async () => {
    const root = seed();
    const result = await capture(() =>
      runPromote(
        root,
        config(root),
        { promote: true, json: false },
        runContext(root, { completeness: 'partial', completenessReasons: ['parse diagnostics'] })
      )
    );
    expect(result.out).toContain('is a FLOOR, not the price');
    expect(result.out).toContain('parse diagnostics');
  });

  it('escapes a control character an ArkRules id smuggles into the report', async () => {
    const root = seed();
    const rules = { ...ARKRULES, structure: [{ id: 'ev[2K\ril', sensor: 'thin-adapter' }] };
    fs.writeFileSync(
      path.join(root, 'arkrules/DomainModel.json'),
      `${JSON.stringify(rules, null, 2)}\n`
    );
    const result = await capture(() =>
      runPromote(root, config(root), { promote: true, json: false }, runContext(root))
    );
    expect(result.out).not.toContain('[2K');
    expect(result.out).toContain('\\u001b');
  });

  it('exits 1 and suggests declared ids for a focus nobody declared', async () => {
    const root = seed();
    const result = await capture(() =>
      runPromote(root, config(root), { promote: 'private-stat', json: false }, runContext(root))
    );
    expect(result.exitCode).toBe(1);
    expect(result.err).toContain('private-state');
  });

  it('reports an unknown focus in JSON too', async () => {
    const root = seed();
    const result = await capture(() =>
      runPromote(root, config(root), { promote: 'nope', json: true }, runContext(root))
    );
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.out).error).toContain('nope');
  });

  it('exits 2 rather than pricing rules it could not load', async () => {
    const root = seed();
    fs.writeFileSync(path.join(root, 'arkrules/DomainModel.json'), '{ not json');
    const result = await capture(() =>
      runPromote(root, config(root), { promote: true, json: false }, runContext(root))
    );
    expect(result.exitCode).toBe(2);
  });

  it('applies a named promotion and reports the file it wrote', async () => {
    const root = seed();
    const result = await capture(() =>
      runPromote(
        root,
        config(root),
        { promote: 'private-state', apply: true, json: false },
        runContext(root)
      )
    );
    expect(result.exitCode).toBe(0);
    expect(result.out).toContain('wrote arkrules/DomainModel.json');
    expect(
      JSON.parse(fs.readFileSync(path.join(root, 'arkrules/DomainModel.json'), 'utf8')).structure.find(
        (row: { id: string }) => row.id === 'private-state'
      ).mode
    ).toBe('enforced');
  });

  it('says nothing to price when the contract declares no arkRules', async () => {
    const root = seed();
    const result = await capture(() =>
      runPromote(root, config(root, false), { promote: true, json: false }, runContext(root))
    );
    expect(result.out).toContain('No ArkRules declared');
  });
});

describe('applyPromotion', () => {
  const map = buildSensorMap({
    structure: [
      { id: 'thin', sensor: 'thin-adapter', mode: 'advisory', sourceFile: 'a.json' },
      { id: 'tier2', sensor: 'no-anemic-model', mode: 'advisory', sourceFile: 'a.json' },
      { id: 'already', sensor: 'thin-adapter', mode: 'enforced', sourceFile: 'a.json' },
    ],
  });
  const never = () => {
    throw new Error('the write must not be reached');
  };

  it('refuses a bare --apply rather than promoting everything at once', () => {
    const preview = buildPromotionPreview({ map });
    const result = applyPromotion('/root', preview, null, never);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('needs one rule id');
  });

  it('refuses an id that matched nothing, one already enforced, and one that cannot be', () => {
    expect(
      applyPromotion('/root', buildPromotionPreview({ map, focus: 'ghost' }), 'ghost', never).reason
    ).toContain('No declared rule');
    expect(
      applyPromotion('/root', buildPromotionPreview({ map, focus: 'already' }), 'already', never)
        .reason
    ).toContain('already enforced');
    expect(
      applyPromotion('/root', buildPromotionPreview({ map, focus: 'tier2' }), 'tier2', never).reason
    ).toContain('Tier-2');
  });

  it('refuses a contract change priced by a run that could not measure it', () => {
    const preview = buildPromotionPreview({
      map,
      focus: 'thin',
      analysis: { completeness: 'partial' },
    });
    const result = applyPromotion('/root', preview, 'thin', never);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('false green');
  });

  it('binds the write to the sensor the rule was priced with', () => {
    const preview = buildPromotionPreview({ map, focus: 'thin' });
    const seen: unknown[] = [];
    applyPromotion('/root', preview, 'thin', (...args: unknown[]) => {
      seen.push(args);
      return { ok: true, file: 'a.json', reason: 'done' };
    });
    expect(seen[0]).toEqual(['/root', 'a.json', 'thin', 'thin-adapter']);
  });
});

describe('analysisCaveat', () => {
  it('is silent only when the run really could measure the price', () => {
    expect(analysisCaveat({ completeness: 'complete' })).toBeNull();
    expect(analysisCaveat(undefined)).toBeNull();
    expect(analysisCaveat({ teethDemotedByFloor: true })).toContain('classification floor');
    expect(analysisCaveat({ completeness: 'unavailable' })).toContain('FLOOR, not the price');
  });
});
