import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { canPromoteInvariant, type InvariantCoverageEvidence } from '../../src/domain/invariantCoverage';
import {
  INVARIANT_PROBE_REASONS,
  INVARIANT_PROBE_VERDICTS,
  planMutants,
  type InvariantProbeSummary,
  type ProbeSite,
} from '../../src/domain/invariantProbe';
import { runFuzz } from '../helpers/fuzz';

const idToken = fc.stringMatching(/^[A-Z][A-Z0-9-]{2,24}$/);

const evidenceArb = fc.record({
  covered: fc.boolean(),
  partial: fc.boolean(),
  evidence: fc.subarray(['test-title', 'symbol'] as const),
  outsideDeclaredRoots: fc.option(fc.boolean(), { nil: undefined }),
  coverageRootsDeclared: fc.option(fc.boolean(), { nil: undefined }),
});

const probeArb: fc.Arbitrary<InvariantProbeSummary> = fc.record({
  verdict: fc.constantFrom(...INVARIANT_PROBE_VERDICTS),
  reason: fc.constantFrom(...INVARIANT_PROBE_REASONS),
  fresh: fc.boolean(),
  survivors: fc.constant([]),
});

describe('invariant probe promotion properties (ADR 0039 D2)', () => {
  /**
   * The probe can only subtract: for every probe state except a fresh
   * survived / not-reached, promotion equals today's promotion (no probe).
   * A fresh survived / not-reached never turns a refusal into an allow.
   */
  it('changes promotion only for a fresh survived or not-reached row', () => {
    runFuzz(
      'invariant-probe-only-subtracts',
      fc.property(idToken, evidenceArb, probeArb, (invariantId, base, probe) => {
        const coverage: InvariantCoverageEvidence = {
          invariantId,
          layer: 'DomainModel',
          sourceFile: 'arkrules/DomainModel.json',
          mode: 'advisory',
          description: 'property fixture',
          ...base,
          evidence: [...base.evidence],
        };
        const today = canPromoteInvariant(coverage);
        const withProbe = canPromoteInvariant({ ...coverage, probe });
        const refuses = probe.fresh && (probe.verdict === 'survived' || probe.verdict === 'not-reached');
        if (!refuses || !today.ok) {
          expect(withProbe).toEqual(today);
          return;
        }
        expect(withProbe.ok).toBe(false);
        expect(withProbe.blocker).toBe('probe-survived');
      })
    );
  });

  it('plans the same mutants whatever order the sites arrive in', () => {
    const siteArb: fc.Arbitrary<ProbeSite> = fc
      .record({
        kind: fc.constantFrom('guard', 'throw', 'comparison', 'numeric', 'boolean'),
        start: fc.nat({ max: 500 }),
        width: fc.integer({ min: 1, max: 8 }),
        text: fc.constantFrom('<', '>=', '===', '!=', '42', 'true', 'x > 1', 'throw e;'),
      })
      .map(({ kind, start, width, text }) => ({ kind, start, end: start + width, line: 1, column: start + 1, text }));
    runFuzz(
      'invariant-probe-plan-deterministic',
      fc.property(fc.array(siteArb, { maxLength: 12 }), (sites) => {
        const forward = planMutants(sites);
        expect(planMutants([...sites].reverse())).toEqual(forward);
        expect(forward.length).toBeLessThanOrEqual(3);
        expect(new Set(forward.map((mutant) => mutant.operator)).size).toBe(forward.length);
      })
    );
  });
});
