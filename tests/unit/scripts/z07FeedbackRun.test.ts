import { describe, expect, it } from 'vitest';
import { budgetFailures } from '../../../scripts/z07-feedback-run.mjs';

describe('Z07 feedback budget', () => {
  it('fails closed on lane errors, missing budgets, and wall-time regressions', () => {
    const report = { mode: 'pr', wallMs: 9, lanes: [{ kind: 'pure', status: 0 }] };
    expect(budgetFailures(report, { modes: { pr: { maxWallMs: 10 } } })).toEqual([]);
    expect(budgetFailures({ ...report, wallMs: 10 }, { modes: { pr: { maxWallMs: 10 } } })).toEqual([
      'pr wall 10ms is not below 10ms',
    ]);
    expect(budgetFailures({ ...report, lanes: [{ kind: 'pure', status: 1 }] }, { modes: {} })).toEqual([
      'pure lane exited 1',
      'missing pr wall-time budget',
    ]);
    expect(budgetFailures({
      ...report,
      lanes: [{ kind: 'pure', status: 1, timedOut: true, timeoutMs: 10 }],
    }, { modes: { pr: { maxWallMs: 10 } } })).toEqual(['pure lane exceeded 10ms']);
  });
});
