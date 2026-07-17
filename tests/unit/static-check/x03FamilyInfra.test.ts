/**
 * X03 — the lateral-adapter smell recognizes family infrastructure (field
 * feedback, amarilla 2026-07-16): an adapter layer explicitly allowed into its
 * OWN family's infra base (`PaymentsAdapters -> PaymentsInfra`) is the
 * sanctioned direction, not a lateral peer. Cross-family edges, non-infra
 * siblings, and the reverse direction (base into member) still fire.
 */
import { describe, it, expect } from 'vitest';
import { detectContractSmells } from '../../../bin/lib/contract-smells.mjs';

const NO_ACKS = { exists: false, acks: [] };

function lateralFor(rules: Array<{ from: string; to: string; allowed: boolean }>) {
  const layers = [...new Set(rules.flatMap((r) => [r.from, r.to]))].map((name) => ({
    name,
    patterns: [`src/${name.toLowerCase()}/**`],
  }));
  const smells = detectContractSmells({ layers, rules }, null, NO_ACKS);
  return smells.find((s) => s.id === 'contract-lateral-adapter-allow');
}

describe('X03 lateral-adapter smell — family infrastructure carve-out', () => {
  it('adapter into its own family infra base is not a lateral peer', () => {
    for (const to of [
      'PaymentsInfra',
      'PaymentsInfrastructure',
      'PaymentsCore',
      'PaymentsShared',
      'PaymentsBase',
      'PaymentsKernel',
      'PaymentsPlatform',
    ]) {
      expect(
        lateralFor([{ from: 'PaymentsAdapters', to, allowed: true }]),
        `PaymentsAdapters -> ${to}`
      ).toBeUndefined();
    }
  });

  it('delimiter and case variants match the same family', () => {
    expect(
      lateralFor([{ from: 'payments-adapters', to: 'payments-infra', allowed: true }])
    ).toBeUndefined();
    expect(
      lateralFor([{ from: 'payments_adapters', to: 'Payments Infrastructure', allowed: true }])
    ).toBeUndefined();
  });

  it('cross-family adapter edges still fire', () => {
    const smell = lateralFor([
      { from: 'PersistenceAdapters', to: 'IntegrationAdapters', allowed: true },
    ]);
    expect(smell).toBeDefined();
    expect(smell!.evidence).toContain('edge:PersistenceAdapters->IntegrationAdapters');
    // Sharing a family token is not enough when the target is not an infra base.
    expect(
      lateralFor([{ from: 'PaymentsAdapters', to: 'BillingInfra', allowed: true }])
    ).toBeDefined();
  });

  it('a same-family sibling that is not an infra base still fires', () => {
    expect(
      lateralFor([
        { from: 'IntegrationAdapters', to: 'IntegrationAdaptersLegacy', allowed: true },
      ])
    ).toBeDefined();
    // An infra word inside a sibling adapter name is not a base — every
    // remaining token must be an infra word (cross-model review finding).
    expect(
      lateralFor([{ from: 'PaymentsAdapters', to: 'PaymentsCoreAdapters', allowed: true }])
    ).toBeDefined();
    expect(
      lateralFor([{ from: 'PaymentsAdapters', to: 'PaymentsSharedGateway', allowed: true }])
    ).toBeDefined();
    // Multi-token pure bases still qualify.
    expect(
      lateralFor([{ from: 'PaymentsAdapters', to: 'PaymentsSharedInfra', allowed: true }])
    ).toBeUndefined();
  });

  it('the reverse direction — family base into a member adapter — still fires', () => {
    expect(
      lateralFor([{ from: 'PaymentsInfra', to: 'PaymentsAdapters', allowed: true }])
    ).toBeDefined();
  });

  it('a single-letter family token never groups layers', () => {
    expect(lateralFor([{ from: 'AAdapters', to: 'AInfra', allowed: true }])).toBeDefined();
  });

  it('infra-ish words embedded in a longer word do not read as a base', () => {
    // "Coredump" tokenizes as one word; only whole tokens count as infra.
    expect(
      lateralFor([{ from: 'PaymentsAdapters', to: 'PaymentsCoredumpGateway', allowed: true }])
    ).toBeDefined();
  });
});
