/**
 * LC01: opt-in --local reuses --changed, stays per-root, refuses --strict-merge.
 */
import { execFile, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

import {
  LOCAL_STRICT_MERGE_MESSAGE,
  parseArgs,
} from '../../../bin/lib/check-args.mjs';
import { residentHookEndpoint } from '../../../bin/lib/resident-hook.mjs';

const execFileAsync = promisify(execFile);
const arkCheck = path.resolve('bin/ark-check.mjs');
const temps: string[] = [];

function mk(prefix = 'ark-local-dx-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

function git(root: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function writeProject(root: string, fileCount = 8) {
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'local-dx' }));
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
  for (let i = 0; i < fileCount; i += 1) {
    fs.writeFileSync(path.join(root, `src/domain/m${i}.ts`), `export const m${i} = ${i};\n`);
  }
}

function initGit(root: string) {
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.name=Ark Test', '-c', 'user.email=ark@example.test', 'commit', '-qm', 'init']);
}

function runCheck(root: string, extra: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [arkCheck, '--root', root, ...extra], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe('LC01 local check DX', () => {
  it('parseArgs: --local enables --changed; env is ignored under --strict-merge', () => {
    const local = parseArgs(['node', 'ark-check', '--local', '--base', 'HEAD'], {});
    expect(local.local).toBe(true);
    expect(local.changed).toBe(true);

    const fromEnv = parseArgs(['node', 'ark-check'], { ARK_CHECK_LOCAL: '1' });
    expect(fromEnv.local).toBe(true);
    expect(fromEnv.changed).toBe(true);

    const ciEnv = parseArgs(['node', 'ark-check', '--strict-merge'], { ARK_CHECK_LOCAL: '1' });
    expect(ciEnv.strictMerge).toBe(true);
    expect(ciEnv.local).toBe(false);
    expect(ciEnv.changed).toBe(false);

    expect(() => parseArgs(['node', 'ark-check', '--local', '--strict-merge'], {})).toThrow(
      LOCAL_STRICT_MERGE_MESSAGE
    );
    expect(() => parseArgs(['node', 'ark-check', '--local', '--doctor'], {})).toThrow(
      /cannot be combined with report modes/
    );

    const leftoverDoctor = parseArgs(['node', 'ark-check', '--doctor'], { ARK_CHECK_LOCAL: '1' });
    expect(leftoverDoctor.doctor).toBe(true);
    expect(leftoverDoctor.local).toBe(false);
    expect(leftoverDoctor.changed).toBe(false);

    const leftoverCoverage = parseArgs(['node', 'ark-check', '--coverage'], { ARK_CHECK_LOCAL: 'true' });
    expect(leftoverCoverage.coverage).toBe(true);
    expect(leftoverCoverage.local).toBe(false);

    const leftoverPlan = parseArgs(['node', 'ark-check', '--plan'], { ARK_CHECK_LOCAL: 'yes' });
    expect(leftoverPlan.plan).toBe(true);
    expect(leftoverPlan.local).toBe(false);

    const leftoverReport = parseArgs(['node', 'ark-check', '--report'], { ARK_CHECK_LOCAL: '1' });
    expect(leftoverReport.report).toBe('ark-report.html');
    expect(leftoverReport.local).toBe(false);

    const leftoverPromote = parseArgs(['node', 'ark-check', '--promote'], { ARK_CHECK_LOCAL: '1' });
    expect(leftoverPromote.promote).toBe(true);
    expect(leftoverPromote.local).toBe(false);
  });

  it('CLI --local --strict-merge exits 2; --local --base HEAD cheap-passes a clean tree', () => {
    const root = mk();
    writeProject(root);
    initGit(root);

    const refused = runCheck(root, ['--local', '--strict-merge', '--json']);
    expect(refused.status).toBe(2);
    expect(refused.stderr).toContain('--local cannot be combined with --strict-merge');

    const cheap = runCheck(root, ['--local', '--base', 'HEAD', '--json']);
    expect(cheap.status).toBe(0);
    const body = JSON.parse(cheap.stdout) as {
      ok: boolean;
      cheap?: boolean;
      local?: boolean;
      scope?: string;
      analysisRoot?: string;
    };
    expect(body.ok).toBe(true);
    expect(body.cheap).toBe(true);
    expect(body.local).toBe(true);
    expect(body.scope).toBe('changed');
    expect(body.analysisRoot).toBe(fs.realpathSync(root));

    const noGit = mk('ark-local-dx-nongit-');
    writeProject(noGit);
    const needsBase = runCheck(noGit, ['--local', '--json']);
    expect(needsBase.status).toBe(2);
    expect(`${needsBase.stdout}${needsBase.stderr}`).toContain('--local needs a git merge base');
  });

  it('ARK_CHECK_LOCAL=1 does not narrow --strict-merge; two roots stay isolated', async () => {
    const a = mk('ark-local-dx-a-');
    const b = mk('ark-local-dx-b-');
    writeProject(a, 12);
    writeProject(b, 12);
    initGit(a);
    initGit(b);
    fs.appendFileSync(path.join(a, 'src/domain/m0.ts'), 'export const dirtyA = 1;\n');
    fs.appendFileSync(path.join(b, 'src/domain/m0.ts'), 'export const dirtyB = 1;\n');

    const launcher = path.resolve('bin/ark-mcp.mjs');
    const endpointA = residentHookEndpoint({
      root: a,
      config: 'ark.config.json',
      launcher,
    });
    const endpointB = residentHookEndpoint({
      root: b,
      config: 'ark.config.json',
      launcher,
    });
    expect(endpointA.directory).toBe(endpointB.directory);
    expect(endpointA.socket).not.toBe(endpointB.socket);

    const [left, right] = await Promise.all([
      execFileAsync(process.execPath, [arkCheck, '--root', a, '--local', '--base', 'HEAD', '--json'], {
        encoding: 'utf8',
      }),
      execFileAsync(process.execPath, [arkCheck, '--root', b, '--local', '--base', 'HEAD', '--json'], {
        encoding: 'utf8',
      }),
    ]);

    const leftJson = JSON.parse(left.stdout) as {
      ok: boolean;
      local?: boolean;
      analysisRoot?: string;
    };
    const rightJson = JSON.parse(right.stdout) as {
      ok: boolean;
      local?: boolean;
      analysisRoot?: string;
    };
    expect(leftJson.ok).toBe(true);
    expect(rightJson.ok).toBe(true);
    expect(leftJson.local).toBe(true);
    expect(rightJson.local).toBe(true);
    expect(leftJson.analysisRoot).toBe(fs.realpathSync(a));
    expect(rightJson.analysisRoot).toBe(fs.realpathSync(b));
    expect(leftJson.analysisRoot).not.toBe(rightJson.analysisRoot);
  });
});
