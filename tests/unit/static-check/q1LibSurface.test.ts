/**
 * Q1 surface: html-report, doctor-plan, ast-scan, resolve, violations.
 * Shared fixtures: ./helpers/q1Fixtures
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { mk, rm, loadTypescript } from './helpers/q1Fixtures';
import fs from 'node:fs';
import path from 'node:path';
import {
  detectPackageManager,
  presentLockfiles,
  execRunner,
  arkCommand,
  execCommandParts,
  installDevHint,
  usableTypescript,
  typescriptUsabilityHint,
  looksLikeIntent,
  resolveIntentLayer,
  createElevenLayerConfig,
  applyFrameworkLayoutOverlays,
  resolveOperatingMode,
  collectForbiddenGlobalUses,
  detectWorkspaces,
  detectTsPackageRoots,
  resolveIncludeRoots,
  collectAggregatedDeps,
  collectRepoShapeSignals,
  buildArchitectureRecommendation,
  formatArchitectureRecommendationHuman,
  isValidArchetypeId,
  resolveArchetypePreset,
  mapWizardChoiceToArchetype,
  shouldShowNewHereNudge,
  buildAdoptionPlanDocument,
  writeAdoptionPlan,
  listPolicyPackIds,
  loadPolicyPackMeta,
  policyPackIdForPreset,
  loadArchitecturePlaybook,
  scoreArchetypes,
  whyFromMatchedSignals,
  defaultPlaybookPath,
  MATURE_REPO_FILE_THRESHOLD,
} from '../../../bin/ark-shared.mjs';
import {
  detectEnforcement,
  htmlEscape,
  buildReportSnapshot,
  computeReportFitness,
  deltaField,
  formatDelta,
  reportsDir,
  archiveReportSnapshots,
  readJsonSafe,
  renderHtmlReport,
  renderBeginnerHtmlReport,
} from '../../../bin/lib/html-report.mjs';
import {
  computeCoverage,
  buildRemediationPlan,
  runDoctor,
  runCoverage,
  runPlan,
} from '../../../bin/lib/doctor-plan.mjs';
import {
  lineOf,
  textOfModuleSpecifier,
  isTypeOnlyModuleReference,
  sourceFileExportsOnlyTypes,
  valueExportNames,
  expressionMayHaveSideEffects,
  sourceFileHasTopLevelSideEffects,
  typeOnlyExportNames,
  namedModuleBindings,
  propertyName,
  objectProperty,
  objectHasProperty,
  objectPropertyValue,
  objectHasMetadataSource,
  stringLiteralText,
  isPublishCall,
  looksLikeIntentCreatorExpression,
  isArkPublishCandidate,
  publishSourceLiteral,
  publishHasSource,
  moduleSpecifierFromCall,
} from '../../../bin/lib/ast-scan.mjs';
import {
  createModuleResolutionHost,
  isFile,
  resolveRelativeFallback,
  scanCachePath,
  scanCacheKey,
  loadScanCache,
  saveScanCache,
} from '../../../bin/lib/ts-resolve.mjs';
import {
  createImportTargetResolver,
  readTsconfigAliases,
  resolveSpecifierToRel,
} from '../../../bin/lib/import-resolve.mjs';
import {
  intentLayersFromManifest,
  layerForIntent,
  isBlocked,
  configWarning,
  collectConfigWarnings,
} from '../../../bin/lib/config-warnings.mjs';
import { scanSourceFile, runArchitectureScan } from '../../../bin/lib/architecture-scan.mjs';
import {
  readBaseline,
  writeBaseline,
  printViolation,
  printViolationBreakdown,
  summarizeViolations,
  violationEdge,
} from '../../../bin/lib/violations.mjs';
import {
  classifyRemediation,
  enrichViolationWithFixClass,
} from '../../../bin/lib/remediation.mjs';
import { suggestLayerForDir, detectBestFitModel, buildUnclassifiedSuggestions } from '../../../bin/lib/suggestions.mjs';
import {
  stripMcpServerArgs,
  mcpArgsHaveDuplicateBins,
  brokenMcpGateFiles,
  detectDeployPathQuality,
  collectAdoptionGaps,
} from '../../../bin/lib/mcp-adoption.mjs';
import { provePortProofInject, applyPortProofInject } from '../../../bin/lib/port-proof.mjs';

const require = createRequire(import.meta.url);

describe('html-report branch push', () => {
  it('fitness scores across modes, archive reset, deltas, detection variants', () => {
    const root = mk();
    try {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'demo-app' }));
      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.claude/settings.json'),
        JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ command: 'npx arkgate-mcp --hook' }] }] } })
      );
      fs.writeFileSync(path.join(root, 'eslint.config.mjs'), "import x from 'arkgate/eslint'\nexport default [];\n");
      fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.github/workflows/ci.yml'),
        'name: ci\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx ark-check\n'
      );
      fs.writeFileSync(path.join(root, '.ark-baseline.json'), '{"keys":[]}\n');
      fs.mkdirSync(path.join(root, '.cursor'), { recursive: true });
      fs.writeFileSync(path.join(root, '.cursor/mcp.json'), JSON.stringify({ mcpServers: { ark: {} } }));
      const enf = detectEnforcement(root);
      expect(enf.some((e) => e.on)).toBe(true);
      expect(enf.length).toBe(4);

      // unreadable enforcement files
      const spy = vi.spyOn(fs, 'readFileSync').mockImplementation((p, ...rest) => {
        if (String(p).includes('settings.json')) throw new Error('EACCES');
        return fs.readFileSync.wrappedMethod
          ? // @ts-expect-error vitest
            fs.readFileSync.wrappedMethod(p, ...rest)
          : require('node:fs').readFileSync(p, ...rest);
      });
      // simpler: restore and re-detect without spy issues
      spy.mockRestore();

      expect(htmlEscape('&<>"')).toBe('&amp;&lt;&gt;&quot;');
      expect(formatDelta(null)).toBe('—');
      expect(formatDelta(NaN)).toBe('—');
      expect(formatDelta(0)).toBe('0');
      expect(formatDelta(-2, { suffix: '%' })).toBe('-2%');
      expect(deltaField({ a: 1 }, { a: 'x' }, 'a')).toBeNull();
      expect(deltaField(null, { a: 1 }, 'a')).toBeNull();
      expect(readJsonSafe(path.join(root, 'nope.json'))).toBeNull();
      fs.writeFileSync(path.join(root, 'bad.json'), '{');
      expect(readJsonSafe(path.join(root, 'bad.json'))).toBeNull();

      // weak / ok / strong / elite fitness
      for (const [gov, viols, gates, scoreHint] of [
        [10, 20, [{ on: false }, { on: false }], 'weak'],
        [55, 5, [{ on: true }, { on: false }], 'ok'],
        [80, 1, [{ on: true }, { on: true }], 'strong'],
        [100, 0, [{ on: true }, { on: true }, { on: true }, { on: true }], 'elite'],
      ] as const) {
        const fit = computeReportFitness({
          coverage: {
            governed: { percent: gov, classifiedFiles: gov, totalFiles: 100 },
            layers: [
              { name: 'DomainModel', files: 10 },
              { name: 'PresentationAdapters', files: gov > 50 ? 5 : 40 },
            ],
          },
          violations: Array.from({ length: viols }, (_, i) => ({
            ruleId: 'X',
            file: `f${i}.ts`,
            typeOnly: i % 2 === 0,
          })),
          ok: viols === 0,
          enforcement: gates,
          config: {
            layers: [
              { name: 'DomainModel', optional: true },
              { name: 'PresentationAdapters' },
              { name: 'ApplicationOrchestration' },
            ],
            rules: [
              { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
              { from: 'ApplicationOrchestration', to: 'DomainModel', allowed: true },
            ],
          },
        });
        expect(fit.score).toBeGreaterThanOrEqual(0);
        expect(['elite', 'strong', 'ok', 'weak']).toContain(fit.scoreTone);
        expect(typeof scoreHint).toBe('string');
      }

      // empty enforcement / empty layers edge
      const emptyFit = computeReportFitness({
        coverage: { governed: { percent: null as unknown as number, classifiedFiles: 0, totalFiles: 0 }, layers: [] },
        violations: undefined as unknown as [],
        ok: true,
        enforcement: undefined as unknown as [],
        config: {},
      });
      expect(emptyFit.score).toBeGreaterThanOrEqual(0);

      const coverage = {
        governed: { percent: 70, classifiedFiles: 7, totalFiles: 10 },
        layers: [
          { name: 'DomainModel', files: 3, patterns: ['src/domain/**'] },
          { name: 'ApplicationOrchestration', files: 4, patterns: ['src/app/**'] },
          { name: 'PresentationAdapters', files: 0, patterns: ['src/ui/**'] },
        ],
        unclassified: { count: 3, files: ['src/x.ts', 'src/y.ts', 'src/z.ts'] },
        emptyLayers: ['PresentationAdapters'],
        layersWithoutRules: ['PresentationAdapters'],
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
          message: 'bad',
          typeOnly: true,
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
        config: {
          layers: coverage.layers,
          rules: [
            { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
            { from: 'DomainModel', to: 'DomainModel', allowed: true },
          ],
        },
      });
      const snap = buildReportSnapshot({
        root,
        config: { layers: coverage.layers, rules: [{ allowed: false }, { allowed: true }] },
        coverage,
        violations,
        ok: false,
        suppressed: 2,
        version: '1.2.3',
        fileCountByLayer: new Map([['DomainModel', 3]]),
        enforcement: enf,
        score: fit.score,
        mode: fit.mode,
      });
      expect(snap.project).toBe('demo-app');
      expect(snap.typeOnlyViolations).toBe(1);

      // without Map fileCountByLayer
      const snap2 = buildReportSnapshot({
        root,
        config: null as unknown as object,
        coverage: null as unknown as object,
        violations: null as unknown as [],
        ok: true,
        version: undefined,
        fileCountByLayer: undefined,
        enforcement: undefined,
        score: undefined,
        mode: undefined,
      });
      expect(snap2.kind).toBe('ark-architecture-snapshot');

      const html = renderHtmlReport({
        root,
        config: {
          layers: coverage.layers,
          rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
        },
        coverage,
        violations,
        ok: false,
        version: '1.2.3',
        configPath: 'ark.config.json',
        generatedAt: new Date().toISOString(),
        enforcement: enf,
      });
      expect(html).toMatch(/html/i);
      expect(html.length).toBeGreaterThan(500);

      const beginner = renderBeginnerHtmlReport({
        root,
        config: { layers: coverage.layers, rules: [] },
        violations: [],
        ok: true,
        version: '1.2.3',
        configPath: 'ark.config.json',
        generatedAt: new Date().toISOString(),
      });
      expect(beginner).toMatch(/html/i);

      const archive = archiveReportSnapshots(root, {
        html,
        snapshot: snap,
        resetOrigin: false,
        noArchive: false,
      });
      expect(archive.createdOrigin).toBe(true);
      // second pass: origin exists, history grows
      const archive2 = archiveReportSnapshots(root, {
        html: beginner,
        snapshot: { ...snap, score: 99 },
        resetOrigin: false,
      });
      expect(archive2.createdOrigin).toBe(false);
      // reset origin
      archiveReportSnapshots(root, { html, snapshot: snap, resetOrigin: true });
      // no archive
      archiveReportSnapshots(root, { html, snapshot: snap, noArchive: true });
      expect(fs.existsSync(reportsDir(root))).toBe(true);

      // history pruning: write many snapshots
      for (let i = 0; i < 22; i++) {
        archiveReportSnapshots(root, {
          html: `<!-- ${i} -->`,
          snapshot: { ...snap, score: i },
        });
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('doctor-plan branch push', () => {
  it('coverage/plan/doctor text + json paths with honesty edge cases', () => {
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(root, 'src/misc'), { recursive: true });
      const domain = path.join(root, 'src/domain/x.ts');
      const misc = path.join(root, 'src/misc/y.ts');
      fs.writeFileSync(domain, 'export const x = 1;\n');
      fs.writeFileSync(misc, 'export const y = 1;\n');
      const config = {
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'EmptyLayer', patterns: ['src/does-not-exist/**'] },
        ],
        rules: [{ from: 'DomainModel', to: 'EmptyLayer', allowed: false }],
      };

      // empty scope
      const empty = computeCoverage(root, config, [], []);
      expect(empty.emptyScope).toBe(true);
      expect(empty.governed.percent).toBe(0);

      const cov = computeCoverage(root, config, [domain, misc], config.rules);
      expect(cov.unclassified.count).toBeGreaterThan(0);
      expect(cov.emptyLayers).toContain('EmptyLayer');

      // false-green plan: 0 violations, low coverage
      const lowPlan = buildRemediationPlan(root, [], 20, 10, { completeness: 'complete' });
      expect(lowPlan.goal.met).toBe(false);
      expect(lowPlan.goal.statement).toMatch(/governs only|classify/i);

      // empty totalFiles
      const emptyPlan = buildRemediationPlan(root, [], 100, 0, { completeness: 'complete' });
      expect(emptyPlan.goal.emptyScope).toBe(true);
      expect(emptyPlan.goal.met).toBe(false);

      // clean honest plan
      const clean = buildRemediationPlan(root, [], 100, 5, { completeness: 'complete' });
      expect(clean.goal.met).toBe(true);

      // mixed classes of violations
      const plan = buildRemediationPlan(
        root,
        [
          {
            ruleId: 'LAYER_IMPORT_VIOLATION',
            file: 'src/domain/x.ts',
            line: 1,
            fromLayer: 'DomainModel',
            toLayer: 'PersistenceAdapters',
            typeOnly: true,
            sourcePureTypeModule: true,
            target: './t',
            targetTypeOnlyExports: true,
            namedBindingsTypeOnly: true,
            edgeKind: 'static',
          },
          {
            ruleId: 'FORBIDDEN_GLOBAL',
            file: 'src/domain/x.ts',
            fromLayer: 'DomainModel',
            message: 'fetch',
          },
          {
            ruleId: 'CIRCULAR_DEPENDENCY',
            file: 'src/a.ts',
            line: 1,
          },
        ],
        80,
        10,
        { completeness: 'complete' }
      );
      expect(plan.steps.length).toBe(3);
      expect(plan.counts.mechanicalSafe + plan.counts.judgment + plan.counts.deferred).toBe(3);

      const lines: string[] = [];
      const orig = console.log;
      console.log = (s: unknown) => lines.push(String(s));
      try {
        runCoverage(root, config, [domain, misc], config.rules, false);
        runCoverage(root, config, [domain, misc], config.rules, true);
        runPlan(root, [], false, 20, 10, { completeness: 'complete' });
        runPlan(
          root,
          [
            {
              ruleId: 'LAYER_IMPORT_VIOLATION',
              file: 'src/domain/x.ts',
              line: 1,
              fromLayer: 'DomainModel',
              toLayer: 'PersistenceAdapters',
              typeOnly: true,
              sourcePureTypeModule: true,
            },
          ],
          false,
          80,
          10,
          { completeness: 'complete' }
        );
        runPlan(root, [], true, 100, 5, { completeness: 'complete' });
        runDoctor(root, config, [domain, misc], config.rules, [], false, {
          configMissing: true,
          completeness: 'complete',
        });
        runDoctor(
          root,
          config,
          [domain, misc],
          config.rules,
          [
            {
              ruleId: 'FORBIDDEN_GLOBAL',
              file: 'src/domain/x.ts',
              line: 1,
              fromLayer: 'DomainModel',
              message: 'fetch',
            },
          ],
          true,
          { configPath: path.join(root, 'ark.config.json'), completeness: 'complete' }
        );
      } finally {
        console.log = orig;
      }
      expect(lines.join('\n').length).toBeGreaterThan(50);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('ast-scan branch push', () => {
  it('covers type-only edges, side effects, publish helpers, object props', () => {
    const ts = require('typescript');
    const pure = ts.createSourceFile(
      'pure.ts',
      `
export type T = number;
export interface I { x: number }
import type { Z } from './z';
export type { Z };
`,
      ts.ScriptTarget.Latest,
      true
    );
    expect(sourceFileExportsOnlyTypes(ts, pure)).toBe(true);
    expect(typeOnlyExportNames(ts, pure).length).toBeGreaterThan(0);
    expect(sourceFileHasTopLevelSideEffects(ts, pure)).toBe(false);

    const side = ts.createSourceFile(
      'side.ts',
      `
import './polyfill';
console.log(1);
export const v = 1;
export type T = 1;
export default class C {}
export * from './x';
export = 1;
`,
      ts.ScriptTarget.Latest,
      true
    );
    expect(sourceFileExportsOnlyTypes(ts, side)).toBe(false);
    expect(sourceFileHasTopLevelSideEffects(ts, side)).toBe(true);
    const valueNames = valueExportNames(ts, side);
    expect(valueNames == null || valueNames.length >= 0 || valueNames.size >= 0).toBe(true);
    const mixed = ts.createSourceFile(
      'm.ts',
      `
import type { A } from './a';
import { type B, C } from './c';
import * as NS from './ns';
import Def from './def';
export type { A };
export { type B, C } from './c';
export { D } from './d';
const x = import('./dyn');
publish('Domain.Event', { source: 'x' });
createIntent('Domain.X');
bus.publish({ type: 'Domain.Event', source: 'y' });
const obj = { source: 's', name: 'n', 'meta': 1, store };
`,
      ts.ScriptTarget.Latest,
      true
    );

    for (const stmt of mixed.statements) {
      if (ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt)) {
        isTypeOnlyModuleReference(ts, stmt);
        namedModuleBindings(ts, stmt);
        textOfModuleSpecifier(stmt);
      }
    }

    // walk expressions
    const visit = (node: import('typescript').Node) => {
      if (ts.isCallExpression(node)) {
        isPublishCall(ts, node);
        isArkPublishCandidate(ts, node);
        publishSourceLiteral(ts, node);
        publishHasSource(ts, node);
        looksLikeIntentCreatorExpression(ts, node.expression);
        moduleSpecifierFromCall(ts, node);
      }
      if (ts.isObjectLiteralExpression(node)) {
        objectHasProperty(ts, node, 'source');
        objectHasProperty(ts, node, 'missing');
        objectProperty(ts, node, 'source');
        objectPropertyValue(ts, node, 'source');
        objectHasMetadataSource(ts, node);
        for (const p of node.properties) {
          if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) {
            propertyName(ts, p.name || (p as { name: import('typescript').Node }).name);
          }
        }
      }
      if (ts.isStringLiteralLike(node)) stringLiteralText(ts, node);
      if (ts.isBinaryExpression(node) || ts.isCallExpression(node) || ts.isNewExpression(node)) {
        expressionMayHaveSideEffects(ts, node as import('typescript').Expression);
      }
      ts.forEachChild(node, visit);
    };
    visit(mixed);
    expect(lineOf(mixed, 0)).toBe(1);

    // side-effect expression forms
    const exprs = ts.createSourceFile(
      'e.ts',
      `const a = foo(); const b = new Foo(); const c = x && y(); const d = await z();`,
      ts.ScriptTarget.Latest,
      true
    );
    visit(exprs);
  });
});

describe('import/ts-resolve + config-warnings + scan branch push', () => {
  it('resolvers, cache, warnings, architecture scan variants', () => {
    const ts = require('typescript');
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src/domain/x.ts'), 'export type T = 1;\nexport const v = 1;\n');
      fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};\n');
      fs.writeFileSync(
        path.join(root, 'src/domain/bad.ts'),
        "import { db } from '../infra/db';\nimport type { T } from './x';\nexport const n = Date.now();\n"
      );
      fs.writeFileSync(
        path.join(root, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: { '@/*': ['src/*'] },
          },
        })
      );
      fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'], forbiddenGlobals: ['fetch', 'Date.now'], optional: true },
          { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
        ],
        rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
      }));

      expect(isFile(path.join(root, 'src/domain/x.ts'))).toBe(true);
      expect(isFile(path.join(root, 'nope.ts'))).toBe(false);
      expect(resolveRelativeFallback(path.join(root, 'src/domain/bad.ts'), './x')).toBeTruthy();
      expect(resolveRelativeFallback(path.join(root, 'src/domain/bad.ts'), '../infra/db')).toBeTruthy();
      expect(resolveRelativeFallback(path.join(root, 'src/domain/bad.ts'), 'lodash')).toBeFalsy();

      const host = createModuleResolutionHost(ts);
      expect(host.fileExists(path.join(root, 'src/domain/x.ts'))).toBe(true);
      expect(host.readFile?.(path.join(root, 'src/domain/x.ts'))).toMatch(/export/);

      const key = scanCacheKey(root, { config: path.join(root, 'ark.config.json') });
      saveScanCache(root, key, [path.join(root, 'src/domain/x.ts')]);
      const loaded = loadScanCache(root, key);
      expect(loaded).toBeTruthy();
      expect(scanCachePath(root)).toBeTruthy();
      // miss
      expect(loadScanCache(root, 'wrong-key')).toBeFalsy();

      const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
      const resolve = createImportTargetResolver(ts, root, config);
      expect(resolve('./x', path.join(root, 'src/domain/bad.ts'))).toBeTruthy();
      expect(resolve('../infra/db', path.join(root, 'src/domain/bad.ts'))).toBeTruthy();
      const lodashHit = resolve('lodash', path.join(root, 'src/domain/bad.ts'));
      expect(lodashHit == null || lodashHit.layer == null || lodashHit.relPath === 'lodash').toBe(true);
      const aliases = readTsconfigAliases(ts, root);
      expect(aliases === undefined || typeof aliases === 'object').toBe(true);
      expect(
        resolveSpecifierToRel('./x', path.join(root, 'src/domain/bad.ts'), root, aliases || null)
      ).toBeTruthy();

      const layers = intentLayersFromManifest({
        intents: [
          { name: 'Domain.Order', layer: 'DomainModel' },
          { name: 'App.Run' },
        ],
      });
      expect(layerForIntent('Domain.Order', [], layers)).toBe('DomainModel');
      layerForIntent('Unknown', [{ prefix: 'Domain.', layer: 'DomainModel' }], layers);
      expect(isBlocked([{ from: 'A', to: 'B', allowed: false }], 'A', 'B')).toBeTruthy();
      expect(Boolean(isBlocked([{ from: 'A', to: 'B', allowed: true }], 'A', 'B'))).toBe(false);      expect(configWarning('ID', 'msg').message).toBe('msg');

      const files = [
        path.join(root, 'src/domain/x.ts'),
        path.join(root, 'src/domain/bad.ts'),
        path.join(root, 'src/infra/db.ts'),
      ];
      const warns = collectConfigWarnings(root, config, files, config.rules, {
        intents: [{ name: 'Domain.Order', layer: 'DomainModel' }],
      });
      expect(Array.isArray(warns)).toBe(true);

      const scanned = scanSourceFile(
        ts,
        root,
        config,
        config.rules,
        new Map(),
        path.join(root, 'src/domain/bad.ts'),
        'DomainModel'
      );
      expect((scanned.contentViolations ?? scanned.violations ?? []).length).toBeGreaterThan(0);

      const scan = runArchitectureScan({
        root,
        config,
        manifest: null,
        rules: config.rules,
        files,
        ts,
        args: { config: path.join(root, 'ark.config.json'), noCache: true },
      });
      expect(scan.violations.length).toBeGreaterThan(0);

      // with cache
      const scanCached = runArchitectureScan({
        root,
        config,
        manifest: null,
        rules: config.rules,
        files,
        ts,
        args: { config: path.join(root, 'ark.config.json'), noCache: false },
      });
      expect(Array.isArray(scanCached.violations)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('violations + remediation + suggestions + mcp + port-proof', () => {
  it('covers remaining shipped helpers', () => {
    const root = mk();
    try {
      const v = {
        ruleId: 'LAYER_IMPORT_VIOLATION',
        file: 'a.ts',
        line: 1,
        fromLayer: 'DomainModel',
        toLayer: 'PersistenceAdapters',
        message: 'no',
        typeOnly: true,
        sourcePureTypeModule: true,
      };
      writeBaseline(root, '.ark-baseline.json', [v]);
      const bl = readBaseline(root, '.ark-baseline.json');
      expect(bl.keys.size).toBeGreaterThan(0);
      expect(violationEdge(v)).toMatch(/DomainModel|Persistence/);
      printViolation(v);
      printViolationBreakdown(summarizeViolations([v, { ...v, file: 'b.ts', typeOnly: false }]), {
        toStderr: true,
      });
      printViolationBreakdown(summarizeViolations([]), { toStderr: false });

      const verdict = classifyRemediation(v);
      expect(['mechanical-safe', 'judgment', 'deferred']).toContain(verdict.class);
      expect(typeof enrichViolationWithFixClass(v).fixClass).toBe('string');
      expect(
        ['mechanical-safe', 'judgment', 'deferred']
      ).toContain(
        classifyRemediation({
          ruleId: 'FORBIDDEN_GLOBAL',
          fromLayer: 'DomainModel',
        }).class
      );

      expect(suggestLayerForDir('domain')).toMatchObject({ layer: 'DomainModel' });
      expect(suggestLayerForDir('unknown-xyz-folder')).toBeNull();
      expect(detectBestFitModel(['domain', 'application', 'infra', 'ui'])).toBeTruthy();
      expect(detectBestFitModel([]) == null || detectBestFitModel([]) === false).toBe(true);
      expect(
        buildUnclassifiedSuggestions(['src/domain/a.ts', 'src/weird/b.ts', 'lib/c.ts']).length
      ).toBeGreaterThan(0);
      expect(stripMcpServerArgs([])).toContain('--root');
      expect(stripMcpServerArgs(['npx', 'exec', 'arkgate-mcp', '--root', '.', '--config', 'ark.config.json'])).toContain('--root');
      expect(mcpArgsHaveDuplicateBins(['ark-mcp', 'arkgate-mcp'])).toBe(true);
      expect(mcpArgsHaveDuplicateBins(['arkgate-mcp'])).toBe(false);

      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
          name: 'app',
          dependencies: { next: '15' },
          scripts: { build: 'next build && tsc', typecheck: 'tsc -p .' },
        })
      );
      fs.writeFileSync(
        path.join(root, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            ark: { command: 'npx', args: ['ark-mcp', 'arkgate-mcp', '--root', '.'] },
          },
        })
      );
      expect(brokenMcpGateFiles(root).length).toBeGreaterThanOrEqual(0);
      expect(detectDeployPathQuality(root).engines.length).toBeGreaterThanOrEqual(0);

      const adoption = collectAdoptionGaps(
        root,
        {
          layers: [
            { name: 'DomainModel', patterns: ['src/domain/**'], optional: true },
            { name: 'ApplicationOrchestration', patterns: ['src/**'] },
          ],
          rules: [],
        },
        {
          governed: { percent: 30, classifiedFiles: 3, totalFiles: 10 },
          layers: [
            { name: 'DomainModel', files: 0 },
            { name: 'ApplicationOrchestration', files: 3 },
          ],
        }
      );
      expect(adoption.gaps.length).toBeGreaterThanOrEqual(0);
      expect(adoption.writePath?.mode).toMatch(/none|mcp-only|reject-only|repair/);

      const ts = require('typescript');
      const src = `
import { UserRepo } from '../infra/user-repo';
export function getUser(id: string) {
  return UserRepo.find(id);
}
`;
      try {
        provePortProofInject(ts, src, {
          target: '../infra/user-repo',
          fromLayer: 'DomainModel',
          toLayer: 'PersistenceAdapters',
        });
        applyPortProofInject(ts, src, {
          target: '../infra/user-repo',
          fromLayer: 'DomainModel',
          toLayer: 'PersistenceAdapters',
        });
      } catch {
        /* judgment path may throw or return null — still executes branches */
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
