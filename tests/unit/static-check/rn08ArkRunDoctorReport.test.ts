/**
 * RN08: doctor / status / HTML report ArkRun section (notAScore) + mergePlanes honesty.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeSemanticGateArtifacts } from '../../helpers/semanticGateArtifacts';
import { summarizeArkRunSection } from '../../../bin/lib/ark-run-doctor.mjs';
import { formatArkRunHtml } from '../../../bin/lib/ark-run-report.mjs';
import { summarizeRulesUnderContract } from '../../../bin/lib/rules-under-contract.mjs';
import { collectStatusFacts } from '../../../bin/lib/status-command.mjs';
import { buildStatusManifest } from '../../../src/domain/statusManifest';

const CHECK = path.resolve('bin/ark-check.mjs');
const FIXTURES = path.resolve('tests/fixtures/arkrun-sensors');
const roots: string[] = [];

function copyCase(name: string): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `ark-rn08-${name}-`)));
  roots.push(root);
  fs.cpSync(path.join(FIXTURES, name), root, { recursive: true });
  writeSemanticGateArtifacts(root);
  return root;
}

function runJson(root: string, extra: string[] = []) {
  const run = spawnSync(
    process.execPath,
    [CHECK, '--root', root, '--config', 'ark.config.json', '--json', '--no-cache', ...extra],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
  );
  return {
    status: run.status ?? 1,
    data: JSON.parse(run.stdout || '{}') as Record<string, unknown>,
    raw: `${run.stdout}\n${run.stderr}`,
  };
}

describe('RN08 ArkRun doctor / report / status', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('absence stays silent on doctor arkRun and does not arm extra merge teeth', () => {
    const root = copyCase('absent');
    const doctor = runJson(root, ['--doctor']);
    const payload = doctor.data as {
      doctor?: {
        arkRun?: {
          notAScore?: boolean;
          active?: boolean;
          extraMergeTeeth?: boolean;
          residual?: { count?: number };
        };
        rulesUnderContract?: { mergePlanes?: { arkRun?: { present?: boolean }; extraMergeTeeth?: boolean } };
      };
    };
    expect(payload.doctor?.arkRun?.notAScore).toBe(true);
    expect(payload.doctor?.arkRun?.active).toBe(false);
    expect(payload.doctor?.arkRun?.extraMergeTeeth).toBe(false);
    expect(payload.doctor?.arkRun?.residual?.count).toBe(0);
    expect(payload.doctor?.rulesUnderContract?.mergePlanes?.arkRun?.present).toBe(false);
    expect(payload.doctor?.rulesUnderContract?.mergePlanes?.extraMergeTeeth).toBe(false);
  });

  it('enforced extra exposes residual + mergePlanes honesty on doctor JSON', () => {
    const root = copyCase('missing-root');
    const doctor = runJson(root, ['--doctor']);
    const arkRun = (doctor.data as { doctor?: { arkRun?: Record<string, unknown> } }).doctor?.arkRun;
    expect(arkRun?.notAScore).toBe(true);
    expect(arkRun?.active).toBe(true);
    expect(arkRun?.mode).toBe('enforced');
    expect(arkRun?.extraMergeTeeth).toBe(true);
    expect(arkRun?.residual).toMatchObject({ count: expect.any(Number) });
    expect((arkRun?.residual as { ruleIds?: string[] }).ruleIds).toContain('ARKRUN_MISSING_ROOT');
    const merge = (doctor.data as { doctor?: { rulesUnderContract?: { mergePlanes?: Record<string, unknown> } } })
      .doctor?.rulesUnderContract?.mergePlanes;
    expect(merge?.arkRun).toMatchObject({ present: true, mode: 'enforced', extraMergeTeeth: true });
    expect(merge?.extraMergeTeeth).toBe(true);
    expect(String(merge?.failMergeWhen)).toMatch(/ArkRun/i);
    expect(String(merge?.dualPlaneStamp)).toMatch(/not a score/i);
  });

  it('HTML --report emits data-advisory="arkRun" and no score UI', () => {
    const root = copyCase('kernel-in-domain');
    spawnSync(
      process.execPath,
      [CHECK, '--root', root, '--config', 'ark.config.json', '--report', 'out.html', '--no-cache'],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
    );
    const html = fs.readFileSync(path.join(root, 'out.html'), 'utf8');
    expect(html).toContain('data-advisory="arkRun"');
    expect(html).toMatch(/not a score|notAScore/i);
    expect(html).toContain('ARKRUN_KERNEL_IN_DOMAIN');
    expect(html).not.toMatch(/Excellent|score bar|\d+\s*\/\s*10/i);
    const latest = JSON.parse(fs.readFileSync(path.join(root, '.ark/reports/latest.json'), 'utf8')) as {
      arkRun?: { notAScore?: boolean; present?: boolean; residual?: number };
    };
    expect(latest.arkRun?.notAScore).toBe(true);
    expect(latest.arkRun?.present).toBe(true);
    expect((latest.arkRun?.residual ?? 0) > 0).toBe(true);
  });

  it('advisory never arms extraMergeTeeth on mergePlanes even with residual', () => {
    const root = copyCase('missing-root');
    const configPath = path.join(root, 'ark.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      arkRun?: { mode?: string };
    };
    if (!config.arkRun) throw new Error('fixture missing arkRun');
    config.arkRun.mode = 'advisory';
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    const doctor = runJson(root, ['--doctor']);
    const arkRun = (doctor.data as { doctor?: { arkRun?: { extraMergeTeeth?: boolean; mode?: string } } }).doctor
      ?.arkRun;
    const merge = (
      doctor.data as { doctor?: { rulesUnderContract?: { mergePlanes?: { extraMergeTeeth?: boolean } } } }
    ).doctor?.rulesUnderContract?.mergePlanes;
    expect(arkRun?.mode).toBe('advisory');
    expect(arkRun?.extraMergeTeeth).toBe(false);
    expect(merge?.extraMergeTeeth).toBe(false);
  });
});

describe('RN08 ArkRun HTML formatter + status facts', () => {
  it('renders inactive and active shapes with notAScore', () => {
    const esc = (v: unknown) => String(v);
    const inactive = formatArkRunHtml(summarizeArkRunSection({}), esc);
    expect(inactive).toContain('data-advisory="arkRun"');
    expect(inactive).toMatch(/silent/i);
    const active = formatArkRunHtml(
      summarizeArkRunSection({
        arkRun: {
          mode: 'enforced',
          compositionRoots: ['src/main.ts'],
          managedLayers: ['ApplicationOrchestration'],
          requireDeclarations: true,
        },
        findings: [{ ruleId: 'ARKRUN_DIRECT_NEW' }],
        classification: { governedPercent: 100, populatedLayerCount: 1 },
      }),
      esc
    );
    expect(active).toContain('ARKRUN_DIRECT_NEW');
    expect(active).toMatch(/notAScore|not a score/i);
    expect(active).toMatch(/extra merge teeth armed/i);
  });

  it('HTML Merge planes: sentence follows mergePlanes, not an ArkRun-only override', () => {
    const esc = (v: unknown) => String(v);
    const section = summarizeArkRunSection({
      arkRun: {
        mode: 'advisory',
        compositionRoots: ['src/main.ts'],
        managedLayers: ['ApplicationOrchestration'],
      },
      findings: [{ ruleId: 'ARKRUN_DIRECT_NEW' }],
      classification: { governedPercent: 100, populatedLayerCount: 1 },
      arkRules: { active: true, structureEnforced: 2, structureTotal: 2 },
    });
    const html = formatArkRunHtml(section, esc);
    expect(section.mergePlanes.extraMergeTeeth).toBe(true);
    expect(html).toContain(`<b>Merge planes:</b> ${section.mergePlanes.failMergeWhen}`);
    expect(html).toMatch(/structure\/invariant/i);
    expect(html).not.toContain(
      '<b>Merge planes:</b> Layer graph only — advisory ArkRun never merge-blocks.'
    );
  });

  it('rulesUnderContract mergePlanes names ArkRun even when ArkRules are off', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-rn08-merge-'));
    roots.push(root);
    const summary = summarizeRulesUnderContract(root, {
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
      arkRun: { mode: 'enforced', compositionRoots: ['src/main.ts'], managedLayers: ['DomainModel'] },
    });
    expect(summary.active).toBe(false);
    expect(summary.mergePlanes.arkRun.present).toBe(true);
    expect(summary.mergePlanes.arkRun.mode).toBe('enforced');
    expect(summary.mergePlanes.arkRun.extraMergeTeeth).toBe(true);
    expect(summary.mergePlanes.extraMergeTeeth).toBe(true);
    expect(summary.mergePlanes.failMergeWhen).toMatch(/ArkRun/i);
  });

  it('status manifest carries arkRun without a score field', () => {
    const status = buildStatusManifest({
      arkgateVersion: '4.6.7',
      resolvedRoot: '/repo',
      resolvedConfigPath: '/repo/ark.config.json',
      activeHost: 'claude',
      hardWriteActive: true,
      lastCheckVerdict: 'pass',
      lastCheckAt: '2026-08-25T00:00:00.000Z',
      activeViolations: 0,
      leftoverDesignWork: false,
      arkRun: {
        notAScore: true,
        present: true,
        mode: 'advisory',
        extraMergeTeeth: false,
        residual: 2,
      },
    });
    expect(status.arkRun).toEqual({
      notAScore: true,
      present: true,
      mode: 'advisory',
      extraMergeTeeth: false,
      residual: 2,
    });
    expect(status.nextAction.id).toBe('review-arkrun-residual');
    expect(status).not.toHaveProperty('score');
  });

  it('status extraMergeTeeth stays false without a latest.arkRun snapshot', () => {
    const root = copyCase('missing-root');
    const facts = collectStatusFacts({ root });
    expect(facts.arkRun).toMatchObject({
      notAScore: true,
      present: true,
      mode: 'enforced',
      extraMergeTeeth: false,
      residual: null,
    });
  });
});
