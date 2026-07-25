/**
 * Field gap closure S4 — gates / upgrade / agent surfaces.
 * Gaps: NEW-FORCE-GATES-VS-UPGRADE-DIGEST, NEW-AGENTS-11-LAYER-TABLE,
 * NEW-NO-CHECK-SCRIPT-ON-START, NEW-DOCTOR-STALE-FINISH-START, DL-START-APPLY-MESSAGE.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  agentInstructions,
  ensureCheckArchitectureScript,
  layerPlacementTable,
  loadConfigLayersForAgents,
} from '../../../bin/lib/ci-and-commands.mjs';
import {
  applyManagedUpgrade,
  classifyManagedAsset,
  isManagedAssetCustomizedOnDisk,
  managedContentIdentity,
  planManagedUpgrade,
  syncManagedManifestFromDisk,
  tryReadManagedManifest,
} from '../../../bin/lib/managed-upgrade.mjs';
import { shouldShowNewHereNudge } from '../../../bin/ark-shared.mjs';
import { renderStartPreview } from '../../../bin/lib/start-preview.mjs';

const ARK = path.resolve('bin/ark.mjs');
const ARK_CHECK = path.resolve('bin/ark-check.mjs');

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

function eightLayerConfig() {
  return {
    include: ['apps', 'packages'],
    layers: [
      { name: 'DomainModel', patterns: ['packages/domain/**'], intentPrefixes: ['Domain.'] },
      { name: 'ApplicationOrchestration', patterns: ['apps/api/**'], intentPrefixes: ['Application.'] },
      { name: 'PersistenceAdapters', patterns: ['packages/db/**'], intentPrefixes: ['Adapter.Persistence.'] },
      { name: 'IntegrationAdapters', patterns: ['packages/integrations/**'], intentPrefixes: ['Adapter.Integration.'] },
      { name: 'PresentationAdapters', patterns: ['apps/web/**'], intentPrefixes: ['Presentation.'] },
      { name: 'ReportingReadModels', patterns: ['packages/reporting/**'], intentPrefixes: ['Reporting.'] },
      { name: 'SecurityAuditObservability', patterns: ['packages/security/**'], intentPrefixes: ['Security.'] },
      { name: 'Kernel', patterns: ['packages/kernel/**'], intentPrefixes: ['Kernel.'] },
    ],
    rules: [],
  };
}

describe('S4 NEW-AGENTS-11-LAYER-TABLE', () => {
  it('layerPlacementTable uses live layers (8-row custom contract)', () => {
    const layers = eightLayerConfig().layers;
    const table = layerPlacementTable(layers);
    expect(table).toMatch(/Patterns \(from ark\.config\.json\)/);
    expect(table).toContain('DomainModel');
    expect(table).toContain('packages/domain/**');
    // Not stock 11-layer Conventional directories header
    expect(table).not.toMatch(/Conventional directories/);
    // Exactly 8 data rows + header separator
    const dataRows = table.split('\n').filter((line) => line.startsWith('| ') && !line.includes('Layer |'));
    expect(dataRows.length).toBe(8);
  });

  it('agentInstructions embeds live layer table when ark.config.json present', () => {
    const root = mkTemp('ark-s4-agents-');
    write(root, 'ark.config.json', `${JSON.stringify(eightLayerConfig(), null, 2)}\n`);
    write(root, 'package.json', '{"name":"s4-agents","private":true}\n');
    expect(loadConfigLayersForAgents(root)?.length).toBe(8);
    const text = agentInstructions(root);
    expect(text).toMatch(/8\*\* configured layer/);
    expect(text).toContain('packages/domain/**');
    expect(text).toContain('apps/web/**');
    expect(text).not.toMatch(/default 11-layer placement below/);
    // Stock layer not in this contract should not appear as a table row
    expect(text).not.toMatch(/\| WorkflowSagaEngine \|/);
  });

  it('falls back to stock 11-layer table without config', () => {
    const root = mkTemp('ark-s4-agents-stock-');
    write(root, 'package.json', '{"name":"s4-stock","private":true}\n');
    const text = agentInstructions(root);
    expect(text).toMatch(/default 11-layer placement/);
    expect(layerPlacementTable()).toMatch(/Conventional directories/);
  });
});

describe('S4 NEW-NO-CHECK-SCRIPT-ON-START', () => {
  it('ensureCheckArchitectureScript adds script once', () => {
    const root = mkTemp('ark-s4-check-script-');
    write(root, 'package.json', JSON.stringify({ name: 'app', scripts: { lint: 'eslint .' } }));
    const first = ensureCheckArchitectureScript(root, { write: true });
    expect(first.changed).toBe(true);
    expect(first.script).toMatch(/ark-check|arkgate-check/);
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts['check:architecture']).toBe(first.script);
    expect(pkg.scripts.lint).toBe('eslint .');
    const second = ensureCheckArchitectureScript(root, { write: true });
    expect(second.changed).toBe(false);
    expect(second.reason).toBe('already');
  });

  it('start --apply writes check:architecture', () => {
    const root = mkTemp('ark-s4-start-check-');
    write(root, 'package.json', JSON.stringify({ name: 'start-check', private: true }, null, 2));
    write(root, 'src/domain/value.ts', 'export const value = 1;\n');
    const result = run(ARK, [
      'start',
      '--root',
      root,
      '--apply',
      '--yes',
      '--no-install',
      '--no-strict',
      '--tools',
      'claude',
    ]);
    expect(result.status, result.stderr || result.stdout).toBe(0);
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(typeof pkg.scripts?.['check:architecture']).toBe('string');
    expect(pkg.scripts['check:architecture']).toMatch(/ark-check|arkgate-check/);
  });
});

describe('S4 NEW-DOCTOR-STALE-FINISH-START', () => {
  it('shouldShowNewHereNudge is false when config + AGENTS present (post-start)', () => {
    const root = mkTemp('ark-s4-newhere-');
    const configPath = path.join(root, 'ark.config.json');
    write(root, 'ark.config.json', JSON.stringify(eightLayerConfig()));
    write(root, 'AGENTS.md', '# Ark Enforcement\n\ncompact\n');
    expect(shouldShowNewHereNudge(root, configPath, 0, false)).toBe(false);
    expect(shouldShowNewHereNudge(root, configPath, 30, false)).toBe(false);
  });

  it('still nudges when config missing or start unfinished', () => {
    const root = mkTemp('ark-s4-newhere2-');
    const configPath = path.join(root, 'ark.config.json');
    expect(shouldShowNewHereNudge(root, configPath, 100, true)).toBe(true);
    write(root, 'ark.config.json', JSON.stringify(eightLayerConfig()));
    // Config only — no AGENTS yet → still new-here
    expect(shouldShowNewHereNudge(root, configPath, 10, false)).toBe(true);
  });

  it('doctor after start does not primary-action finish ark start', () => {
    const root = mkTemp('ark-s4-doctor-start-');
    // Post-start shape: valid config + AGENTS present, low coverage (thin tree).
    write(
      root,
      'package.json',
      JSON.stringify(
        {
          name: 'doc-start',
          private: true,
          scripts: {
            'check:architecture':
              'npx ark-check --root . --config ark.config.json --strict-config',
          },
        },
        null,
        2
      )
    );
    write(
      root,
      'ark.config.json',
      `${JSON.stringify(
        {
          include: ['src'],
          layers: [
            {
              name: 'DomainModel',
              patterns: ['src/domain/**'],
              intentPrefixes: ['Domain.'],
              optional: true,
            },
            {
              name: 'PresentationAdapters',
              patterns: ['src/components/**'],
              intentPrefixes: ['Presentation.'],
              optional: true,
            },
          ],
          rules: [],
        },
        null,
        2
      )}\n`
    );
    write(root, 'AGENTS.md', '# Ark Enforcement\n\n<!-- arkgate:compact-router host=claude -->\n');
    write(root, 'src/components/ui.ts', 'export const ui = 1;\n');
    write(root, '.mcp.json', '{ "mcpServers": {} }\n');
    write(root, '.github/workflows/ark-check.yml', 'name: ark\non: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx ark-check\n');

    const doctor = run(ARK_CHECK, ['--root', root, '--doctor', '--json']);
    expect(doctor.status, doctor.stderr || doctor.stdout).toBe(0);
    const json = JSON.parse(doctor.stdout || '{}');
    expect(json.doctor?.newHere?.show ?? false).toBe(false);
    const plain = run(ARK_CHECK, ['--root', root, '--doctor']);
    expect(plain.stdout || '').not.toMatch(/finish ark start/i);
  });
});

describe('S4 DL-START-APPLY-MESSAGE', () => {
  it('renderStartPreview applying mode does not claim preview no-write', () => {
    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    try {
      renderStartPreview(
        {
          analysis: null,
          projectedCoverage: { percent: 80, classifiedFiles: 4, totalFiles: 5 },
          setupBudget: { files: 3, gateFiles: 3, arkrulesFiles: 0, bytes: 100, maxFiles: 8, maxBytes: 32000, ok: true },
          changes: [
            { action: 'create', path: 'ark.config.json', afterHash: 'sha256:abc' },
            { action: 'create', path: 'AGENTS.md', afterHash: 'sha256:def' },
          ],
          commands: ['ark-check --init'],
          hostGuarantees: ['shared CI'],
          unresolvedDecisions: [],
        },
        { applying: true }
      );
    } finally {
      console.log = original;
    }
    const text = logs.join('\n');
    expect(text).toMatch(/writing 2 planned mutation/);
    expect(text).not.toMatch(/preview — no files were changed/i);
  });

  it('start --apply stdout is not preview-no-write + applied', () => {
    const root = mkTemp('ark-s4-apply-msg-');
    write(root, 'package.json', JSON.stringify({ name: 'apply-msg', private: true }, null, 2));
    write(root, 'src/domain/a.ts', 'export const a = 1;\n');
    const result = run(ARK, [
      'start',
      '--root',
      root,
      '--apply',
      '--yes',
      '--no-install',
      '--no-strict',
      '--tools',
      'claude',
    ]);
    expect(result.status, result.stderr || result.stdout).toBe(0);
    const out = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    expect(out).toMatch(/Applied \d+ start mutation/);
    expect(out).not.toMatch(/Ark start preview — no files were changed/);
  });
});

describe('S4 NEW-FORCE-GATES-VS-UPGRADE-DIGEST', () => {
  it('classify + isManagedAssetCustomizedOnDisk preserve customized identity', () => {
    const target = '# Ark Enforcement\n\nstock\n';
    const custom = '# Ark Enforcement\n\nuser customized body\n';
    const recorded = {
      contentIdentity: managedContentIdentity(target),
      baseHash: managedContentIdentity(target),
    };
    expect(
      classifyManagedAsset({
        recorded,
        currentContent: custom,
        targetContent: target,
        kind: 'gate',
      }).state
    ).toBe('customized');

    const root = mkTemp('ark-s4-custom-');
    write(root, 'package.json', '{"name":"c","private":true}\n');
    write(root, 'AGENTS.md', custom);
    write(
      root,
      'ark.managed.json',
      `${JSON.stringify(
        {
          schemaVersion: '1.0',
          profile: 'full',
          hosts: ['claude'],
          assets: [
            {
              path: 'AGENTS.md',
              templateId: 'gate:AGENTS.md',
              scope: 'whole-file',
              baseHash: managedContentIdentity(target),
              contentIdentity: managedContentIdentity(target),
            },
          ],
        },
        null,
        2
      )}\n`
    );
    expect(isManagedAssetCustomizedOnDisk(root, 'AGENTS.md', target, 'gate')).toBe(true);
    expect(isManagedAssetCustomizedOnDisk(root, 'AGENTS.md', custom, 'gate')).toBe(false);
  });

  it('force preserve customized AGENTS by content-identity even without managed list', () => {
    const root = mkTemp('ark-s4-force-no-manifest-');
    const target = '# ArkGate agent instructions\n\n(stock router)\n';
    const custom = `${target}\n\n## Project notes\nDo not clobber me.\n`;
    write(root, 'package.json', '{"name":"nomanifest","private":true}\n');
    write(root, 'AGENTS.md', custom);
    // No ark.managed.json — incomplete manifest must not clobber customized AGENTS.
    expect(isManagedAssetCustomizedOnDisk(root, 'AGENTS.md', target, 'gate')).toBe(true);
    expect(isManagedAssetCustomizedOnDisk(root, 'AGENTS.md', custom, 'gate')).toBe(false);
  });

  it('force after managed upgrade preserves customized AGENTS and recomputes digest', () => {
    const root = mkTemp('ark-s4-force-digest-');
    write(root, 'package.json', '{"name":"force-digest","private":true}\n');
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

    const installed = run(ARK_CHECK, [
      '--root',
      root,
      '--install-agent-gates',
      '--tools',
      'claude',
    ]);
    expect(installed.status, installed.stderr || installed.stdout).toBe(0);

    // Establish managed manifest via upgrade apply
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
    const { planDigest } = JSON.parse(preview.stdout) as { planDigest: string };
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
      planDigest,
      '--json',
    ]);
    expect(applied.status, applied.stderr || applied.stdout).toBe(0);
    expect(tryReadManagedManifest(root)).not.toBeNull();

    // Customize AGENTS (content-identity diverge from recorded)
    const agentsPath = path.join(root, 'AGENTS.md');
    const stock = fs.readFileSync(agentsPath, 'utf8');
    const customized = `${stock}\n\n## Project notes\nDo not clobber me.\n`;
    fs.writeFileSync(agentsPath, customized);

    // Also customize .mcp.json so force would otherwise clobber it
    const mcpPath = path.join(root, '.mcp.json');
    const stockMcp = fs.readFileSync(mcpPath, 'utf8');
    const customMcp = JSON.stringify(
      { ...JSON.parse(stockMcp), projectNote: 'custom' },
      null,
      2
    );
    fs.writeFileSync(mcpPath, customMcp.endsWith('\n') ? customMcp : `${customMcp}\n`);

    const force = run(ARK_CHECK, [
      '--root',
      root,
      '--install-agent-gates',
      '--tools',
      'claude',
      '--force',
    ]);
    expect(force.status, force.stderr || force.stdout).toBe(0);
    expect(force.stdout || '').toMatch(/customized|Recomputed ark\.managed\.json|already matches/i);

    // Customized content preserved
    expect(fs.readFileSync(agentsPath, 'utf8')).toBe(customized);
    expect(fs.readFileSync(mcpPath, 'utf8')).toContain('projectNote');

    // Fresh upgrade preview must succeed (digest integrity)
    const after = run(ARK, [
      'upgrade',
      '--root',
      root,
      '--tools',
      'claude',
      '--no-install',
      '--no-strict',
      '--json',
    ]);
    expect(after.status, after.stderr || after.stdout).toBe(0);
    const afterPlan = JSON.parse(after.stdout) as {
      planDigest: string;
      summary?: { customizedPreserved?: number };
    };
    expect(afterPlan.planDigest).toMatch(/^sha256:/);
    // Apply with the new digest must not fail on digest mismatch
    const reapply = run(ARK, [
      'upgrade',
      '--root',
      root,
      '--tools',
      'claude',
      '--no-install',
      '--no-strict',
      '--apply',
      '--plan-digest',
      afterPlan.planDigest,
      '--json',
    ]);
    expect(reapply.status, reapply.stderr || reapply.stdout).toBe(0);
    expect(reapply.stderr || '').not.toMatch(/plan digest mismatch/i);
    // Customized AGENTS still preserved through upgrade apply
    expect(fs.readFileSync(agentsPath, 'utf8')).toContain('Do not clobber me');
  });

  it('without --force, managed present defaults to skills-only refresh', () => {
    const root = mkTemp('ark-s4-skills-default-');
    write(root, 'package.json', '{"name":"skills-def","private":true}\n');
    write(root, 'src/domain/value.ts', 'export const value = 1;\n');
    write(
      root,
      'ark.config.json',
      `${JSON.stringify({
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        rules: [],
      })}\n`
    );
    const installed = run(ARK_CHECK, [
      '--root',
      root,
      '--install-agent-gates',
      '--tools',
      'claude',
    ]);
    expect(installed.status, installed.stderr || installed.stdout).toBe(0);

    // Seed managed manifest
    const plan = planManagedUpgrade(root, { tools: ['claude'] });
    applyManagedUpgrade(root, plan, plan.planDigest);
    expect(tryReadManagedManifest(root)).not.toBeNull();

    const agentsBefore = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    // Mutate AGENTS so a full force rewrite would change it; skills-only must leave it.
    fs.writeFileSync(path.join(root, 'AGENTS.md'), `${agentsBefore}\n<!-- user -->\n`);

    const refresh = run(ARK_CHECK, [
      '--root',
      root,
      '--install-agent-gates',
      '--tools',
      'claude',
    ]);
    expect(refresh.status, refresh.stderr || refresh.stdout).toBe(0);
    expect(refresh.stdout || '').toMatch(/skills-only refresh \(default/i);
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toContain('<!-- user -->');
  });

  it('syncManagedManifestFromDisk is idempotent when content matches', () => {
    const root = mkTemp('ark-s4-sync-idem-');
    write(root, 'package.json', '{"name":"sync","private":true}\n');
    write(root, 'src/domain/value.ts', 'export const v = 1;\n');
    write(
      root,
      'ark.config.json',
      `${JSON.stringify({
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        rules: [],
      })}\n`
    );
    expect(
      run(ARK_CHECK, ['--root', root, '--install-agent-gates', '--tools', 'claude']).status
    ).toBe(0);
    const plan = planManagedUpgrade(root, { tools: ['claude'] });
    applyManagedUpgrade(root, plan, plan.planDigest);
    const first = syncManagedManifestFromDisk(root, { tools: ['claude'] });
    const second = syncManagedManifestFromDisk(root, { tools: ['claude'] });
    expect(second.wrote).toBe(false);
    expect(second.planDigest).toBe(first.planDigest);
  });
});
