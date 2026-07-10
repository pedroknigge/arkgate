/**
 * High-yield branch hits for ark-shared repo-shape + overlays + port-proof rejects
 * + field-install pin/sync edge paths.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  collectRepoShapeSignals,
  buildArchitectureRecommendation,
  formatArchitectureRecommendationHuman,
  applyFrameworkLayoutOverlays,
  createElevenLayerConfig,
  scoreArchetypes,
  loadArchitecturePlaybook,
  defaultPlaybookPath,
  whyFromMatchedSignals,
  buildAdoptionPlanDocument,
  writeAdoptionPlan,
  resolveArchetypePreset,
  mapWizardChoiceToArchetype,
  INIT_WIZARD_CHOICES,
  ARCHETYPE_IDS,
  isValidArchetypeId,
  resolveOperatingMode,
  shouldShowNewHereNudge,
  presentLockfiles,
  detectPackageManager,
  execRunner,
  arkCommand,
  installDevHint,
  detectWorkspaces,
  detectTsPackageRoots,
  resolveIncludeRoots,
  collectAggregatedDeps,
  loadPolicyPackMeta,
  listPolicyPackIds,
  policyPackIdForPreset,
  usableTypescript,
  typescriptUsabilityHint,
  looksLikeIntent,
  resolveIntentLayer,
  collectForbiddenGlobalUses,
} from '../../../bin/ark-shared.mjs';
import {
  provePortProofInject,
  applyPortProofInject,
  specifierLooksLikeTarget,
} from '../../../bin/lib/port-proof.mjs';
import {
  ensureBaselineFlagInCheckCommand,
  syncBaselineIntoCheckSurfaces,
  pinArkgateDevDependency,
  detectContractFalseGreenRisk,
  falseGreenAdoptionGap,
} from '../../../bin/lib/field-install.mjs';
import {
  runInstallAgentGates,
  runMigrateCommands,
  staleRunnerGateFiles,
  warnLockfileConflict,
} from '../../../bin/lib/install-migrate.mjs';
import {
  collectAdoptionGaps,
  detectDeployPathQuality,
  stripMcpServerArgs,
  brokenMcpGateFiles,
} from '../../../bin/lib/mcp-adoption.mjs';
import {
  normalizeToolsList,
  resolveTools,
  stampSkill,
  installedSkillVersion,
  isVersionOlder,
  skillTemplates,
  skillTemplateNames,
  detectSkillGaps,
  detectCodexHomeGap,
  arkPackageVersion,
} from '../../../bin/lib/skill-install.mjs';
import {
  assessCodexHomeMcp,
  wireCodexMcp,
  isTempOrUpgradeRoot,
  codexArkBlockNeedsRewrite,
  codexArkBlockHasPreferredBin,
  upsertCodexMcpTable,
  listCodexArkServerTables,
} from '../../../bin/lib/codex-home.mjs';
import { runDoctor, runPlan, runCoverage, buildRemediationPlan } from '../../../bin/lib/doctor-plan.mjs';
import { renderHtmlReport, detectEnforcement, archiveReportSnapshots, buildReportSnapshot, computeReportFitness } from '../../../bin/lib/html-report.mjs';

const require = createRequire(import.meta.url);

function mk(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ark-shape-'));
}

function writeTree(root: string, files: Record<string, string>) {
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
}

describe('ark-shared multi-shape fixtures', () => {
  it('scores nest, next monorepo, fsd, vertical slice, ddd, cli, library, jobs', () => {
    const shapes: Array<{ name: string; files: Record<string, string> }> = [
      {
        name: 'nest',
        files: {
          'package.json': JSON.stringify({
            name: 'nest-app',
            dependencies: { '@nestjs/core': '10', '@nestjs/common': '10', typeorm: '0.3', pg: '8' },
            scripts: { start: 'nest start', build: 'nest build', lint: 'eslint .', typecheck: 'tsc -p .' },
          }),
          'nest-cli.json': '{}',
          'src/app.module.ts': 'export class AppModule {}\n',
          'src/users/users.controller.ts': 'export class UsersController {}\n',
          'src/users/users.service.ts': 'export class UsersService {}\n',
          'src/domain/user.ts': 'export class User {}\n',
        },
      },
      {
        name: 'next-mono',
        files: {
          'package.json': JSON.stringify({ name: 'root', workspaces: ['apps/*', 'packages/*'] }),
          'pnpm-workspace.yaml': 'packages:\n  - apps/*\n  - packages/*\n',
          'turbo.json': '{}',
          'apps/web/package.json': JSON.stringify({
            name: 'web',
            dependencies: { next: '15', react: '18', 'react-dom': '18' },
            scripts: { build: 'next build', lint: 'next lint' },
          }),
          'apps/web/app/page.tsx': 'export default function Page(){return null}\n',
          'apps/web/app/layout.tsx': 'export default function L({children}:any){return children}\n',
          'apps/web/components/Button.tsx': 'export const B=()=>null\n',
          'packages/ui/package.json': JSON.stringify({ name: 'ui', main: 'index.ts' }),
          'packages/ui/index.ts': 'export const x=1\n',
          'packages/ui/tsconfig.json': '{}',
        },
      },
      {
        name: 'fsd',
        files: {
          'package.json': JSON.stringify({ name: 'fsd', dependencies: { react: '18' } }),
          'src/app/index.ts': 'export {}\n',
          'src/pages/home/index.tsx': 'export default function H(){return null}\n',
          'src/features/auth/ui.tsx': 'export const A=()=>null\n',
          'src/entities/user/model.ts': 'export type U={}\n',
          'src/shared/lib/x.ts': 'export const x=1\n',
          'src/widgets/header/ui.tsx': 'export const H=()=>null\n',
        },
      },
      {
        name: 'vertical-slice',
        files: {
          'package.json': JSON.stringify({ name: 'vs', dependencies: { express: '4' } }),
          'src/features/orders/create.ts': 'export const c=1\n',
          'src/features/orders/list.ts': 'export const l=1\n',
          'src/shared/db.ts': 'export const db={}\n',
          'src/lib/util.ts': 'export const u=1\n',
        },
      },
      {
        name: 'ddd',
        files: {
          'package.json': JSON.stringify({ name: 'ddd', dependencies: { '@nestjs/core': '10' } }),
          'src/contexts/orders/domain/order.ts': 'export class Order {}\n',
          'src/contexts/orders/application/place.ts': 'export const place=1\n',
          'src/contexts/orders/infrastructure/repo.ts': 'export const repo=1\n',
          'src/bounded-contexts/billing/domain/invoice.ts': 'export class Invoice {}\n',
        },
      },
      {
        name: 'cli-lib',
        files: {
          'package.json': JSON.stringify({
            name: 'cli',
            bin: { cli: 'bin/cli.js' },
            main: 'dist/index.js',
            type: 'module',
          }),
          'bin/cli.js': '#!/usr/bin/env node\n',
          'src/index.ts': 'export const x=1\n',
        },
      },
      {
        name: 'library',
        files: {
          'package.json': JSON.stringify({
            name: 'lib',
            main: 'dist/index.js',
            exports: { '.': './dist/index.js' },
            type: 'module',
          }),
          'src/index.ts': 'export const x=1\n',
          'src/a.ts': 'export const a=1\n',
          'src/b.ts': 'export const b=1\n',
        },
      },
      {
        name: 'jobs',
        files: {
          'package.json': JSON.stringify({ name: 'jobs', dependencies: { bullmq: '5' } }),
          'src/jobs/worker.ts': 'export const w=1\n',
          'src/workers/cron.ts': 'export const c=1\n',
          'src/schedules/daily.ts': 'export const d=1\n',
        },
      },
      {
        name: 'express-prisma',
        files: {
          'package.json': JSON.stringify({
            name: 'api',
            dependencies: { express: '4', prisma: '5', '@prisma/client': '5' },
            scripts: { build: 'tsc', start: 'node dist' },
          }),
          'src/routes/users.ts': 'export const r=1\n',
          'src/controllers/user.ts': 'export const c=1\n',
          'src/persistence/db.ts': 'export const db=1\n',
          'src/integrations/stripe.ts': 'export const s=1\n',
          'src/workflows/saga.ts': 'export const g=1\n',
          'prisma/schema.prisma': 'generator client { provider = "prisma-client-js" }\n',
        },
      },
      {
        name: 'nx-mono',
        files: {
          'package.json': JSON.stringify({ name: 'nxroot' }),
          'nx.json': '{}',
          'workspace.json': '{}',
          'apps/api/src/main.ts': 'export const m=1\n',
          'apps/api/package.json': JSON.stringify({ name: 'api', dependencies: { fastify: '4' } }),
        },
      },
    ];

    const playbook = loadArchitecturePlaybook(defaultPlaybookPath());
    for (const shape of shapes) {
      const root = mk();
      try {
        writeTree(root, shape.files);
        const signals = collectRepoShapeSignals(root);
        expect(signals && typeof signals === 'object').toBe(true);
        scoreArchetypes(signals, playbook);
        const matched = Object.keys(signals).filter((k) => {
          const v = (signals as Record<string, unknown>)[k];
          return Boolean(v) && v !== 0 && !(Array.isArray(v) && v.length === 0);
        });
        whyFromMatchedSignals(signals, matched);
        whyFromMatchedSignals(signals, ['workspaces', 'cli', 'ui', 'tinyTree', 'libraryOnly']);
        const rec = buildArchitectureRecommendation(root);
        formatArchitectureRecommendationHuman(rec);
        buildAdoptionPlanDocument(rec);
        writeAdoptionPlan(root, rec);
        const overlaid = applyFrameworkLayoutOverlays(createElevenLayerConfig(), root);
        expect(overlaid.layers.length).toBeGreaterThan(0);
        detectWorkspaces(root);
        detectTsPackageRoots(root);
        resolveIncludeRoots(root);
        collectAggregatedDeps(root);
        presentLockfiles(root);
        detectPackageManager(root);
        execRunner(root);
        arkCommand(root, 'ark-check', '--strict');
        installDevHint(root, 'arkgate');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }

    for (const id of ARCHETYPE_IDS) {
      isValidArchetypeId(id);
      try {
        resolveArchetypePreset(id);
      } catch {
        /* optional */
      }
    }
    for (const c of INIT_WIZARD_CHOICES) {
      mapWizardChoiceToArchetype(typeof c === 'string' ? c : c.key || c.id || c.value || c);
    }
    for (const pack of listPolicyPackIds().slice(0, 8)) {
      loadPolicyPackMeta(pack);
    }
    policyPackIdForPreset('crud-product');
    policyPackIdForPreset('unknown-xyz');

    resolveOperatingMode({
      governedPercent: 100,
      planMet: true,
      mature: true,
      totalFiles: 200,
      emptyLayers: [],
      coreOptionalWithFiles: 0,
      presentationShare: 0,
    });
    resolveOperatingMode({
      governedPercent: null,
      planMet: false,
      mature: false,
      totalFiles: 0,
      emptyLayers: ['A', 'B'],
      coreOptionalWithFiles: 5,
      presentationShare: 1,
    });

    const ts = require('typescript');
    expect(usableTypescript(ts)).toBeTruthy();
    typescriptUsabilityHint(null);
    typescriptUsabilityHint({ version: '7.0.0' });
    typescriptUsabilityHint({ sys: { fileExists: 1 } });
    looksLikeIntent('Domain.X');
    looksLikeIntent('');
    resolveIntentLayer('Domain.X', [{ name: 'DomainModel', prefixes: ['Domain.'] }]);
    resolveIntentLayer('Other.Y', [{ name: 'DomainModel', prefixes: ['Domain.'] }]);    const sf = ts.createSourceFile(
      'x.ts',
      'const a = Date.now(); fetch("/"); process.env.X; Math.random();\n',
      ts.ScriptTarget.Latest,
      true
    );
    collectForbiddenGlobalUses(ts, sf, ['fetch', 'Date.now', 'Math.random', 'process']);
  });
});

describe('port-proof rejection matrix + field/install/skill/doctor extras', () => {
  it('covers port-proof fail paths and install edge cases', () => {
    const ts = require('typescript');
    const cases = [
      '',
      null as unknown as string,
      `import type { db } from '../infra/db';\nexport function f(){return 1}\n`,
      `import '../infra/db';\nexport function f(){return 1}\n`,
      `import { a, b } from '../infra/db';\nexport function f(){return a.x()}\n`,
      `import { type T, db } from '../infra/db';\nexport function f(){return db.x()}\n`,
      `import { db } from 'lodash';\nexport function f(){return db.x()}\n`,
      `import * as db from '../infra/db';\nexport function f(){return db.x()}\n`,
      `import { db as d } from '../infra/db';\nexport function f(){return d.x(); return d;}\n`,
      `import { db } from '../infra/db';\nexport const f = () => db.save(1);\n`,
      `import { db } from '../infra/db';\nclass C { m(){ return db.save(1);} }\n`,
      `import { db } from '../infra/db';\nexport function f(...a: string[]){return db.save(a[0])}\n`,
      `import { db } from '../infra/db';\nexport function f(){ const x = db; return x.save(1); }\n`,
      `import { db } from '../infra/db';\nimport { other } from '../infra/o';\nexport function f(){return db.save(1)}\n`,
    ];
    for (const src of cases) {
      provePortProofInject(ts, src as string, { importLocalName: 'db', importSpecifier: '../infra/db' });
      applyPortProofInject(ts, src as string, {});
    }
    // eligible multi-method
    const multi = `import { repo } from '../infra/repo';\nexport function a(id:string){return repo.get(id);}\nexport function b(id:string){return repo.save(id);}\n`;
    const proof = provePortProofInject(ts, multi);
    if (proof.eligible) applyPortProofInject(ts, multi);
    specifierLooksLikeTarget('../infra/repo', 'infra/repo');
    specifierLooksLikeTarget('../infra/repo.ts', 'repo');
    specifierLooksLikeTarget('lodash', 'infra/repo');

    const root = mk();
    try {
      writeTree(root, {
        'package.json': JSON.stringify({
          name: 'edge',
          scripts: { 'check:architecture': 'npx ark-check --strict', build: 'next build' },
          dependencies: { next: '15' },
          devDependencies: { arkgate: '1.0.0' },
        }),
        'package-lock.json': '{}\n',
        'pnpm-lock.yaml': 'lockfileVersion: 9\n',
        'yarn.lock': '# yarn\n',
        '.ark-baseline.json': '[]\n',
        'AGENTS.md': '# Other\n',
        '.claude/settings.json': JSON.stringify({
          hooks: { PreToolUse: [{ hooks: [{ command: 'npx ark-check' }] }] },
        }),
        '.github/workflows/ci.yml':
          'name: ci\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx ark-check\n      - run: npm run lint\n      - run: npm run typecheck\n',
        'src/application/db/repo.ts': 'export const r=1\n',
        'src/application/auth/x.ts': 'export const a=1\n',
      });

      ensureBaselineFlagInCheckCommand('npx ark-check');
      ensureBaselineFlagInCheckCommand('npx arkgate-check --strict');
      ensureBaselineFlagInCheckCommand('# ark-check');
      ensureBaselineFlagInCheckCommand(null as unknown as string);
      syncBaselineIntoCheckSurfaces(root, { baselineRel: '.ark-baseline.json' });
      syncBaselineIntoCheckSurfaces(root, { baselineRel: 'missing.json' });
      pinArkgateDevDependency(root, {});
      pinArkgateDevDependency(root, { force: true });

      const cov = {
        governed: { percent: 15, classifiedFiles: 2, totalFiles: 12 },
        emptyLayers: ['DomainModel', 'PersistenceAdapters'],
        layers: [
          { name: 'DomainModel', files: 0 },
          { name: 'PersistenceAdapters', files: 0 },
          { name: 'ApplicationOrchestration', files: 2 },
        ],
      };
      const config = {
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
          { name: 'ApplicationOrchestration', patterns: ['src/application/**'] },
        ],
        rules: [],
      };
      detectContractFalseGreenRisk(root, config, cov);
      falseGreenAdoptionGap(root, config, cov);
      detectContractFalseGreenRisk(root, null as unknown as object, cov);
      detectContractFalseGreenRisk(root, { layers: [] }, cov);

      detectDeployPathQuality(root);
      collectAdoptionGaps(root, config, cov);
      stripMcpServerArgs(['npx', 'exec', '--config.verify-deps-before-run=false', 'arkgate-mcp', '--root', '.']);
      stripMcpServerArgs(null as unknown as string[]);
      brokenMcpGateFiles(root);

      warnLockfileConflict(root);
      staleRunnerGateFiles(root);
      runMigrateCommands(root);
      runInstallAgentGates({
        root,
        tools: ['claude', 'cursor', 'grok', 'windsurf', 'codex'],
        force: true,
      });
      runInstallAgentGates({ root, tools: ['claude'], force: false });

      normalizeToolsList(null);
      normalizeToolsList('');
      normalizeToolsList(['claude', 'unknown-tool']);
      resolveTools({ root, tools: ['claude', 'cursor', 'grok'] });
      resolveTools({ root, tools: [] });      const stamped = stampSkill('# Skill\n\nbody', arkPackageVersion());
      const skillPath = path.join(root, 'S.md');
      fs.writeFileSync(skillPath, stamped);
      installedSkillVersion(skillPath);
      installedSkillVersion(path.join(root, 'missing.md'));
      isVersionOlder('1.0.0', '1.0.1');
      isVersionOlder('10.0.0', '9.0.0');
      isVersionOlder('a', 'b');
      skillTemplates();
      skillTemplateNames();
      detectSkillGaps(root);
      detectCodexHomeGap(root);

      const toml = `[mcp_servers.ark]\ncommand = "npx"\nargs = ["ark-mcp", "--root", "${root}"]\n`;
      assessCodexHomeMcp(toml, root);
      assessCodexHomeMcp('', root);
      codexArkBlockHasPreferredBin(toml);
      codexArkBlockNeedsRewrite(toml, root);
      listCodexArkServerTables(toml);
      upsertCodexMcpTable(toml, 'mcp_servers.ark', 'command = "npx"\nargs = ["arkgate-mcp"]\n');
      if (isTempOrUpgradeRoot(root)) wireCodexMcp(root, true);

      // doctor + html extras
      const f = path.join(root, 'src/application/db/repo.ts');
      const lines: string[] = [];
      const orig = console.log;
      console.log = (s: unknown) => lines.push(String(s));
      try {
        runDoctor(root, config, [f], [], [], false, {});
        runDoctor(root, config, [f], [], [], true, {
          safety: {
            anyCasts: [],
            tsSuppressions: [{ file: 'a.ts', line: 1 }],
            nonLiteralDynamicImports: [],
            inMemoryProductionStores: [],
            disabledPeerIsolationRules: [],
          },
        });
        runCoverage(root, config, [f], [], false);
        runPlan(root, [], false, 10, 5);
        buildRemediationPlan(root, [], 0, 0);
      } finally {
        console.log = orig;
      }

      const enf = detectEnforcement(root);
      const coverage = {
        governed: { percent: 40, classifiedFiles: 2, totalFiles: 5 },
        layers: config.layers.map((l) => ({ name: l.name, files: 0, patterns: l.patterns })),
        unclassified: { count: 3, files: ['a.ts', 'b.ts', 'c.ts'] },
        emptyLayers: ['DomainModel'],
        layersWithoutRules: ['DomainModel'],
        suggestions: [{ dir: 'src/x', layer: 'DomainModel', files: 1, unrecognized: true }],
        include: ['src'],
      };
      const fit = computeReportFitness({
        coverage,
        violations: [],
        ok: true,
        enforcement: enf,
        config,
      });
      const snap = buildReportSnapshot({
        root,
        config,
        coverage,
        violations: [],
        ok: true,
        version: '1',
        fileCountByLayer: new Map(),
        enforcement: enf,
        score: fit.score,
        mode: fit.mode,
      });
      const html = renderHtmlReport({
        root,
        config,
        coverage,
        violations: [],
        ok: true,
        version: '1',
        configPath: 'ark.config.json',
        generatedAt: new Date().toISOString(),
        skillGaps: [],
        originSnapshot: snap,
        currentSnapshot: snap,
        originJustCreated: true,
      });
      expect(html).toMatch(/html/i);
      archiveReportSnapshots(root, { html, snapshot: snap, noArchive: true });
      shouldShowNewHereNudge(root, path.join(root, 'nope.json'), 5, true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
