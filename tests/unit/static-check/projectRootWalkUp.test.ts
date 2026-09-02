/**
 * S2 / NEW-MONOREPO-CWD-WALKUP — config walk-up from nested package cwd.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  findNearestArkConfig,
  isMutatingCliCommand,
  resolveConfigPathWithinRoot,
  resolveEffectiveProjectRoot,
} from '../../../bin/lib/project-root.mjs';
import { detectWritePathCapabilities } from '../../../bin/lib/write-path-detect.mjs';
import { describePackageVersionDualTruth } from '../../../bin/lib/field-install.mjs';
import {
  buildWritePathHonesty,
  buildProductHonesty,
  buildCoverageHonesty,
  buildBaselineHonesty,
} from '../../../bin/lib/enforcement-honesty.mjs';

const temps: string[] = [];
function mk(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-walkup-'));
  temps.push(root);
  return root;
}
afterEach(() => {
  for (const t of temps.splice(0)) {
    try {
      fs.rmSync(t, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe('findNearestArkConfig / resolveEffectiveProjectRoot', () => {
  it('walks up from apps/web to monorepo root with ark.config.json', () => {
    const mono = mk();
    fs.writeFileSync(
      path.join(mono, 'package.json'),
      JSON.stringify({ name: 'mono', private: true, workspaces: ['apps/*'] })
    );
    fs.writeFileSync(
      path.join(mono, 'ark.config.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        include: ['apps'],
        layers: [{ name: 'ApplicationOrchestration', patterns: ['apps/**/src/**'] }],
        rules: [],
      })
    );
    const web = path.join(mono, 'apps', 'web');
    fs.mkdirSync(web, { recursive: true });
    fs.writeFileSync(
      path.join(web, 'package.json'),
      JSON.stringify({ name: 'web', private: true })
    );

    const found = findNearestArkConfig(web);
    expect(found).not.toBeNull();
    expect(found!.root).toBe(mono);
    expect(found!.walkedUp).toBe(true);
    expect(found!.configPath).toBe(path.join(mono, 'ark.config.json'));

    const effective = resolveEffectiveProjectRoot(web, { configName: 'ark.config.json' });
    expect(effective.configFound).toBe(true);
    expect(effective.walkedUp).toBe(true);
    expect(effective.root).toBe(mono);
    expect(effective.configRoot).toBe(mono);
  });

  it('does not invent walk-up when config is local', () => {
    const root = mk();
    fs.writeFileSync(path.join(root, 'ark.config.json'), '{}\n');
    const effective = resolveEffectiveProjectRoot(root);
    expect(effective.walkedUp).toBe(false);
    expect(effective.configFound).toBe(true);
    expect(effective.root).toBe(root);
  });

  it('nested relative --config is a path, not a walk-up filename', () => {
    const parent = mk();
    fs.writeFileSync(
      path.join(parent, 'ark.config.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/**'] }],
        rules: [],
      })
    );
    fs.mkdirSync(path.join(parent, 'src'), { recursive: true });
    fs.writeFileSync(path.join(parent, 'src', 'parent.ts'), 'export const parent = 1;\n');

    const nestedRel = path.join('examples', 'app');
    const nested = path.join(parent, nestedRel);
    fs.mkdirSync(path.join(nested, 'src', 'domain'), { recursive: true });
    fs.mkdirSync(path.join(nested, 'src', 'application'), { recursive: true });
    fs.writeFileSync(
      path.join(nested, 'ark.config.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'ApplicationOrchestration', patterns: ['src/application/**'] },
        ],
        rules: [],
      })
    );
    fs.writeFileSync(path.join(nested, 'src', 'domain', 'order.ts'), 'export const order = 1;\n');
    fs.writeFileSync(
      path.join(nested, 'src', 'application', 'place.ts'),
      'export const place = 1;\n'
    );

    const nestedConfigRel = path.join(nestedRel, 'ark.config.json');
    const effective = resolveEffectiveProjectRoot(nested, { configName: nestedConfigRel });
    expect(effective.configFound).toBe(true);
    expect(effective.walkedUp).toBe(false);
    expect(effective.root).toBe(nested);
    expect(effective.configRoot).toBe(nested);
    expect(effective.configPath).toBe(path.join(nested, 'ark.config.json'));

    const arkCheck = path.resolve('bin/ark-check.mjs');
    const run = spawnSync(
      process.execPath,
      [
        arkCheck,
        '--root',
        nested,
        '--config',
        nestedConfigRel,
        '--coverage',
        '--json',
        '--no-cache',
      ],
      { encoding: 'utf8', cwd: parent, env: { ...process.env, NO_COLOR: '1' } }
    );
    const out = (run.stdout || '') + (run.stderr || '');
    const jsonStart = out.indexOf('{');
    expect(jsonStart, out.slice(0, 800)).toBeGreaterThanOrEqual(0);
    const payload = JSON.parse(out.slice(jsonStart)) as {
      coverage?: {
        unclassified?: { files?: string[] };
        layers?: Array<{ name: string; files: number }>;
        governed?: { totalFiles: number };
      };
    };
    const unclassified = payload.coverage?.unclassified?.files ?? [];
    expect(unclassified).not.toContain('src/parent.ts');
    const byName = Object.fromEntries(
      (payload.coverage?.layers ?? []).map((layer) => [layer.name, layer.files])
    );
    expect(byName.ApplicationOrchestration).toBeGreaterThan(0);
    expect(payload.coverage?.governed?.totalFiles).toBe(2);
  });

  it('returns configFound false for true greenfield (no parent config)', () => {
    const root = mk();
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"gf"}\n');
    const effective = resolveEffectiveProjectRoot(root);
    expect(effective.configFound).toBe(false);
    expect(effective.walkedUp).toBe(false);
    expect(effective.root).toBe(root);
  });

  it('writeMode keeps nested --root (does not rewrite parent monorepo without opt-in)', () => {
    const mono = mk();
    fs.writeFileSync(
      path.join(mono, 'package.json'),
      JSON.stringify({ name: 'mono', private: true, workspaces: ['apps/*'] })
    );
    fs.writeFileSync(
      path.join(mono, 'ark.config.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        include: ['apps'],
        layers: [{ name: 'ApplicationOrchestration', patterns: ['apps/**/src/**'] }],
        rules: [],
      })
    );
    const web = path.join(mono, 'apps', 'web');
    fs.mkdirSync(web, { recursive: true });

    const writeKeep = resolveEffectiveProjectRoot(web, {
      configName: 'ark.config.json',
      writeMode: true,
      followConfigRoot: false,
    });
    expect(writeKeep.configFound).toBe(true);
    expect(writeKeep.walkedUp).toBe(true);
    expect(writeKeep.configRoot).toBe(mono);
    expect(writeKeep.root).toBe(web);
    expect(writeKeep.writeRoot).toBe(web);
    expect(writeKeep.writeRootFollowedConfig).toBe(false);

    const writeFollow = resolveEffectiveProjectRoot(web, {
      configName: 'ark.config.json',
      writeMode: true,
      followConfigRoot: true,
    });
    expect(writeFollow.root).toBe(mono);
    expect(writeFollow.writeRootFollowedConfig).toBe(true);
  });

  it('resolveConfigPathWithinRoot refuses --config outside project root', () => {
    const root = mk();
    const outside = path.join(path.dirname(root), 'outside-ark.config.json');
    const bad = resolveConfigPathWithinRoot(root, outside);
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/outside project root/i);

    const ok = resolveConfigPathWithinRoot(root, 'ark.config.json');
    expect(ok.ok).toBe(true);
    expect(ok.configPath).toBe(path.join(root, 'ark.config.json'));
  });

  it('isMutatingCliCommand covers install/init/migrate --write', () => {
    expect(isMutatingCliCommand({ installAgentGates: true })).toBe(true);
    expect(isMutatingCliCommand({ init: true })).toBe(true);
    expect(isMutatingCliCommand({ migrateContract: true, write: true })).toBe(true);
    expect(isMutatingCliCommand({ migrateContract: true })).toBe(false);
    expect(isMutatingCliCommand({ doctor: true })).toBe(false);
    expect(isMutatingCliCommand({ adoptContract: true, write: true })).toBe(true);
    expect(isMutatingCliCommand({ applyPolicyPack: true })).toBe(true);
    expect(isMutatingCliCommand({ ratchetCores: true })).toBe(true);
  });

  it('mutative config writes refuse --config outside project root (exit 2)', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/**'], optional: false },
          { name: 'ApplicationOrchestration', patterns: [], optional: true },
          { name: 'PresentationAdapters', patterns: [], optional: true },
          { name: 'PersistenceAdapters', patterns: [], optional: true },
        ],
        rules: [],
      })
    );
    const outside = path.join(path.dirname(root), `outside-escape-${Date.now()}.json`);
    const outsideExisted = fs.existsSync(outside);
    const arkCheck = path.resolve('bin/ark-check.mjs');
    const run = (flags: string[]) =>
      spawnSync(process.execPath, [arkCheck, '--root', root, '--config', outside, ...flags], {
        encoding: 'utf8',
        cwd: root,
        env: { ...process.env, NO_COLOR: '1' },
      });

    const adopt = run(['--adopt-contract', '--write', '--json']);
    expect(adopt.status).toBe(2);
    expect((adopt.stderr || '') + (adopt.stdout || '')).toMatch(/outside project root/i);

    const pack = run(['--apply-policy-pack', 'enthusiast-ui-surface', '--force', '--json']);
    expect(pack.status).toBe(2);
    expect((pack.stderr || '') + (pack.stdout || '')).toMatch(/outside project root/i);

    const ratchet = run(['--ratchet-cores', '--json']);
    expect(ratchet.status).toBe(2);
    expect((ratchet.stderr || '') + (ratchet.stdout || '')).toMatch(/outside project root/i);

    // Escape path must never be written.
    if (!outsideExisted) {
      expect(fs.existsSync(outside)).toBe(false);
    }
  });

  it('does not walk above workspaces root when config is only outside monorepo', () => {
    const outer = mk();
    fs.writeFileSync(path.join(outer, 'ark.config.json'), '{}\n');
    const mono = path.join(outer, 'mono');
    fs.mkdirSync(mono, { recursive: true });
    fs.writeFileSync(
      path.join(mono, 'package.json'),
      JSON.stringify({ name: 'mono', private: true, workspaces: ['apps/*'] })
    );
    const web = path.join(mono, 'apps', 'web');
    fs.mkdirSync(web, { recursive: true });
    // Config at outer is above workspaces root — must not latch.
    const found = findNearestArkConfig(web);
    expect(found).toBeNull();
  });

  it('ark-check --doctor from nested package uses monorepo root (integration)', () => {
    const mono = mk();
    fs.writeFileSync(
      path.join(mono, 'package.json'),
      JSON.stringify({ name: 'mono-int', private: true, workspaces: ['apps/*'] })
    );
    fs.writeFileSync(
      path.join(mono, 'ark.config.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        include: ['apps'],
        layers: [
          {
            name: 'ApplicationOrchestration',
            patterns: ['apps/web/src/**'],
          },
        ],
        rules: [],
      })
    );
    const web = path.join(mono, 'apps', 'web');
    fs.mkdirSync(path.join(web, 'src'), { recursive: true });
    fs.writeFileSync(path.join(web, 'package.json'), '{"name":"web","private":true}\n');
    fs.writeFileSync(path.join(web, 'src', 'page.ts'), 'export const x = 1;\n');

    const arkCheck = path.resolve('bin/ark-check.mjs');
    const run = spawnSync(
      process.execPath,
      [arkCheck, '--root', web, '--doctor', '--json', '--no-cache'],
      { encoding: 'utf8', cwd: web, env: { ...process.env, NO_COLOR: '1' } }
    );
    // Doctor may exit non-zero without TS host or on incomplete analysis; parse JSON either way.
    const out = (run.stdout || '') + (run.stderr || '');
    const jsonStart = out.indexOf('{');
    expect(jsonStart, out.slice(0, 500)).toBeGreaterThanOrEqual(0);
    const payload = JSON.parse(out.slice(jsonStart));
    expect(payload.doctor?.configRoot).toBe(mono);
    expect(payload.doctor?.configWalkedUp).toBe(true);
    // Must not invent empty 0-file ADAPT world when monorepo config governs apps/web/src.
    expect(payload.doctor?.governed?.totalFiles ?? 0).toBeGreaterThan(0);
  });
});

describe('PACKAGE_PIN_ABSENT writePath honesty (S2.4)', () => {
  it('configured hooks without package install: hard false + pin-absent honesty', () => {
    const root = mk();
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"consumer","private":true}\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/**'] }],
        rules: [],
      })
    );
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n');
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ command: 'npx arkgate-mcp --hook' }] }],
        },
      })
    );

    const writePath = detectWritePathCapabilities(root, 'claude');
    expect(writePath.enforcementState.localWrite.configured).toBe(true);
    expect(writePath.enforcementState.localWrite.installed).toBe(false);
    expect(writePath.enforcementState.localWrite.hard).toBe(false);
    expect(writePath.enforcementLadder.localWrite.hard).toBe(false);

    const pin = describePackageVersionDualTruth(root, { cliVersion: '4.1.0' });
    expect(pin.code).toBe('PACKAGE_PIN_ABSENT');

    const honesty = buildWritePathHonesty('claude', writePath.enforcementState.localWrite.hard, {
      packageInstalled: false,
      packagePinCode: pin.code,
    });
    expect(honesty.hardWriteActive).toBe(false);
    expect(honesty.packagePinAbsent).toBe(true);

    const product = buildProductHonesty({
      coverageHonesty: buildCoverageHonesty({ percent: 100, totalFiles: 1 }),
      baselineHonesty: buildBaselineHonesty({ exists: false }),
      writePathHonesty: honesty,
      packageVersionTruth: pin,
    });
    expect(product.unfinished).toBe(true);
    expect(product.reasonIds).toContain('package-pin-absent');
    expect(product.finished).toBe(false);
    expect(product.primaryNextAction).toMatch(/PACKAGE_PIN_ABSENT|package\.json|install/i);
  });

  it('self-host mother is PACKAGE_PIN_SELF_HOST not consumer pin-absent unfinished', () => {
    const pin = describePackageVersionDualTruth(path.resolve('.'));
    // Running tests inside mother repo.
    expect(pin.code).toBe('PACKAGE_PIN_SELF_HOST');
    expect(pin.selfHost).toBe(true);

    const product = buildProductHonesty({
      coverageHonesty: buildCoverageHonesty({ percent: 100, totalFiles: 10 }),
      baselineHonesty: buildBaselineHonesty({
        exists: true,
        frozenKeys: 0,
        activeViolations: 0,
        totalViolations: 0,
      }),
      packageVersionTruth: pin,
    });
    expect(product.reasonIds).not.toContain('package-pin-absent');
  });
});
