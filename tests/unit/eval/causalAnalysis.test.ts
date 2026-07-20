import { describe, expect, it } from 'vitest';
import {
  analyzeExperiment,
  firstValidPercentile,
  hierarchicalPairedBootstrap,
  restrictedMeanTime,
} from '../../../eval/causal/analyze.mjs';
import { censoredTerminal, firstValidTerminal, makeLedger, makeManifest, resealEntries } from './causalFixtures';

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe('Z08 full-denominator causal analysis', () => {
  it('retains failed cells at tau in RMST and reports an unreached percentile', () => {
    const outcomes = [firstValidTerminal(1_000), censoredTerminal(10_000), censoredTerminal(10_000)];
    expect(restrictedMeanTime(outcomes, 10_000)).toBe(7_000);
    expect(firstValidPercentile(outcomes, 0.5)).toEqual({
      status: 'not_reached',
      valueMs: null,
      requiredCompletions: 2,
      completions: 1,
    });
  });

  it('defines median as reached at exactly half completion, never over success-only rows', () => {
    const outcomes = [firstValidTerminal(800), firstValidTerminal(1_200), censoredTerminal(), censoredTerminal()];
    expect(firstValidPercentile(outcomes, 0.5)).toEqual({
      status: 'reached',
      valueMs: 1_200,
      requiredCompletions: 2,
      completions: 2,
    });
    expect(firstValidPercentile(outcomes, 0.75).status).toBe('not_reached');
  });

  it('resamples paired repository→task→replicate clusters deterministically', () => {
    const pairs = Array.from({ length: 2 }, (_, repositoryIndex) =>
      Array.from({ length: 2 }, (_, taskIndex) =>
        Array.from({ length: 3 }, (_, replicateIndex) => ({
          repositoryId: `repo-${repositoryIndex}`,
          taskId: `task-${repositoryIndex}-${taskIndex}`,
          replicate: replicateIndex + 1,
          control: firstValidTerminal(1_000 + repositoryIndex * 100 + taskIndex * 50 + replicateIndex * 10),
          treatment: firstValidTerminal(450 + repositoryIndex * 120 + taskIndex * 20 + replicateIndex * 5),
        }))
      ).flat()
    ).flat();
    const options = { pairs, tauMs: 10_000, replicates: 500, seed: 'fixed-bootstrap', confidenceLevel: 0.95 };
    const first = hierarchicalPairedBootstrap(options);
    const second = hierarchicalPairedBootstrap(options);
    expect(first).toEqual(second);
    expect(first.method).toBe('hierarchical-paired-bootstrap:repository->task->replicate');
    expect(first.lower).toBeLessThan(first.upper);
    expect(first.upper).toBeLessThan(1);
  });

  it('publishes the preregistered RMST ratio, CI, completion delta, full denominator, and secondary counts', () => {
    const manifest = makeManifest();
    const taskNumber = new Map(manifest.tasks.map((task: { id: string }, index: number) => [task.id, index]));
    const ledger = makeLedger(manifest, (run) => {
      const index = taskNumber.get(run.taskId as string) as number;
      const controlMs = 2_000 + (index % 6) * 100 + (run.replicate as number) * 20;
      return firstValidTerminal(run.arm === 'control' ? controlMs : Math.round(controlMs * (0.45 + (index % 3) * 0.05)));
    });
    const report = analyzeExperiment({
      manifest,
      ledgerEntries: ledger,
    });

    expect(report.denominator).toEqual({ repositories: 6, tasks: 24, pairs: 72, cells: 144 });
    expect(report.cells).toHaveLength(144);
    expect(report.cells.every((cell: { terminal: { outcome: string } }) => cell.terminal.outcome === 'first_valid')).toBe(true);
    expect(report.primary.censoring).toBe('unsuccessful cells retained at tau');
    expect(report.primary.treatmentToControlRatio).toBeLessThanOrEqual(0.55);
    expect(report.primary.confidenceInterval).toMatchObject({
      method: 'hierarchical-paired-bootstrap:repository->task->replicate',
      replicates: 50_000,
      seed: 'z08-bootstrap-fixture-v1',
    });
    expect(report.primary.confidenceInterval.upper).toBeLessThan(1);
    expect(report.completion).toMatchObject({ controlRate: 1, treatmentRate: 1, delta: 0, passed: true });
    expect(report.arms.control).toMatchObject({ cells: 72, completed: 72, censored: 0, turns: { total: 216, mean: 3 } });
    expect(report.arms.treatment.usage).toMatchObject({ reportedCells: 72, unreportedCells: 0, totalTokens: 10_800 });
    expect(report.mutation.zeroNoCoverage).toBe(true);
    expect(report.acceptance).toEqual({ primary: true, completion: true, passed: true });
  });

  it('keeps censoring in both the primary mean and percentile report', () => {
    const manifest = makeManifest();
    let controlSeen = 0;
    let treatmentSeen = 0;
    const ledger = makeLedger(manifest, (run) => {
      if (run.arm === 'control') {
        controlSeen += 1;
        return controlSeen <= 36 ? firstValidTerminal(2_000) : censoredTerminal(manifest.design.tauMs);
      }
      treatmentSeen += 1;
      return treatmentSeen <= 35 ? firstValidTerminal(1_000) : censoredTerminal(manifest.design.tauMs);
    });
    const report = analyzeExperiment({ manifest, ledgerEntries: ledger });

    expect(report.arms.control.rmstMs).toBe((36 * 2_000 + 36 * manifest.design.tauMs) / 72);
    expect(report.arms.treatment.rmstMs).toBeCloseTo((35 * 1_000 + 37 * manifest.design.tauMs) / 72);
    expect(report.arms.control.firstValidPercentiles.p50.status).toBe('reached');
    expect(report.arms.treatment.firstValidPercentiles.p50.status).toBe('not_reached');
    expect(report.arms.treatment.censored).toBe(37);
    expect(report.cells.filter((cell: { terminal: { outcome: string } }) => cell.terminal.outcome === 'censored')).toHaveLength(73);
    expect(report.completion.delta).toBeCloseTo(-1 / 72);
  });

  it('fails before analysis when the ledger is incomplete, drifted, reordered, hash-broken, or contains NoCoverage', () => {
    const manifest = makeManifest();

    const incomplete = makeLedger(manifest);
    incomplete.pop();
    expect(() => analyzeExperiment({ manifest, ledgerEntries: incomplete })).toThrow(/expected 145/);

    const hashBroken = clone(makeLedger(manifest));
    (hashBroken[0].terminal as { turns: number }).turns += 1;
    expect(() => analyzeExperiment({ manifest, ledgerEntries: hashBroken })).toThrow(/hash chain/);

    const drift = clone(makeLedger(manifest));
    drift[0].cellFingerprint = '0'.repeat(64);
    expect(() => analyzeExperiment({ manifest, ledgerEntries: resealEntries(drift) })).toThrow(/fingerprint/);

    const order = clone(makeLedger(manifest));
    [order[0], order[1]] = [order[1], order[0]];
    order.forEach((entry, index) => { entry.sequence = index + 1; });
    expect(() => analyzeExperiment({ manifest, ledgerEntries: resealEntries(order) })).toThrow(/execution order/);

    const noCoverage = clone(makeLedger(manifest));
    const statuses = (noCoverage.at(-1)!.groups as Array<{ statuses: Record<string, number> }>)[0].statuses;
    statuses.killed -= 1;
    statuses.noCoverage += 1;
    expect(() => analyzeExperiment({ manifest, ledgerEntries: resealEntries(noCoverage) })).toThrow(/NoCoverage/);
  });
});
