/**
 * MCP ark_policy_delta ArkRules inputs: base catalog is supplied as data or the call
 * is refused; never a config-only verdict that ignores ArkRule demotions/deletions.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzePolicyDelta } from '../../../bin/lib/analysis-engine.mjs';
import { resolvePolicyDeltaArkRules } from '../../../bin/lib/policy-delta-io.mjs';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const CONFIG = {
  schemaVersion: '1.1',
  include: ['src'],
  layers: [{ name: 'Domain', patterns: ['src/domain/**'] }],
  rules: [],
  arkRules: { Domain: 'arkrules/Domain.json' },
};
const ENFORCED = { id: 'private-state', sensor: 'aggregate-private-state', mode: 'enforced' };
const rulesFile = (structure: unknown[]) => ({ schemaVersion: '1.0', layer: 'Domain', structure });

function projectWith(structure: unknown[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-mcp-policy-arkrules-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'arkrules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify(CONFIG));
  fs.writeFileSync(path.join(root, 'arkrules', 'Domain.json'), JSON.stringify(rulesFile(structure)));
  return root;
}

describe('ark_policy_delta ArkRules inputs (arkrules cluster)', () => {
  it('refuses when baseConfig maps arkRules and no base catalog is supplied', () => {
    const root = projectWith([{ ...ENFORCED, mode: 'advisory' }]);
    expect(() =>
      resolvePolicyDeltaArkRules({
        root,
        baseConfig: CONFIG,
        candidateConfig: CONFIG,
        candidateIsProjectConfig: true,
      })
    ).toThrow(/baseArkRuleFiles/);
  });

  it('classifies a demotion as weakening when the base catalog is supplied', () => {
    const root = projectWith([{ ...ENFORCED, mode: 'advisory' }]);
    const ark = resolvePolicyDeltaArkRules({
      root,
      baseConfig: CONFIG,
      candidateConfig: CONFIG,
      candidateIsProjectConfig: true,
      baseArkRuleFiles: { 'arkrules/Domain.json': rulesFile([ENFORCED]) },
    });
    const delta = analyzePolicyDelta({ baseConfig: CONFIG, candidateConfig: CONFIG, ...ark });
    expect(delta.classification).toBe('weakening');
    expect(delta.valid).toBe(false);
    expect(delta.requiresAcknowledgement).toBe(true);
  });

  it('requires candidateArkRuleFiles for a non-project candidate that maps arkRules', () => {
    const root = projectWith([ENFORCED]);
    const other = { ...CONFIG, include: ['src', 'lib'] };
    expect(() =>
      resolvePolicyDeltaArkRules({
        root,
        baseConfig: CONFIG,
        candidateConfig: other,
        candidateIsProjectConfig: false,
        baseArkRuleFiles: { 'arkrules/Domain.json': rulesFile([ENFORCED]) },
      })
    ).toThrow(/candidateArkRuleFiles/);
    const ark = resolvePolicyDeltaArkRules({
      root,
      baseConfig: CONFIG,
      candidateConfig: other,
      candidateIsProjectConfig: false,
      baseArkRuleFiles: { 'arkrules/Domain.json': rulesFile([ENFORCED]) },
      candidateArkRuleFiles: { 'arkrules/Domain.json': rulesFile([]) },
    });
    const delta = analyzePolicyDelta({ baseConfig: CONFIG, candidateConfig: other, ...ark });
    expect(delta.classification).toBe('weakening');
  });

  it('a base config without arkRules needs no catalog', () => {
    const root = projectWith([ENFORCED]);
    const { arkRules: _unused, ...plain } = CONFIG;
    const ark = resolvePolicyDeltaArkRules({
      root,
      baseConfig: plain,
      candidateConfig: CONFIG,
      candidateIsProjectConfig: true,
    });
    expect(ark.baseArkRules.structure).toHaveLength(0);
    expect(ark.candidateArkRules.structure).toHaveLength(1);
  });
});
