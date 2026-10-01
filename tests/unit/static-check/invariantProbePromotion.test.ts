/**
 * ADR 0039 D2: committed probe evidence reaches the one promotion judge on
 * every surface (--promote, the policy delta, status, rules inventory), and can
 * only subtract. No artifact, a stale row, a killed row or a malformed file
 * changes nothing.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzePolicyTransition } from '../../../bin/lib/policy-delta-io.mjs';
import { loadSensorMap } from '../../../bin/lib/sensor-promote-io.mjs';
import {
  buildRulesInventoryPayload,
  formatArkRulesDoctorLines,
  summarizeRulesUnderContract,
} from '../../../bin/lib/rules-under-contract.mjs';
import { hashProjectFile, invariantIdentityHash } from '../../../bin/lib/invariant-probe-io.mjs';
import { buildInvariantProbeArtifact } from '../../../bin/lib/invariant-probe.mjs';

const roots: string[] = [];
const ID = 'INV-ORDER-003';
const CONFIG = {
  schemaVersion: '1.1',
  include: ['src'],
  layers: [{ name: 'DomainModel', patterns: ['src/**'] }],
  rules: [],
  dynamicImportAllowlist: [],
  arkRules: { DomainModel: 'arkrules/DomainModel.json' },
  coverage: { coverageRoots: ['tests'] },
};

function write(root: string, rel: string, text: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}

function rules(mode: 'advisory' | 'enforced') {
  return `${JSON.stringify({
    schemaVersion: '1.0',
    layer: 'DomainModel',
    invariants: [{ id: ID, description: 'Order total is never negative', coverage: { symbol: 'orderTotal' }, mode }],
  })}\n`;
}

function git(root: string, args: string[]): void {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'ArkGate Test',
      GIT_AUTHOR_EMAIL: 'arkgate@example.test',
      GIT_COMMITTER_NAME: 'ArkGate Test',
      GIT_COMMITTER_EMAIL: 'arkgate@example.test',
    },
  });
  if (result.status !== 0) throw new Error(result.stderr);
}

function project(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-probe-promote-')));
  roots.push(root);
  write(root, 'src/order.ts', 'export function orderTotal(n: number) {\n  if (n < 0) throw new Error("negative");\n  return n;\n}\n');
  write(root, 'tests/order.test.ts', `it('${ID} keeps totals non-negative', () => {});\n`);
  write(root, 'ark.config.json', `${JSON.stringify(CONFIG)}\n`);
  write(root, 'arkrules/DomainModel.json', rules('advisory'));
  git(root, ['init']);
  git(root, ['checkout', '-b', 'main']);
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'base']);
  return root;
}

function writeArtifact(root: string, verdict: 'survived' | 'killed' | 'not-reached') {
  const reason = verdict === 'survived' ? 'mutant-survived' : verdict === 'killed' ? 'all-killed' : 'reach-canary-survived';
  const artifact = buildInvariantProbeArtifact({
    arkgateVersion: 'test',
    runner: { id: 'node', version: '26.0.0' },
    probedOn: '2026-09-30',
    rows: [
      {
        invariantId: ID,
        invariantHash: invariantIdentityHash({ id: ID, coverage: { symbol: 'orderTotal' } }),
        layer: 'DomainModel',
        sourceFile: 'arkrules/DomainModel.json',
        mode: 'advisory',
        symbol: 'orderTotal',
        symbolFile: 'src/order.ts',
        symbolFileHash: hashProjectFile(root, 'src/order.ts'),
        tests: [{ path: 'tests/order.test.ts', contentHash: hashProjectFile(root, 'tests/order.test.ts')! }],
        baseline: { status: 'green', durationMs: 5 },
        wiring: { load: 'killed', reach: verdict === 'not-reached' ? 'survived' : 'killed' },
        mutants:
          verdict === 'not-reached'
            ? []
            : [
                {
                  id: 'drop-throw@2:14',
                  operator: 'drop-throw',
                  line: 2,
                  column: 14,
                  original: 'throw new Error("negative");',
                  replacement: ';',
                  status: verdict === 'survived' ? 'survived' : 'killed',
                  durationMs: 5,
                },
              ],
        verdict,
        reason,
      },
    ],
  });
  write(root, '.ark/invariant-probe.json', `${JSON.stringify(artifact, null, 2)}\n`);
}

function promotion(root: string) {
  write(root, 'arkrules/DomainModel.json', rules('enforced'));
  const result = analyzePolicyTransition({
    root,
    configPath: 'ark.config.json',
    candidateConfig: CONFIG,
    strictMerge: true,
    baseRef: 'HEAD',
  });
  write(root, 'arkrules/DomainModel.json', rules('advisory'));
  const ids = (result?.findings ?? []).map((finding: { id: string }) => finding.id);
  return {
    promoted: ids.some((id: string) => id.endsWith(':arkrule-invariant-promoted')),
    refused: ids.some((id: string) => id.endsWith(':arkrule-invariant-promote-refused')),
    messages: (result?.findings ?? []).map((finding: { message: string }) => finding.message).join('\n'),
  };
}

function sensorRow(root: string) {
  const loaded = loadSensorMap(root, CONFIG) as { map: { invariants: Array<{ id: string; promotable: boolean; blocker: string | null }> } };
  return loaded.map.invariants.find((row) => row.id === ID);
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('probe evidence on the promotion surfaces (ADR 0039 D2)', () => {
  it('no artifact: promotion and status behave exactly as before', () => {
    const root = project();
    expect(sensorRow(root)).toMatchObject({ promotable: true, blocker: null });
    expect(promotion(root)).toMatchObject({ promoted: true, refused: false });
    const section = summarizeRulesUnderContract(root, CONFIG, { files: [{ path: 'src/order.ts' }] });
    expect(section.probe).toBeUndefined();
    expect(formatArkRulesDoctorLines(section).join('\n')).not.toMatch(/probe/i);
    expect(buildRulesInventoryPayload(root, CONFIG, ['src/order.ts']).payload.coverageEvidence?.probe).toBeUndefined();
  });

  it.each(['survived', 'not-reached'] as const)('a fresh %s row refuses on --promote and the policy delta alike', (verdict) => {
    const root = project();
    writeArtifact(root, verdict);
    expect(sensorRow(root)).toMatchObject({ promotable: false, blocker: 'probe-survived' });
    const delta = promotion(root);
    expect(delta).toMatchObject({ promoted: false, refused: true });
    expect(delta.messages).toMatch(verdict === 'survived' ? /do not pin it/ : /never call the declared symbol/);
    const section = summarizeRulesUnderContract(root, CONFIG, { files: [{ path: 'src/order.ts' }] });
    expect(section.probe.rows).toEqual([expect.objectContaining({ id: ID, status: verdict, ruleId: 'INVARIANT_PROBE_SURVIVED' })]);
    expect(formatArkRulesDoctorLines(section).join('\n')).toMatch(/INVARIANT_PROBE_SURVIVED, advisory; promotion refuses/);
    expect(buildRulesInventoryPayload(root, CONFIG, ['src/order.ts']).payload.coverageEvidence.probe.rows[0].status).toBe(verdict);
  });

  it('a stale row (a covering test changed) and a killed row change nothing', () => {
    const root = project();
    writeArtifact(root, 'survived');
    write(root, 'tests/order.test.ts', `it('${ID} keeps totals non-negative', () => { expect(1).toBe(1); });\n`);
    expect(sensorRow(root)).toMatchObject({ promotable: true, blocker: null });
    expect(promotion(root)).toMatchObject({ promoted: true, refused: false });
    const section = summarizeRulesUnderContract(root, CONFIG, { files: [{ path: 'src/order.ts' }] });
    expect(section.probe.rows[0]).toMatchObject({ status: 'stale', staleBecause: ['tests/order.test.ts changed'] });

    writeArtifact(root, 'killed');
    expect(sensorRow(root)).toMatchObject({ promotable: true, blocker: null });
    expect(promotion(root)).toMatchObject({ promoted: true, refused: false });
  });

  it('a malformed artifact changes nothing and status says it was ignored', () => {
    const root = project();
    write(root, '.ark/invariant-probe.json', '{"kind":"arkgate-invariant-probe","schemaVersion":"1.0","invariants":"nope"}\n');
    expect(sensorRow(root)).toMatchObject({ promotable: true, blocker: null });
    expect(promotion(root)).toMatchObject({ promoted: true, refused: false });
    const section = summarizeRulesUnderContract(root, CONFIG, { files: [{ path: 'src/order.ts' }] });
    expect(section.probe.note).toMatch(/was ignored/);
    write(root, '.ark/invariant-probe.json', 'not json');
    expect(sensorRow(root)).toMatchObject({ promotable: true, blocker: null });
  });
});
