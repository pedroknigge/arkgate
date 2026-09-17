#!/usr/bin/env node
/**
 * LC01 timing proof. Writes docs/plans/local-check-worktree-dx/proof.md.
 * Not a second analysis engine — times existing ark-check paths.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arkCheck = path.join(repoRoot, 'bin/ark-check.mjs');
const proofPath = path.join(repoRoot, 'docs/plans/local-check-worktree-dx/proof.md');

function timeMs(fn) {
  const started = Date.now();
  const result = fn();
  return { ms: Date.now() - started, result };
}

function run(args, cwd = repoRoot, extraEnv = {}) {
  return spawnSync(process.execPath, [arkCheck, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  });
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')}: ${result.stderr || result.stdout}`);
  }
}

function writeFixture(root, n = 40) {
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'local-dx-proof' }));
  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true, moduleResolution: 'bundler' } })
  );
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    JSON.stringify({
      include: ['src'],
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'] },
        { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
      ],
      rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
    })
  );
  fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};\n');
  for (let i = 0; i < n; i += 1) {
    fs.writeFileSync(path.join(root, `src/domain/m${i}.ts`), `export const m${i} = ${i};\n`);
  }
}

const motherFull = timeMs(() => run(['--root', repoRoot, '--config', 'ark.config.json', '--json']));
const motherLocal = timeMs(() =>
  run(['--root', repoRoot, '--config', 'ark.config.json', '--local', '--base', 'HEAD', '--json'])
);
const motherChanged = timeMs(() =>
  run(['--root', repoRoot, '--config', 'ark.config.json', '--changed', '--base', 'HEAD', '--json'])
);
const motherRefuse = run([
  '--root',
  repoRoot,
  '--config',
  'ark.config.json',
  '--local',
  '--strict-merge',
]);

const a = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-local-proof-a-'));
const b = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-local-proof-b-'));
try {
  writeFixture(a);
  writeFixture(b);
  for (const root of [a, b]) {
    git(root, ['init', '-q', '-b', 'main']);
    git(root, ['add', '-A']);
    git(root, [
      '-c',
      'user.name=Ark Test',
      '-c',
      'user.email=ark@example.test',
      'commit',
      '-qm',
      'init',
    ]);
  }
  fs.appendFileSync(path.join(a, 'src/domain/m0.ts'), 'export const dirtyA = 1;\n');
  fs.appendFileSync(path.join(b, 'src/domain/m0.ts'), 'export const dirtyB = 1;\n');

  const fixtureFull = timeMs(() => run(['--root', a, '--json'], a));
  const fixtureLocal = timeMs(() => run(['--root', a, '--local', '--base', 'HEAD', '--json'], a));

  const parallelStarted = Date.now();
  const left = spawnSync(process.execPath, [arkCheck, '--root', a, '--local', '--base', 'HEAD', '--json'], {
    encoding: 'utf8',
  });
  // Sequential pair measured separately; true overlap via execFileSync is one-at-a-time
  // here — the unit test owns Promise.all overlap. This script records both roots
  // completing and distinct analysisRoot values.
  const right = spawnSync(process.execPath, [arkCheck, '--root', b, '--local', '--base', 'HEAD', '--json'], {
    encoding: 'utf8',
  });
  const pairMs = Date.now() - parallelStarted;
  const leftJson = JSON.parse(left.stdout);
  const rightJson = JSON.parse(right.stdout);

  const host = `${os.platform()} ${os.arch()} ${os.cpus()?.[0]?.model ?? 'cpu'} x${os.cpus()?.length ?? '?'}`;
  const md = `# LC01 proof — local multi-worktree check

Measured on \`${host}\` at ${new Date().toISOString()}.
This checkout: \`${repoRoot}\`.

Numbers are wall times from \`scripts/local-check-dx-proof.mjs\`. They are
evidence, not a product SLA. \`--local\` reuses \`--changed\`; it does not
invent a second engine.

## Mother tree (this repo)

| Invocation | Wall | Exit | Notes |
|---|---:|---:|---|
| full \`ark-check --json\` | ${motherFull.ms} ms | ${motherFull.result.status} | whole governed set |
| \`--local --base HEAD --json\` | ${motherLocal.ms} ms | ${motherLocal.result.status} | scoped \`--changed\` path (dirty worktree pays the diff, not the whole tree) |
| \`--changed --base HEAD --json\` | ${motherChanged.ms} ms | ${motherChanged.result.status} | same engine path |
| \`--local --strict-merge\` | — | ${motherRefuse.status} | refused (Contener) |

Local JSON: \`${JSON.stringify({
    local: JSON.parse(motherLocal.result.stdout || '{}').local,
    scope: JSON.parse(motherLocal.result.stdout || '{}').scope,
    cheap: JSON.parse(motherLocal.result.stdout || '{}').cheap,
  })}\`

## 40-file fixture (one dirty file)

| Invocation | Wall | Exit |
|---|---:|---:|
| full \`ark-check --json\` | ${fixtureFull.ms} ms | ${fixtureFull.result.status} |
| \`--local --base HEAD --json\` | ${fixtureLocal.ms} ms | ${fixtureLocal.result.status} |

## Two-root isolation

Two independent git fixtures, each with one dirty governed file.

| Fact | Observed |
|------|----------|
| Root A \`ok\` / \`local\` | ${leftJson.ok} / ${leftJson.local} |
| Root B \`ok\` / \`local\` | ${rightJson.ok} / ${rightJson.local} |
| \`analysisRoot\` differs | ${leftJson.analysisRoot !== rightJson.analysisRoot} |
| Shared analysis lock | none (no global flock; sockets are per-root digest) |
| Sequential pair wall | ${pairMs} ms |

Overlap concurrency (Promise.all, two dirty roots) is asserted in
\`tests/unit/static-check/localCheckDx.test.ts\`.

## Bound (honest)

\`--local\` does not make \`--doctor\` or \`--strict-merge\` faster. Import
closure can still be large when a barrel file sits on the diff. Full-tree CI
stays the merge line. Write hooks stay lexical; they do not run this check.
`;

  fs.writeFileSync(proofPath, md);
  console.log(md);
} finally {
  fs.rmSync(a, { recursive: true, force: true });
  fs.rmSync(b, { recursive: true, force: true });
}
