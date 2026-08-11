/**
 * Phase FX — field upgrade & multi-project MCP truth (4.5.6).
 * Focused unit coverage for FX01–FX09 product surfaces.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildPackageInstallSkipPayload,
  compareSemverCore,
  formatPackageInstallDecisionHuman,
  packageInstallArgv,
  shouldSkipArkgateInstall,
} from '../../../bin/ark-shared.mjs';
import {
  compareSemverCore as decisionCompare,
  probeRegistryArkgateLatest,
} from '../../../bin/lib/upgrade-package-decision.mjs';
import {
  buildHostSelectionHonesty,
  buildPostUpgradeChecks,
  buildSkillDriftSummary,
  classifyManagedAsset,
  formatHostSelectionHuman,
  formatSkillDriftHuman,
  planManagedUpgrade,
} from '../../../bin/lib/managed-upgrade.mjs';
import { buildRulesInventory } from '../../../bin/lib/rules-inventory.mjs';

const temps: string[] = [];

function tempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(root);
  return root;
}

function write(root: string, rel: string, body: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

afterEach(() => {
  for (const root of temps.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('FX01–FX02 package install decision', () => {
  it('compareSemverCore orders cores and ignores prerelease', () => {
    expect(compareSemverCore('4.5.5', '4.5.6')).toBe(-1);
    expect(compareSemverCore('4.5.6', '4.5.5')).toBe(1);
    expect(compareSemverCore('4.5.6', '4.5.6')).toBe(0);
    expect(decisionCompare('v4.5.6-beta.1', '4.5.6')).toBe(0);
    expect(compareSemverCore('4.5.6+build', '4.5.6')).toBe(0);
  });

  it('NOT_INSTALLED and UNREADABLE do not skip', () => {
    const missing = tempRoot('ark-fx01-miss-');
    write(missing, 'package.json', JSON.stringify({ name: 'm', private: true }));
    expect(shouldSkipArkgateInstall(missing, '4.5.6', { skipRegistryProbe: true })).toMatchObject({
      skip: false,
      reasonCode: 'NOT_INSTALLED',
    });

    const bad = tempRoot('ark-fx01-bad-');
    write(bad, 'package.json', JSON.stringify({ name: 'b', private: true }));
    write(bad, 'node_modules/arkgate/package.json', '{not-json');
    expect(shouldSkipArkgateInstall(bad, '4.5.6', { skipRegistryProbe: true })).toMatchObject({
      skip: false,
      reasonCode: 'UNREADABLE',
    });
  });

  it('VERSION_DIFFERS when CLI ≠ installed', () => {
    const root = tempRoot('ark-fx01-diff-');
    write(root, 'package.json', JSON.stringify({ name: 'd', private: true }));
    write(
      root,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '4.3.0' })
    );
    expect(
      shouldSkipArkgateInstall(root, '4.5.6', { registryLatest: '4.5.6' })
    ).toMatchObject({
      skip: false,
      reasonCode: 'VERSION_DIFFERS',
      installedVersion: '4.3.0',
    });
  });

  it('getRegistryLatest throw maps to REGISTRY_UNAVAILABLE when versions match', () => {
    const root = tempRoot('ark-fx01-throw-');
    write(root, 'package.json', JSON.stringify({ name: 't', private: true }));
    write(
      root,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '4.5.6' })
    );
    expect(
      shouldSkipArkgateInstall(root, '4.5.6', {
        getRegistryLatest: () => {
          throw new Error('network');
        },
      })
    ).toMatchObject({
      skip: true,
      reasonCode: 'REGISTRY_UNAVAILABLE',
    });
  });

  it('probeRegistryArkgateLatest parses stdout and null on failure', () => {
    expect(
      probeRegistryArkgateLatest({
        run: () => ({ status: 0, stdout: '4.5.6\n' }),
      })
    ).toBe('4.5.6');
    expect(
      probeRegistryArkgateLatest({
        run: () => ({ status: 1, stdout: '', stderr: 'fail' }),
      })
    ).toBe(null);
    expect(
      probeRegistryArkgateLatest({
        run: () => {
          throw new Error('spawn failed');
        },
      })
    ).toBe(null);
  });

  it('buildPackageInstallSkipPayload exposes recovery command', () => {
    const root = tempRoot('ark-fx02-');
    write(root, 'package.json', JSON.stringify({ name: 'fx02', private: true }));
    write(
      root,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '4.3.0' })
    );
    const decision = shouldSkipArkgateInstall(root, '4.3.0', {
      registryLatest: '4.5.5',
    });
    expect(decision.skip).toBe(false);
    const payload = buildPackageInstallSkipPayload(decision, root, packageInstallArgv);
    expect(payload.reasonCode).toBe('BEHIND_REGISTRY');
    expect(payload.packageInstallSkipped).toBe(false);
    expect(payload.suggestedInstallCmd).toMatch(/arkgate@4\.5\.5/);
    const lines = formatPackageInstallDecisionHuman(payload);
    expect(lines.some((l) => /behind registry/i.test(l))).toBe(true);
  });

  it('skipRegistryProbe treats equal versions as ALREADY_CURRENT without registry', () => {
    const root = tempRoot('ark-fx01-skipprobe-');
    write(root, 'package.json', JSON.stringify({ name: 'sp', private: true }));
    write(
      root,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '4.5.6' })
    );
    expect(
      shouldSkipArkgateInstall(root, '4.5.6', { skipRegistryProbe: true })
    ).toMatchObject({
      skip: true,
      reasonCode: 'ALREADY_CURRENT',
    });
  });

  it('ALREADY_CURRENT and REGISTRY_UNAVAILABLE human lines', () => {
    const root = tempRoot('ark-fx02-cur-');
    write(root, 'package.json', JSON.stringify({ name: 'fx02c', private: true }));
    write(
      root,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '4.5.5' })
    );
    const decision = shouldSkipArkgateInstall(root, '4.5.5', {
      registryLatest: '4.5.5',
    });
    const payload = buildPackageInstallSkipPayload(decision, root, packageInstallArgv);
    expect(payload.packageInstallSkipped).toBe(true);
    expect(payload.reasonCode).toBe('ALREADY_CURRENT');
    expect(formatPackageInstallDecisionHuman(payload).join('\n')).toMatch(/skipping install/i);

    const offline = formatPackageInstallDecisionHuman({
      packageInstallSkipped: true,
      reasonCode: 'REGISTRY_UNAVAILABLE',
      installedVersion: '4.5.5',
      suggestedInstallCmd: 'npm install -D arkgate@latest',
    });
    expect(offline.join('\n')).toMatch(/registry latest unknown/i);
    expect(offline.join('\n')).toMatch(/npm install -D arkgate@latest/);

    const other = formatPackageInstallDecisionHuman({
      packageInstallSkipped: false,
      reasonCode: 'VERSION_DIFFERS',
      suggestedInstallCmd: 'npm install -D arkgate@latest',
    });
    expect(other.join('\n')).toMatch(/Updating ArkGate/);
    expect(formatPackageInstallDecisionHuman(null)).toEqual([]);
  });
});

describe('FX03–FX04 skill drift + refresh-skills', () => {
  it('buildSkillDriftSummary counts skill states', () => {
    const summary = buildSkillDriftSummary({
      assets: [
        { kind: 'skill', state: 'current', path: 'a', willApply: false },
        { kind: 'skill', state: 'customized', path: 'b', willApply: false },
        { kind: 'skill', state: 'stale', path: 'c', willApply: true },
        { kind: 'gate', state: 'stale', path: 'd', willApply: true },
      ],
    });
    expect(summary).toMatchObject({
      notAScore: true,
      skillCount: 3,
      customized: 1,
      stale: 1,
      current: 1,
      wouldRefresh: 1,
    });
    expect(summary.samplePaths.customized).toEqual(['b']);
    expect(summary.note).toMatch(/stale|customized|refresh/i);
  });

  it('skillDrift notes when all skills current or missing only', () => {
    const allCurrent = buildSkillDriftSummary({
      assets: [
        { kind: 'skill', state: 'current', path: 'a', willApply: false },
        { kind: 'skill', state: 'current', path: 'b', willApply: false },
      ],
    });
    expect(allCurrent.customized).toBe(0);
    expect(allCurrent.stale).toBe(0);
    expect(allCurrent.note).toMatch(/matches package|scheduled/i);

    const missing = buildSkillDriftSummary({
      assets: [{ kind: 'skill', state: 'missing', path: 'm', willApply: true }],
    });
    expect(missing.missing).toBe(1);
    expect(missing.wouldRefresh).toBe(1);
  });

  it('classifyManagedAsset keeps true customized without silent apply', () => {
    const recorded = {
      contentIdentity: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      baseHash: 'x',
    };
    // current differs from both recorded and target → conflicted or customized
    const result = classifyManagedAsset({
      recorded,
      currentContent: 'user edited skill body\n',
      targetContent: 'package skill template\n',
      kind: 'skill',
    });
    expect(['customized', 'conflicted']).toContain(result.state);
  });

  it('classifyManagedAsset marks current and missing', () => {
    const same = classifyManagedAsset({
      recorded: null,
      currentContent: 'same body\n',
      targetContent: 'same body\n',
      kind: 'skill',
    });
    expect(same.state).toBe('current');
    const missing = classifyManagedAsset({
      recorded: null,
      currentContent: null,
      targetContent: 'template\n',
      kind: 'skill',
    });
    expect(missing.state).toBe('missing');
  });
});

describe('FX05 post-upgrade checks', () => {
  it('emits advisory checklist with notAScore', () => {
    const root = tempRoot('ark-fx05-');
    write(root, 'package.json', JSON.stringify({ name: 'fx05', private: true }));
    write(
      root,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '4.5.6' })
    );
    const checks = buildPostUpgradeChecks(root, {
      cliVersion: '4.5.6',
      verification: { mode: 'skipped', exitCode: 0 },
      dualTruth: { dualTruth: false },
    });
    expect(checks.notAScore).toBe(true);
    expect(checks.neverGateInput).toBe(true);
    expect(checks.checks.some((c) => c.id === 'package-pin-cli' && c.ok === true)).toBe(true);
    expect(checks.mcpNote).toMatch(/restart|MCP|expectedRoot/i);
  });

  it('reports pin mismatch and verification failure honestly', () => {
    const root = tempRoot('ark-fx05-bad-');
    write(root, 'package.json', JSON.stringify({ name: 'fx05b', private: true }));
    write(
      root,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '4.3.0' })
    );
    const checks = buildPostUpgradeChecks(root, {
      cliVersion: '4.5.6',
      verification: { mode: 'strict-merge', exitCode: 1 },
      dualTruth: { dualTruth: true, note: 'pin lag' },
    });
    expect(checks.checks.find((c) => c.id === 'package-pin-cli')?.ok).toBe(false);
    expect(checks.checks.find((c) => c.id === 'architecture-verification')?.ok).toBe(false);
    expect(checks.checks.find((c) => c.id === 'package-version-truth')?.ok).toBe(false);
  });

  it('handles missing install without inventing pin ok', () => {
    const root = tempRoot('ark-fx05-none-');
    write(root, 'package.json', JSON.stringify({ name: 'fx05n', private: true }));
    const checks = buildPostUpgradeChecks(root, { cliVersion: '4.5.6' });
    expect(checks.checks.find((c) => c.id === 'package-pin-cli')?.ok).toBe(null);
  });
});

describe('FX03 skill drift formatters', () => {
  it('formats skill drift and host selection human lines', () => {
    const empty = buildSkillDriftSummary({ assets: [] });
    expect(empty.skillCount).toBe(0);
    expect(formatSkillDriftHuman(empty).join('\n')).toMatch(/Skill drift/);
    expect(formatSkillDriftHuman(null)).toEqual([]);

    const customizedOnly = buildSkillDriftSummary({
      assets: [{ kind: 'skill', state: 'customized', path: 's', willApply: false }],
    });
    expect(customizedOnly.note).toMatch(/refresh-skills|customized/i);

    const host = buildHostSelectionHonesty({ hosts: [] });
    expect(formatHostSelectionHuman(host).length).toBeGreaterThan(0);
    expect(formatHostSelectionHuman(null)).toEqual([]);
    expect(formatHostSelectionHuman({})).toEqual([]);
  });
});

describe('FX07 host selection honesty', () => {
  it('reports structured hostSelection', () => {
    const honesty = buildHostSelectionHonesty({ hosts: ['claude'] });
    expect(honesty).toMatchObject({
      notAScore: true,
      managedHosts: ['claude'],
    });
    expect(typeof honesty.note).toBe('string');
    expect(honesty.note.length).toBeGreaterThan(0);
  });
});

describe('FX09 inventory UX message noise', () => {
  it('downranks pure UX message string constants, keeps numeric business limits', () => {
    const inventory = buildRulesInventory({
      fileContents: {
        'src/domain/cart.ts': `
          export const MAX_CART_SIZE = 50;
          export const ERROR_MESSAGE_CHECKOUT = "Something went wrong with your order.";
          export const EMPTY_STATE_TEXT = "No items yet — add a product to continue.";
          export const TOAST_MSG_SAVED = "Saved successfully!";
          export const USER_MSG_WELCOME = "Welcome back.";
          export const HINT_HELP_TEXT = "Tap to continue.";
          export const ORDER_STATUS_OPEN = "order_open_state_token";
        `,
      },
      governedLayerByFile: {
        'src/domain/cart.ts': 'DomainModel',
      },
    });
    const magics = inventory.candidates.filter((c) => c.kind === 'magic-business-constant');
    expect(magics.some((c) => /MAX_CART_SIZE/.test(c.message))).toBe(true);
    expect(magics.some((c) => /ERROR_MESSAGE|EMPTY_STATE|TOAST_MSG|USER_MSG|HINT_HELP/i.test(c.message))).toBe(
      false
    );
    // Domain status token with long non-sentence string still surfaces as a pilot seed.
    expect(magics.some((c) => /ORDER_STATUS_OPEN/.test(c.message))).toBe(true);
  });
});

describe('FX03 planManagedUpgrade skillDrift-ready plan', () => {
  it('plan exposes assets for drift projection', () => {
    const root = tempRoot('ark-fx03-plan-');
    write(
      root,
      'package.json',
      JSON.stringify({ name: 'fx03', private: true, devDependencies: { arkgate: '4.5.5' } })
    );
    write(root, 'ark.config.json', JSON.stringify({ version: 1, layers: [] }));
    // Minimal tree: planManagedUpgrade should not throw without managed assets.
    const plan = planManagedUpgrade(root, { tools: 'claude', acceptConflicts: false });
    expect(plan.assets).toBeDefined();
    const drift = buildSkillDriftSummary(plan);
    expect(drift.notAScore).toBe(true);
    expect(typeof drift.skillCount).toBe('number');
  });

  it('refreshSkills option is recorded on the plan object', () => {
    const root = tempRoot('ark-fx04-plan-');
    write(
      root,
      'package.json',
      JSON.stringify({ name: 'fx04', private: true, devDependencies: { arkgate: '4.5.6' } })
    );
    write(root, 'ark.config.json', JSON.stringify({ version: 1, layers: [] }));
    const plan = planManagedUpgrade(root, {
      tools: 'claude',
      refreshSkills: true,
      acceptConflicts: false,
    });
    expect(plan.refreshSkills).toBe(true);
    const noRefresh = planManagedUpgrade(root, { tools: 'claude' });
    expect(noRefresh.refreshSkills).toBe(false);
  });
});

describe('FX01 packageInstallArgv + decision payload edges', () => {
  it('buildPackageInstallSkipPayload uses latest when not behind registry', () => {
    const root = tempRoot('ark-fx02-latest-');
    write(root, 'package.json', JSON.stringify({ name: 'fx', private: true }));
    write(
      root,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '4.5.6' })
    );
    const decision = shouldSkipArkgateInstall(root, '4.5.6', { registryLatest: '4.5.6' });
    const payload = buildPackageInstallSkipPayload(decision, root, packageInstallArgv);
    expect(payload.suggestedInstallCmd).toMatch(/arkgate@latest|arkgate@4\.5\.6/);
  });

  it('probe with empty stdout returns null', () => {
    expect(
      probeRegistryArkgateLatest({
        run: () => ({ status: 0, stdout: '   \n' }),
      })
    ).toBe(null);
  });
});
