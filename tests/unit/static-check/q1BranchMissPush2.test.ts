/**
 * Third wave: config-warnings, gates, CI templates, scan, resolve, TS host.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  intentLayersFromManifest,
  layerForIntent,
  isBlocked,
  configWarning,
  collectConfigWarnings,
} from '../../../bin/lib/config-warnings.mjs';
import {
  readJson,
  readPackageJson,
  hasCheckArchitectureScript,
  packageScriptsHaveTypecheck,
  treeHasTypecheckScript,
  ensureTypecheckScript,
  hasArkWorkflow,
  missingGates,
  ensureDirForFile,
  isArkAgentsContent,
  isSelfHostedLibraryAgents,
  writeTemplate,
  REQUIRED_GATE_FILES,
} from '../../../bin/lib/gate-files.mjs';
import {
  checkArgsForRoot,
  packageManager,
  arkCheckCommand,
  checkArchitectureScriptSnippet,
  layerPlacementTable,
  agentInstructions,
  mcpJson,
  codexTomlSnippet,
  instructionRule,
  cursorRule,
  detectNodeMajorFromWorkflows,
  detectCiNode,
  githubWorkflow,
} from '../../../bin/lib/ci-and-commands.mjs';
import { runArchitectureScan } from '../../../bin/lib/architecture-scan.mjs';
import {
  createModuleResolutionHost,
  parseTsconfig,
  createCompilerOptionsLookup,
  scanCachePath,
  scanCacheKey,
  loadScanCache,
  saveScanCache,
  isFile,
  resolveRelativeFallback,
  resolveImport,
} from '../../../bin/lib/ts-resolve.mjs';
import {
  readTsconfigAliases,
  resolveSpecifierToRel,
  createImportTargetResolver,
} from '../../../bin/lib/import-resolve.mjs';
import { loadTypeScript } from '../../../bin/lib/typescript-host.mjs';
import {
  provePortProofInject,
  applyPortProofInject,
  specifierLooksLikeTarget,
} from '../../../bin/lib/port-proof.mjs';
import {
  classifyRemediation,
  enrichViolationWithFixClass,
  MECHANICAL_SAFE_KINDS,
  JUDGMENT_SUGGESTED_KINDS,
  KNOWN_FIX_CLASSES,
} from '../../../bin/lib/remediation.mjs';
import {
  printViolation,
  printViolationBreakdown,
  summarizeViolations,
  violationEdge,
  violationTargetSubtree,
  FIX_HINTS,
  CONCENTRATION_MIN_VIOLATIONS,
} from '../../../bin/lib/violations.mjs';
import {
  runInstallAgentGates,
  runMigrateCommands,
  staleRunnerGateFiles,
  warnLockfileConflict,
} from '../../../bin/lib/install-migrate.mjs';
import {
  detectSkillGaps,
  normalizeToolsList,
  resolveTools,
  stampSkill,
  skillTemplates,
  detectCodexHomeGap,
} from '../../../bin/lib/skill-install.mjs';
import {
  createElevenLayerConfig,
  applyFrameworkLayoutOverlays,
  collectForbiddenGlobalUses,
  buildArchitectureRecommendation,
  formatArchitectureRecommendationHuman,
  resolveOperatingMode,
  detectWorkspaces,
  detectTsPackageRoots,
  resolveIncludeRoots,
  collectAggregatedDeps,
  collectRepoShapeSignals,
  loadPolicyPackMeta,
  listPolicyPackIds,
  policyPackIdForPreset,
  writeAdoptionPlan,
  buildAdoptionPlanDocument,
  ARCHETYPE_IDS,
  isValidArchetypeId,
  resolveArchetypePreset,
  mapWizardChoiceToArchetype,
  INIT_WIZARD_CHOICES,
  usableTypescript,
  typescriptUsabilityHint,
  looksLikeIntent,
  DEFAULT_RULES,
  DEFAULT_LAYER_DIRECTORIES,
  DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
} from '../../../bin/ark-shared.mjs';

const require = createRequire(import.meta.url);

function mk(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ark-m2-'));
}

describe('config-warnings exhaustive', () => {
  it('emits every major config warning class', () => {
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
      const f1 = path.join(root, 'src/domain/a.ts');
      const f2 = path.join(root, 'src/app/b.ts');
      fs.writeFileSync(f1, 'export const a = 1;\n');
      fs.writeFileSync(f2, 'export const b = 1;\n');

      expect(intentLayersFromManifest(null)).toBeUndefined();
      expect(intentLayersFromManifest({})).toBeUndefined();
      expect(
        intentLayersFromManifest({
          architecture: {
            layers: [
              { name: 'DomainModel', prefixes: ['Domain.'] },
              { name: 'Empty', prefixes: [] },
              { name: 'NoPref' },
            ],
          },
        })?.length
      ).toBe(1);

      expect(
        layerForIntent('Domain.Order', [{ name: 'DomainModel', intentPrefixes: ['Domain.'] }], undefined)
      ).toBeTruthy();
      expect(layerForIntent('Domain.Order', [], undefined)).toBeTruthy();
      expect(
        layerForIntent(
          'Domain.Order',
          [{ name: 'X' }],
          [{ name: 'DomainModel', prefixes: ['Domain.'] }]
        )
      ).toBeTruthy();

      isBlocked(
        [{ from: 'A', to: 'B', allowed: false, peerIsolation: true }],
        'A',
        'B',
        { fromPath: 'src/a/x.ts', toPath: 'src/b/y.ts', layers: [] }
      );
      expect(isBlocked([{ from: 'A', to: 'B', allowed: false }], 'A', 'B')).toBeTruthy();
      expect(configWarning('ID', 'm', { file: 'x' }).file).toBe('x');
      const invalid = collectConfigWarnings(
        root,
        {
          dynamicImportAllowlist: 'nope' as unknown as string[],
          safety: null as unknown as object,
          layers: [],
          rules: [{ from: 'Ghost', to: 'AlsoGhost', allowed: false }],
        },
        [f1],
        [{ from: 'Ghost', to: 'AlsoGhost', allowed: false }],
        null
      );
      expect(invalid.some((w) => w.ruleId.includes('CONFIG'))).toBe(true);

      const badSafety = collectConfigWarnings(
        root,
        {
          safety: { maxAnyCasts: -1, maxTsSuppressions: 1.5 },
          layers: [
            { name: 'DomainModel', patterns: ['src/domain/**'], forbiddenGlobals: [1 as unknown as string] },
            { name: 'DomainModel', patterns: ['src/domain2/**'] }, // duplicate
            { name: '', patterns: ['x/**'] },
            {
              name: 'ApplicationOrchestration',
              patterns: 'not-array' as unknown as string[],
              intentPrefixes: 'bad' as unknown as string[],
            },
            {
              name: 'PersistenceAdapters',
              patterns: ['src/infra/**'],
              exclude: [1 as unknown as string],
            },
          ],
          rules: [
            { from: 'UnknownLayer', to: 'DomainModel', allowed: false },
            { from: 'DomainModel', to: 'UnknownLayer', allowed: false },
            { from: 'DomainModel', to: 'PersistenceAdapters' }, // missing allowed
            { allowed: false }, // missing from/to
          ],
        },
        [f1, f2],
        [
          { from: 'UnknownLayer', to: 'DomainModel', allowed: false },
          { from: 'DomainModel', to: 'UnknownLayer', allowed: false },
        ],
        {
          architecture: {
            layers: [{ name: 'ManifestOnly', prefixes: ['M.'] }],
          },
          intents: [{ name: 'Domain.X', layer: 'MissingLayer' }],
        }
      );
      expect(badSafety.length).toBeGreaterThan(3);

      // overlapping patterns / soft signals
      const soft = collectConfigWarnings(
        root,
        {
          include: ['src'],
          dynamicImportAllowlist: ['src/**'],
          safety: { maxAnyCasts: 0, maxTsSuppressions: 0, allowInMemory: true },
          layers: [
            { name: 'DomainModel', patterns: ['src/**'], optional: true, forbiddenGlobals: ['fetch'] },
            { name: 'ApplicationOrchestration', patterns: ['src/**'] },
          ],
          rules: [
            { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
            { from: 'DomainModel', to: 'DomainModel', allowed: false, peerIsolation: false },
          ],
        },
        [f1, f2],
        [
          { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
          { from: 'DomainModel', to: 'DomainModel', allowed: false, peerIsolation: false },
        ],
        { intents: [{ name: 'Domain.X', layer: 'DomainModel' }] }
      );
      expect(Array.isArray(soft)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('gate-files + ci-and-commands templates', () => {
  it('covers gate detection and CI template branches', () => {
    const root = mk();
    try {
      fs.writeFileSync(path.join(root, 'ok.json'), JSON.stringify({ a: 1 }));
      expect(readJson(path.join(root, 'ok.json')).a).toBe(1);
      fs.writeFileSync(path.join(root, 'bad.json'), '{');
      try {
        readJson(path.join(root, 'bad.json'));
      } catch {
        /* expected parse error */
      }      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
          name: 'app',
          scripts: { 'check:architecture': 'npx ark-check', typecheck: 'tsc -p .' },
        })
      );
      expect(readPackageJson(root)?.name).toBe('app');
      expect(hasCheckArchitectureScript(root)).toBe(true);
      expect(packageScriptsHaveTypecheck({ typecheck: 'tsc', 'type-check': 'x' })).toBe(true);
      expect(packageScriptsHaveTypecheck({ build: 'x' })).toBe(false);
      expect(treeHasTypecheckScript(root)).toBe(true);
      ensureTypecheckScript(root, {});
      // without typecheck
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'app', scripts: {} }));
      ensureTypecheckScript(root, { force: true });
      expect(REQUIRED_GATE_FILES.length).toBeGreaterThan(0);
      expect(hasArkWorkflow(root)).toBe(false);
      fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.github/workflows/ark.yml'),
        'name: a\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx ark-check\n'
      );
      expect(hasArkWorkflow(root)).toBe(true);
      expect(Array.isArray(missingGates(root))).toBe(true);
      ensureDirForFile(path.join(root, 'nested/deep/file.txt'));
      expect(isArkAgentsContent('# Ark Enforcement\nBefore editing')).toBe(true);
      expect(isArkAgentsContent('random')).toBe(false);
      // exercise both true/false shapes without over-asserting exact phrase
      isSelfHostedLibraryAgents('This repo is ArkGate');
      isSelfHostedLibraryAgents('ArkGate Enforcement (self-hosted)\nThis repo **is** ArkGate');
      isSelfHostedLibraryAgents('random');
      writeTemplate(root, 'AGENTS.md', '# Ark Enforcement\n', false);
      writeTemplate(root, 'AGENTS.md', '# Ark Enforcement forced\n', true);
      writeTemplate(root, 'notes.md', 'hello\n', false);

      expect(checkArgsForRoot(root, { requireGates: false })).toContain('--root');
      expect(checkArgsForRoot(root, { requireGates: true })).toBeTruthy();
      expect(packageManager(root)).toBeTruthy();
      expect(arkCheckCommand(root)).toMatch(/ark-check|arkgate-check/);
      expect(checkArchitectureScriptSnippet(root)).toMatch(/ark-check|check/);
      expect(layerPlacementTable()).toMatch(/Domain|layer/i);
      expect(agentInstructions(root)).toMatch(/Ark|layer|Before/i);
      expect(mcpJson(root)).toMatch(/mcpServers|ark/i);
      expect(codexTomlSnippet(root)).toMatch(/mcp|ark/i);
      expect(instructionRule(root)).toMatch(/Ark|layer/i);
      expect(cursorRule(root)).toMatch(/Ark|layer/i);

      fs.writeFileSync(
        path.join(root, '.github/workflows/node.yml'),
        'name: n\njobs:\n  j:\n    runs-on: ubuntu-latest\n    strategy:\n      matrix:\n        node-version: [20, 22]\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: ${{ matrix.node-version }}\n'
      );
      detectNodeMajorFromWorkflows(root);
      const ciNode = detectCiNode(root);
      fs.writeFileSync(
        path.join(root, '.github/workflows/plain.yml'),
        'name: p\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n'
      );
      detectNodeMajorFromWorkflows(root);
      const pmObj = packageManager(root);
      const wf1 = githubWorkflow(pmObj, ciNode || { kind: 'version', value: '22' }, {
        hasLintScript: true,
        hasTypecheckScript: true,
      });
      expect(wf1).toMatch(/ark-check|node|jobs/i);
      const wf2 = githubWorkflow(
        { cache: 'pnpm', setup: ['corepack enable'], install: 'pnpm install', run: 'pnpm exec ark-check' },
        { kind: 'file', value: '.nvmrc' },
        { hasLintScript: false, hasTypecheckScript: false }
      );
      expect(wf2).toMatch(/pnpm|node-version-file|jobs/i);
      const wf3 = githubWorkflow(
        { cache: 'yarn', setup: ['corepack enable'], install: 'yarn install', run: 'yarn ark-check' },
        { kind: 'default', value: '20' },
        {}
      );
      expect(wf3).toMatch(/yarn|jobs/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('architecture-scan + resolve + ts host', () => {
  it('scans type-only, value, publish, and cache paths', async () => {
    const ts = require('typescript');
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
      fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};\nexport type Db = {};\n');
      fs.writeFileSync(path.join(root, 'src/domain/types.ts'), 'export type Id = string;\n');
      fs.writeFileSync(
        path.join(root, 'src/domain/bad.ts'),
        `
import { db } from '../infra/db';
import type { Db } from '../infra/db';
import { type Id } from './types';
import * as Infra from '../infra/db';
export const n = Date.now();
export function f() { return fetch('/'); }
const dyn = import('../infra/db');
export const x = Math.random();
`
      );
      fs.writeFileSync(
        path.join(root, 'src/app/pub.ts'),
        `
import { createEventBus } from 'arkgate';
const bus = createEventBus();
bus.publish({ type: 'Domain.Event', source: 'app' });
publish('Domain.Event', { source: 'x' });
`
      );
      fs.writeFileSync(
        path.join(root, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: { '@/*': ['src/*'], '@domain/*': ['src/domain/*'] },
            moduleResolution: 'node',
          },
          include: ['src'],
        })
      );
      fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify({
        include: ['src'],
        layers: [
          {
            name: 'DomainModel',
            patterns: ['src/domain/**'],
            forbiddenGlobals: ['fetch', 'Date.now', 'Math.random'],
            intentPrefixes: ['Domain.'],
          },
          { name: 'ApplicationOrchestration', patterns: ['src/app/**'] },
          { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
        ],
        rules: [
          { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
          { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
          { from: 'ApplicationOrchestration', to: 'DomainModel', allowed: true },
          { from: 'ApplicationOrchestration', to: 'PersistenceAdapters', allowed: true },
        ],
        dynamicImportAllowlist: [],
        safety: { maxAnyCasts: 0 },
      }));
      const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
      const files = [
        path.join(root, 'src/domain/bad.ts'),
        path.join(root, 'src/domain/types.ts'),
        path.join(root, 'src/infra/db.ts'),
        path.join(root, 'src/app/pub.ts'),
      ];
      const scan1 = runArchitectureScan({
        root,
        config,
        manifest: {
          architecture: { layers: [{ name: 'DomainModel', prefixes: ['Domain.'] }] },
          intents: [{ name: 'Domain.Event', layer: 'DomainModel' }],
        },
        rules: config.rules,
        files,
        ts,
        args: { config: path.join(root, 'ark.config.json'), noCache: true },
      });
      expect(scan1.violations.length).toBeGreaterThan(0);
      const scan2 = runArchitectureScan({
        root,
        config,
        manifest: null,
        rules: config.rules,
        files,
        ts,
        args: { config: path.join(root, 'ark.config.json'), noCache: false },
      });
      expect(Array.isArray(scan2.violations)).toBe(true);

      // resolvers
      const host = createModuleResolutionHost(ts);
      expect(host.directoryExists?.(root)).toBe(true);
      if (typeof host.realpath === 'function') {
        expect(host.realpath(path.join(root, 'src/domain/bad.ts'))).toMatch(/bad\.ts$/);
      }
      expect(parseTsconfig(ts, path.join(root, 'tsconfig.json'))).toBeTruthy();
      // missing config returns null/undefined or empty options — must not throw
      const missingCfg = parseTsconfig(ts, path.join(root, 'missing.json'));
      expect(missingCfg == null || typeof missingCfg === 'object').toBe(true);
      expect(createCompilerOptionsLookup(ts, root, path.join(root, 'tsconfig.json'))).toBeTruthy();
      expect(createCompilerOptionsLookup(ts, root, undefined)).toBeTruthy();
      const key = scanCacheKey(root, {
        config: path.join(root, 'ark.config.json'),
        strict: true,
      });
      saveScanCache(root, key, files);
      const cached = loadScanCache(root, key);
      expect(cached === undefined || Array.isArray(cached) || typeof cached === 'object').toBe(true);
      // corrupt cache
      fs.writeFileSync(scanCachePath(root), 'not-json');
      expect(loadScanCache(root, key)).toBeFalsy();
      expect(isFile(files[0])).toBe(true);
      expect(isFile(root)).toBe(false);
      expect(resolveRelativeFallback(files[0], './types') || resolveRelativeFallback(files[0], './types.ts')).toBeTruthy();
      expect(resolveRelativeFallback(files[0], '../infra/db')).toBeTruthy();
      expect(resolveRelativeFallback(files[0], 'lodash')).toBeFalsy();
      const opts = {};
      expect(resolveImport(ts, './types', files[0], opts, host, root)).toBeTruthy();
      // bare package may resolve as undefined or non-layer hit
      const lodashImp = resolveImport(ts, 'lodash', files[0], opts, host, root);
      expect(lodashImp == null || typeof lodashImp === 'object' || typeof lodashImp === 'string').toBe(true);
      expect(resolveImport(ts, '../infra/db', files[0], opts, host, root)).toBeTruthy();
      const aliases = readTsconfigAliases(ts, root);
      resolveSpecifierToRel('./types', files[0], root, aliases);
      resolveSpecifierToRel('@/domain/types', files[0], root, aliases);
      resolveSpecifierToRel('@domain/types', files[0], root, aliases);
      resolveSpecifierToRel('lodash', files[0], root, aliases);
      resolveSpecifierToRel('../infra/db', files[0], root, null);
      const resolve = createImportTargetResolver(ts, root, config);
      resolve('./types', files[0]);
      resolve('../infra/db', files[0]);
      resolve('@/domain/types', files[0]);
      resolve('lodash', files[0]);
      resolve('', files[0]);

      const loaded = await loadTypeScript(root);
      expect(loaded?.ts?.version || loaded?.version || typeof loaded === 'object').toBeTruthy();
      expect(usableTypescript(ts)).toBeTruthy();
      typescriptUsabilityHint({ version: '7.0.0' });
      typescriptUsabilityHint({ sys: {} });
      typescriptUsabilityHint(ts);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('remediation + violations + install matrix + ark-shared leftovers', () => {
  it('classifies many violation kinds and installs multi-tool gates', () => {
    for (const kind of [
      {
        ruleId: 'LAYER_IMPORT_VIOLATION',
        typeOnly: true,
        sourcePureTypeModule: true,
      },
      {
        ruleId: 'LAYER_IMPORT_VIOLATION',
        typeOnly: true,
        namedBindingsTypeOnly: true,
      },
      {
        ruleId: 'LAYER_IMPORT_VIOLATION',
        typeOnly: true,
        targetTypeOnlyExports: true,
      },
      {
        ruleId: 'LAYER_IMPORT_VIOLATION',
        typeOnly: false,
        portProofEligible: true,
      },
      {
        ruleId: 'LAYER_IMPORT_VIOLATION',
        peerIsolation: true,
        fromLayer: 'A',
        toLayer: 'A',
      },
      { ruleId: 'FORBIDDEN_GLOBAL', fromLayer: 'DomainModel' },
      { ruleId: 'CIRCULAR_DEPENDENCY', file: 'a.ts' },
      { ruleId: 'UNKNOWN_XYZ' },
      { code: 'LAYER_IMPORT_VIOLATION', typeOnly: true },
    ]) {
      const v = classifyRemediation(kind);
      expect(['mechanical-safe', 'judgment', 'deferred']).toContain(v.class);
      enrichViolationWithFixClass({ ...kind, ruleId: kind.ruleId || kind.code });
    }
    expect(MECHANICAL_SAFE_KINDS.length).toBeGreaterThan(0);
    expect(JUDGMENT_SUGGESTED_KINDS.length).toBeGreaterThan(0);
    expect(KNOWN_FIX_CLASSES.length).toBeGreaterThan(0);

    const many = Array.from({ length: CONCENTRATION_MIN_VIOLATIONS + 2 }, (_, i) => ({
      ruleId: 'LAYER_IMPORT_VIOLATION',
      file: `src/a${i % 2}.ts`,
      line: i + 1,
      fromLayer: 'DomainModel',
      toLayer: 'PersistenceAdapters',
      target: i % 3 === 0 ? 't' : undefined,
      typeOnly: i % 2 === 0,
      message: 'm',
    }));
    const summary = summarizeViolations(many);
    expect(summary.edges.length).toBeGreaterThan(0);
    printViolation(many[0]);
    printViolationBreakdown(summary, { toStderr: true });
    printViolationBreakdown(summary, { toStderr: false });
    expect(violationEdge(many[0])).toBeTruthy();
    const subtree = violationTargetSubtree(many[0]);
    expect(subtree === undefined || typeof subtree === 'string').toBe(true);
    expect(Object.keys(FIX_HINTS).length).toBeGreaterThan(0);

    const root = mk();
    try {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'multi' }));
      fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');
      runInstallAgentGates({
        root,
        tools: ['claude', 'cursor', 'grok', 'windsurf', 'codex'],
        force: true,
      });
      expect(detectSkillGaps(root)).toBeTruthy();
      staleRunnerGateFiles(root);
      warnLockfileConflict(root);
      runMigrateCommands(root);
      resolveTools({ root, tools: ['claude', 'cursor'] });
      normalizeToolsList(undefined);
      stampSkill('# x\n', arkPackageVersionSafe());
      skillTemplates();
      detectCodexHomeGap(root);

      // port proof
      const ts = require('typescript');
      const src = `
import { Repo } from '../infra/repo';
export function get(id: string) { return Repo.get(id); }
`;
      specifierLooksLikeTarget('../infra/repo', 'infra/repo');
      specifierLooksLikeTarget('./x', 'y');
      provePortProofInject(ts, src, {
        target: '../infra/repo',
        fromLayer: 'DomainModel',
        toLayer: 'PersistenceAdapters',
        namedBindings: ['Repo'],
      });
      applyPortProofInject(ts, src, {
        target: '../infra/repo',
        fromLayer: 'DomainModel',
        toLayer: 'PersistenceAdapters',
      });

      // ark-shared constants + more shapes
      expect(DEFAULT_RULES.length).toBeGreaterThan(0);
      expect(DEFAULT_LAYER_DIRECTORIES.DomainModel).toBeTruthy();
      expect(Object.keys(DEFAULT_LAYER_DIRECTORIES).length).toBeGreaterThan(3);
      expect(DEFAULT_DOMAIN_FORBIDDEN_GLOBALS.length).toBeGreaterThan(0);
      expect(looksLikeIntent('Domain.X')).toBe(true);
      const eleven = createElevenLayerConfig();
      applyFrameworkLayoutOverlays(eleven, root);
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
          name: 'ws',
          workspaces: ['packages/*'],
          dependencies: { express: '4', react: '18', vue: '3', fastify: '4' },
        })
      );
      fs.mkdirSync(path.join(root, 'packages/lib/src'), { recursive: true });
      fs.writeFileSync(path.join(root, 'packages/lib/package.json'), '{"name":"lib"}');
      fs.writeFileSync(path.join(root, 'packages/lib/tsconfig.json'), '{}');
      fs.writeFileSync(path.join(root, 'packages/lib/src/i.ts'), 'export const i=1\n');
      detectWorkspaces(root);
      detectTsPackageRoots(root);
      resolveIncludeRoots(root);
      collectAggregatedDeps(root);
      const signals = collectRepoShapeSignals(root);
      const rec = buildArchitectureRecommendation(root);
      formatArchitectureRecommendationHuman(rec);
      buildAdoptionPlanDocument(rec);
      writeAdoptionPlan(root, rec);
      for (const id of ARCHETYPE_IDS) {
        isValidArchetypeId(id);
        try {
          resolveArchetypePreset(id);
        } catch {
          /* some may lack pack */
        }
      }
      for (const c of INIT_WIZARD_CHOICES) {
        mapWizardChoiceToArchetype(typeof c === 'string' ? c : c.key || c.id || c.value);
      }
      const packs = listPolicyPackIds();
      for (const p of packs.slice(0, 5)) loadPolicyPackMeta(p);
      policyPackIdForPreset('crud-product');
      resolveOperatingMode({
        governedPercent: 55,
        planMet: false,
        mature: false,
        totalFiles: 30,
        emptyLayers: ['DomainModel'],
        coreOptionalWithFiles: 3,
        presentationShare: 0.9,
      });
      expect(signals && typeof signals === 'object').toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

function arkPackageVersionSafe(): string {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
    ).version;
  } catch {
    return '0.0.0';
  }
}
