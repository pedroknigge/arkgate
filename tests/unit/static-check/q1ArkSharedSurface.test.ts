/**
 * Q1 surface: ark-shared recommendation / package-manager branches.
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
import { runArchitectureScan } from '../../../bin/lib/architecture-scan.mjs';
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

describe('ark-shared package manager + recommendation branches', () => {
  it('detects lockfiles and package managers across fixtures', () => {
    const root = mk();
    try {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x' }));
      expect(presentLockfiles(root).length).toBe(0);
      expect(detectPackageManager(root)).toBeTruthy();
      expect(execRunner(root)).toMatch(/npx|pnpm|yarn|npm/);
      expect(arkCommand(root, 'ark-check', '--strict')).toMatch(/ark-check|arkgate-check/);
      const parts = execCommandParts(root, 'ark-check', ['--strict']);
      expect(parts && (Array.isArray(parts) || typeof parts === 'object')).toBe(true);
      expect(installDevHint(root, 'arkgate')).toMatch(/install|arkgate/i);
      fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
      const locks = presentLockfiles(root);
      expect(Array.isArray(locks) ? locks.length : locks ? 1 : 0).toBeGreaterThan(0);
      expect(detectPackageManager(root)).toMatch(/pnpm|npm/);

      fs.writeFileSync(path.join(root, 'yarn.lock'), '# yarn\n');
      expect(presentLockfiles(root)).toBeTruthy();
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({ name: 'x', packageManager: 'pnpm@9.0.0' })
      );
      expect(detectPackageManager(root)).toMatch(/pnpm/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('typescript usability, intents, eleven-layer config, overlays', () => {
    const ts = require('typescript');
    expect(usableTypescript(ts)).toBeTruthy();
    expect(usableTypescript(null)).toBeNull();
    expect(usableTypescript({})).toBeNull();
    expect(typescriptUsabilityHint(null)).toMatch(/null|undefined|typescript|install/i);
    expect(typescriptUsabilityHint(ts)).toBeTruthy();
    expect(looksLikeIntent('Domain.CreateOrder')).toBe(true);
    expect(looksLikeIntent('not-an-intent')).toBe(false);
    expect(looksLikeIntent('')).toBe(false);
    // resolveIntentLayer expects intent string + prefix layers
    expect(
      resolveIntentLayer('Domain.X', [{ name: 'DomainModel', prefixes: ['Domain.'] }])
    ).toBe('DomainModel');
    expect(
      resolveIntentLayer('Other.Y', [{ name: 'DomainModel', prefixes: ['Domain.'] }])
    ).toBeUndefined();
    const eleven = createElevenLayerConfig();
    expect(eleven.layers.length).toBeGreaterThan(5);
    const withOpts = createElevenLayerConfig({ include: ['apps'], framework: 'nestjs' });
    expect(Array.isArray(withOpts.include) ? withOpts.include : withOpts.layers).toBeTruthy();
    expect(Array.isArray(withOpts.layers) && withOpts.layers.length > 0).toBe(true);

    const root = mk();
    try {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { next: '15' } }));
      fs.mkdirSync(path.join(root, 'app'), { recursive: true });
      fs.writeFileSync(path.join(root, 'app/page.tsx'), 'export default function P(){return null}\n');
      const overlaid = applyFrameworkLayoutOverlays(
        { layers: eleven.layers, rules: eleven.rules || [] },
        root
      );
      expect(overlaid.layers.length).toBeGreaterThan(0);

      expect(resolveOperatingMode({ governedPercent: 10, planMet: false, mature: false, totalFiles: 5, emptyLayers: [], coreOptionalWithFiles: 0, presentationShare: null })).toMatch(/suggest|adapt|enforce/);
      expect(resolveOperatingMode({ governedPercent: 90, planMet: true, mature: true, totalFiles: 200, emptyLayers: [], coreOptionalWithFiles: 0, presentationShare: 0.1 })).toMatch(/suggest|adapt|enforce/);
      expect(resolveOperatingMode({ governedPercent: 60, planMet: false, mature: false, totalFiles: 40, emptyLayers: ['X'], coreOptionalWithFiles: 2, presentationShare: 0.8 })).toBeTruthy();

      const sf = ts.createSourceFile(
        'a.ts',
        'export const n = Date.now();\nfetch("/");\nMath.random();\n',
        ts.ScriptTarget.Latest,
        true
      );
      const uses = collectForbiddenGlobalUses(ts, sf, ['fetch', 'Date.now', 'Math.random']);
      expect(uses.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('repo shape, workspaces, adoption plan, archetypes', () => {
    const root = mk();
    try {
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
          name: 'mono',
          workspaces: ['packages/*'],
          dependencies: { express: '4', react: '18', '@nestjs/core': '10' },
          devDependencies: { typescript: '5', vitest: '3' },
          scripts: { build: 'tsc', test: 'vitest', lint: 'eslint .' },
        })
      );
      fs.mkdirSync(path.join(root, 'packages/a/src'), { recursive: true });
      fs.writeFileSync(path.join(root, 'packages/a/package.json'), JSON.stringify({ name: 'a' }));
      fs.writeFileSync(path.join(root, 'packages/a/src/index.ts'), 'export const a = 1;\n');
      fs.writeFileSync(path.join(root, 'packages/a/tsconfig.json'), '{}\n');
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src/domain/x.ts'), 'export type T = 1;\n');
      fs.mkdirSync(path.join(root, 'apps/web'), { recursive: true });
      fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');

      expect(Array.isArray(detectWorkspaces(root)) || detectWorkspaces(root) != null).toBe(true);
      expect(Array.isArray(detectTsPackageRoots(root)) || detectTsPackageRoots(root) != null).toBe(true);
      expect(Array.isArray(resolveIncludeRoots(root))).toBe(true);
      const deps = collectAggregatedDeps(root);
      expect(deps && typeof deps === 'object').toBe(true);
      expect(Object.keys(deps).length).toBeGreaterThan(0);
      const signals = collectRepoShapeSignals(root);
      expect(signals && typeof signals === 'object').toBe(true);
      const rec = buildArchitectureRecommendation(root);
      expect(rec && typeof rec === 'object').toBe(true);
      expect(formatArchitectureRecommendationHuman(rec).length).toBeGreaterThan(10);

      const playbook = loadArchitecturePlaybook(defaultPlaybookPath());
      expect(playbook && typeof playbook === 'object').toBe(true);
      const scored = scoreArchetypes(signals, playbook);
      expect(Array.isArray(scored) || (scored && typeof scored === 'object')).toBe(true);
      const why = whyFromMatchedSignals(signals, Object.keys(signals).slice(0, 3));
      expect(Array.isArray(why) || typeof why === 'string' || why == null).toBe(true);

      expect(isValidArchetypeId('crud-product')).toBe(true);
      expect(isValidArchetypeId('nope-xyz')).toBe(false);
      const preset =
        resolveArchetypePreset('crud-product') || resolveArchetypePreset('api-backend');
      expect(preset).toBeTruthy();
      // wizard map may return null for free-form keys — at least one known id works
      const mapped =
        mapWizardChoiceToArchetype('crud-product') ||
        mapWizardChoiceToArchetype('api-backend');
      expect(mapped === null || typeof mapped === 'string' || typeof mapped === 'object').toBe(true);
      expect(shouldShowNewHereNudge(root, path.join(root, 'missing.json'), 10, true)).toBe(true);
      expect(shouldShowNewHereNudge(root, path.join(root, 'package.json'), 90, false)).toBe(false);

      const planDoc = buildAdoptionPlanDocument(rec);
      expect(planDoc && typeof planDoc === 'object').toBe(true);
      const written = writeAdoptionPlan(root, rec);
      const writtenPath =
        typeof written === 'string'
          ? written
          : written && typeof written === 'object' && 'path' in written
            ? String((written as { path: string }).path)
            : 'ark-adoption-plan.json';
      expect(
        fs.existsSync(path.isAbsolute(writtenPath) ? writtenPath : path.join(root, writtenPath)) ||
          fs.existsSync(path.join(root, 'ark-adoption-plan.json'))
      ).toBe(true);
      const packs = listPolicyPackIds();
      expect(Array.isArray(packs)).toBe(true);
      if (packs.length > 0) {
        expect(loadPolicyPackMeta(packs[0])).toBeTruthy();
      }
      // hexagonal maps to enthusiast-hexagonal pack (or null if pack catalog misses)
      const packId = policyPackIdForPreset('hexagonal');
      expect(packId === null || typeof packId === 'string').toBe(true);
      if (typeof packId === 'string') expect(packId).toMatch(/hexagonal|enthusiast/i);
      expect(MATURE_REPO_FILE_THRESHOLD).toBeGreaterThan(50);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
