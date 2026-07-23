import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARK = path.join(REPO, 'bin', 'ark.mjs');
const ARK_CHECK = path.join(REPO, 'bin', 'ark-check.mjs');
const FIXTURES = path.join(REPO, 'tests', 'fixtures', 'onboarding');
const HOSTS = ['claude', 'grok', 'cursor', 'codex'] as const;
const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn'] as const;
const SHAPES = ['library', 'api', 'frontend', 'monorepo'] as const;
const SIZES = ['small', 'medium', 'large'] as const;
const SHARD = process.env.O04_SHARD;

type Host = (typeof HOSTS)[number];
type PackageManager = (typeof PACKAGE_MANAGERS)[number];
type Shape = (typeof SHAPES)[number];
type Size = (typeof SIZES)[number];

type StartResult = {
  changes: Array<{ path: string }>;
  commands: string[];
  projectedCoverage: { percent: number; classifiedFiles: number; totalFiles: number };
};

const CANONICAL_CAPABILITIES: Record<Host, Record<string, boolean>> = {
  claude: { 'hard-write': true, 'advisory-write': true, 'merge-gate': true, 'repair-payload': true },
  grok: { 'hard-write': true, 'advisory-write': true, 'merge-gate': true, 'repair-payload': true },
  cursor: { 'hard-write': false, 'advisory-write': true, 'merge-gate': true, 'repair-payload': false },
  codex: { 'hard-write': false, 'advisory-write': true, 'merge-gate': true, 'repair-payload': false },
};

function matrix() {
  return SHAPES.flatMap((shape) =>
    SIZES.flatMap((size) =>
      HOSTS.flatMap((host) => PACKAGE_MANAGERS.map((packageManager) => ({ shape, size, host, packageManager })))
    )
  );
}

function snapshot(root: string) {
  const files = new Map<string, Buffer>();
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else files.set(path.relative(root, file).split(path.sep).join('/'), fs.readFileSync(file));
    }
  };
  visit(root);
  return files;
}

function changedPaths(before: Map<string, Buffer>, after: Map<string, Buffer>) {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((file) => !before.get(file)?.equals(after.get(file)!))
    .sort();
}

function writePackageManagerSignal(root: string, packageManager: PackageManager) {
  for (const lockfile of ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']) {
    fs.rmSync(path.join(root, lockfile), { force: true });
  }
  const packageJson = path.join(root, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(packageJson, 'utf8')) as Record<string, unknown>;
  manifest.packageManager = `${packageManager}@${packageManager === 'npm' ? '10.8.0' : packageManager === 'pnpm' ? '9.15.0' : '4.5.0'}`;
  fs.writeFileSync(packageJson, `${JSON.stringify(manifest, null, 2)}\n`);
  if (packageManager === 'npm') fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
  if (packageManager === 'pnpm') fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
  if (packageManager === 'yarn') fs.writeFileSync(path.join(root, 'yarn.lock'), '# yarn lockfile v1\n');
}

function run(file: string, args: string[], root: string, host: Host) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], {
      cwd: root,
      env: { ...process.env, ARK_ACTIVE_HOST: host, CODEX_HOME: path.join(root, '.codex-home') },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (stdout += chunk));
    child.stderr.on('data', (chunk: string) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

async function start(root: string, host: Host, apply = false) {
  const args = ['start', '--root', root, '--no-strict', '--tools', host, '--install', '--json'];
  if (apply) args.push('--apply');
  const result = await run(ARK, args, root, host);
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  return JSON.parse(result.stdout) as StartResult;
}

function assertNoUnrelatedHostFiles(root: string, host: Host) {
  const paths: Record<Host, string[]> = {
    claude: ['.grok', '.cursor', '.codex'],
    grok: ['.claude', '.cursor', '.codex'],
    cursor: ['.claude', '.grok', '.codex'],
    codex: ['.claude', '.grok', '.cursor'],
  };
  for (const unrelated of paths[host]) expect(fs.existsSync(path.join(root, unrelated))).toBe(false);
}

function assertPackageManagerCommand(commands: string[], packageManager: PackageManager) {
  const first = commands[0] ?? '';
  if (packageManager === 'npm') expect(first).toMatch(/^npm install (?:-D|--save-dev) arkgate@/);
  if (packageManager === 'pnpm') expect(first).toMatch(/^pnpm add -D arkgate@/);
  if (packageManager === 'yarn') expect(first).toMatch(/^yarn add (?:-D|--dev) arkgate@/);
}

describe('O04 clean-room onboarding matrix', () => {
  const cells = matrix();
  const fixtureCells = SHARD
    ? cells.filter(({ shape, size }) => `${shape}/${size}` === SHARD)
    : [];

  it('defines all 144 supported cells', () => {
    expect(cells).toHaveLength(144);
    expect(new Set(cells.map((cell) => `${cell.shape}/${cell.size}/${cell.host}/${cell.packageManager}`)).size).toBe(144);
  });

  it.each(fixtureCells)(
    '$shape/$size/$host/$packageManager completes the clean-room journey',
    async ({ shape, size, host, packageManager }) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-o04-'));
      try {
        fs.cpSync(path.join(FIXTURES, shape, size), root, { recursive: true });
        writePackageManagerSignal(root, packageManager);

        const before = snapshot(root);
        const preview = await start(root, host);
        expect(snapshot(root)).toEqual(before);
        expect(preview.projectedCoverage.percent).toBeGreaterThanOrEqual(90);
        expect(preview.projectedCoverage.classifiedFiles).toBe(preview.projectedCoverage.totalFiles);
        assertPackageManagerCommand(preview.commands, packageManager);

        const applied = await start(root, host, true);
        const after = snapshot(root);
        // --install may run the package manager and rewrite lockfiles outside the
        // declared Ark mutation set (e.g. npm regenerating package-lock.json when
        // arkgate is added). Compare product files only.
        const lockfiles = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);
        const productChanged = changedPaths(before, after).filter((file) => !lockfiles.has(file));
        const productDeclared = applied.changes
          .map((change) => change.path)
          .filter((file) => !lockfiles.has(file))
          .sort();
        expect(productChanged).toEqual(productDeclared);
        expect(applied.projectedCoverage).toEqual(preview.projectedCoverage);
        assertNoUnrelatedHostFiles(root, host);

        const strict = await run(ARK_CHECK, ['--root', root, '--strict-merge'], root, host);
        expect(strict.status, `${strict.stdout}\n${strict.stderr}`).toBe(0);
        const doctor = await run(ARK_CHECK, ['--root', root, '--doctor', '--json', '--no-cache'], root, host);
        expect(doctor.status, doctor.stderr).toBe(0);
        const governed = JSON.parse(doctor.stdout).doctor.governed;
        expect(governed).toEqual(preview.projectedCoverage);

        const rerun = await start(root, host);
        expect(rerun.changes).toEqual([]);

        if (shape === 'library' && size === 'small' && packageManager === 'npm') {
          const installArgs = ['--root', root, '--install-agent-gates', '--tools', host];
          if (host === 'claude' || host === 'grok') installArgs.push('--require-write-hook', host);
          const installed = await run(ARK_CHECK, installArgs, root, host);
          expect(installed.status, `${installed.stdout}\n${installed.stderr}`).toBe(0);
          const installedDoctor = await run(ARK_CHECK, ['--root', root, '--doctor', '--json', '--no-cache'], root, host);
          const writePath = JSON.parse(installedDoctor.stdout).doctor.writePath;
          expect(writePath.capabilities).toMatchObject(CANONICAL_CAPABILITIES[host]);
        }
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
  }, 60_000);
});
