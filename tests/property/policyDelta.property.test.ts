import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  analyzePolicyDelta,
  POLICY_DELTA_SCHEMA_VERSION,
  policyDeltaAcknowledgementMatches,
} from '../../src';
import { runFuzz } from '../helpers/fuzz';

function config(maxAnyCasts: number, include = ['src', 'packages']) {
  return {
    include,
    layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
    rules: [{ from: 'DomainModel', to: 'DomainModel', allowed: false, peerIsolation: true }],
    safety: { maxAnyCasts },
  };
}

const idToken = fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/);
const hashToken = fc.stringMatching(/^[a-f0-9]{8,40}$/);
const nonEmptyReason = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter((s) => s.trim().length > 0);

describe('policy delta properties', () => {
  it('classifies safety thresholds monotonically', () => {
    runFuzz(
      'policy-delta-safety-monotonicity',
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (before, after) => {
          const result = analyzePolicyDelta({
            baseConfig: config(before),
            candidateConfig: config(after),
          });
          if (after > before) {
            expect(result).toMatchObject({ classification: 'weakening', valid: false });
          } else if (after < before) {
            expect(result).toMatchObject({ classification: 'strengthening', valid: true });
          } else {
            expect(result).toMatchObject({ classification: 'neutral', valid: true });
          }
        }
      )
    );
  });

  it('is invariant to ordering and descriptive metadata', () => {
    runFuzz(
      'policy-delta-order-invariance',
      fc.property(fc.string({ minLength: 1, maxLength: 60 }), (description) => {
        const base = config(0);
        const candidate = {
          ...config(0, ['packages', 'src']),
          name: description,
          layers: [{ ...config(0).layers[0], description }],
          rules: [{ ...config(0).rules[0], message: description }],
        };
        expect(analyzePolicyDelta({ baseConfig: base, candidateConfig: candidate })).toMatchObject({
          classification: 'neutral',
          valid: true,
          findings: [],
        });
      })
    );
  });

  /**
   * DF04 — acknowledgement matching: exact base+candidate hashes and the same
   * sorted-unique finding id set (order-insensitive). Empty reason / wrong schema /
   * missing fields always fail closed.
   */
  it('matches acknowledgements only on exact hashes and finding-id sets', () => {
    runFuzz(
      'policy-delta-ack-match',
      fc.property(
        hashToken,
        hashToken,
        fc.array(idToken, { minLength: 0, maxLength: 8 }),
        nonEmptyReason,
        fc.constantFrom(
          'exact',
          'shuffled-ids',
          'duplicate-ids',
          'wrong-base-hash',
          'wrong-candidate-hash',
          'missing-finding',
          'extra-finding',
          'empty-reason',
          'wrong-schema',
          'undefined-ack'
        ),
        (baseHash, candidateHash, findingIds, reason, mode) => {
          const expected = {
            basePolicyHash: baseHash,
            candidatePolicyHash: candidateHash,
            findingIds,
          };
          const uniqueSorted = [...new Set(findingIds)].sort();

          if (mode === 'undefined-ack') {
            expect(policyDeltaAcknowledgementMatches(undefined, expected)).toBe(false);
            return;
          }

          if (mode === 'exact' || mode === 'shuffled-ids' || mode === 'duplicate-ids') {
            let ids = [...findingIds];
            if (mode === 'shuffled-ids') ids = [...uniqueSorted].reverse();
            if (mode === 'duplicate-ids' && uniqueSorted.length > 0) {
              ids = [...uniqueSorted, uniqueSorted[0]!];
            }
            const ack = {
              schemaVersion: POLICY_DELTA_SCHEMA_VERSION,
              basePolicyHash: baseHash,
              candidatePolicyHash: candidateHash,
              findingIds: ids,
              reason,
            };
            expect(policyDeltaAcknowledgementMatches(ack, expected)).toBe(true);
            return;
          }

          if (mode === 'wrong-base-hash') {
            const ack = {
              schemaVersion: POLICY_DELTA_SCHEMA_VERSION,
              basePolicyHash: `${baseHash}x`,
              candidatePolicyHash: candidateHash,
              findingIds,
              reason,
            };
            expect(policyDeltaAcknowledgementMatches(ack, expected)).toBe(false);
            return;
          }

          if (mode === 'wrong-candidate-hash') {
            const ack = {
              schemaVersion: POLICY_DELTA_SCHEMA_VERSION,
              basePolicyHash: baseHash,
              candidatePolicyHash: `${candidateHash}x`,
              findingIds,
              reason,
            };
            expect(policyDeltaAcknowledgementMatches(ack, expected)).toBe(false);
            return;
          }

          if (mode === 'missing-finding') {
            if (uniqueSorted.length === 0) {
              // No finding to drop — treat as exact match.
              expect(
                policyDeltaAcknowledgementMatches(
                  {
                    schemaVersion: POLICY_DELTA_SCHEMA_VERSION,
                    basePolicyHash: baseHash,
                    candidatePolicyHash: candidateHash,
                    findingIds,
                    reason,
                  },
                  expected
                )
              ).toBe(true);
              return;
            }
            const ack = {
              schemaVersion: POLICY_DELTA_SCHEMA_VERSION,
              basePolicyHash: baseHash,
              candidatePolicyHash: candidateHash,
              findingIds: uniqueSorted.slice(1),
              reason,
            };
            expect(policyDeltaAcknowledgementMatches(ack, expected)).toBe(false);
            return;
          }

          if (mode === 'extra-finding') {
            const ack = {
              schemaVersion: POLICY_DELTA_SCHEMA_VERSION,
              basePolicyHash: baseHash,
              candidatePolicyHash: candidateHash,
              findingIds: [...findingIds, 'extra-finding-id'],
              reason,
            };
            expect(policyDeltaAcknowledgementMatches(ack, expected)).toBe(false);
            return;
          }

          if (mode === 'empty-reason') {
            const ack = {
              schemaVersion: POLICY_DELTA_SCHEMA_VERSION,
              basePolicyHash: baseHash,
              candidatePolicyHash: candidateHash,
              findingIds,
              reason: '   ',
            };
            expect(policyDeltaAcknowledgementMatches(ack, expected)).toBe(false);
            return;
          }

          // wrong-schema
          const ack = {
            schemaVersion: '0.9' as typeof POLICY_DELTA_SCHEMA_VERSION,
            basePolicyHash: baseHash,
            candidatePolicyHash: candidateHash,
            findingIds,
            reason,
          };
          expect(policyDeltaAcknowledgementMatches(ack, expected)).toBe(false);
        }
      )
    );
  });
});
