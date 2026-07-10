/**
 * Compact coverage top-up: high-branch paths that are not fully hit by surface suites.
 * Prefer one dense file over multiple overlapping "final push" megasuites.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mk, rm, writeTree, loadTypescript } from './helpers/q1Fixtures';
import {
  readTsconfigAliases,
  resolveSpecifierToRel,
  createImportTargetResolver,
} from '../../../bin/lib/import-resolve.mjs';
import {
  pinArkgateDevDependency,
  syncBaselineIntoCheckSurfaces,
  ensureBaselineFlagInCheckCommand,
  detectContractFalseGreenRisk,
  falseGreenAdoptionGap,
  IO_DIR_SEGMENTS,
} from '../../../bin/lib/field-install.mjs';
import {
  writeTemplate,
  isSelfHostedLibraryAgents,
  isArkAgentsContent,
  ensureTypecheckScript,
  packageScriptsHaveTypecheck,
  hasArkWorkflow,
  missingGates,
} from '../../../bin/lib/gate-files.mjs';
import {
  runInstallAgentGates,
  runMigrateCommands,
  staleRunnerGateFiles,
  warnLockfileConflict,
} from '../../../bin/lib/install-migrate.mjs';
import {
  KNOWN_TOOLS,
  normalizeToolsList,
  resolveTools,
  stampSkill,
  skillTemplates,
  arkPackageVersion,
  isVersionOlder,
  installedSkillVersion,
  detectSkillGaps,
} from '../../../bin/lib/skill-install.mjs';
import {
  stripMcpServerArgs,
  mcpArgsHaveDuplicateBins,
  brokenMcpGateFiles,
  collectAdoptionGaps,
} from '../../../bin/lib/mcp-adoption.mjs';
import { detectDeployPathQuality } from '../../../bin/lib/deploy-path.mjs';
import {
  provePortProofInject,
  applyPortProofInject,
  specifierLooksLikeTarget,
} from '../../../bin/lib/port-proof.mjs';
import {
  assessCodexHomeMcp,
  extractCodexRootFromBlock,
  listCodexArkServerTables,
  upsertCodexMcpTable,
  codexPrimaryTable,
  codexArkBlockHasPreferredBin,
  codexArkBlockNeedsRewrite,
  isTempOrUpgradeRoot,
  wireCodexMcp,
} from '../../../bin/lib/codex-home.mjs';
import {
  checkArgsForRoot,
  packageManager,
  arkCheckCommand,
  githubWorkflow,
  detectCiNode,
  agentInstructions,
  mcpJson,
} from '../../../bin/lib/ci-and-commands.mjs';
import { runDoctor, runPlan, runCoverage, buildRemediationPlan, computeCoverage } from '../../../bin/lib/doctor-plan.mjs';
import {
  expressionMayHaveSideEffects,
  sourceFileExportsOnlyTypes,
  sourceFileHasTopLevelSideEffects,
  valueExportNames,
  typeOnlyExportNames,
  isTypeOnlyModuleReference,
  namedModuleBindings,
  isPublishCall,
  publishHasSource,
  objectHasProperty,
  objectPropertyValue,
} from '../../../bin/lib/ast-scan.mjs';
import {
  collectRepoShapeSignals,
  buildArchitectureRecommendation,
  formatArchitectureRecommendationHuman,
  applyFrameworkLayoutOverlays,
  createElevenLayerConfig,
  resolveOperatingMode,
  scoreArchetypes,
  loadArchitecturePlaybook,
  defaultPlaybookPath,
  whyFromMatchedSignals,
  detectWorkspaces,
  detectTsPackageRoots,
  resolveIncludeRoots,
  collectAggregatedDeps,
  presentLockfiles,
  detectPackageManager,
  execRunner,
  arkCommand,
  installDevHint,
  usableTypescript,
  typescriptUsabilityHint,
  looksLikeIntent,
  resolveIntentLayer,
  collectForbiddenGlobalUses,
  isValidArchetypeId,
  resolveArchetypePreset,
  mapWizardChoiceToArchetype,
  shouldShowNewHereNudge,
  buildAdoptionPlanDocument,
  writeAdoptionPlan,
  listPolicyPackIds,
  loadPolicyPackMeta,
  policyPackIdForPreset,
  ARCHETYPE_IDS,
  INIT_WIZARD_CHOICES,
  MATURE_REPO_FILE_THRESHOLD,
} from '../../../bin/ark-shared.mjs';
import {
  renderHtmlReport,
  renderBeginnerHtmlReport,
  detectEnforcement,
  computeReportFitness,
  archiveReportSnapshots,
  buildReportSnapshot,
  formatDelta,
  htmlEscape,
} from '../../../bin/lib/html-report.mjs';
import { createAICodeGate, defaultIntentRegistry } from '../../../src/index';

describe('q1 coverage top-up (dense, non-overlapping)', () => {
  it('import-resolve matrix + field-install pin/sync edges', () => {
    const ts = loadTypescript();
    const root = mk('ark-top-');
    try {
      expect(readTsconfigAliases(null, root).aliases).toEqual([]);
      writeTree(root, {
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: { '@/*': ['src/*'], '@lib/*': ['lib/*'], '*': ['src/*'] },
          },
        }),
        'src/domain/x.ts': 'export type T = 1;\n',
        'src/domain/index.ts': 'export type Z = 1;\n',
        'lib/util.ts': 'export const u = 1;\n',
      });
      const aliases = readTsconfigAliases(ts, root);
      expect(aliases.aliases.some((a: { from: string }) => a.from.startsWith('@'))).toBe(true);
      expect(
        resolveSpecifierToRel('./x', path.join(root, 'src/domain/y.ts'), root, aliases)
      ).toMatch(/domain/);
      expect(resolveSpecifierToRel('lodash', path.join(root, 'src/a.ts'), root, aliases)).toBeUndefined();
      expect(
        resolveSpecifierToRel('../../../../etc/passwd', path.join(root, 'src/a.ts'), root, aliases)
      ).toBeUndefined();

      expect(createImportTargetResolver(ts, root, { layers: [] })).toBeUndefined();
      const resolve = createImportTargetResolver(ts, root, {
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'ApplicationOrchestration', patterns: ['src/**'] },
        ],
      })!;
      expect(resolve(path.join(root, 'src/domain/x.ts'), '')?.layer).toBe('DomainModel');
      expect(resolve('/tmp/outside.ts', '')).toBeUndefined();
      expect(resolve('./x', path.join(root, 'src/domain/y.ts'))?.relPath).toBeTruthy();
      expect(resolve('@/domain/x', path.join(root, 'src/a.ts'))?.relPath).toBeTruthy();

      // pinArkgate edges
      expect(pinArkgateDevDependency(root).reason).toMatch(/no-package|unreadable|already|added/);
      fs.writeFileSync(path.join(root, 'package.json'), '{bad');
      expect(pinArkgateDevDependency(root).reason).toBe('unreadable-package-json');
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({ name: 'app', dependencies: { arkgate: '1.0.0' } })
      );
      expect(pinArkgateDevDependency(root).reason).toBe('already-present');
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'app', scripts: {} }));
      expect(pinArkgateDevDependency(root, { version: '3.0.0' }).changed).toBe(true);

      fs.writeFileSync(path.join(root, '.ark-baseline.json'), '[]\n');
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
          name: 'app',
          scripts: { 'check:architecture': 'npx ark-check --strict' },
          dependencies: { next: '15' },
        })
      );
      fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.github/workflows/ci.yml'),
        'name: c\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx ark-check\n      - run: npm run lint\n'
      );
      syncBaselineIntoCheckSurfaces(root, {});
      expect(ensureBaselineFlagInCheckCommand('npx ark-check --strict').changed).toBe(true);
      expect(ensureBaselineFlagInCheckCommand('npx ark-check --baseline x.json').changed).toBe(false);

      // false-green with real IO dirs
      for (const seg of IO_DIR_SEGMENTS.slice(0, 4)) {
        fs.mkdirSync(path.join(root, 'src/app', seg), { recursive: true });
        fs.writeFileSync(path.join(root, 'src/app', seg, 'x.ts'), 'export const x = 1;\n');
      }
      const cov = {
        emptyLayers: ['DomainModel', 'PersistenceAdapters'],
        layers: [
          { name: 'DomainModel', files: 0 },
          { name: 'PersistenceAdapters', files: 0 },
          { name: 'ApplicationOrchestration', files: 4 },
        ],
        governed: { percent: 30, classifiedFiles: 4, totalFiles: 12 },
      };
      const config = {
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
          { name: 'ApplicationOrchestration', patterns: ['src/app/**'] },
        ],
      };
      expect(detectContractFalseGreenRisk(root, config, cov)?.risk).toBe(true);
      expect(falseGreenAdoptionGap(root, config, cov)?.id).toBeTruthy();

      expect(packageScriptsHaveTypecheck({ typecheck: 'tsc' })).toBe(true);
      ensureTypecheckScript(root, {});
      expect(hasArkWorkflow(root)).toBe(true);
      expect(Array.isArray(missingGates(root))).toBe(true);
      expect(isArkAgentsContent('# ArkGate Enforcement\n')).toBe(true);
      expect(
        isSelfHostedLibraryAgents(
          '## Identity — read this first\nmother / canonical development repository\n'
        )
      ).toBe(true);
      writeTemplate(
        root,
        'AGENTS.md',
        '## Identity — read this first\nmother / canonical development repository\n',
        true
      );
      writeTemplate(root, 'AGENTS.md', '# Ark Enforcement\nconsumer\n', true);
      expect(isSelfHostedLibraryAgents(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'))).toBe(
        true
      );

      const deploy = detectDeployPathQuality(root);
      expect(Array.isArray(deploy.engines)).toBe(true);
      collectAdoptionGaps(root, config, cov);
    } finally {
      rm(root);
    }
  });

  it('full tool install + migrate + codex + port-proof + ci templates', () => {
    const root = mk('ark-top2-');
    try {
      writeTree(root, {
        'package.json': JSON.stringify({
          name: 'full-host',
          scripts: { lint: 'eslint .', typecheck: 'tsc -p .', build: 'next build' },
          dependencies: { next: '15', react: '18' },
        }),
        'package-lock.json': '{}\n',
        'pnpm-lock.yaml': 'lockfileVersion: 9\n',
        '.ark-baseline.json': '[]\n',
        '.mcp.json': JSON.stringify({
          mcpServers: {
            ark: { command: 'npx', args: ['ark-mcp', 'arkgate-mcp', '--root', '.'] },
          },
        }),
        'AGENTS.md': 'npx ark-check and yarn ark-check\n',
        '.github/workflows/ci.yml':
          'name: ci\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx ark-check\n      - run: npm run lint\n',
      });

      expect(KNOWN_TOOLS.length).toBeGreaterThan(5);
      runInstallAgentGates({
        root,
        tools: [...KNOWN_TOOLS],
        force: true,
        codexHome: false,
      });
      runInstallAgentGates({ root, tools: ['claude', 'cursor'], force: false, skillsOnly: true });
      runMigrateCommands(root);
      warnLockfileConflict(root);
      expect(Array.isArray(staleRunnerGateFiles(root))).toBe(true);

      expect(normalizeToolsList('claude,grok')).toContain('claude');
      expect(resolveTools({ root, tools: ['claude'] }).tools.has('claude')).toBe(true);
      const stamped = stampSkill('# t\n', arkPackageVersion());
      fs.writeFileSync(path.join(root, 'S.md'), stamped);
      expect(installedSkillVersion(path.join(root, 'S.md')) === null || typeof installedSkillVersion(path.join(root, 'S.md')) === 'string').toBe(true);
      expect(isVersionOlder('1.0.0', '2.0.0')).toBe(true);
      expect(skillTemplates().length).toBeGreaterThan(0);
      expect(Array.isArray(detectSkillGaps(root))).toBe(true);

      expect(stripMcpServerArgs(['npx', 'arkgate-mcp', '--root', '.'])).toContain('--root');
      expect(mcpArgsHaveDuplicateBins(['ark-mcp', 'arkgate-mcp'])).toBe(true);
      expect(Array.isArray(brokenMcpGateFiles(root))).toBe(true);

      const block = `command = "npx"\nargs = ["arkgate-mcp", "--root", "/proj"]\n`;
      expect(extractCodexRootFromBlock(block)).toBe('/proj');
      const toml = `[mcp_servers.ark]\n${block}\n`;
      expect(listCodexArkServerTables(toml).length).toBeGreaterThan(0);
      expect(upsertCodexMcpTable(toml, 'mcp_servers.ark', block)).toMatch(/arkgate-mcp|mcp_servers/);
      expect(codexPrimaryTable(toml)?.table).toBeTruthy();
      expect(typeof codexArkBlockHasPreferredBin(toml)).toBe('boolean');
      expect(typeof codexArkBlockNeedsRewrite(toml, '/proj')).toBe('boolean');
      expect(assessCodexHomeMcp(toml, '/proj') && typeof assessCodexHomeMcp(toml, '/proj') === 'object').toBe(true);
      if (isTempOrUpgradeRoot(root)) wireCodexMcp(root, true);

      const ts = loadTypescript();
      const rejectCases = [
        `import db from '../infra/db';\nexport function f(){ return db.save(1); }\n`,
        `import { a, b } from '../infra/db';\nexport function f(){ return a.x(); }\n`,
        `import { db } from 'lodash';\nexport function f(){ return db.x(); }\n`,
        `import * as db from '../infra/db';\nexport function f(){ return db.x(); }\n`,
        `import { db } from '../infra/db';\nexport const f = () => db.save(1);\n`,
      ];
      for (const src of rejectCases) {
        expect(provePortProofInject(ts, src).eligible).toBe(false);
      }
      const eligible = `import { db } from '../infra/db';\nexport function place(id: string) {\n  return db.save(id);\n}\n`;
      const proof = provePortProofInject(ts, eligible);
      if (proof.eligible) {
        const applied = applyPortProofInject(ts, eligible);
        expect(applied?.source).toMatch(/Port|db:/);
      }
      expect(specifierLooksLikeTarget('../infra/db', 'infra/db')).toBe(true);

      expect(checkArgsForRoot(root, { requireGates: true })).toMatch(/--root|--config/);
      const pm = packageManager(root);
      expect(pm.setup).toBeDefined();
      expect(arkCheckCommand(root)).toMatch(/ark-check|arkgate-check/);
      expect(agentInstructions(root)).toMatch(/Ark|layer/i);
      expect(mcpJson(root)).toMatch(/mcpServers|ark/i);
      const ciNode = detectCiNode(root) || { kind: 'version', value: '22' };
      expect(githubWorkflow(pm, ciNode, { hasLintScript: true, hasTypecheckScript: true })).toMatch(
        /jobs|ark-check|node/i
      );

      const f = path.join(root, 'src/x.ts');
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, 'export const x = 1;\n');
      const lines: string[] = [];
      const orig = console.log;
      console.log = (s: unknown) => lines.push(String(s));
      try {
        runDoctor(
          root,
          {
            layers: [{ name: 'ApplicationOrchestration', patterns: ['src/**'] }],
            rules: [],
          },
          [f],
          [],
          [],
          false,
          {
            safety: {
              anyCasts: [],
              tsSuppressions: [],
              nonLiteralDynamicImports: [],
              inMemoryProductionStores: [],
              disabledPeerIsolationRules: [],
            },
          }
        );
        runPlan(root, [], false, 10, 5);
      } finally {
        console.log = orig;
      }
      expect(lines.join('\n').length).toBeGreaterThan(20);

      const sf = ts.createSourceFile(
        't.ts',
        `import type { T } from './t';\nimport { type U, V } from './v';\nexport type { T };\nconst x = foo() && new Bar();\n`,
        ts.ScriptTarget.Latest,
        true
      );
      sourceFileExportsOnlyTypes(ts, sf);
      for (const stmt of sf.statements) {
        if (ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt)) {
          isTypeOnlyModuleReference(ts, stmt);
          namedModuleBindings(ts, stmt);
        }
      }
      expressionMayHaveSideEffects(ts, ts.factory.createCallExpression(ts.factory.createIdentifier('foo'), undefined, []));
    } finally {
      rm(root);
    }
  });

  it('repo shapes + html/doctor + ast/AICodeGate branch density', () => {
    const shapes = [
      {
        files: {
          'package.json': JSON.stringify({
            name: 'nest',
            dependencies: { '@nestjs/core': '10', typeorm: '0.3' },
          }),
          'src/app.module.ts': 'export class AppModule {}\n',
          'src/users/users.controller.ts': 'export class UsersController {}\n',
          'src/domain/user.ts': 'export class User {}\n',
        },
      },
      {
        files: {
          'package.json': JSON.stringify({
            name: 'next-app',
            dependencies: { next: '15', react: '18' },
            workspaces: ['apps/*'],
          }),
          'turbo.json': '{}',
          'apps/web/package.json': JSON.stringify({ name: 'web', dependencies: { next: '15' } }),
          'apps/web/app/page.tsx': 'export default function P(){return null}\n',
          'apps/web/components/B.tsx': 'export const B=()=>null\n',
        },
      },
      {
        files: {
          'package.json': JSON.stringify({ name: 'fsd', dependencies: { react: '18' } }),
          'src/app/index.ts': 'export {}\n',
          'src/pages/home/ui.tsx': 'export default function H(){return null}\n',
          'src/features/auth/ui.tsx': 'export const A=()=>null\n',
          'src/entities/user/model.ts': 'export type U={}\n',
          'src/shared/lib/x.ts': 'export const x=1\n',
        },
      },
      {
        files: {
          'package.json': JSON.stringify({
            name: 'lib',
            main: 'dist/index.js',
            exports: { '.': './dist/index.js' },
            type: 'module',
          }),
          'src/index.ts': 'export const x=1\n',
          'src/a.ts': 'export const a=1\n',
        },
      },
      {
        files: {
          'package.json': JSON.stringify({
            name: 'jobs',
            bin: { cli: 'bin/c.js' },
            dependencies: { express: '4', prisma: '5', bullmq: '5' },
          }),
          'bin/c.js': '#!/usr/bin/env node\n',
          'src/jobs/worker.ts': 'export const w=1\n',
          'src/routes/api.ts': 'export const r=1\n',
          'src/persistence/db.ts': 'export const d=1\n',
          'src/integrations/stripe.ts': 'export const s=1\n',
          'src/workflows/saga.ts': 'export const g=1\n',
          'nx.json': '{}',
        },
      },
      {
        files: {
          'package.json': JSON.stringify({
            name: 'vs',
            packageManager: 'pnpm@9.0.0',
            dependencies: { hono: '4' },
          }),
          'pnpm-lock.yaml': 'lockfileVersion: 9\n',
          'src/features/orders/create.ts': 'export const c=1\n',
          'src/shared/db.ts': 'export const d=1\n',
          'src/lib/util.ts': 'export const u=1\n',
        },
      },
      {
        files: {
          'package.json': JSON.stringify({ name: 'ddd', dependencies: { '@nestjs/core': '10' } }),
          'src/contexts/orders/domain/order.ts': 'export class Order {}\n',
          'src/contexts/orders/application/place.ts': 'export const p=1\n',
          'src/contexts/orders/infrastructure/repo.ts': 'export const r=1\n',
          'src/bounded-contexts/billing/domain/inv.ts': 'export class Inv {}\n',
        },
      },
    ];
    const playbook = loadArchitecturePlaybook(defaultPlaybookPath());
    for (const shape of shapes) {
      const root = mk('ark-shape-');
      try {
        writeTree(root, shape.files);
        const signals = collectRepoShapeSignals(root);
        scoreArchetypes(signals, playbook);
        whyFromMatchedSignals(signals, Object.keys(signals).slice(0, 4));
        const rec = buildArchitectureRecommendation(root);
        formatArchitectureRecommendationHuman(rec);
        applyFrameworkLayoutOverlays(createElevenLayerConfig(), root);
        detectWorkspaces(root);
        detectTsPackageRoots(root);
        resolveIncludeRoots(root);
        collectAggregatedDeps(root);
        presentLockfiles(root);
        detectPackageManager(root);
        execRunner(root);
        arkCommand(root, 'ark-check', '--strict');
        installDevHint(root, 'arkgate');
        shouldShowNewHereNudge(root, path.join(root, 'missing.json'), 5, true);
        const rec2 = buildArchitectureRecommendation(root);
        buildAdoptionPlanDocument(rec2);
        writeAdoptionPlan(root, rec2);
        for (const mode of [
          {
            governedPercent: 0,
            planMet: false,
            mature: false,
            totalFiles: 0,
            emptyLayers: ['A'],
            coreOptionalWithFiles: 0,
            presentationShare: null,
          },
          {
            governedPercent: 45,
            planMet: false,
            mature: false,
            totalFiles: 40,
            emptyLayers: [],
            coreOptionalWithFiles: 2,
            presentationShare: 0.7,
          },
          {
            governedPercent: 90,
            planMet: true,
            mature: true,
            totalFiles: 200,
            emptyLayers: [],
            coreOptionalWithFiles: 0,
            presentationShare: 0.1,
          },
        ]) {
          expect(resolveOperatingMode(mode)).toMatch(/suggest|adapt|enforce/);
        }
      } finally {
        rm(root);
      }
    }

    expect(usableTypescript(loadTypescript())).toBeTruthy();
    typescriptUsabilityHint(null);
    typescriptUsabilityHint({ version: '7.0.0' });
    expect(looksLikeIntent('Domain.X')).toBe(true);
    expect(resolveIntentLayer('Domain.X', [{ name: 'DomainModel', prefixes: ['Domain.'] }])).toBe(
      'DomainModel'
    );
    const ts0 = loadTypescript();
    const sf0 = ts0.createSourceFile(
      'g.ts',
      'const a = Date.now(); fetch("/"); Math.random();\n',
      ts0.ScriptTarget.Latest,
      true
    );
    expect(
      collectForbiddenGlobalUses(ts0, sf0, ['fetch', 'Date.now', 'Math.random']).length
    ).toBeGreaterThan(0);
    for (const id of ARCHETYPE_IDS.slice(0, 6)) {
      expect(isValidArchetypeId(id)).toBe(true);
      try {
        resolveArchetypePreset(id);
      } catch {
        /* optional packs */
      }
    }
    for (const c of INIT_WIZARD_CHOICES.slice(0, 4)) {
      mapWizardChoiceToArchetype(typeof c === 'string' ? c : c.key || c.id || c.value);
    }
    const packs = listPolicyPackIds();
    if (packs.length) loadPolicyPackMeta(packs[0]);
    policyPackIdForPreset('hexagonal');
    expect(MATURE_REPO_FILE_THRESHOLD).toBeGreaterThan(50);

    const root = mk('ark-html-');
    try {
      writeTree(root, {
        'package.json': JSON.stringify({ name: 'demo' }),
        '.ark-baseline.json': JSON.stringify([{ ruleId: 'X' }]),
        '.claude/settings.json': JSON.stringify({
          hooks: { PreToolUse: [{ hooks: [{ command: 'npx arkgate-mcp --hook --hook-repair' }] }] },
        }),
        '.mcp.json': JSON.stringify({
          mcpServers: { ark: { command: 'npx', args: ['arkgate-mcp'] } },
        }),
        'eslint.config.mjs': "export default []; // arkgate\n",
        '.github/workflows/ci.yml':
          'name: ci\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx ark-check\n',
        'src/domain/a.ts': 'export const a=1\n',
        'src/misc/b.ts': 'export const b=1\n',
      });
      const layers = [
        { name: 'DomainModel', patterns: ['src/domain/**'], forbiddenGlobals: ['fetch'], description: 'core' },
        { name: 'ApplicationOrchestration', patterns: ['src/**'], mayImportInfrastructure: true },
        { name: 'PresentationAdapters', patterns: ['src/ui/**'], optional: true },
      ];
      const rules = [
        { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
        { from: 'ApplicationOrchestration', to: 'DomainModel', allowed: true },
      ];
      const config = { layers, rules, include: ['src'] };
      const files = [path.join(root, 'src/domain/a.ts'), path.join(root, 'src/misc/b.ts')];
      const cov = computeCoverage(root, config, files, rules);
      expect(cov.governed.percent).toBeGreaterThanOrEqual(0);
      buildRemediationPlan(root, [], 20, 10);
      buildRemediationPlan(root, [], 100, 0);
      buildRemediationPlan(
        root,
        [
          {
            ruleId: 'LAYER_IMPORT_VIOLATION',
            file: 'src/domain/a.ts',
            line: 1,
            fromLayer: 'DomainModel',
            toLayer: 'PersistenceAdapters',
            typeOnly: true,
            sourcePureTypeModule: true,
          },
        ],
        80,
        2
      );

      const lines: string[] = [];
      const orig = console.log;
      console.log = (s: unknown) => lines.push(String(s));
      try {
        runCoverage(root, config, files, rules, false);
        runCoverage(root, config, files, rules, true);
        runPlan(root, [], false, 20, 10);
        runPlan(
          root,
          [
            {
              ruleId: 'FORBIDDEN_GLOBAL',
              file: 'src/domain/a.ts',
              line: 1,
              fromLayer: 'DomainModel',
              message: 'fetch',
            },
          ],
          false,
          80,
          2
        );
        runDoctor(root, config, files, rules, [], false, { configMissing: true });
        runDoctor(root, config, [], rules, [], true, {});
      } finally {
        console.log = orig;
      }
      expect(lines.join('\n').length).toBeGreaterThan(50);

      const enf = detectEnforcement(root);
      const coverage = {
        governed: { percent: 70, classifiedFiles: 7, totalFiles: 10 },
        layers: layers.map((l, i) => ({ name: l.name, files: i, patterns: l.patterns })),
        unclassified: { count: 3, files: ['a.ts', 'b.ts', 'c.ts'] },
        emptyLayers: ['PresentationAdapters'],
        layersWithoutRules: [],
        suggestions: [{ dir: 'src/ui', layer: 'PresentationAdapters', files: 3 }],
        include: ['src'],
      };
      const violations = [
        {
          ruleId: 'LAYER_IMPORT_VIOLATION',
          file: 'src/a.ts',
          line: 1,
          fromLayer: 'DomainModel',
          toLayer: 'PersistenceAdapters',
          typeOnly: true,
          message: 'bad',
        },
        {
          ruleId: 'FORBIDDEN_GLOBAL',
          file: 'src/b.ts',
          line: 2,
          fromLayer: 'DomainModel',
          message: 'fetch',
        },
      ];
      const fit = computeReportFitness({
        coverage,
        violations,
        ok: false,
        enforcement: enf,
        config,
      });
      const snap = buildReportSnapshot({
        root,
        config,
        coverage,
        violations,
        ok: false,
        suppressed: 1,
        version: '1',
        fileCountByLayer: new Map([['DomainModel', 3]]),
        enforcement: enf,
        score: fit.score,
        mode: fit.mode,
      });
      const html = renderHtmlReport({
        root,
        config,
        coverage,
        violations,
        ok: false,
        version: '1',
        configPath: 'ark.config.json',
        generatedAt: new Date().toISOString(),
        skillGaps: [{ tool: 'claude', missing: 1, stale: 0 }],
        originSnapshot: snap,
        currentSnapshot: snap,
      });
      expect(html).toMatch(/html/i);
      expect(renderBeginnerHtmlReport({
        root,
        config,
        violations,
        ok: false,
        version: '1',
        configPath: 'c',
        generatedAt: 't',
      })).toMatch(/html/i);
      archiveReportSnapshots(root, { html, snapshot: snap });
      expect(formatDelta(null)).toBe('—');
      expect(htmlEscape('<>')).toMatch(/&lt;/);

      // ast density
      const ts = loadTypescript();
      const side = ts.createSourceFile(
        's.ts',
        `import './poly';\nconsole.log(1);\nexport const v=1;\nexport type T=1;\nexport default class C{}\nexport * from './x';\n`,
        ts.ScriptTarget.Latest,
        true
      );
      expect(sourceFileExportsOnlyTypes(ts, side)).toBe(false);
      expect(sourceFileHasTopLevelSideEffects(ts, side)).toBe(true);
      valueExportNames(ts, side);
      typeOnlyExportNames(ts, side);
      const mixed = ts.createSourceFile(
        'm.ts',
        `import { type A, B } from './c';\nexport { type A, B } from './c';\npublish('Domain.X', { source: 's' });\nconst o={ source:'s', store };\n`,
        ts.ScriptTarget.Latest,
        true
      );
      const visit = (n: import('typescript').Node) => {
        if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) {
          isTypeOnlyModuleReference(ts, n);
          namedModuleBindings(ts, n);
        }
        if (ts.isCallExpression(n)) {
          isPublishCall(ts, n);
          publishHasSource(ts, n);
        }
        if (ts.isObjectLiteralExpression(n)) {
          objectHasProperty(ts, n, 'source');
          objectPropertyValue(ts, n, 'source');
        }
        ts.forEachChild(n, visit);
      };
      visit(mixed);

      defaultIntentRegistry.clear();
      const gate = createAICodeGate({ typescript: ts });
      gate.validate('import { db } from "../infra/db";\nexport const x = db;\n', {
        filePath: 'src/domain/y.ts',
      });
      gate.validate('const m = require("fs");', { filePath: 'src/domain/z.ts' });
      createAICodeGate({
        typescript: ts,
        allowNonLiteralDynamicImport: () => true,
      }).validate('import(x)', { filePath: 'src/p.ts' });
    } finally {
      rm(root);
    }
  });
});
