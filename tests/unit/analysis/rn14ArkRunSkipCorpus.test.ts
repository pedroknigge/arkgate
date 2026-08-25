/**
 * RN14 skip corpus: extra absent = green; enforced extra fails unmanaged
 * `new`, peer import, and homemade bus on analysis, write path, CLI, and CI.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeResolvedProject, loadContract } from '../../../src/gate';
import { loadTypeScript } from '../../../bin/lib/typescript-host.mjs';
import { prepareChangeFromRoot } from '../../../bin/lib/prepare-change.mjs';
import { resolveCandidateFacts } from '../../../bin/lib/resolved-candidate-facts.mjs';
import { writeSemanticGateArtifacts } from '../../helpers/semanticGateArtifacts';

const CORPUS = path.resolve('tests/fixtures/arkrun-skip-corpus');
const CHECK = path.resolve('bin/ark-check.mjs');
const MCP = path.resolve('bin/ark-mcp.mjs');
const TECHNIQUES = ['unmanaged-new', 'peer-import', 'homemade-bus'] as const;
const roots: string[] = [];

type CorpusCase = {
  id: string;
  tree: string;
  kind: 'positive';
  techniques: string[];
  expectedRuleIds: string[];
  writePathFile: string;
  evidence: {
    newOf?: string;
    peerImport?: string;
    importedFrom?: string;
    busSpecifier?: string;
  };
};

type CorpusManifest = {
  version: number;
  item: string;
  adr: string;
  skipTechniques: string[];
  contracts: Record<string, string>;
  cases: CorpusCase[];
};

type ExtraMode = 'absent' | 'advisory' | 'enforced' | '1.1';

function manifest(): CorpusManifest {
  return JSON.parse(fs.readFileSync(path.join(CORPUS, 'manifest.v1.json'), 'utf8')) as CorpusManifest;
}

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(CORPUS, relativePath), 'utf8')) as Record<string, unknown>;
}

function configFor(mode: ExtraMode): Record<string, unknown> {
  const contracts = manifest().contracts;
  if (mode === '1.1') return readJson(contracts.layers11);
  const layers = readJson(contracts.layers);
  if (mode === 'absent') return layers;
  return { ...layers, ...readJson(mode === 'enforced' ? contracts.enforced : contracts.advisory) };
}

function copyTree(tree: string): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `ark-rn14-${path.basename(tree)}-`)));
  roots.push(root);
  fs.cpSync(path.join(CORPUS, tree), root, { recursive: true });
  return root;
}

function writeConfig(root: string, mode: ExtraMode): Record<string, unknown> {
  const config = configFor(mode);
  fs.writeFileSync(path.join(root, 'ark.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

function arkRunIds(items: ReadonlyArray<{ ruleId?: string | null }> = []): string[] {
  return [
    ...new Set(
      items
        .map((item) => item.ruleId)
        .filter((id): id is string => typeof id === 'string' && id.startsWith('ARKRUN_'))
    ),
  ].sort();
}

function layerVoice(items: ReadonlyArray<{ ruleId?: string | null }> = []): string[] {
  return items
    .map((item) => item.ruleId)
    .filter((id): id is string => typeof id === 'string' && !id.startsWith('ARKRUN_'))
    .sort();
}

async function analyzeRoot(root: string, config: unknown) {
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

describe('RN14 ArkRun skip corpus', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('declares the three skip techniques and a complete case tree', () => {
    const doc = manifest();
    expect(doc.version).toBe(1);
    expect(doc.item).toBe('RN14');
    expect(doc.adr).toBe('docs/adr/0022-arkrun-anti-skip-facts.md');
    expect(doc.skipTechniques).toEqual([...TECHNIQUES]);
    expect(Object.keys(doc.contracts).sort()).toEqual(['advisory', 'enforced', 'layers', 'layers11']);
    for (const relative of Object.values(doc.contracts)) {
      expect(fs.existsSync(path.join(CORPUS, relative)), relative).toBe(true);
    }
    const layers = readJson(doc.contracts.layers);
    expect(layers).not.toHaveProperty('arkRun');
    expect(layers.schemaVersion).toBe('1.2');
    expect(readJson(doc.contracts.layers11).schemaVersion).toBe('1.1');
    expect(readJson(doc.contracts.layers11)).not.toHaveProperty('arkRun');

    const ids = doc.cases.map((entry) => entry.id).sort();
    expect(ids).toEqual(['combined', 'homemade-bus', 'peer-import', 'unmanaged-new']);
    for (const technique of TECHNIQUES) {
      expect(
        doc.cases.some((entry) => entry.techniques.includes(technique)),
        technique
      ).toBe(true);
    }
    for (const entry of doc.cases) {
      expect(fs.existsSync(path.join(CORPUS, entry.tree, 'src/main.ts')), entry.id).toBe(true);
      expect(fs.existsSync(path.join(CORPUS, entry.tree, entry.writePathFile)), entry.id).toBe(true);
      const source = fs.readFileSync(path.join(CORPUS, entry.tree, entry.writePathFile), 'utf8');
      const main = fs.readFileSync(path.join(CORPUS, entry.tree, 'src/main.ts'), 'utf8');
      expect(main).toMatch(/createStrictArkKernel/);
      if (entry.evidence.newOf) {
        expect(source).toContain(`new ${entry.evidence.newOf}(`);
      }
      if (entry.evidence.peerImport) {
        expect(source).toContain(`from '${entry.evidence.peerImport}'`);
      }
      if (entry.evidence.importedFrom) {
        expect(source).toContain(`from '${entry.evidence.importedFrom}'`);
      }
      if (entry.evidence.busSpecifier) {
        expect(source).toContain(`from '${entry.evidence.busSpecifier}'`);
      }
    }
  });

  it.each(manifest().cases.map((entry) => [entry.id, entry] as const))(
    '%s: extra absent stays green; enforced fails the labeled skip',
    async (_id, entry) => {
      const absentRoot = copyTree(entry.tree);
      const absentConfig = writeConfig(absentRoot, 'absent');
      const absent = await analyzeRoot(absentRoot, absentConfig);
      expect(arkRunIds(absent.result.ir.violations)).toEqual([]);
      expect(arkRunIds(absent.result.ir.warnings)).toEqual([]);
      expect(absent.result.valid).toBe(true);

      const enforcedRoot = copyTree(entry.tree);
      const enforcedConfig = writeConfig(enforcedRoot, 'enforced');
      const enforced = await analyzeRoot(enforcedRoot, enforcedConfig);
      expect(arkRunIds(enforced.result.ir.violations)).toEqual([...entry.expectedRuleIds].sort());
      expect(arkRunIds(enforced.result.ir.warnings)).toEqual([]);
      expect(enforced.result.valid).toBe(false);

      const advisoryRoot = copyTree(entry.tree);
      const advisoryConfig = writeConfig(advisoryRoot, 'advisory');
      const advisory = await analyzeRoot(advisoryRoot, advisoryConfig);
      expect(arkRunIds(advisory.result.ir.violations)).toEqual([]);
      expect(arkRunIds(advisory.result.ir.warnings)).toEqual([...entry.expectedRuleIds].sort());
      expect(advisory.result.valid).toBe(true);
    }
  );

  it('schema 1.1 and 1.2 without arkRun share Layers/ArkRules verdicts on skip sources', async () => {
    const combined = manifest().cases.find((entry) => entry.id === 'combined');
    expect(combined).toBeTruthy();
    const v11Root = copyTree(combined!.tree);
    const v12Root = copyTree(combined!.tree);
    const v11 = await analyzeRoot(v11Root, writeConfig(v11Root, '1.1'));
    const v12 = await analyzeRoot(v12Root, writeConfig(v12Root, 'absent'));
    expect(v11.result.valid).toBe(true);
    expect(v12.result.valid).toBe(true);
    expect(arkRunIds(v11.result.ir.violations)).toEqual([]);
    expect(arkRunIds(v12.result.ir.violations)).toEqual([]);
    expect(layerVoice(v11.result.ir.violations)).toEqual(layerVoice(v12.result.ir.violations));
    expect(layerVoice(v11.result.ir.warnings)).toEqual(layerVoice(v12.result.ir.warnings));
  });

  it('combined enforced skip fails write path, CLI, MCP, and --strict-merge', async () => {
    const combined = manifest().cases.find((entry) => entry.id === 'combined');
    expect(combined).toBeTruthy();
    const expected = [...combined!.expectedRuleIds].sort();
    const root = copyTree(combined!.tree);
    writeConfig(root, 'enforced');
    writeSemanticGateArtifacts(root);

    const cli = runCheck(root);
    expect(cli.data.ok).toBe(false);
    expect(cli.data.valid).toBe(false);
    expect(arkRunIds(cli.data.violations)).toEqual(expected);

    const strict = runCheck(root, ['--strict-merge']);
    expect(strict.status).toBe(1);
    expect(strict.data.ok).toBe(false);
    expect(arkRunIds(strict.data.violations)).toEqual(expected);

    const preflight = await preflightFile(root, combined!.writePathFile);
    expect(preflight.valid).toBe(false);
    expect(arkRunIds(preflight.violations)).toEqual(expected);

    const mcp = runMcpCheck(root);
    expect(mcp?.isError).toBe(true);
    expect(mcp?.structuredContent?.valid).toBe(false);
    expect(arkRunIds(mcp?.structuredContent?.diagnostics ?? [])).toEqual(expected);

    const source = fs.readFileSync(path.join(root, combined!.writePathFile), 'utf8');
    const write = runHookWrite(root, 'src/application/skipped-write.ts', source);
    expect(write.status).toBe(2);
    expect(write.stderr).toMatch(/ARKRUN_DIRECT_NEW/);
    expect(write.stderr).toMatch(/ARKRUN_TRANSPORT_BYPASS/);
  });

  it('combined extra-absent skip stays green across CLI, preflight, hook, and --strict-merge', async () => {
    const combined = manifest().cases.find((entry) => entry.id === 'combined');
    expect(combined).toBeTruthy();
    const root = copyTree(combined!.tree);
    writeConfig(root, 'absent');
    writeSemanticGateArtifacts(root);

    const cli = runCheck(root, ['--strict-merge']);
    expect(cli.status).toBe(0);
    expect(cli.data.ok).toBe(true);
    expect(arkRunIds(cli.data.violations)).toEqual([]);

    const preflight = await preflightFile(root, combined!.writePathFile);
    expect(preflight.valid).toBe(true);
    expect(arkRunIds(preflight.violations)).toEqual([]);

    const source = fs.readFileSync(path.join(root, combined!.writePathFile), 'utf8');
    const write = runHookWrite(root, 'src/application/skipped-write.ts', source);
    expect(write.status).toBe(0);
    expect(write.stderr).not.toMatch(/ARKRUN_/);
  });
});
