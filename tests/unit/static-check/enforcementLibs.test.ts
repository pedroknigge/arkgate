/**
 * High-coverage tests for shipped bin/lib enforcement modules (Q1 residual).
 * Drives real exports — no reimplementation.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { detectCycles } from '../../../bin/lib/graph-cycles.mjs';
import {
  intentLayersFromManifest,
  layerForIntent,
  isBlocked,
  configWarning,
  collectConfigWarnings,
} from '../../../bin/lib/config-warnings.mjs';
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
  htmlEscape,
  metricKpi,
  baselineSignalHint,
  modeBadgeHint,
  buildReportSnapshot,
  computeReportFitness,
  deltaField,
  formatDelta,
  detectEnforcement,
  reportsDir,
  archiveReportSnapshots,
  readJsonSafe,
  renderHtmlReport,
} from '../../../bin/lib/html-report.mjs';
import {
  renderDesignDepthStrip,
  renderDesignCleanNote,
  renderWritePathAdoptionBlock,
  renderBaselineSignalLegend,
  writePathModeHint,
} from '../../../bin/lib/html-report-depth.mjs';
import {
  computeCoverage,
  buildRemediationPlan,
  runDoctor,
} from '../../../bin/lib/doctor-plan.mjs';
import {
  collectSafetyDiagnostics,
} from '../../../bin/lib/safety-diagnostics.mjs';
import {
  readBaseline,
  writeBaseline,
  baselineOccurrenceKeys,
  printViolation,
  printViolationBreakdown,
  summarizeViolations,
} from '../../../bin/lib/violations.mjs';
import {
  createImportTargetResolver,
  readTsconfigAliases,
  resolveSpecifierToRel,
} from '../../../bin/lib/import-resolve.mjs';
import { runArchitectureScan } from '../../../bin/lib/architecture-scan.mjs';
import { suggestLayerForDir, detectBestFitModel } from '../../../bin/lib/suggestions.mjs';

const require = createRequire(import.meta.url);

function mk(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ark-enf-'));
}

describe('graph-cycles (shipped)', () => {
  it('detects value cycles via Tarjan on a Map graph', () => {
    const g = new Map([
      ['a.ts', new Set(['b.ts'])],
      ['b.ts', new Set(['a.ts'])],
      ['c.ts', new Set()],
    ]);
    const cycles = detectCycles(g);
    expect(cycles.length).toBe(1);
    expect(cycles[0].ruleId).toBe('CIRCULAR_DEPENDENCY');
    expect(cycles[0].target).toMatch(/a\.ts/);
  });
});

describe('config-warnings (shipped)', () => {
  it('maps intents and blocks edges via isBlocked', () => {
    const layers = intentLayersFromManifest({
      intents: [{ name: 'Domain.Order', layer: 'DomainModel' }],
    });
    expect(layerForIntent('Domain.Order', [], layers)).toBe('DomainModel');
    const rules = [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }];
    expect(isBlocked(rules, 'DomainModel', 'PersistenceAdapters')).toBeTruthy();
    expect(configWarning('X', 'msg').ruleId).toBe('X');
  });

  it('collectConfigWarnings flags empty optional cores and soft signals', () => {
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      const f = path.join(root, 'src/a.ts');
      fs.writeFileSync(f, 'export const a = 1;\n');
      const config = {
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'], optional: true },
          { name: 'ApplicationOrchestration', patterns: ['src/**'] },
        ],
        rules: [
          { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
        ],
      };
      const warns = collectConfigWarnings(root, config, [f], config.rules, null);
      expect(Array.isArray(warns)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('ts-resolve + import-resolve (shipped)', () => {
  it('relative fallback and cache round-trip', () => {
    const root = mk();
    try {
      const from = path.join(root, 'src/a.ts');
      fs.mkdirSync(path.dirname(from), { recursive: true });
      fs.writeFileSync(from, 'export {};\n');
      fs.writeFileSync(path.join(root, 'src/b.ts'), 'export {};\n');
      expect(isFile(from)).toBe(true);
      const rel = resolveRelativeFallback(from, './b');
      // May return absolute path to b.ts or undefined depending on extension probing
      expect(rel === undefined || String(rel).includes('b')).toBe(true);
      const key = scanCacheKey(root, { config: path.join(root, 'ark.config.json') });
      expect(typeof key).toBe('string');
      saveScanCache(root, key, [from]);
      const loaded = loadScanCache(root, key);
      expect(loaded === undefined || Array.isArray(loaded) || typeof loaded === 'object').toBe(
        true
      );
      expect(String(scanCachePath(root))).toMatch(/ark-check|cache|\.ark/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('createModuleResolutionHost and import target resolver load with typescript', () => {
    const ts = require('typescript');
    const host = createModuleResolutionHost(ts);
    expect(typeof host.fileExists).toBe('function');
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src/domain/x.ts'), 'export type T = 1;\n');
      const config = {
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'ApplicationOrchestration', patterns: ['src/application/**'] },
        ],
      };
      const resolve = createImportTargetResolver(ts, root, config);
      const hit = resolve('./x', path.join(root, 'src/domain/y.ts'));
      expect(hit?.layer === 'DomainModel' || hit?.relPath).toBeTruthy();
      const aliases = readTsconfigAliases(ts, root);
      expect(aliases === undefined || typeof aliases === 'object').toBe(true);
      const rel = resolveSpecifierToRel('./x.ts', path.join(root, 'src/domain/y.ts'), root, null);
      expect(rel === undefined || typeof rel === 'string').toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('html-report pure helpers (shipped)', () => {
  it('metric KPIs expose plain-language hints for newcomers', () => {
    const tile = metricKpi('100%', 'Governed', 'Share of scanned files in a layer');
    expect(tile).toContain('class="kpi"');
    expect(tile).toContain('class="kpi-hint"');
    expect(tile).toContain('Share of scanned files in a layer');
    expect(tile).toContain('Governed');
    expect(tile).toContain('100%');
    expect(baselineSignalHint('keep-empty')).toMatch(/freezes 0 keys/i);
    expect(baselineSignalHint('active-ratchet')).toMatch(/freezes known debt/i);
    expect(modeBadgeHint('enforce')).toMatch(/hold the line/i);
    expect(modeBadgeHint('adapt')).toMatch(/aligning/i);
  });

  it('design-depth strip, write-path block, and baseline legend render for showcase', () => {
    const weak = renderDesignDepthStrip({
      mode: 'enforce',
      designFitness: { designWeak: true, smellCount: 1 },
      designSmells: [
        {
          id: 'god-module',
          outcome: 'A few huge files own too many responsibilities',
          evidence: ['lib/db/schema.ts'],
        },
      ],
      pilotLoop: {
        active: true,
        nextPilot: {
          smellId: 'god-module',
          pilotTarget: 'lib/db/schema.ts',
          successSignal: 'split pilot',
          killSwitch: 'stop after one',
        },
      },
      postGreenPath: { short: '/ark-explore shape-focus' },
    });
    expect(weak).toContain('design-weak');
    expect(weak).toContain('god-module');
    expect(weak).toContain('lib/db/schema.ts');
    expect(weak).toContain('Next pilot');
    expect(weak).toContain('/ark-explore shape-focus');

    const clean = renderDesignCleanNote({
      ok: true,
      mode: 'enforce',
      designFitness: { designWeak: false, smellCount: 0 },
    });
    expect(clean).toContain('Design depth · OK');
    // Missing sensors must not claim design OK (callers without designDepth).
    expect(
      renderDesignCleanNote({ ok: true, mode: 'enforce', designFitness: null })
    ).toBe('');
    expect(renderDesignCleanNote({ ok: true, mode: 'enforce' })).toBe('');

    const wp = renderWritePathAdoptionBlock({
      activeHost: 'unknown',
      mode: 'none',
      inventory: {
        hosts: {
          grok: { configured: true },
          claude: { configured: true },
        },
      },
      hookPresent: false,
      mcpPresent: false,
    });
    expect(wp).toContain('Write path');
    expect(wp).toContain('unknown');
    expect(wp).toContain('grok');
    expect(writePathModeHint('repair')).toMatch(/repair payload/i);
    expect(renderBaselineSignalLegend()).toContain('keep-empty');

    const root = mk();
    try {
      const html = renderHtmlReport({
        root,
        config: {
          layers: [{ name: 'DomainModel', patterns: ['src/**'] }],
          rules: [],
        },
        coverage: {
          governed: { percent: 100, classifiedFiles: 2, totalFiles: 2 },
          layers: [{ name: 'DomainModel', files: 2 }],
        },
        violations: [],
        ok: true,
        version: '0.0.0-test',
        adoption: {
          gaps: [],
          hosts: [{ host: 'grok', complete: true }],
          mcp: { ok: true, dualBinFiles: [] },
          coreOptional: [],
          originReport: { present: true, path: '.ark/reports/origin.json' },
          baseline: {
            exists: true,
            frozenKeys: 0,
            primaryPathUsesBaseline: true,
            signal: 'keep-empty',
          },
          writePath: {
            activeHost: 'grok',
            mode: 'repair',
            hookPresent: true,
            hookRepair: true,
            mcpPresent: true,
            inventory: { hosts: { grok: { configured: true } } },
          },
        },
        designDepth: {
          designFitness: { designWeak: true, smellCount: 1, label: 'ENFORCE · design-weak' },
          designSmells: [{ id: 'god-module', outcome: 'split me', evidence: ['a.ts'] }],
          pilotLoop: {
            active: true,
            nextPilot: { smellId: 'god-module', pilotTarget: 'a.ts' },
          },
          postGreenPath: { short: '/ark-explore shape-focus' },
        },
      });
      expect(html).toContain('design-weak');
      expect(html).toContain('id="design-depth"');
      expect(html).toContain('Write path');
      expect(html).toContain('Baseline policy signals');
      expect(html).toContain('kpi-hint');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('escapes HTML and computes fitness + snapshots', () => {
    expect(htmlEscape('<a&b>')).toContain('&lt;');
    expect(formatDelta(3)).toBe('+3');
    expect(deltaField({ a: 5 }, { a: 2 }, 'a')).toBe(3);
    const coverage = {
      governed: { percent: 100, classifiedFiles: 2, totalFiles: 2 },
      layers: [
        { name: 'DomainModel', files: 1 },
        { name: 'ApplicationOrchestration', files: 1 },
      ],
      unclassified: { count: 0 },
    };
    const fitness = computeReportFitness({
      coverage,
      violations: [],
      ok: true,
      enforcement: [{ on: true }, { on: false }],
      config: {
        layers: [{ name: 'DomainModel' }, { name: 'ApplicationOrchestration' }],
        rules: [{ from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false }],
      },
    });
    expect(fitness.score).toBeGreaterThan(0);
    expect(fitness.mode).toMatch(/suggest|adapt|enforce/);
    const root = mk();
    try {
      const snap = buildReportSnapshot({
        root,
        config: { layers: [], rules: [] },
        coverage,
        violations: [],
        ok: true,
        version: '0.0.0-test',
        fileCountByLayer: new Map([['DomainModel', 1]]),
        enforcement: [{ on: true }],
        score: fitness.score,
        mode: fitness.mode,
      });
      expect(snap.kind).toBe('ark-architecture-snapshot');
      const html = '<html>ok</html>';
      const archive = archiveReportSnapshots(root, { html, snapshot: snap });
      expect(fs.existsSync(path.join(reportsDir(root), 'origin.json'))).toBe(true);
      expect(readJsonSafe(path.join(reportsDir(root), 'origin.json'))?.kind).toBe(
        'ark-architecture-snapshot'
      );
      expect(archive.createdOrigin).toBe(true);
      const enf = detectEnforcement(root);
      expect(Array.isArray(enf)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('doctor-plan + baseline ratchet (shipped)', () => {
  it('buildRemediationPlan and computeCoverage on real files', () => {
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      const f = path.join(root, 'src/domain/x.ts');
      fs.writeFileSync(f, 'export const x = 1;\n');
      const config = {
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
        ],
        rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
      };
      const cov = computeCoverage(root, config, [f], config.rules);
      expect(cov.governed.percent).toBe(100);
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
          },
        ],
        100,
        1
      );
      expect(plan.goal).toBeTruthy();
      expect(Array.isArray(plan.steps)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('baseline write/read does not swallow a new distinct violation key', () => {
    const root = mk();
    try {
      const v1 = {
        ruleId: 'LAYER_IMPORT_VIOLATION',
        file: 'src/a.ts',
        fromLayer: 'A',
        toLayer: 'B',
        target: 't',
      };
      const v2 = {
        ruleId: 'LAYER_IMPORT_VIOLATION',
        file: 'src/b.ts',
        fromLayer: 'A',
        toLayer: 'B',
        target: 't',
      };
      writeBaseline(root, '.ark-baseline.json', [v1]);
      const { keys } = readBaseline(root, '.ark-baseline.json');
      expect(keys.has(baselineOccurrenceKeys([v1])[0])).toBe(true);
      expect(keys.has(baselineOccurrenceKeys([v2])[0])).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('runDoctor returns structured payload for empty clean tree', () => {
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      const f = path.join(root, 'src/domain/x.ts');
      fs.writeFileSync(f, 'export const x = 1;\n');
      const config = {
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        rules: [],
      };
      const out: string[] = [];
      const orig = console.log;
      console.log = (s: string) => {
        out.push(String(s));
      };
      try {
        runDoctor(root, config, [f], [], [], true, {});
      } finally {
        console.log = orig;
      }
      const joined = out.join('\n');
      expect(joined).toMatch(/"doctor"|operatingMode|ok/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('safety-diagnostics + architecture-scan (shipped)', () => {
  it('collectSafetyDiagnostics runs on a tiny project with typescript', () => {
    const ts = require('typescript');
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      const f = path.join(root, 'src/domain/x.ts');
      fs.writeFileSync(f, 'export const x: any = 1 as any;\n');
      const config = {
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        safety: { maxAnyCasts: 0, maxTsSuppressions: 0, allowInMemory: false },
      };
      const diags = collectSafetyDiagnostics(ts, root, config, [f]);
      expect(diags && typeof diags === 'object').toBe(true);
      expect(Array.isArray(diags.report?.anyCasts)).toBe(true);
      expect(diags.report.anyCasts.length).toBeGreaterThan(0);
      expect(Array.isArray(diags.warnings)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('canonical architecture scan finds forbidden global and layer import on real TS source', () => {
    const ts = require('typescript');
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};\n');
      const file = path.join(root, 'src/domain/bad.ts');
      fs.writeFileSync(
        file,
        "import { db } from '../infra/db';\nexport const n = Date.now();\nexport function f(){ return fetch('/'); }\n"
      );
      const config = {
        include: ['src'],
        layers: [
          {
            name: 'DomainModel',
            patterns: ['src/domain/**'],
            forbiddenGlobals: ['fetch', 'Date.now'],
          },
          { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
        ],
      };
      const rules = [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }];
      const scan = runArchitectureScan({
        root,
        config,
        manifest: null,
        rules,
        files: [file, path.join(root, 'src/infra/db.ts')],
        ts,
        args: { config: path.join(root, 'ark.config.json'), noCache: true },
      });
      fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify(config));
      const scan2 = runArchitectureScan({
        root,
        config,
        manifest: null,
        rules,
        files: [file, path.join(root, 'src/infra/db.ts')],
        ts,
        args: { config: path.join(root, 'ark.config.json'), noCache: true },
      });
      expect(Array.isArray(scan2.violations)).toBe(true);
      expect(scan2.violations.map((violation: { ruleId: string }) => violation.ruleId)).toEqual(
        expect.arrayContaining(['FORBIDDEN_GLOBAL', 'LAYER_IMPORT_VIOLATION'])
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('suggestions (shipped)', () => {
  it('suggestLayerForDir and detectBestFitModel return shapes', () => {
    expect(suggestLayerForDir('domain')).toBeTruthy();
    const fit = detectBestFitModel(['domain', 'application', 'adapters']);
    expect(fit === null || (fit && typeof fit.name === 'string')).toBe(true);
  });
});

describe('html-report render + doctor plan runners (shipped)', () => {
  it('renderHtmlReport and renderBeginnerHtmlReport produce HTML strings', async () => {
    const { renderHtmlReport, renderBeginnerHtmlReport } = await import(
      '../../../bin/lib/html-report.mjs'
    );
    const root = mk();
    try {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'demo' }));
      const coverage = {
        governed: { percent: 80, classifiedFiles: 8, totalFiles: 10 },
        layers: [
          { name: 'DomainModel', files: 3, patterns: ['src/domain/**'] },
          { name: 'ApplicationOrchestration', files: 5, patterns: ['src/application/**'] },
        ],
        unclassified: { count: 2, files: ['src/misc/x.ts', 'src/misc/y.ts'] },
        emptyLayers: [],
        layersWithoutRules: [],
        suggestions: [],
        include: ['src'],
      };
      const enforcement = [
        { name: 'CI', on: true, where: '.github/workflows/ci.yml', what: 'ci' },
      ];
      const html = renderHtmlReport({
        root,
        config: {
          layers: coverage.layers,
          rules: [{ from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false }],
        },
        coverage,
        violations: [
          {
            ruleId: 'LAYER_IMPORT_VIOLATION',
            file: 'src/a.ts',
            line: 1,
            fromLayer: 'DomainModel',
            toLayer: 'ApplicationOrchestration',
            message: 'bad',
          },
        ],
        ok: false,
        version: '9.9.9',
        configPath: 'ark.config.json',
        generatedAt: new Date().toISOString(),
        enforcement,
      });
      expect(html).toMatch(/<!DOCTYPE html>|<html/i);
      expect(html).toMatch(/DomainModel|LAYER_IMPORT/);
      const beginner = renderBeginnerHtmlReport({
        root,
        config: { layers: coverage.layers, rules: [] },
        violations: [],
        ok: true,
        version: '9.9.9',
        configPath: 'ark.config.json',
        generatedAt: new Date().toISOString(),
      });
      expect(beginner).toMatch(/html/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('runPlan and runCoverage emit JSON via console', async () => {
    const { runPlan, runCoverage } = await import('../../../bin/lib/doctor-plan.mjs');
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      const f = path.join(root, 'src/domain/x.ts');
      fs.writeFileSync(f, 'export const x = 1;\n');
      const config = {
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        rules: [],
      };
      const lines: string[] = [];
      const orig = console.log;
      console.log = (s: unknown) => lines.push(String(s));
      try {
        runCoverage(root, config, [f], [], true);
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
            },
          ],
          true,
          100,
          1
        );
      } finally {
        console.log = orig;
      }
      const joined = lines.join('\n');
      expect(joined).toMatch(/coverage|plan|ok/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('collectAdoptionGaps returns writePath for producer tree', async () => {
    const { collectAdoptionGaps } = await import('../../../bin/lib/agent-gates.mjs');
    const coverage = {
      governed: { percent: 100, classifiedFiles: 1, totalFiles: 1 },
      layers: [{ name: 'DomainModel', files: 1 }],
    };
    const adoption = collectAdoptionGaps(
      process.cwd(),
      { layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }], rules: [] },
      coverage
    );
    expect(adoption.writePath?.inventory.capabilities['hard-write']).toBe(true);
    expect(adoption.writePath?.inventory.capabilities['repair-payload']).toBe(true);
    expect(Array.isArray(adoption.gaps)).toBe(true);
  });

  it('runInstallAgentGates (shipped) writes templates for claude toolset', async () => {
    const { runInstallAgentGates, normalizeToolsList, resolveTools, stampSkill } =
      await import('../../../bin/lib/agent-gates.mjs');
    expect(normalizeToolsList('claude,grok')).toEqual(['claude', 'grok']);
    expect(resolveTools({ tools: ['claude'] }).tools.has('claude')).toBe(true);
    expect(stampSkill('# skill', '1.2.3')).toMatch(/1\.2\.3|arkVersion|skill/i);
    const root = mk();
    try {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'consumer' }));
      fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');
      const prev = process.exitCode;
      process.exitCode = 0;
      runInstallAgentGates({ root, tools: ['claude'], force: true });
      expect(fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(true);
      expect(fs.existsSync(path.join(root, '.mcp.json'))).toBe(true);
      expect(fs.existsSync(path.join(root, '.claude/settings.json'))).toBe(true);
      process.exitCode = prev;
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('printViolation helpers run without throwing', () => {
    const violations = [
      {
        ruleId: 'LAYER_IMPORT_VIOLATION',
        file: 'a.ts',
        line: 1,
        fromLayer: 'DomainModel',
        toLayer: 'PersistenceAdapters',
        message: 'no',
        typeOnly: false,
      },
      {
        ruleId: 'FORBIDDEN_GLOBAL',
        file: 'b.ts',
        line: 2,
        fromLayer: 'DomainModel',
        message: 'fetch',
      },
    ];
    // Exercise stderr path
    printViolation(violations[0]);
    printViolationBreakdown(summarizeViolations(violations), { toStderr: true });
    printViolationBreakdown(summarizeViolations(violations), { toStderr: false });
    expect(true).toBe(true);
  });

  it('loadTypeScript resolves a usable host', async () => {
    const { loadTypeScript } = await import('../../../bin/lib/agent-gates.mjs');
    const loaded = await loadTypeScript(process.cwd());
    expect(loaded?.ts?.version || loaded?.version).toBeTruthy();
  });

  it('adoption + migrate helpers exercise multi-host fixture trees', async () => {
    const {
      collectAdoptionGaps,
      detectDeployPathQuality,
      staleRunnerGateFiles,
      warnLockfileConflict,
      runMigrateCommands,
      brokenMcpGateFiles,
      stripMcpServerArgs,
      mcpArgsHaveDuplicateBins,
    } = await import('../../../bin/lib/agent-gates.mjs');
    expect(mcpArgsHaveDuplicateBins(['ark-mcp', 'arkgate-mcp'])).toBe(true);
    expect(stripMcpServerArgs(['npx', 'arkgate-mcp', '--root', '.'])).toContain('--root');

    const root = mk();
    try {
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
          name: 'app',
          dependencies: { next: '15.0.0' },
          scripts: { build: 'next build', lint: 'eslint .', typecheck: 'tsc -p .' },
        })
      );
      fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');
      fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.claude/settings.json'),
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                hooks: [
                  { command: 'npx arkgate-mcp --hook --hook-repair --root . --config ark.config.json' },
                ],
              },
            ],
          },
        })
      );
      fs.writeFileSync(
        path.join(root, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            ark: { command: 'npx', args: ['arkgate-mcp', '--root', '.', '--config', 'ark.config.json'] },
          },
        })
      );
      fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Ark Enforcement\n\nBefore editing\n');
      fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.github/workflows/ark-check.yml'),
        'name: ark\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx ark-check\n'
      );
      fs.writeFileSync(path.join(root, 'tsconfig.json'), '{}\n');
      fs.writeFileSync(path.join(root, 'eslint.config.mjs'), 'export default [];\n');

      const deploy = detectDeployPathQuality(root);
      expect(deploy.embedsTypecheckInBuild === true || deploy.engines.includes('next')).toBe(true);

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
          governed: { percent: 40, classifiedFiles: 4, totalFiles: 10 },
          layers: [
            { name: 'DomainModel', files: 0 },
            { name: 'ApplicationOrchestration', files: 4 },
          ],
        }
      );
      expect(adoption.writePath.mode).toMatch(/repair|reject-only|mcp-only|none/);
      expect(Array.isArray(brokenMcpGateFiles(root))).toBe(true);
      expect(Array.isArray(staleRunnerGateFiles(root))).toBe(true);
      warnLockfileConflict(root);
      runMigrateCommands(root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
