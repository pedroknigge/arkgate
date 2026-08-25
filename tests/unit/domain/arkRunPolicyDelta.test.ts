import { describe, expect, it } from 'vitest';
import { classifyArkPolicyDelta } from '../../../src/domain/policyDelta';
import { loadArkConfigContract } from '../../../src/domain/configContract';
import {
  analyzePolicyDelta,
  analyzeProject,
  loadContract,
} from '../../../src/kernel/analysisCore';

const BASE = {
  include: ['src'],
  layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
  rules: [{ from: 'DomainModel', to: 'Kernel', allowed: false }],
};

function loaded(extra?: Record<string, unknown>) {
  return loadArkConfigContract({
    ...BASE,
    schemaVersion: '1.2',
    ...(extra ? { arkRun: extra } : {}),
  }).config;
}

describe('RN02 arkRun policy-delta + silence', () => {
  it('keeps policyHash stable across 1.1 and 1.2 when arkRun is absent', () => {
    const from11 = loadContract({ ...BASE, schemaVersion: '1.1' });
    const from12 = loadContract({ ...BASE, schemaVersion: '1.2' });
    expect(from11.policyHash).toBe(from12.policyHash);
    expect(from11.config.arkRun).toBeUndefined();
  });

  it('does not change layer verdicts when arkRun is absent or advisory', () => {
    const files = [{ path: 'src/domain/a.ts', content: 'export const a = 1;\n' }];
    const without = analyzeProject({
      contract: loadContract({ ...BASE, schemaVersion: '1.1' }),
      files,
    });
    const withExtra = analyzeProject({
      contract: loadContract({
        ...BASE,
        schemaVersion: '1.2',
        arkRun: {
          mode: 'advisory',
          compositionRoots: ['src/main.ts'],
          managedLayers: ['DomainModel'],
        },
      }),
      files,
    });
    expect(withExtra.valid).toBe(without.valid);
    expect(withExtra.ir.violations.map((v) => v.ruleId)).toEqual(
      without.ir.violations.map((v) => v.ruleId)
    );
  });

  it('classifies add / promote / demote / delete of the extra', () => {
    const absent = loaded();
    const advisory = loaded({
      mode: 'advisory',
      compositionRoots: ['src/main.ts'],
      managedLayers: ['DomainModel'],
    });
    const enforced = loaded({
      mode: 'enforced',
      compositionRoots: ['src/main.ts'],
      managedLayers: ['DomainModel'],
    });

    const added = classifyArkPolicyDelta(absent, advisory);
    expect(added.classification).toBe('strengthening');
    expect(added.findings.some((f) => f.id.includes('arkrun-added'))).toBe(true);

    const promoted = classifyArkPolicyDelta(advisory, enforced);
    expect(promoted.classification).toBe('strengthening');
    expect(promoted.findings.some((f) => f.id.includes('arkrun-promoted'))).toBe(true);

    const demoted = classifyArkPolicyDelta(enforced, advisory);
    expect(demoted.classification).toBe('weakening');
    expect(demoted.findings.some((f) => f.id.includes('arkrun-demoted'))).toBe(true);

    const removed = classifyArkPolicyDelta(advisory, absent);
    expect(removed.classification).toBe('weakening');
    expect(removed.findings.some((f) => f.id.includes('arkrun-removed'))).toBe(true);
  });

  it('classifies composition-root and declaration coverage changes', () => {
    const base = loaded({
      mode: 'advisory',
      compositionRoots: ['src/main.ts', 'src/nestjs/**'],
      managedLayers: ['DomainModel'],
      requireDeclarations: true,
    });
    const weaker = loaded({
      mode: 'advisory',
      compositionRoots: ['src/main.ts'],
      managedLayers: [],
      requireDeclarations: false,
    });
    const delta = classifyArkPolicyDelta(base, weaker);
    expect(delta.classification).toBe('weakening');
    expect(delta.findings.map((f) => f.path)).toEqual(
      expect.arrayContaining([
        '$.arkRun.compositionRoots',
        '$.arkRun.managedLayers',
        '$.arkRun.requireDeclarations',
      ])
    );
  });

  it('analyzePolicyDelta requires acknowledgement for arkRun demotion', () => {
    const advisory = {
      ...BASE,
      schemaVersion: '1.2' as const,
      arkRun: {
        mode: 'advisory' as const,
        compositionRoots: ['src/main.ts'],
        managedLayers: ['DomainModel'],
      },
    };
    const enforced = {
      ...advisory,
      arkRun: { ...advisory.arkRun, mode: 'enforced' as const },
    };
    const result = analyzePolicyDelta({
      baseConfig: enforced,
      candidateConfig: advisory,
    });
    expect(result.requiresAcknowledgement).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.basePolicyHash).not.toBe(result.candidatePolicyHash);
  });
});
