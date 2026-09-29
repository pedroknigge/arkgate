/**
 * Generated commands in a project that does not pin arkgate.
 *
 * A bare `npx ark-check` / `npx arkgate-mcp` asks npm for a package named after the bin
 * (404) or runs a stale global copy. When arkgate is not a local dependency, generated CI
 * workflows, host hooks and MCP entries must name the exact package:
 * `npx -y -p arkgate@<this version> <bin>`. When it is pinned, the project's own runner stays.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  arkgateIsProjectDependency,
  execCommandParts,
  execRunner,
  npxArkgatePrefixLength,
} from '../../../bin/lib/package-manager.mjs';
import { packageManager } from '../../../bin/lib/ci-and-commands.mjs';
import { detectWritePathCapabilities } from '../../../bin/lib/write-path-detect.mjs';
import { runsArkCheck } from '../../../bin/lib/github-enforcement.mjs';
import {
  pinDependentGateFiles,
  withPinDependentGateFiles,
} from '../../../bin/lib/pin-dependent-gates.mjs';
import { packagePinAbsentPrimaryAction } from '../../../bin/lib/doctor-next-actions.mjs';
import { runDoctor } from '../../../bin/lib/doctor-plan.mjs';
import { collectGovernedFiles } from '../../../bin/lib/scan-files.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const VERSION = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version as string;
const PINNED = `npx -y -p arkgate@${VERSION}`;
const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempRoot(prefix: string): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  temps.push(root);
  return root;
}

function write(root: string, rel: string, text: string) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}

function read(root: string, rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function installGates(root: string, extra: string[] = []) {
  return spawnSync(
    process.execPath,
    [path.join(REPO, 'bin/ark-check.mjs'), '--root', root, '--install-agent-gates', ...extra],
    { encoding: 'utf8' }
  );
}

describe('unpinned project: generated commands name arkgate@<exact>', () => {
  it('no package.json: hooks, MCP entries and CI run npx -y -p arkgate@<version>', () => {
    const root = tempRoot('ark-unpinned-bare-');
    expect(arkgateIsProjectDependency(root)).toBe(false);
    expect(execRunner(root)).toBe(PINNED);

    const result = installGates(root, ['--tools', 'claude']);
    expect(result.status, result.stderr).toBe(0);

    const settings = read(root, '.claude/settings.json');
    expect(settings).toContain(`${PINNED} arkgate-mcp --hook`);
    expect(settings).toContain(`${PINNED} arkgate-mcp --session-context`);
    expect(settings).not.toMatch(/"npx arkgate-mcp/);

    const mcp = JSON.parse(read(root, '.mcp.json'));
    expect(mcp.mcpServers.ark.command).toBe('npx');
    expect(mcp.mcpServers.ark.args.slice(0, 4)).toEqual(['-y', '-p', `arkgate@${VERSION}`, 'arkgate-mcp']);

    const workflow = read(root, '.github/workflows/ark-check.yml');
    expect(workflow).toContain(`${PINNED} ark-check --root . --config ark.config.json --strict-merge`);
    expect(workflow).not.toMatch(/npx ark-check/);
    // Nothing to install, and setup-node's cache needs a lockfile that does not exist.
    expect(workflow).not.toContain('cache:');
    expect(workflow).not.toContain('name: Install dependencies');
    expect(runsArkCheck(workflow)).toBe(true);

    // The pinned hook and MCP entry are still recognized as Ark's write boundary.
    const cap = detectWritePathCapabilities(root, 'claude');
    expect(cap.hookPresent).toBe(true);
    expect(cap.inventory.hosts.claude.configured).toBe(true);
    // Nothing generated depends on a local pin.
    expect(pinDependentGateFiles(root)).toEqual([]);
  });

  it('package.json without arkgate: pinned run, project install and cache kept', () => {
    const root = tempRoot('ark-unpinned-pnpm-');
    write(root, 'package.json', '{"name":"app","packageManager":"pnpm@10.0.0"}\n');
    write(root, 'pnpm-lock.yaml', 'lockfileVersion: 9\n');
    expect(execRunner(root)).toBe(PINNED);
    expect(execCommandParts(root, 'arkgate-mcp', ['--root', '.'])).toEqual({
      command: 'npx',
      args: ['-y', '-p', `arkgate@${VERSION}`, 'arkgate-mcp', '--root', '.'],
    });
    expect(packageManager(root)).toMatchObject({
      cache: 'pnpm',
      install: 'pnpm install --frozen-lockfile',
      run: `${PINNED} ark-check --root . --config ark.config.json --strict-merge`,
    });
  });

  it('pinned project keeps the package-manager runner', () => {
    const npmRoot = tempRoot('ark-pinned-npm-');
    write(npmRoot, 'package.json', '{"name":"app","devDependencies":{"arkgate":"^4.8.0"}}\n');
    expect(arkgateIsProjectDependency(npmRoot)).toBe(true);
    expect(execRunner(npmRoot)).toBe('npx');
    expect(packageManager(npmRoot).run).toMatch(/^npx ark-check /);

    const pnpmRoot = tempRoot('ark-pinned-pnpm-');
    write(pnpmRoot, 'package.json', '{"name":"app","dependencies":{"arkgate":"4.8.0"}}\n');
    write(pnpmRoot, 'pnpm-lock.yaml', 'lockfileVersion: 9\n');
    expect(execRunner(pnpmRoot)).toBe('pnpm --config.verify-deps-before-run=false exec');

    const installed = tempRoot('ark-installed-');
    write(installed, 'node_modules/arkgate/package.json', '{"name":"arkgate","version":"4.8.0"}\n');
    expect(execRunner(installed)).toBe('npx');
  });

  it('npx prefix parser accepts the pinned spellings only for arkgate', () => {
    expect(npxArkgatePrefixLength(['arkgate-mcp'])).toBe(0);
    expect(npxArkgatePrefixLength(['-y', '-p', 'arkgate@4.8.23', 'arkgate-mcp'])).toBe(3);
    expect(npxArkgatePrefixLength(['--yes', '--package', 'arkgate', 'ark-check'])).toBe(3);
    expect(npxArkgatePrefixLength(['--package=arkgate@4.8.23', 'ark-check'])).toBe(1);
    expect(npxArkgatePrefixLength(['-y', '-p', 'evil@1.0.0', 'arkgate-mcp'])).toBe(0);
  });

  it('ark init without package.json writes pinned host hooks and CI', () => {
    const root = tempRoot('ark-unpinned-init-');
    write(root, 'src/domain/a.ts', 'export const a = 1;\n');
    const result = spawnSync(
      process.execPath,
      [path.join(REPO, 'bin/ark.mjs'), 'init', '--root', root, '--preset', 'hexagonal', '--yes', '--tools', 'claude'],
      { encoding: 'utf8' }
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`npx -y -p arkgate@${VERSION}`);
    const workflow = read(root, '.github/workflows/ark-check.yml');
    expect(workflow).toContain(`${PINNED} ark-check`);
    expect(workflow).not.toMatch(/npx ark-check/);
    expect(read(root, '.claude/settings.json')).toContain(`${PINNED} arkgate-mcp`);
  });

  it('migrate-commands rewrites a bare npx runner into the pinned form', () => {
    const root = tempRoot('ark-unpinned-migrate-');
    write(
      root,
      '.claude/settings.json',
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'npx ark-mcp --hook --root . --config ark.config.json' }] }] } })
    );
    write(
      root,
      '.mcp.json',
      JSON.stringify({ mcpServers: { ark: { command: 'npx', args: ['arkgate-mcp', '--root', '.', '--config', 'ark.config.json'] } } })
    );
    expect(pinDependentGateFiles(root)).toEqual(['.claude/settings.json', '.mcp.json']);
    const result = installGates(root, ['--migrate-commands']);
    expect(result.status, result.stderr).toBe(0);
    expect(read(root, '.claude/settings.json')).toContain(`${PINNED} arkgate-mcp --hook`);
    const mcp = JSON.parse(read(root, '.mcp.json'));
    expect(mcp.mcpServers.ark.args).toEqual([
      '-y', '-p', `arkgate@${VERSION}`, 'arkgate-mcp', '--root', '.', '--config', 'ark.config.json',
    ]);
    expect(pinDependentGateFiles(root)).toEqual([]);
    // Idempotent: a second run keeps one pinned prefix.
    expect(installGates(root, ['--migrate-commands']).status).toBe(0);
    expect(JSON.parse(read(root, '.mcp.json')).mcpServers.ark.args.slice(0, 4)).toEqual([
      '-y', '-p', `arkgate@${VERSION}`, 'arkgate-mcp',
    ]);
  });
});

describe('doctor: PACKAGE_PIN_ABSENT leads when a generated file needs the pin', () => {
  const CONFIG = {
    include: ['src'],
    layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
    rules: [],
  };
  const workflow = (run: string) =>
    `name: ark\non: [push, pull_request]\njobs:\n  ark:\n    runs-on: ubuntu-latest\n    steps:\n      - run: ${run}\n`;

  function tree(run: string): string {
    const root = tempRoot('ark-pin-doctor-');
    write(root, 'ark.config.json', JSON.stringify(CONFIG));
    write(root, 'AGENTS.md', '# Ark Enforcement\n');
    write(root, 'src/domain/thing.ts', 'export const n = 1;\n');
    write(root, '.github/workflows/ark-check.yml', workflow(run));
    return root;
  }

  function doctorJson(root: string) {
    const files = collectGovernedFiles(root, CONFIG);
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    try {
      runDoctor(root, CONFIG, files, CONFIG.rules, [], true, { completeness: 'complete' });
    } finally {
      console.log = orig;
    }
    return JSON.parse(logs.join('\n'));
  }

  it('bare npx workflow without a pin: primary next action is PACKAGE_PIN_ABSENT', () => {
    const root = tree('npx arkgate-check --strict-merge');
    expect(pinDependentGateFiles(root)).toEqual(['.github/workflows/ark-check.yml']);
    const payload = doctorJson(root);
    expect(payload.doctor.primaryNextAction).toContain('PACKAGE_PIN_ABSENT');
    expect(payload.doctor.primaryNextAction).toContain('.github/workflows/ark-check.yml');
  });

  it('pinned npx workflow without a pin: the pin does not lead', () => {
    const root = tree(`${PINNED} arkgate-check --strict-merge`);
    expect(pinDependentGateFiles(root)).toEqual([]);
    const payload = doctorJson(root);
    expect(payload.doctor.primaryNextAction ?? '').not.toContain('PACKAGE_PIN_ABSENT');
  });

  it('ranks only PACKAGE_PIN_ABSENT with dependent files, never self-host', () => {
    const truth = { code: 'PACKAGE_PIN_ABSENT', dependentGateFiles: ['.mcp.json'] };
    expect(packagePinAbsentPrimaryAction({ packageVersionTruth: truth })).toContain('.mcp.json');
    expect(packagePinAbsentPrimaryAction({ packageVersionTruth: truth, selfHost: true })).toBeNull();
    expect(
      packagePinAbsentPrimaryAction({ packageVersionTruth: { ...truth, dependentGateFiles: [] } })
    ).toBeNull();
    expect(
      packagePinAbsentPrimaryAction({ packageVersionTruth: { ...truth, code: 'PACKAGE_PIN_MATCHES' } })
    ).toBeNull();
    const matches = { code: 'PACKAGE_PIN_MATCHES' };
    expect(withPinDependentGateFiles(REPO, matches)).toBe(matches);
  });
});
