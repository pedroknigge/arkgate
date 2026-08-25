import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeResolvedProject, loadContract } from '../../../src/gate';
import { loadTypeScript } from '../../../bin/lib/typescript-host.mjs';
import { resolveCandidateFacts } from '../../../bin/lib/resolved-candidate-facts.mjs';

const FIXTURES = path.resolve('tests/fixtures/arkrun-sensors');
const roots: string[] = [];

function copyCase(name: string): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `ark-rn04-${name}-`)));
  roots.push(root);
  fs.cpSync(path.join(FIXTURES, name), root, { recursive: true });
  return root;
}

function patchMode(root: string, mode: 'advisory' | 'enforced') {
  const configPath = path.join(root, 'ark.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
    arkRun?: { mode?: string };
  };
  if (!config.arkRun) throw new Error('fixture missing arkRun');
  config.arkRun.mode = mode;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

async function analyzeCase(root: string, config: unknown) {
  const loaded = await loadTypeScript(root);
  expect(loaded.ts).toBeTruthy();
  const contract = loadContract(config);
  const facts = resolveCandidateFacts({
    root,
    config: contract.config,
    ts: loaded.ts,
  });
  return { facts, result: analyzeResolvedProject({ contract, facts }) };
}

function arkRunIds(
  items: ReadonlyArray<{ ruleId?: string | null }>
): string[] {
  return items
    .map((item) => item.ruleId)
    .filter((id): id is string => typeof id === 'string' && id.startsWith('ARKRUN_'))
    .sort();
}

describe('RN04 ArkRun tier-1 sensors through resolved analysis', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it.each([
    ['missing-root', 'ARKRUN_MISSING_ROOT'],
    ['kernel-in-domain', 'ARKRUN_KERNEL_IN_DOMAIN'],
    ['direct-new', 'ARKRUN_DIRECT_NEW'],
    ['undeclared-emit', 'ARKRUN_UNDECLARED_EMIT'],
    ['undeclared-handle', 'ARKRUN_UNDECLARED_HANDLE'],
    ['undeclared-depend', 'ARKRUN_UNDECLARED_DEPEND'],
    ['transport-bypass', 'ARKRUN_TRANSPORT_BYPASS'],
  ] as const)('%s fixture emits %s; advisory does not flip valid; enforced blocks', async (name, ruleId) => {
    const enforcedRoot = copyCase(name);
    const enforcedConfig = JSON.parse(
      fs.readFileSync(path.join(enforcedRoot, 'ark.config.json'), 'utf8')
    );
    const enforced = await analyzeCase(enforcedRoot, enforcedConfig);
    expect(arkRunIds(enforced.result.ir.violations)).toEqual([ruleId]);
    expect(arkRunIds(enforced.result.ir.warnings)).toEqual([]);
    expect(enforced.result.valid).toBe(false);

    const advisoryRoot = copyCase(name);
    const advisoryConfig = patchMode(advisoryRoot, 'advisory');
    const advisory = await analyzeCase(advisoryRoot, advisoryConfig);
    expect(arkRunIds(advisory.result.ir.violations)).toEqual([]);
    expect(arkRunIds(advisory.result.ir.warnings)).toEqual([ruleId]);
    expect(advisory.result.valid).toBe(true);
  });

  it('green enforced fixture stays valid', async () => {
    const root = copyCase('green');
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    const { result } = await analyzeCase(root, config);
    expect(arkRunIds(result.ir.violations)).toEqual([]);
    expect(arkRunIds(result.ir.warnings)).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('glob compositionRoots with one factory among many files stays green', async () => {
    const root = copyCase('glob-root-with-factory');
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    const { result } = await analyzeCase(root, config);
    expect(arkRunIds(result.ir.violations)).toEqual([]);
    expect(arkRunIds(result.ir.warnings)).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('absence of arkRun leaves skip-like sources green', async () => {
    const root = copyCase('absent');
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    const { result } = await analyzeCase(root, config);
    expect(result.ir.violations.some((item) => String(item.ruleId).startsWith('ARKRUN_'))).toBe(
      false
    );
    expect(result.ir.warnings.some((item) => String(item.ruleId).startsWith('ARKRUN_'))).toBe(false);
    expect(result.valid).toBe(true);
  });
});
