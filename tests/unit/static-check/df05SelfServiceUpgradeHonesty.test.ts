/**
 * DF05 — Self-service upgrade / activation honesty residual (one pilot).
 *
 * Self-service criterion (must be quoted in PR / this fixture):
 *   After a managed upgrade (or equivalent), can a consumer learn from package surfaces whether
 *   the write-path is still honestly labeled active/advisory and whether customized install
 *   content was preserved — without asking a maintainer?
 *
 * Pilot class: managed-upgrade content-identity preserve + activation label post-upgrade.
 * Not in scope: new hosts; false hard-write claims for soft hosts.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyManagedUpgrade,
  planManagedUpgrade,
  projectHostWritePathActivation,
  projectManagedUpgradeSelfServiceHonesty,
} from '../../../bin/lib/managed-upgrade.mjs';

const ARK = path.resolve('bin/ark.mjs');
const ARK_CHECK = path.resolve('bin/ark-check.mjs');

/** Criterion string required by DF05 acceptance (PR / tests quote it). */
export const DF05_SELF_SERVICE_CRITERION =
  'After a managed upgrade (or equivalent), can a consumer learn from package surfaces whether the write-path is still honestly labeled active/advisory and whether customized install content was preserved — without asking a maintainer?';

function mkTemp(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function write(root: string, rel: string, body: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

function run(file: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, [file, ...args], {
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function fixtureRoot(prefix: string) {
  const root = mkTemp(prefix);
  write(root, 'package.json', '{"name":"df05-fixture","private":true}\n');
  write(root, 'package-lock.json', '{}\n');
  write(root, 'tsconfig.json', '{"compilerOptions":{"strict":true}}\n');
  write(root, 'src/domain/value.ts', 'export const value = 1;\n');
  write(
    root,
    'ark.config.json',
    `${JSON.stringify({
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'], intentPrefixes: ['Domain.'] }],
      rules: [],
    })}\n`
  );
  return root;
}

function installAndSeedManaged(root: string, host: string) {
  const installed = run(ARK_CHECK, [
    '--root',
    root,
    '--install-agent-gates',
    '--tools',
    host,
  ]);
  expect(installed.status, installed.stderr || installed.stdout).toBe(0);
  const plan = planManagedUpgrade(root, { tools: [host] });
  const applied = applyManagedUpgrade(root, plan, plan.planDigest);
  expect(applied.applied).toBe(true);
  return applied;
}

type SelfServiceSlice = {
  schemaVersion: string;
  notAScore: boolean;
  criterionId: string;
  customizedPreserved: number;
  customizedPaths: string[];
  conflictedPaths: string[];
  customizedContentPreserved: boolean;
  writePathActivation: Array<{
    host: string;
    writePath: string;
    softWriteHost: boolean;
    hardWriteSupported: boolean;
    hardWriteActive: boolean;
    label: string;
  }>;
  writePathHonestlyLabeled: boolean;
  answers: {
    writePathActivationLabeled: boolean;
    customizedContentPreserved: boolean;
  };
};

describe('DF05 self-service criterion (quoted)', () => {
  it('records the self-service criterion for PR evidence', () => {
    // Keep this string byte-stable so PR templates can grep the criterion.
    expect(DF05_SELF_SERVICE_CRITERION).toMatch(
      /After a managed upgrade \(or equivalent\), can a consumer learn from package surfaces whether/
    );
    expect(DF05_SELF_SERVICE_CRITERION).toMatch(
      /write-path is still honestly labeled active\/advisory/
    );
    expect(DF05_SELF_SERVICE_CRITERION).toMatch(
      /customized install content was preserved/
    );
    expect(DF05_SELF_SERVICE_CRITERION).toMatch(/without asking a maintainer/);
  });
});

describe('DF05 pure host activation labels (fail-closed)', () => {
  it('labels soft hosts advisory and never hard without evidence', () => {
    for (const host of ['codex', 'opencode'] as const) {
      const entry = projectHostWritePathActivation(host);
      expect(entry.softWriteHost).toBe(true);
      expect(entry.hardWriteSupported).toBe(false);
      expect(entry.hardWriteActive).toBe(false);
      expect(entry.writePath).toBe('advisory');
      expect(entry.label).toMatch(/advisory/i);
    }
  });

  it('labels hard-capable hosts advisory when hard is not proven (no false hard)', () => {
    for (const host of ['claude', 'grok', 'antigravity', 'cursor'] as const) {
      const entry = projectHostWritePathActivation(host);
      expect(entry.softWriteHost).toBe(false);
      expect(entry.hardWriteSupported).toBe(true);
      expect(entry.hardWriteActive).toBe(false);
      expect(entry.writePath).toBe('advisory');
    }
  });

  it('only claims hard when hardWriteActive evidence is supplied for hard-capable host', () => {
    const soft = projectHostWritePathActivation('codex', { hardWriteActive: true });
    expect(soft.writePath).toBe('advisory');
    expect(soft.hardWriteActive).toBe(false);

    const hard = projectHostWritePathActivation('claude', { hardWriteActive: true });
    expect(hard.writePath).toBe('hard');
    expect(hard.hardWriteActive).toBe(true);
  });

  it('does not claim writePathActivationLabeled when no hosts were projected', () => {
    const honesty = projectManagedUpgradeSelfServiceHonesty({ hosts: [], assets: [] });
    expect(honesty.writePathActivation).toEqual([]);
    expect(honesty.writePathHonestlyLabeled).toBe(true); // vacuously honest
    expect(honesty.answers.writePathActivationLabeled).toBe(false);
  });
});

describe('DF05 managed-upgrade selfService projection', () => {
  it('answers both criterion questions from upgrade JSON after customized preserve', () => {
    const root = fixtureRoot('ark-df05-preserve-');
    installAndSeedManaged(root, 'claude');

    const agentsPath = path.join(root, 'AGENTS.md');
    const stock = fs.readFileSync(agentsPath, 'utf8');
    const customized = `${stock}\n\n## Project notes\nDF05 do not clobber.\n`;
    fs.writeFileSync(agentsPath, customized);

    const preview = run(ARK, [
      'upgrade',
      '--root',
      root,
      '--tools',
      'claude',
      '--no-install',
      '--no-strict',
      '--json',
    ]);
    expect(preview.status, preview.stderr || preview.stdout).toBe(0);
    const report = JSON.parse(preview.stdout) as {
      summary: { customizedPreserved: number; wouldWrite: number };
      assets: Array<{ path: string; state: string; willApply: boolean }>;
      selfService?: SelfServiceSlice;
    };

    // Residual under test: package surface must expose selfService honesty.
    expect(report.selfService, 'upgrade JSON must project selfService for DF05').toBeDefined();
    const honesty = report.selfService!;
    expect(honesty.schemaVersion).toBe('1.0');
    expect(honesty.notAScore).toBe(true);
    expect(honesty.criterionId).toBe('df05-upgrade-activation-preserve');

    // (1) customized install content preserved — visible without maintainer
    expect(report.summary.customizedPreserved).toBeGreaterThanOrEqual(1);
    expect(honesty.customizedPreserved).toBeGreaterThanOrEqual(1);
    expect(honesty.customizedPaths).toContain('AGENTS.md');
    expect(honesty.customizedContentPreserved).toBe(true);
    expect(honesty.answers.customizedContentPreserved).toBe(true);
    const agentsAsset = report.assets.find((a) => a.path === 'AGENTS.md');
    expect(agentsAsset?.state).toBe('customized');
    expect(agentsAsset?.willApply).toBe(false);

    // (2) write-path honestly labeled active/advisory — visible without maintainer
    expect(honesty.writePathActivation.length).toBeGreaterThanOrEqual(1);
    const claude = honesty.writePathActivation.find((e) => e.host === 'claude');
    expect(claude).toBeDefined();
    expect(claude!.hardWriteSupported).toBe(true);
    // Upgrade never invents hard from disk alone.
    expect(claude!.hardWriteActive).toBe(false);
    expect(claude!.writePath).toBe('advisory');
    expect(honesty.writePathHonestlyLabeled).toBe(true);
    expect(honesty.answers.writePathActivationLabeled).toBe(true);

    // Apply must still preserve customized body.
    const applied = run(ARK, [
      'upgrade',
      '--root',
      root,
      '--tools',
      'claude',
      '--no-install',
      '--no-strict',
      '--apply',
      '--plan-digest',
      JSON.parse(preview.stdout).planDigest,
      '--json',
    ]);
    expect(applied.status, applied.stderr || applied.stdout).toBe(0);
    const appliedReport = JSON.parse(applied.stdout) as {
      selfService?: SelfServiceSlice;
      applied?: boolean;
    };
    expect(appliedReport.selfService?.customizedPaths).toContain('AGENTS.md');
    expect(fs.readFileSync(agentsPath, 'utf8')).toContain('DF05 do not clobber');
  });

  it('soft host upgrade JSON never labels write-path hard', () => {
    const root = fixtureRoot('ark-df05-soft-');
    installAndSeedManaged(root, 'codex');

    const preview = run(ARK, [
      'upgrade',
      '--root',
      root,
      '--tools',
      'codex',
      '--no-install',
      '--no-strict',
      '--json',
    ]);
    expect(preview.status, preview.stderr || preview.stdout).toBe(0);
    const report = JSON.parse(preview.stdout) as { selfService?: SelfServiceSlice };
    expect(report.selfService).toBeDefined();
    const codex = report.selfService!.writePathActivation.find((e) => e.host === 'codex');
    expect(codex).toBeDefined();
    expect(codex!.softWriteHost).toBe(true);
    expect(codex!.writePath).toBe('advisory');
    expect(codex!.hardWriteActive).toBe(false);
    expect(report.selfService!.writePathHonestlyLabeled).toBe(true);
  });

  it('human upgrade output surfaces self-service honesty lines', () => {
    const root = fixtureRoot('ark-df05-human-');
    installAndSeedManaged(root, 'claude');
    const agentsPath = path.join(root, 'AGENTS.md');
    fs.writeFileSync(
      agentsPath,
      `${fs.readFileSync(agentsPath, 'utf8')}\n\n## Human note\npreserve me\n`
    );

    const human = run(ARK, [
      'upgrade',
      '--root',
      root,
      '--tools',
      'claude',
      '--no-install',
      '--no-strict',
    ]);
    expect(human.status, human.stderr || human.stdout).toBe(0);
    expect(human.stdout).toMatch(/Self-service honesty/i);
    expect(human.stdout).toMatch(/Write-path claude:/i);
    expect(human.stdout).toMatch(/Customized preserved:/i);
    expect(human.stdout).toMatch(/AGENTS\.md/);
  });

  it('pure projector marks willApply customized as not preserved', () => {
    // Documents the failing side of the preserve contract before wiring.
    const bad = projectManagedUpgradeSelfServiceHonesty({
      hosts: ['claude'],
      assets: [{ path: 'AGENTS.md', state: 'customized', willApply: true }],
      summary: { customizedPreserved: 1 },
    });
    expect(bad.customizedContentPreserved).toBe(false);
    expect(bad.answers.customizedContentPreserved).toBe(false);

    const good = projectManagedUpgradeSelfServiceHonesty({
      hosts: ['claude'],
      assets: [{ path: 'AGENTS.md', state: 'customized', willApply: false }],
      summary: { customizedPreserved: 1 },
    });
    expect(good.customizedContentPreserved).toBe(true);
    expect(good.customizedPaths).toEqual(['AGENTS.md']);
    expect(good.writePathActivation[0]?.writePath).toBe('advisory');
  });
});
