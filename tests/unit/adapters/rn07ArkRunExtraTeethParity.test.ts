/**
 * RN07: CLI / MCP / hook / preflight / CI extra-teeth parity — one verdict.
 * Enforced extra teeth only when the layer plane is classified.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadTypeScript } from '../../../bin/lib/typescript-host.mjs';
import { prepareChangeFromRoot } from '../../../bin/lib/prepare-change.mjs';
import { writeSemanticGateArtifacts } from '../../helpers/semanticGateArtifacts';

const CHECK = path.resolve('bin/ark-check.mjs');
const MCP = path.resolve('bin/ark-mcp.mjs');
const FIXTURES = path.resolve('tests/fixtures/arkrun-sensors');
const roots: string[] = [];

function copyCase(name: string): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `ark-rn07-${name}-`)));
  roots.push(root);
  fs.cpSync(path.join(FIXTURES, name), root, { recursive: true });
  writeSemanticGateArtifacts(root);
  return root;
}

function addUnclassifiedOrphans(root: string, count: number): void {
  for (let i = 1; i <= count; i += 1) {
    fs.writeFileSync(path.join(root, `src/orphan-${i}.ts`), `export const orphan${i} = ${i};\n`);
  }
}

function runCheck(root: string, extra: string[] = []) {
  const run = spawnSync(
    process.execPath,
    [CHECK, '--root', root, '--config', 'ark.config.json', '--json', '--no-cache', ...extra],
    { encoding: 'utf8' }
  );
  return {
    status: run.status ?? 1,
    data: JSON.parse(run.stdout || '{}') as {
      ok?: boolean;
      valid?: boolean;
      violations?: Array<{ ruleId?: string; failsStrict?: boolean }>;
      diagnostics?: Array<{ ruleId?: string; severity?: string }>;
    },
    raw: `${run.stdout}\n${run.stderr}`,
  };
}

function arkRunVoice(items: ReadonlyArray<{ ruleId?: string; failsStrict?: boolean }> = []) {
  return items
    .filter((item) => String(item.ruleId ?? '').startsWith('ARKRUN_'))
    .map((item) => ({ ruleId: item.ruleId, failsStrict: item.failsStrict !== false }))
    .sort((left, right) => String(left.ruleId).localeCompare(String(right.ruleId)));
}

async function preflightFile(root: string, relativePath: string) {
  const loaded = await loadTypeScript(root);
  expect(loaded.ts).toBeTruthy();
  const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
  const content = fs.readFileSync(path.join(root, relativePath), 'utf8');
  return prepareChangeFromRoot({
    root,
    config,
    configSource: path.join(root, 'ark.config.json'),
    changes: [{ path: relativePath, content }],
    ts: loaded.ts,
  });
}

function runMcpCheck(root: string) {
  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'ark_check',
      arguments: { strict: false, baseline: false, project: { expectedRoot: root } },
    },
  };
  const run = spawnSync(process.execPath, [MCP, '--root', root, '--config', 'ark.config.json'], {
    encoding: 'utf8',
    input: `${JSON.stringify(request)}\n`,
  });
  const response = run.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .find((item) => item.id === 1);
  return response?.result;
}

function runHookWrite(root: string, relativePath: string, content: string) {
  const payload = {
    tool_name: 'Write',
    tool_input: {
      file_path: path.join(root, relativePath),
      content,
    },
  };
  return spawnSync(process.execPath, [MCP, '--hook', '--root', root, '--config', 'ark.config.json'], {
    encoding: 'utf8',
    input: JSON.stringify(payload),
  });
}

function runHookPatchAdd(root: string, relativePath: string, content: string) {
  const lines = content.replace(/\n$/, '').split('\n').map((line) => `+${line}`).join('\n');
  const payload = {
    tool_name: 'apply_patch',
    tool_input: {
      patch: `*** Begin Patch\n*** Add File: ${relativePath}\n${lines}\n*** End Patch`,
    },
  };
  return spawnSync(process.execPath, [MCP, '--hook', '--root', root, '--config', 'ark.config.json'], {
    encoding: 'utf8',
    input: JSON.stringify(payload),
  });
}

describe('RN07 ArkRun extra-teeth adapter parity', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('classified enforced extra: CLI, preflight, MCP, hook, and --strict-merge share one fail', async () => {
    const root = copyCase('kernel-in-domain');
    const cli = runCheck(root);
    expect(cli.data.ok).toBe(false);
    expect(cli.data.valid).toBe(false);
    expect(arkRunVoice(cli.data.violations)).toEqual([
      { ruleId: 'ARKRUN_KERNEL_IN_DOMAIN', failsStrict: true },
    ]);

    const strict = runCheck(root, ['--strict-merge']);
    expect(strict.status).toBe(1);
    expect(strict.data.ok).toBe(false);

    const preflight = await preflightFile(root, 'src/domain/order.ts');
    expect(preflight.valid).toBe(false);
    expect(arkRunVoice(preflight.violations)).toEqual([
      { ruleId: 'ARKRUN_KERNEL_IN_DOMAIN', failsStrict: true },
    ]);

    const mcp = runMcpCheck(root);
    expect(mcp?.isError).toBe(true);
    expect(mcp?.structuredContent?.valid).toBe(false);
    expect(
      (mcp?.structuredContent?.diagnostics ?? []).some(
        (item: { ruleId?: string }) => item.ruleId === 'ARKRUN_KERNEL_IN_DOMAIN'
      )
    ).toBe(true);

    const source = fs.readFileSync(path.join(root, 'src/domain/order.ts'), 'utf8');
    const write = runHookWrite(root, 'src/domain/leaked.ts', source);
    expect(write.status).toBe(2);
    expect(write.stderr).toMatch(/ARKRUN_KERNEL_IN_DOMAIN/);

    const patch = runHookPatchAdd(root, 'src/domain/leaked-patch.ts', source);
    expect(patch.status).toBe(2);
    expect(patch.stderr).toMatch(/ARKRUN_KERNEL_IN_DOMAIN/);
  });

  it('unclassified enforced extra does not arm merge/write teeth', async () => {
    const root = copyCase('kernel-in-domain');
    addUnclassifiedOrphans(root, 3);
    // --strict-merge also implies --strict-config; unclassified files still warn there.
    // Extra teeth are the ArkRun plane: failsStrict false, JSON ok, preflight/hook allow.
    const cli = runCheck(root);
    expect(cli.status).toBe(0);
    expect(cli.data.ok).toBe(true);
    expect(cli.data.valid).toBe(true);
    expect(arkRunVoice(cli.data.violations)).toEqual([
      { ruleId: 'ARKRUN_KERNEL_IN_DOMAIN', failsStrict: false },
    ]);
    expect(
      (cli.data.diagnostics ?? []).find((item) => item.ruleId === 'ARKRUN_KERNEL_IN_DOMAIN')
    ).toMatchObject({ severity: 'warning' });

    const preflight = await preflightFile(root, 'src/domain/order.ts');
    expect(arkRunVoice(preflight.violations)).toEqual([
      { ruleId: 'ARKRUN_KERNEL_IN_DOMAIN', failsStrict: false },
    ]);
    expect(
      (preflight.violations ?? []).filter((item) => item.failsStrict !== false)
    ).toEqual([]);

    const source = fs.readFileSync(path.join(root, 'src/domain/order.ts'), 'utf8');
    const write = runHookWrite(root, 'src/domain/leaked.ts', source);
    expect(write.status).toBe(0);
    expect(write.stderr).not.toMatch(/ARKRUN_KERNEL_IN_DOMAIN/);
  });

  it('absence of arkRun stays silent on skip-like sources across CLI and preflight', async () => {
    const root = copyCase('absent');
    const cli = runCheck(root, ['--strict-merge']);
    expect(cli.status).toBe(0);
    expect(cli.data.ok).toBe(true);
    expect(arkRunVoice(cli.data.violations)).toEqual([]);
    const preflight = await preflightFile(root, 'src/domain/order-service.ts');
    expect(preflight.valid).toBe(true);
    expect(arkRunVoice(preflight.violations)).toEqual([]);
  });
});
