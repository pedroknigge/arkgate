/**
 * MCP ark_policy_delta end to end over stdio (arkrules cluster): passing the
 * project's own ark.config.json verbatim as candidateConfig is the project
 * contract (the server's in-memory config carries loader defaults and must not
 * be compared byte-for-byte), so the candidate ArkRules load from disk.
 */
import { execSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDistLock } from '../../helpers/distLock';

const repo = process.cwd();
let runtimeDir: string | undefined;
let projectRoot: string;
let proc: ChildProcessWithoutNullStreams | undefined;
const pending = new Map<number, (msg: any) => void>();
let nextId = 1;

const CONFIG = {
  schemaVersion: '1.1',
  include: ['src'],
  layers: [{ name: 'Domain', patterns: ['src/domain/**'] }],
  rules: [],
  arkRules: { Domain: 'arkrules/Domain.json' },
};
const ENFORCED = { id: 'private-state', sensor: 'aggregate-private-state', mode: 'enforced' };
const rulesFile = (structure: unknown[]) => ({ schemaVersion: '1.0', layer: 'Domain', structure });

function request(method: string, params?: unknown): Promise<any> {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    proc!.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

beforeAll(() => {
  withDistLock(() => {
    execSync('npm run build', { stdio: 'ignore' });
    runtimeDir = fs.mkdtempSync(path.join(repo, '.ark-mcp-runtime-'));
    fs.cpSync(path.join(repo, 'bin'), path.join(runtimeDir, 'bin'), { recursive: true });
    fs.cpSync(path.join(repo, 'dist'), path.join(runtimeDir, 'dist'), { recursive: true });
  });
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-mcp-policy-stdio-'));
  fs.mkdirSync(path.join(projectRoot, 'arkrules'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'src', 'domain'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'ark.config.json'), JSON.stringify(CONFIG));
  fs.writeFileSync(
    path.join(projectRoot, 'arkrules', 'Domain.json'),
    JSON.stringify(rulesFile([{ ...ENFORCED, mode: 'advisory' }]))
  );
  proc = spawn('node', [path.join(runtimeDir!, 'bin', 'ark-mcp.mjs'), '--root', projectRoot], {
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams;
  let buffer = '';
  proc.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.id != null && pending.has(msg.id)) {
        pending.get(msg.id)!(msg);
        pending.delete(msg.id);
      }
    }
  });
}, 120000);

afterAll(() => {
  proc?.stdin.end();
  proc?.kill();
  if (runtimeDir) fs.rmSync(runtimeDir, { recursive: true, force: true });
  if (projectRoot) fs.rmSync(projectRoot, { recursive: true, force: true });
});

describe('ark_policy_delta over stdio with ArkRules (arkrules cluster)', () => {
  it('accepts the project config verbatim as candidateConfig and classifies the demotion', async () => {
    const candidateConfig = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'ark.config.json'), 'utf8')
    );
    const response = await request('tools/call', {
      name: 'ark_policy_delta',
      arguments: {
        baseConfig: CONFIG,
        candidateConfig,
        baseArkRuleFiles: { 'arkrules/Domain.json': rulesFile([ENFORCED]) },
      },
    });
    const text = response.result.content[0].text as string;
    expect(text).not.toMatch(/differs from the project contract|candidateArkRuleFiles/);
    const payload = JSON.parse(text);
    expect(payload).toMatchObject({ classification: 'weakening', requiresAcknowledgement: true });
    expect(JSON.stringify(payload.findings)).toContain('arkrule-demoted');
  });

  it('still refuses a candidate that maps different ArkRules files without their contents', async () => {
    const response = await request('tools/call', {
      name: 'ark_policy_delta',
      arguments: {
        baseConfig: CONFIG,
        candidateConfig: { ...CONFIG, arkRules: { Domain: 'arkrules/Other.json' } },
        baseArkRuleFiles: { 'arkrules/Domain.json': rulesFile([ENFORCED]) },
      },
    });
    expect(response.result.isError).toBe(true);
    expect(response.result.content[0].text).toMatch(/candidateArkRuleFiles/);
  });
});
