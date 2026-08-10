import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { canPromoteInvariant, type InvariantCoverageEvidence } from '../../src/domain/invariantCoverage';
import { runFuzz } from '../helpers/fuzz';

const idToken = fc.stringMatching(/^[A-Z][A-Z0-9-]{2,24}$/);
const evidenceKind = fc.constantFrom('test-title' as const, 'symbol' as const);

function evidence(
  partial: Partial<InvariantCoverageEvidence> & Pick<InvariantCoverageEvidence, 'invariantId'>
): InvariantCoverageEvidence {
  return {
    layer: 'DomainModel',
    sourceFile: 'arkrules/DomainModel.json',
    mode: 'advisory',
    covered: false,
    evidence: [],
    partial: false,
    description: 'property fixture',
    ...partial,
  };
}

describe('invariant coverage promote honesty properties', () => {
  /**
   * DF04 — promotion gate never invents green: ok only when coverage is present,
   * non-partial, and covered. Partial / uncovered / missing always refuse.
   */
  it('refuses promotion unless coverage is complete and covered', () => {
    runFuzz(
      'invariant-promote-honesty',
      fc.property(
        idToken,
        fc.boolean(),
        fc.boolean(),
        fc.array(evidenceKind, { maxLength: 2 }),
        fc.constantFrom('missing', 'present'),
        (invariantId, covered, partial, kinds, presence) => {
          if (presence === 'missing') {
            const gate = canPromoteInvariant(undefined);
            expect(gate.ok).toBe(false);
            expect(gate.reason).toMatch(/No coverage evidence supplied/i);
            return;
          }

          const cov = evidence({
            invariantId,
            covered,
            partial,
            evidence: [...new Set(kinds)],
          });
          const gate = canPromoteInvariant(cov);

          if (partial) {
            expect(gate.ok).toBe(false);
            expect(gate.reason).toMatch(/partial/i);
            return;
          }
          if (!covered) {
            expect(gate.ok).toBe(false);
            expect(gate.reason).toMatch(new RegExp(invariantId));
            expect(gate.reason).toMatch(/uncovered/i);
            return;
          }
          expect(gate.ok).toBe(true);
          expect(gate.reason).toMatch(new RegExp(invariantId));
        }
      )
    );
  });

  it('never returns ok when partial is true, regardless of covered flag', () => {
    runFuzz(
      'invariant-promote-partial-never-ok',
      fc.property(idToken, fc.boolean(), fc.array(evidenceKind, { maxLength: 2 }), (id, covered, kinds) => {
        const gate = canPromoteInvariant(
          evidence({
            invariantId: id,
            covered,
            partial: true,
            evidence: [...new Set(kinds)],
          })
        );
        expect(gate.ok).toBe(false);
      })
    );
  });
});
