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
  formatPackageInstallDecisionHuman,
  packageInstallArgv,
  shouldSkipArkgateInstall,
} from '../../../bin/ark-shared.mjs';
import {
  buildHostSelectionHonesty,
  buildPostUpgradeChecks,
  buildSkillDriftSummary,
  classifyManagedAsset,
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

  it('ALREADY_CURRENT human line mentions skip', () => {
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
        `,
      },
      governedLayerByFile: {
        'src/domain/cart.ts': 'DomainModel',
      },
    });
    const magics = inventory.candidates.filter((c) => c.kind === 'magic-business-constant');
    expect(magics.some((c) => /MAX_CART_SIZE/.test(c.message))).toBe(true);
    expect(magics.some((c) => /ERROR_MESSAGE|EMPTY_STATE|TOAST_MSG/i.test(c.message))).toBe(
      false
    );
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
});
