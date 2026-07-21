import { spawn, spawnSync, execSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withDistLock } from '../../helpers/distLock';

const repositoryRoot = process.cwd();
let runtimeRoot: string;
let mcpBin: string;

function fixtureEnv(): NodeJS.ProcessEnv {
  return { ...process.env, ARK_POLICY_BASE_REF: '', GITHUB_BASE_REF: '' };
}

function write(root: string, relativePath: string, content: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

function git(root: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  expect(result.status, result.stderr || result.stdout).toBe(0);
}

function client(root: string) {
  const process = spawn('node', [mcpBin, '--root', root], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: fixtureEnv(),
  }) as ChildProcessWithoutNullStreams;
  const pending = new Map<number, (message: any) => void>();
  let buffer = '';
  process.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  });
  let id = 0;
  const request = (method: string, params?: unknown) => {
    const requestId = ++id;
    return new Promise<any>((resolve) => {
      pending.set(requestId, resolve);
      process.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })}\n`);
    });
  };
  return { process, request };
}

beforeAll(() => {
  withDistLock(() => execSync('npm run build', { cwd: repositoryRoot, stdio: 'ignore' }));
  runtimeRoot = fs.mkdtempSync(path.join(repositoryRoot, '.ark-z10-mcp-runtime-'));
  fs.cpSync(path.join(repositoryRoot, 'bin'), path.join(runtimeRoot, 'bin'), { recursive: true });
  fs.cpSync(path.join(repositoryRoot, 'dist'), path.join(runtimeRoot, 'dist'), { recursive: true });
  mcpBin = path.join(runtimeRoot, 'bin', 'ark-mcp.mjs');
}, 120000);

afterAll(() => {
  if (runtimeRoot) fs.rmSync(runtimeRoot, { recursive: true, force: true });
});

describe('Z10 write/MCP/CLI design-delta parity', () => {
  it('returns the same smell identity and verdict while only the observed hook is hard', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z10-write-parity-'));
    const config = {
      schemaVersion: '1.0',
      include: ['apps', 'packages'],
      layers: [
        { name: 'DomainModel', patterns: ['packages/shared/src/rules/**'] },
        { name: 'PresentationAdapters', patterns: ['apps/web/src/product/**'] },
      ],
      rules: [{ from: 'DomainModel', to: 'PresentationAdapters', allowed: false }],
    };
    write(root, 'package.json', '{"name":"z10-write-parity","private":true}\n');
    write(root, 'ark.config.json', `${JSON.stringify(config, null, 2)}\n`);
    write(root, 'apps/web/src/product/page.tsx', 'export const Page = () => <main />;\n');
    write(root, 'packages/shared/src/rules/listing.ts', 'export const listingKind = "listing";\n');
    write(root, 'AGENTS.md', '# ArkGate Enforcement\n');
    write(root, '.mcp.json', '{"mcpServers":{"ark":{"command":"arkgate-mcp"}}}\n');
    write(root, '.github/workflows/ark-check.yml', 'jobs:\n  ark-check:\n    steps:\n      - run: npx ark-check --strict-merge\n');
    write(
      root,
      '.ark/golden-pattern.json',
      JSON.stringify({ name: 'shared-rules', norm: 'pure rules outside UI', newCodeHome: 'packages/shared/src/rules/' })
    );
    git(root, ['init', '-q']);
    git(root, ['config', 'user.email', 'arkgate@example.invalid']);
    git(root, ['config', 'user.name', 'ArkGate Test']);
    git(root, ['add', '.']);
    git(root, ['commit', '-qm', 'base']);

    const relativePath = 'apps/web/src/product/listing-permissions.ts';
    const source =
      'export const canManageListing = (ownerId: string, actorId: string) => ' +
      'ownerId === actorId;\n';
    const hook = spawnSync(
      process.execPath,
      [
        mcpBin,
        '--hook',
        '--hook-repair',
        '--fail-on-new-smells',
        '--root', root,
        '--config', 'ark.config.json',
      ],
      {
        cwd: root,
        encoding: 'utf8',
        env: fixtureEnv(),
        input: JSON.stringify({
          tool_name: 'Write',
          tool_input: { file_path: path.join(root, relativePath), content: source },
        }),
      }
    );
    expect(hook.status, hook.stderr || hook.stdout).toBe(2);
    const repairLine = hook.stderr.split('\n').find((line) => line.startsWith('ARK_REPAIR_JSON:'));
    expect(repairLine).toBeTruthy();
    const repair = JSON.parse(repairLine!.slice('ARK_REPAIR_JSON:'.length));
    expect(repair.enforcement.localWrite).toMatchObject({
      active: true,
      operation: 'Write',
      operationCovered: true,
      completePatch: true,
      coverage: 'complete-patch',
      hard: true,
    });
    expect(repair.designDelta).toMatchObject({ complete: true, valid: false });
    const hookFinding = repair.designDelta.changes[0];
    expect(hookFinding.repairHint).toContain('packages/shared/src/rules/');
    expect(hookFinding.repairHint).toContain('shared-rules');

    const mcp = client(root);
    await mcp.request('initialize', { protocolVersion: '2024-11-05' });
    const preparedResponse = await mcp.request('tools/call', {
      name: 'ark_prepare_write',
      arguments: { filePath: relativePath, source },
    });
    mcp.process.kill();
    const prepared = JSON.parse(preparedResponse.result.content[0].text);
    expect(prepared).toMatchObject({ edgeValid: true, valid: false });
    expect(prepared.designDelta).toMatchObject({ complete: true, valid: false });

    write(root, relativePath, source);
    const final = spawnSync(
      process.execPath,
      [
        path.join(runtimeRoot, 'bin', 'ark-check.mjs'),
        '--root', root,
        '--config', 'ark.config.json',
        '--strict-merge',
        '--fail-on-new-smells',
        '--base-ref', 'HEAD',
        '--json',
        '--no-cache',
      ],
      { cwd: root, encoding: 'utf8', env: fixtureEnv() }
    );
    expect(final.status, final.stderr || final.stdout).toBe(1);
    const finalResult = JSON.parse(final.stdout);
    expect(finalResult).toMatchObject({ edgeValid: true, valid: false });
    expect(finalResult.designDelta).toMatchObject({ complete: true, valid: false });
    for (const finding of [prepared.designDelta.changes[0], finalResult.designDelta.changes[0]]) {
      expect(finding).toMatchObject({
        smellId: hookFinding.smellId,
        fingerprint: hookFinding.fingerprint,
        identity: hookFinding.identity,
        classification: 'new',
      });
    }
  });
});
