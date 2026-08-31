import { describe, expect, it } from 'vitest';
import { loadArkConfigContract } from '../../../src/domain/configContract';
import {
  effectiveContractPolicyPayload,
  omitLayerDescriptions,
  resolveEffectiveContract,
} from '../../../src/domain/effectiveContract';
import { analyzePolicyDelta, loadContract } from '../../../src/kernel/analysisCore';

const BASE = {
  schemaVersion: '1.1' as const,
  include: ['src'],
  layers: [{ name: 'DomainModel', patterns: ['src/domain/**'], forbiddenGlobals: ['fetch'] }],
  rules: [{ from: 'DomainModel', to: 'Kernel', allowed: false }],
};

const CAPTION = 'Purchase requests — from asked to received.';

function withCaption(description?: string) {
  return {
    ...BASE,
    layers: [
      description === undefined
        ? { ...BASE.layers[0] }
        : { ...BASE.layers[0], description },
    ],
  };
}

describe('LD02 layers[].description policyHash strip (ADR 0035 D4)', () => {
  it('omits description from nested layer objects and keeps other layer fields', () => {
    const input = loadArkConfigContract(withCaption(CAPTION)).config;
    const before = structuredClone(input);
    const stripped = omitLayerDescriptions(input);
    expect(stripped.layers[0]).not.toHaveProperty('description');
    expect(stripped.layers[0]?.name).toBe('DomainModel');
    expect(stripped.layers[0]?.patterns).toEqual(['src/domain/**']);
    expect(stripped.layers[0]?.forbiddenGlobals).toEqual(['fetch']);
    expect(input).toEqual(before);
    expect(input.layers[0]?.description).toBe(CAPTION);
  });

  it('keeps policyHash stable when configs differ only in layers[].description', () => {
    const absent = loadContract(BASE);
    const present = loadContract(withCaption(CAPTION));
    const typoFix = loadContract(withCaption('Purchase requests — from asked to received'));
    expect(absent.policyHash).toBe(present.policyHash);
    expect(present.policyHash).toBe(typoFix.policyHash);
    expect(present.config.layers[0]?.description).toBe(CAPTION);
    expect(typoFix.config.layers[0]?.description).toBe(
      'Purchase requests — from asked to received'
    );
    expect(absent.config.layers[0]).not.toHaveProperty('description');
  });

  it('keeps policyHash stable when a second layer has no description (absence silent)', () => {
    const mixed = loadContract({
      ...BASE,
      layers: [
        { ...BASE.layers[0], description: CAPTION },
        { name: 'Kernel', patterns: ['src/kernel/**'] },
      ],
    });
    const bothSilent = loadContract({
      ...BASE,
      layers: [
        { ...BASE.layers[0] },
        { name: 'Kernel', patterns: ['src/kernel/**'] },
      ],
    });
    expect(mixed.policyHash).toBe(bothSilent.policyHash);
    expect(mixed.config.layers[0]?.description).toBe(CAPTION);
    expect(bothSilent.config.layers[0]).not.toHaveProperty('description');
  });

  it('changes policyHash when import rules change', () => {
    const deny = loadContract(withCaption(CAPTION));
    const allow = loadContract({
      ...withCaption(CAPTION),
      rules: [{ from: 'DomainModel', to: 'Kernel', allowed: true }],
    });
    const extraDeny = loadContract({
      ...withCaption(CAPTION),
      rules: [
        { from: 'DomainModel', to: 'Kernel', allowed: false },
        { from: 'Kernel', to: 'DomainModel', allowed: false },
      ],
    });
    expect(deny.policyHash).not.toBe(allow.policyHash);
    expect(deny.policyHash).not.toBe(extraDeny.policyHash);
  });

  it('does not require a weakening acknowledgement for a caption-only edit', () => {
    const result = analyzePolicyDelta({
      baseConfig: BASE,
      candidateConfig: withCaption(CAPTION),
    });
    expect(result.classification).toBe('neutral');
    expect(result.requiresAcknowledgement).toBe(false);
    expect(result.valid).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.basePolicyHash).toBe(result.candidatePolicyHash);
  });

  it('omits description from the ArkRules-active payload the same way as stewards', () => {
    const { config } = loadArkConfigContract({
      ...withCaption(CAPTION),
      arkRules: { DomainModel: 'arkrules/DomainModel.json' },
    });
    const contract = resolveEffectiveContract({
      config,
      fileContents: {
        'arkrules/DomainModel.json': JSON.stringify({
          schemaVersion: '1.0',
          layer: 'DomainModel',
        }),
      },
    });
    const payload = effectiveContractPolicyPayload(contract) as {
      config: { layers: Array<Record<string, unknown>>; stewards?: unknown };
    };
    expect(payload.config.stewards).toBeUndefined();
    expect(payload.config.layers[0]).not.toHaveProperty('description');
    expect(payload.config.layers[0]?.forbiddenGlobals).toEqual(['fetch']);

    const captionless = resolveEffectiveContract({
      config: loadArkConfigContract({
        ...BASE,
        arkRules: { DomainModel: 'arkrules/DomainModel.json' },
      }).config,
      fileContents: {
        'arkrules/DomainModel.json': JSON.stringify({
          schemaVersion: '1.0',
          layer: 'DomainModel',
        }),
      },
    });
    expect(effectiveContractPolicyPayload(contract)).toEqual(
      effectiveContractPolicyPayload(captionless)
    );

    const hashedWithCaption = loadContract(
      { ...withCaption(CAPTION), arkRules: { DomainModel: 'arkrules/DomainModel.json' } },
      'a.json'
    );
    const hashedSilent = loadContract(
      { ...BASE, arkRules: { DomainModel: 'arkrules/DomainModel.json' } },
      'b.json'
    );
    expect(hashedWithCaption.policyHash).toBe(hashedSilent.policyHash);
    expect(hashedWithCaption.config.layers[0]?.description).toBe(CAPTION);
    expect(hashedSilent.config.layers[0]).not.toHaveProperty('description');
  });
});
