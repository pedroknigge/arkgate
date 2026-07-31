import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { analyzeResolvedProject, loadContract, preflightResolvedChange } from '../../../src/gate';
import {
  analyzeResolvedProject as analyzeResolvedProjectFromBundle,
  loadContract as loadContractFromBundle,
  preflightResolvedChange as preflightResolvedChangeFromBundle,
} from '../../../bin/lib/analysis-engine.mjs';
import { loadTypeScript } from '../../../bin/lib/typescript-host.mjs';
import { resolveCandidateFacts } from '../../../bin/lib/resolved-candidate-facts.mjs';
import { prepareChangeFromRoot } from '../../../bin/lib/prepare-change.mjs';
import { noDomainInfraImports } from '../../../src/eslint/index';
import { withDistLock } from '../../helpers/distLock';
import { writeSemanticGateArtifacts } from '../../helpers/semanticGateArtifacts';

const ARK = path.resolve('bin/ark.mjs');
const ARK_CHECK = path.resolve('bin/ark-check.mjs');
const roots: string[] = [];
let runtimeRoot: string | undefined;
let MCP = path.resolve('bin/ark-mcp.mjs');

type JsonResult = Record<string, any>;
type CandidateChange = { path: string; content?: string; delete?: true };

function write(root: string, relativePath: string, content: string): void {
  const absolute = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  write(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function tempRoot(prefix: string): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  roots.push(root);
  return root;
}

function readConfig(root: string): JsonResult {
  return JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
}

function runJson(
  command: string,
  args: string[],
  cwd: string,
): { status: number; data: JsonResult } {
  const run = spawnSync(process.execPath, [command, ...args], {
    cwd,
    encoding: 'utf8',
  });
  expect(run.stdout, run.stderr).not.toBe('');
  return { status: run.status ?? 1, data: JSON.parse(run.stdout) };
}

function callMcp(root: string, name: string, args: JsonResult): JsonResult {
  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  };
  const run = spawnSync(process.execPath, [MCP, '--root', root, '--config', 'ark.config.json'], {
    cwd: root,
    encoding: 'utf8',
    input: `${JSON.stringify(request)}\n`,
  });
  const response = run.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .find((message) => message.id === 1);
  expect(response, run.stderr).toBeTruthy();
  return response.result;
}

function repairPayload(stderr: string): JsonResult {
  const line = stderr.split('\n').find((entry) => entry.startsWith('ARK_REPAIR_JSON:'));
  expect(line).toBeTruthy();
  return JSON.parse(line!.slice('ARK_REPAIR_JSON:'.length));
}

function normalizeViolations(violations: JsonResult[] = []): JsonResult[] {
  return violations.map((violation) => ({
    ruleId: violation.ruleId,
    file: violation.file,
    line: violation.line,
    target: violation.target,
    fromLayer: violation.fromLayer,
    toLayer: violation.toLayer,
    edgeKind: violation.edgeKind,
    typeOnly: violation.typeOnly,
  }));
}

function analysisVoice(result: JsonResult, violations: JsonResult[]): JsonResult {
  return {
    mode: result.mode,
    valid: result.valid,
    completeness: result.completeness,
    completenessReasons: result.completenessReasons,
    policyHash: result.policyHash,
    resolverIdentity: result.resolverIdentity,
    factsHash: result.factsHash,
    candidateTreeHash: result.candidateTreeHash,
    violations: normalizeViolations(violations),
  };
}

function preflightVoice(result: JsonResult): JsonResult {
  return {
    mode: result.mode,
    valid: result.valid,
    policyHash: result.policyHash,
    resolverIdentity: result.resolverIdentity,
    baseFactsHash: result.baseFactsHash,
    candidateFactsHash: result.candidateFactsHash,
    baseTreeHash: result.baseTreeHash,
    candidateTreeHash: result.candidateTreeHash,
    baseCompleteness: result.baseCompleteness,
    candidateCompleteness: result.candidateCompleteness,
    changes: result.changes,
    violations: normalizeViolations(result.violations),
  };
}

function adapterVoice(result: JsonResult): JsonResult {
  return {
    schemaVersion: result.schemaVersion,
    mode: result.mode,
    valid: result.valid,
    completeness: result.completeness,
    completenessReasons: result.completenessReasons,
    diagnostics: result.diagnostics,
    policyHash: result.policyHash,
    resolverIdentity: result.resolverIdentity,
    factsHash: result.factsHash,
    candidateTreeHash: result.candidateTreeHash,
  };
}

function syntaxRoot(): string {
  const root = tempRoot('ark-z04-adapter-syntax-');
  writeJson(root, 'ark.config.json', {
    schemaVersion: '1.0',
    include: ['src', 'packages'],
    layers: [
      {
        name: 'DomainModel',
        patterns: ['src/domain/**', 'packages/domain/**'],
      },
      { name: 'Kernel', patterns: ['src/kernel/**', 'packages/kernel/**'] },
    ],
    rules: [{ from: 'DomainModel', to: 'Kernel', allowed: false }],
  });
  writeJson(root, 'tsconfig.json', {
    compilerOptions: {
      module: 'ESNext',
      moduleResolution: 'Bundler',
      target: 'ES2022',
      baseUrl: '.',
      paths: { '@kernel/*': ['src/kernel/*'] },
    },
    include: ['src/**/*.ts', 'packages/**/*.ts'],
  });
  writeJson(root, 'package.json', {
    name: '@z04/adapter-corpus',
    private: true,
    workspaces: ['packages/*'],
    exports: './src/kernel/project.ts',
  });
  writeJson(root, 'packages/kernel/package.json', {
    name: '@matrix/kernel',
    private: true,
    exports: './src/index.ts',
  });
  write(root, 'packages/kernel/src/index.ts', 'export const workspace = 1;\n');
  for (const target of [
    'relative',
    'alias',
    'symlinked',
    'import-equals',
    'commonjs',
    'dynamic',
    'project',
  ]) {
    write(root, `src/kernel/${target}.ts`, `export const value = ${JSON.stringify(target)};\n`);
  }
  write(
    root,
    'src/kernel/types.ts',
    "console.log('runtime module');\nexport type Contract = { id: string };\n",
  );
  fs.mkdirSync(path.join(root, 'node_modules/@matrix'), { recursive: true });
  fs.symlinkSync(
    path.join(root, 'packages/kernel'),
    path.join(root, 'node_modules/@matrix/kernel'),
    'dir',
  );
  fs.symlinkSync(path.join(root, 'src/kernel'), path.join(root, 'src/linked-kernel'), 'dir');
  write(
    root,
    'src/domain/syntax.ts',
    [
      "import { value as relative } from '../kernel/relative';",
      "import { value as aliased } from '@kernel/alias';",
      "import { workspace } from '@matrix/kernel';",
      "import { value as project } from '@z04/adapter-corpus';",
      "import { value as symlinked } from '../linked-kernel/symlinked';",
      "import imported = require('../kernel/import-equals');",
      "const common = require('../kernel/commonjs');",
      "const dynamicValue = import('../kernel/dynamic');",
      "import type { Contract } from '../kernel/types';",
      "import missing from 'missing-package';",
      'export const values = [relative, aliased, workspace, project, symlinked, imported, common, missing];',
      'export type ValueContract = Contract;',
      'void dynamicValue;',
      '',
    ].join('\n'),
  );
  return root;
}

function endToEndRoot(): string {
  const root = tempRoot('ark-z04-adapter-e2e-');
  writeJson(root, 'ark.config.json', {
    schemaVersion: '1.0',
    include: ['src'],
    layers: [
      { name: 'DomainModel', patterns: ['src/domain/**'] },
      { name: 'Kernel', patterns: ['src/kernel/**'] },
    ],
    rules: [{ from: 'DomainModel', to: 'Kernel', allowed: false }],
  });
  write(root, 'src/domain/existing.ts', 'export const existing = 1;\n');
  write(root, 'src/domain/obsolete.ts', 'export const obsolete = true;\n');
  return root;
}

const changes: CandidateChange[] = [
  {
    path: 'src/domain/existing.ts',
    content: "import { service } from '../kernel/service';\nexport const existing = service;\n",
  },
  { path: 'src/kernel/service.ts', content: 'export const service = 1;\n' },
  { path: 'src/domain/obsolete.ts', delete: true },
];

function applyChanges(root: string, candidateChanges: CandidateChange[]): void {
  for (const change of candidateChanges) {
    const absolute = path.join(root, change.path);
    if (change.delete) fs.rmSync(absolute, { force: true });
    else write(root, change.path, change.content ?? '');
  }
}

beforeAll(() => {
  withDistLock(() => {
    execSync('npm run build', { stdio: 'ignore' });
    runtimeRoot = fs.mkdtempSync(path.join(process.cwd(), '.ark-z04-parity-runtime-'));
    fs.cpSync(path.resolve('bin'), path.join(runtimeRoot, 'bin'), {
      recursive: true,
    });
    fs.cpSync(path.resolve('dist'), path.join(runtimeRoot, 'dist'), {
      recursive: true,
    });
  });
  MCP = path.join(runtimeRoot!, 'bin/ark-mcp.mjs');
}, 120_000);

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

afterAll(() => {
  if (runtimeRoot) fs.rmSync(runtimeRoot, { recursive: true, force: true });
});

describe('Z04 resolved adapter differential corpus', () => {
  it('names and normalizes relative, paths/baseUrl, workspace/project packages, symlink, import = require, CommonJS require, dynamic literal, type-only, and unresolved evidence', async () => {
    const root = syntaxRoot();
    const config = readConfig(root);
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    const facts = resolveCandidateFacts({
      root,
      config,
      ts: loaded.ts,
      tsconfig: 'tsconfig.json',
    });

    const cells = [
      {
        name: 'relative',
        specifier: '../kernel/relative',
        eslintEligible: true,
        expected: {
          kind: 'import',
          resolution: 'resolved-project',
          target: 'src/kernel/relative.ts',
        },
      },
      {
        name: 'paths/baseUrl',
        specifier: '@kernel/alias',
        eslintEligible: false,
        expected: {
          kind: 'import',
          resolution: 'resolved-project',
          target: 'src/kernel/alias.ts',
        },
      },
      {
        name: 'workspace package',
        specifier: '@matrix/kernel',
        eslintEligible: false,
        expected: {
          kind: 'import',
          resolution: 'resolved-project',
          target: 'packages/kernel/src/index.ts',
        },
      },
      {
        name: 'project package',
        specifier: '@z04/adapter-corpus',
        eslintEligible: false,
        expected: {
          kind: 'import',
          resolution: 'resolved-project',
          target: 'src/kernel/project.ts',
        },
      },
      {
        name: 'symlink',
        specifier: '../linked-kernel/symlinked',
        eslintEligible: false,
        expected: {
          kind: 'import',
          resolution: 'resolved-project',
          target: 'src/kernel/symlinked.ts',
        },
      },
      {
        name: 'import = require',
        specifier: '../kernel/import-equals',
        eslintEligible: false,
        expected: {
          kind: 'require',
          resolution: 'resolved-project',
          target: 'src/kernel/import-equals.ts',
        },
      },
      {
        name: 'CommonJS require',
        specifier: '../kernel/commonjs',
        eslintEligible: false,
        expected: {
          kind: 'require',
          resolution: 'resolved-project',
          target: 'src/kernel/commonjs.ts',
        },
      },
      {
        name: 'dynamic literal',
        specifier: '../kernel/dynamic',
        eslintEligible: false,
        expected: {
          kind: 'dynamic-import',
          resolution: 'resolved-project',
          target: 'src/kernel/dynamic.ts',
        },
      },
      {
        name: 'type-only',
        specifier: '../kernel/types',
        eslintEligible: true,
        expected: {
          kind: 'import',
          typeOnly: true,
          resolution: 'resolved-project',
          target: 'src/kernel/types.ts',
        },
      },
      {
        name: 'unresolved evidence',
        specifier: 'missing-package',
        eslintEligible: false,
        expected: { kind: 'import', resolution: 'unresolved' },
      },
    ] as const;

    expect(facts).toMatchObject({
      completeness: 'complete',
      completenessReasons: [],
    });
    for (const cell of cells) {
      const dependency = facts.dependencies.find(({ specifier }) => specifier === cell.specifier);
      expect(dependency, cell.name).toMatchObject({
        from: 'src/domain/syntax.ts',
        specifier: cell.specifier,
        ...cell.expected,
      });
    }

    const kernel = analyzeResolvedProject({
      contract: loadContract(config),
      facts,
    });
    const bundle = analyzeResolvedProjectFromBundle({
      contract: loadContractFromBundle(config),
      facts,
    });
    expect(bundle).toEqual(kernel);
    expect(kernel.mode).toBe('resolved-candidate-facts');
    expect(kernel.ir.violations.length).toBeGreaterThan(0);

    const cliRun = runJson(
      ARK_CHECK,
      [
        '--root',
        root,
        '--config',
        'ark.config.json',
        '--tsconfig',
        'tsconfig.json',
        '--json',
        '--strict-config',
      ],
      root,
    );
    expect(cliRun.status).toBe(1);
    expect(analysisVoice(cliRun.data, cliRun.data.violations)).toEqual(
      analysisVoice(kernel, kernel.ir.violations),
    );
    const mcpRun = callMcp(root, 'ark_check', { strict: true, baseline: false });
    const mcpBody = JSON.parse(mcpRun.content[0].text);
    expect(mcpRun.isError).toBe(true);
    expect(analysisVoice(mcpBody, mcpBody.violations)).toEqual(
      analysisVoice(kernel, kernel.ir.violations),
    );
    expect(adapterVoice(mcpRun.structuredContent)).toEqual(adapterVoice(cliRun.data));

    // Only ordinary static relative import/export syntax is in the ESLint layer envelope.
    // Alias/package/symlink/CJS/import-equals/dynamic/unresolved rows remain resolved-only.
    expect(cells.filter(({ eslintEligible }) => eslintEligible).map(({ name }) => name)).toEqual([
      'relative',
      'type-only',
    ]);
    const reports: JsonResult[] = [];
    const listener = noDomainInfraImports.create({
      getFilename: () => path.join(root, 'src/domain/syntax.ts'),
      options: [],
      report: (descriptor: JsonResult) => reports.push(descriptor),
    });
    listener.ImportDeclaration({
      type: 'ImportDeclaration',
      source: { value: '../kernel/relative' },
      loc: { start: { line: 1 } },
    });
    listener.ImportDeclaration({
      type: 'ImportDeclaration',
      source: { value: '../kernel/types' },
      importKind: 'type',
      loc: { start: { line: 9 } },
    });
    expect(reports.map(({ diagnostic }) => diagnostic)).toEqual([
      cliRun.data.diagnostics.find(
        ({ evidence }: JsonResult) => evidence.target === 'src/kernel/relative.ts',
      ),
      cliRun.data.diagnostics.find(
        ({ evidence }: JsonResult) => evidence.target === 'src/kernel/types.ts',
      ),
    ]);
  });

  it('fails closed on parse failure in both the resolved API and generated bundle', async () => {
    const root = syntaxRoot();
    const config = readConfig(root);
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    const facts = resolveCandidateFacts({
      root,
      config,
      ts: loaded.ts,
      tsconfig: 'tsconfig.json',
      changes: [{ path: 'src/domain/syntax.ts', content: 'export const = ;\n' }],
    });
    const kernel = analyzeResolvedProject({
      contract: loadContract(config),
      facts,
    });
    const bundle = analyzeResolvedProjectFromBundle({
      contract: loadContractFromBundle(config),
      facts,
    });

    expect(facts).toMatchObject({
      completeness: 'partial',
      completenessReasons: [
        expect.objectContaining({
          code: 'PARSE_FAILURE',
          file: 'src/domain/syntax.ts',
        }),
      ],
    });
    expect(bundle).toEqual(kernel);
    expect(kernel).toMatchObject({
      mode: 'resolved-candidate-facts',
      valid: false,
      strictValid: false,
      completeness: 'partial',
    });

    write(root, 'src/domain/syntax.ts', 'export const = ;\n');
    writeSemanticGateArtifacts(root);
    const cliRun = runJson(
      ARK_CHECK,
      [
        '--root',
        root,
        '--config',
        'ark.config.json',
        '--tsconfig',
        'tsconfig.json',
        '--json',
        '--strict-config',
        '--strict-merge',
      ],
      root,
    );
    expect(cliRun.status).toBe(1);
    expect(analysisVoice(cliRun.data, cliRun.data.violations)).toEqual(
      analysisVoice(kernel, kernel.ir.violations),
    );
    const mcpRun = callMcp(root, 'ark_check', { strict: true, baseline: false });
    const mcpBody = JSON.parse(mcpRun.content[0].text);
    expect(mcpRun.isError).toBe(true);
    expect(analysisVoice(mcpBody, mcpBody.violations)).toEqual(
      analysisVoice(kernel, kernel.ir.violations),
    );
    expect(adapterVoice(mcpRun.structuredContent)).toEqual(adapterVoice(cliRun.data));
  });

  it('keeps exclusions out of analyzed facts and makes unclassified fail only the strict profile', async () => {
    const root = tempRoot('ark-z04-adapter-scope-');
    writeJson(root, 'ark.config.json', {
      schemaVersion: '1.0',
      include: ['src'],
      exclude: ['src/excluded/**'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    });
    write(root, 'src/domain/ok.ts', 'export const ok = true;\n');
    write(root, 'src/excluded/ignored.ts', 'export const ignored = true;\n');
    write(root, 'src/unclassified.ts', 'export const loose = true;\n');
    const config = readConfig(root);
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    const facts = resolveCandidateFacts({ root, config, ts: loaded.ts });
    const kernel = analyzeResolvedProject({
      contract: loadContract(config),
      facts,
    });
    const bundle = analyzeResolvedProjectFromBundle({
      contract: loadContractFromBundle(config),
      facts,
    });

    expect(facts.files.map(({ path: file }) => file)).toEqual([
      'src/domain/ok.ts',
      'src/unclassified.ts',
    ]);
    expect(bundle).toEqual(kernel);
    expect(kernel).toMatchObject({ valid: true, strictValid: false });
    expect(kernel.ir.warnings).toEqual([
      expect.objectContaining({
        ruleId: 'CONFIG_UNCLASSIFIED_FILES',
        samples: ['src/unclassified.ts'],
      }),
    ]);

    const cliRun = runJson(
      ARK_CHECK,
      ['--root', root, '--config', 'ark.config.json', '--json', '--strict-config'],
      root,
    );
    expect(cliRun.status).toBe(1);
    expect(cliRun.data.ok).toBe(false);
    expect(analysisVoice(cliRun.data, cliRun.data.violations)).toEqual(
      analysisVoice({ ...kernel, valid: kernel.strictValid }, kernel.ir.violations),
    );
    const mcpRun = callMcp(root, 'ark_check', { strict: true, baseline: false });
    const mcpBody = JSON.parse(mcpRun.content[0].text);
    expect(mcpRun.isError).toBe(true);
    expect(analysisVoice(mcpBody, mcpBody.violations)).toEqual(
      analysisVoice({ ...kernel, valid: kernel.strictValid }, kernel.ir.violations),
    );
    expect(adapterVoice(mcpRun.structuredContent)).toEqual(adapterVoice(cliRun.data));
  });

  it('makes create/update/delete agree across API, bundle, preflight, CLI, MCP, complete ApplyPatch hook, final strict, and the eligible ESLint relative edge', async () => {
    const root = endToEndRoot();
    const config = readConfig(root);
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    const baseFacts = resolveCandidateFacts({ root, config, ts: loaded.ts });
    const candidateFacts = resolveCandidateFacts({
      root,
      config,
      ts: loaded.ts,
      changes,
    });
    const kernelContract = loadContract(config);
    const bundleContract = loadContractFromBundle(config);
    const kernelAnalysis = analyzeResolvedProject({
      contract: kernelContract,
      facts: candidateFacts,
    });
    const bundleAnalysis = analyzeResolvedProjectFromBundle({
      contract: bundleContract,
      facts: candidateFacts,
    });
    expect(bundleAnalysis).toEqual(kernelAnalysis);

    const kernelPreflight = preflightResolvedChange({
      contract: kernelContract,
      baseFacts,
      candidateFacts,
      changes,
    });
    const bundlePreflight = preflightResolvedChangeFromBundle({
      contract: bundleContract,
      baseFacts,
      candidateFacts,
      changes,
    });
    expect(bundlePreflight).toEqual(kernelPreflight);
    expect(kernelPreflight.changes).toEqual([
      expect.objectContaining({
        path: 'src/domain/existing.ts',
        operation: 'update',
      }),
      expect.objectContaining({
        path: 'src/domain/obsolete.ts',
        operation: 'delete',
      }),
      expect.objectContaining({
        path: 'src/kernel/service.ts',
        operation: 'create',
      }),
    ]);

    const toolingPreflight = prepareChangeFromRoot({
      root,
      config,
      configSource: path.join(root, 'ark.config.json'),
      changes,
      ts: loaded.ts,
    });
    writeJson(root, 'changes.json', { changes });
    const cliPreflightRun = runJson(
      ARK,
      ['preflight', '--root', root, '--changes', 'changes.json', '--json'],
      root,
    );
    expect(cliPreflightRun.status).toBe(1);
    const mcpPreflight = callMcp(root, 'ark_prepare_change', { changes });
    const mcpPreflightBody = JSON.parse(mcpPreflight.content[0].text);
    expect(mcpPreflight.isError).toBe(true);

    const patch = [
      '*** Begin Patch',
      '*** Update File: src/domain/existing.ts',
      '@@',
      '-export const existing = 1;',
      "+import { service } from '../kernel/service';",
      '+export const existing = service;',
      '*** Add File: src/kernel/service.ts',
      '+export const service = 1;',
      '*** Delete File: src/domain/obsolete.ts',
      '*** End Patch',
    ].join('\n');
    const hookRun = spawnSync(
      process.execPath,
      [
        MCP,
        '--hook',
        '--hook-repair',
        '--root',
        root,
        '--config',
        path.join(root, 'ark.config.json'),
      ],
      {
        cwd: root,
        encoding: 'utf8',
        input: JSON.stringify({
          tool_name: 'ApplyPatch',
          tool_input: { patch },
        }),
      },
    );
    expect(hookRun.status, hookRun.stderr).toBe(2);
    const hookPreflight = repairPayload(hookRun.stderr);

    const expectedPreflight = preflightVoice(kernelPreflight);
    for (const surface of [
      toolingPreflight,
      cliPreflightRun.data,
      mcpPreflightBody,
      hookPreflight,
    ]) {
      expect(preflightVoice(surface)).toEqual(expectedPreflight);
    }
    expect(hookPreflight.diagnostics).toEqual(cliPreflightRun.data.diagnostics);
    expect(mcpPreflightBody.diagnostics).toEqual(cliPreflightRun.data.diagnostics);
    expect(fs.readFileSync(path.join(root, 'src/domain/existing.ts'), 'utf8')).toBe(
      'export const existing = 1;\n',
    );
    expect(fs.existsSync(path.join(root, 'src/kernel/service.ts'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'src/domain/obsolete.ts'))).toBe(true);

    const applied = tempRoot('ark-z04-adapter-final-');
    fs.cpSync(root, applied, { recursive: true });
    applyChanges(applied, changes);
    const finalRun = runJson(
      ARK_CHECK,
      ['--root', applied, '--config', 'ark.config.json', '--json', '--strict-config'],
      applied,
    );
    expect(finalRun.status).toBe(1);
    const mcpFinal = callMcp(applied, 'ark_check', {
      strict: true,
      baseline: false,
    });
    const mcpFinalBody = JSON.parse(mcpFinal.content[0].text);
    expect(mcpFinal.isError).toBe(true);

    const expectedAnalysis = analysisVoice(kernelAnalysis, kernelAnalysis.ir.violations);
    expect(analysisVoice(finalRun.data, finalRun.data.violations)).toEqual(expectedAnalysis);
    expect(analysisVoice(mcpFinalBody, mcpFinalBody.violations)).toEqual(expectedAnalysis);
    expect(kernelPreflight.candidateFactsHash).toBe(finalRun.data.factsHash);
    expect(kernelPreflight.candidateTreeHash).toBe(finalRun.data.candidateTreeHash);
    expect(adapterVoice(mcpFinal.structuredContent)).toEqual(adapterVoice(finalRun.data));
    expect(finalRun.data.diagnostics).toEqual(cliPreflightRun.data.diagnostics);

    const reports: JsonResult[] = [];
    const listener = noDomainInfraImports.create({
      getFilename: () => path.join(applied, 'src/domain/existing.ts'),
      options: [],
      report: (descriptor: JsonResult) => reports.push(descriptor),
    });
    listener.ImportDeclaration({
      type: 'ImportDeclaration',
      source: { value: '../kernel/service' },
      loc: { start: { line: 1 } },
    });
    expect(reports).toHaveLength(1);
    expect(reports[0].diagnostic).toEqual(finalRun.data.diagnostics[0]);
  });
});
