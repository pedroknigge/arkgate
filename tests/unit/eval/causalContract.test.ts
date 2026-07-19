import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CausalContractError,
  canonicalJson,
  freezeManifest,
  sealLedgerEntry,
  validateAndFreezeManifest,
  verifyLedger,
} from '../../../eval/causal/contract.mjs';
import { makeLedger, makeManifest, resealEntries } from './causalFixtures';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function expectCode(action: () => unknown, code: string) {
  try {
    action();
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(CausalContractError);
    expect((error as CausalContractError).code).toBe(code);
  }
}

describe('Z08 causal manifest contract', () => {
  it('ships a strict draft-2020 schema with the frozen 50,000-resample floor', () => {
    const schema = JSON.parse(fs.readFileSync(path.resolve('eval/causal/manifest.schema.v1.json'), 'utf8'));
    expect(schema).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        design: { properties: { bootstrapReplicates: { minimum: 50_000 } } },
        repositories: { minItems: 6 },
        tasks: { minItems: 24 },
        runs: { minItems: 144 },
      },
    });
    expect(schema.$defs.task.required).toEqual(expect.arrayContaining([
      'scenario',
      'noun',
      'fixtureSha256',
      'oracleSha256',
      'architectureConfigSha256',
      'acceptanceSha256',
    ]));
    expect(schema.$defs.repository.properties.commonPatch.oneOf[1].required).toContain('path');
  });

  it('normalizes and recursively freezes a complete paired manifest', () => {
    const frozen = validateAndFreezeManifest(makeManifest());
    expect(frozen.repositories).toHaveLength(6);
    expect(frozen.tasks).toHaveLength(24);
    expect(frozen.runs).toHaveLength(144);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.runs)).toBe(true);
    expect(Object.isFrozen(frozen.runs[0])).toBe(true);
    expect(() => ((frozen.runs[0] as { order: number }).order = 999)).toThrow();
  });

  it('derives the same immutable digest independently of input key insertion order', () => {
    const manifest = makeManifest();
    const reversed = Object.fromEntries(Object.entries(manifest).reverse());
    const first = freezeManifest(manifest);
    const second = freezeManifest(reversed);
    expect(first.sha256).toBe(second.sha256);
    expect(first.canonical).toBe(second.canonical);
    expect(first.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('canonicalizes object keys and rejects non-JSON or ambiguous numbers', () => {
    expect(canonicalJson({ z: 1, a: { y: true, b: null } })).toBe('{"a":{"b":null,"y":true},"z":1}');
    expect(canonicalJson(JSON.parse('{"__proto__":{"polluted":true},"a":1}'))).toBe('{"__proto__":{"polluted":true},"a":1}');
    expectCode(() => canonicalJson({ value: Number.NaN }), 'NON_CANONICAL_JSON');
    expectCode(() => canonicalJson({ value: -0 }), 'NON_CANONICAL_JSON');
    expectCode(() => canonicalJson({ value: undefined }), 'NON_CANONICAL_JSON');
    expectCode(() => canonicalJson(Array(1)), 'NON_CANONICAL_JSON');
    expectCode(() => canonicalJson({ [Symbol('hidden')]: true }), 'NON_CANONICAL_JSON');
  });

  it('rejects endpoint changes, model seed fiction, prompt drift, and a weak bootstrap contract', () => {
    const weakBootstrap = makeManifest();
    weakBootstrap.design.bootstrapReplicates = 49_999;
    expectCode(() => validateAndFreezeManifest(weakBootstrap), 'MANIFEST_INVALID');

    const endpoint = makeManifest();
    endpoint.design.primaryMaxRatio = 0.81;
    expectCode(() => validateAndFreezeManifest(endpoint), 'MANIFEST_INVALID');

    const seededModel = makeManifest();
    seededModel.agent.modelSeed = 'invented';
    expectCode(() => validateAndFreezeManifest(seededModel), 'MANIFEST_INVALID');

    const seedFlag = makeManifest();
    seedFlag.agent.invocationFlags.push('--seed=7');
    expectCode(() => validateAndFreezeManifest(seedFlag), 'MANIFEST_INVALID');

    const promptDrift = makeManifest();
    promptDrift.tasks[0].prompt += ' changed after preregistration';
    expectCode(() => validateAndFreezeManifest(promptDrift), 'MANIFEST_DRIFT');
  });

  it('rejects duplicate UUIDs, overlapping workspaces/pair IDs, incomplete pairs, and order drift', () => {
    const duplicateUuid = makeManifest();
    duplicateUuid.runs[1].sessionUuid = duplicateUuid.runs[0].sessionUuid;
    expectCode(() => validateAndFreezeManifest(duplicateUuid), 'MANIFEST_UUID_DUPLICATE');

    const workspaceOverlap = makeManifest();
    workspaceOverlap.runs[1].workspaceId = workspaceOverlap.runs[0].workspaceId;
    expectCode(() => validateAndFreezeManifest(workspaceOverlap), 'MANIFEST_WORKSPACE_OVERLAP');

    const pairOverlap = makeManifest();
    const distinctPair = pairOverlap.runs.find((run) => run.taskId !== pairOverlap.runs[0].taskId)!;
    distinctPair.pairId = pairOverlap.runs[0].pairId;
    expectCode(() => validateAndFreezeManifest(pairOverlap), 'MANIFEST_WORKSPACE_OVERLAP');

    const incomplete = makeManifest();
    incomplete.runs.pop();
    expectCode(() => validateAndFreezeManifest(incomplete), 'MANIFEST_PAIR_INCOMPLETE');

    const reordered = makeManifest();
    [reordered.runs[0], reordered.runs[1]] = [reordered.runs[1], reordered.runs[0]];
    expectCode(() => validateAndFreezeManifest(reordered), 'MANIFEST_ORDER_INVALID');

    const changedSeed = makeManifest();
    changedSeed.design.orderSeed = 'post-hoc-order';
    expectCode(() => validateAndFreezeManifest(changedSeed), 'MANIFEST_ORDER_INVALID');
  });

  it('requires the four corrected mutation paths and disjoint executable ranges', () => {
    const missing = makeManifest();
    missing.mutation.ranges = missing.mutation.ranges.filter((range) => range.id !== 'snapshot-invalidation');
    expectCode(() => validateAndFreezeManifest(missing), 'MANIFEST_INVALID');

    const wrongFile = makeManifest();
    wrongFile.mutation.ranges[0].file = 'bin/lib/not-completeness.mjs';
    expectCode(() => validateAndFreezeManifest(wrongFile), 'MANIFEST_INVALID');

    const overlap = makeManifest();
    overlap.mutation.ranges.push({
      id: 'overlap',
      file: overlap.mutation.ranges[0].file,
      startLine: 20,
      endLine: 30,
    });
    expectCode(() => validateAndFreezeManifest(overlap), 'MANIFEST_INVALID');
  });

  it('rejects unsafe common-patch paths and unpinned task artifacts', () => {
    const unsafePatch = makeManifest();
    unsafePatch.repositories[2].commonPatch!.path = '../repair.patch';
    expectCode(() => validateAndFreezeManifest(unsafePatch), 'MANIFEST_INVALID');

    const missingTaskPin = makeManifest();
    delete (missingTaskPin.tasks[0] as Partial<(typeof missingTaskPin.tasks)[number]>).oracleSha256;
    expectCode(() => validateAndFreezeManifest(missingTaskPin), 'MANIFEST_INVALID');
  });
});

describe('Z08 append-only causal ledger', () => {
  it('accepts one terminal per preregistered cell plus exact zero-NoCoverage proof', () => {
    const manifest = makeManifest();
    const evidence = verifyLedger({ manifest, entries: makeLedger(manifest) });
    expect(Object.keys(evidence.terminals)).toHaveLength(144);
    expect(evidence.mutation.groups).toHaveLength(4);
    expect(evidence.mutation.groups.every((group: { statuses: { noCoverage: number } }) => group.statuses.noCoverage === 0)).toBe(true);
    expect(evidence.terminalHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects an incomplete ledger and any hash-chain edit', () => {
    const manifest = makeManifest();
    const incomplete = makeLedger(manifest);
    incomplete.pop();
    expectCode(() => verifyLedger({ manifest, entries: incomplete }), 'LEDGER_INCOMPLETE');

    const edited = clone(makeLedger(manifest));
    (edited[0].terminal as { turns: number }).turns += 1;
    expectCode(() => verifyLedger({ manifest, entries: edited }), 'LEDGER_HASH_BROKEN');
  });

  it('rejects manifest/fingerprint drift and post-hoc ledger order changes even after resealing', () => {
    const manifest = makeManifest();
    const manifestDrift = clone(makeLedger(manifest));
    manifestDrift[0].manifestSha256 = '0'.repeat(64);
    expectCode(() => verifyLedger({ manifest, entries: resealEntries(manifestDrift) }), 'LEDGER_DRIFT');

    const fingerprintDrift = clone(makeLedger(manifest));
    fingerprintDrift[0].cellFingerprint = '1'.repeat(64);
    expectCode(() => verifyLedger({ manifest, entries: resealEntries(fingerprintDrift) }), 'LEDGER_DRIFT');

    const reordered = clone(makeLedger(manifest));
    [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
    reordered.forEach((entry, index) => { entry.sequence = index + 1; });
    expectCode(() => verifyLedger({ manifest, entries: resealEntries(reordered) }), 'LEDGER_ORDER_INVALID');
  });

  it('rejects duplicate ledger UUIDs and temporally overlapping supposedly serial cells', () => {
    const manifest = makeManifest();
    const duplicateUuid = clone(makeLedger(manifest));
    duplicateUuid[1].sessionUuid = duplicateUuid[0].sessionUuid;
    expectCode(() => verifyLedger({ manifest, entries: resealEntries(duplicateUuid) }), 'LEDGER_UUID_DUPLICATE');

    const overlapping = clone(makeLedger(manifest));
    const first = overlapping[0].terminal as { finishedAtMs: number };
    const second = overlapping[1].terminal as { startedAtMs: number; finishedAtMs: number; observedElapsedMs: number };
    second.startedAtMs = first.finishedAtMs - 1;
    second.finishedAtMs = second.startedAtMs + second.observedElapsedMs;
    expectCode(() => verifyLedger({ manifest, entries: resealEntries(overlapping) }), 'LEDGER_WORKSPACE_OVERLAP');
  });

  it('fails closed on NoCoverage, missing mutation groups, or range drift', () => {
    const manifest = makeManifest();
    const noCoverage = clone(makeLedger(manifest));
    const mutation = noCoverage.at(-1)!;
    const group = (mutation.groups as Array<{ statuses: Record<string, number> }>)[0];
    group.statuses.killed -= 1;
    group.statuses.noCoverage = 1;
    expectCode(() => verifyLedger({ manifest, entries: resealEntries(noCoverage) }), 'MUTATION_NO_COVERAGE');

    const missing = clone(makeLedger(manifest));
    (missing.at(-1)!.groups as unknown[]).pop();
    expectCode(() => verifyLedger({ manifest, entries: resealEntries(missing) }), 'LEDGER_INCOMPLETE');

    const drift = clone(makeLedger(manifest));
    (drift.at(-1)!.groups as Array<{ endLine: number }>)[0].endLine += 1;
    expectCode(() => verifyLedger({ manifest, entries: resealEntries(drift) }), 'LEDGER_DRIFT');
  });

  it('requires internally consistent terminal, grader, usage, and censorship evidence', () => {
    const manifest = makeManifest();
    const inconsistent = clone(makeLedger(manifest));
    (inconsistent[0].terminal as { grader: { tests: string } }).grader.tests = 'fail';
    expectCode(() => verifyLedger({ manifest, entries: resealEntries(inconsistent) }), 'LEDGER_INVALID');

    const badUsage = clone(makeLedger(manifest));
    (badUsage[0].terminal as { usage: { totalTokens: number } }).usage.totalTokens += 1;
    expectCode(() => verifyLedger({ manifest, entries: resealEntries(badUsage) }), 'LEDGER_INVALID');

    const prematureCensor = clone(makeLedger(manifest));
    Object.assign(prematureCensor[0].terminal as object, {
      outcome: 'censored',
      firstValidMs: null,
      censoredAtMs: 9_999,
      censorReason: 'cap_reached',
      mergeGateCompleted: false,
      finalCiState: 'red',
    });
    expectCode(() => verifyLedger({ manifest, entries: resealEntries(prematureCensor) }), 'LEDGER_INVALID');

    const artifactDrift = clone(makeLedger(manifest));
    (artifactDrift[0].terminal as { transcriptSha256: string }).transcriptSha256 = 'not-a-digest';
    expectCode(() => verifyLedger({ manifest, entries: resealEntries(artifactDrift) }), 'LEDGER_INVALID');

    const treatmentIndex = manifest.runs.findIndex((run) => run.arm === 'treatment');
    const missingIntervention = clone(makeLedger(manifest));
    (missingIntervention[treatmentIndex].terminal as { interventionAfterSha256: string | null }).interventionAfterSha256 = null;
    expectCode(() => verifyLedger({ manifest, entries: resealEntries(missingIntervention) }), 'LEDGER_INVALID');
  });

  it('separates actual interrupted runtime from the censored restricted time', () => {
    const manifest = makeManifest();
    const interrupted = clone(makeLedger(manifest));
    const terminal = interrupted[0].terminal as Record<string, unknown>;
    Object.assign(terminal, {
      outcome: 'censored',
      firstValidMs: null,
      censoredAtMs: manifest.design.tauMs,
      observedElapsedMs: 125,
      restrictedTimeMs: manifest.design.tauMs,
      finishedAtMs: (terminal.startedAtMs as number) + 125,
      censorReason: 'interrupted',
      mergeGateCompleted: false,
      finalCiState: 'red',
      grader: { integrity: 'pass', architecture: 'pass', typecheck: 'not_run', tests: 'not_run' },
      turns: 0,
    });
    const evidence = verifyLedger({ manifest, entries: resealEntries(interrupted) });
    expect(evidence.terminals[manifest.runs[0].cellId]).toMatchObject({
      observedElapsedMs: 125,
      restrictedTimeMs: manifest.design.tauMs,
      censorReason: 'interrupted',
    });
  });

  it('does not permit callers to inject hash-chain fields while sealing', () => {
    expectCode(
      () => sealLedgerEntry({ sequence: 1, previousHash: '0'.repeat(64) }, '0'.repeat(64)),
      'LEDGER_INVALID'
    );
  });
});
