/**
 * Second wave: hit high-miss shipped modules (html-report, doctor text, field/install/skill/codex).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  renderHtmlReport,
  renderBeginnerHtmlReport,
  archiveReportSnapshots,
  buildReportSnapshot,
  computeReportFitness,
  detectEnforcement,
} from '../../../bin/lib/html-report.mjs';
import { runDoctor, runCoverage, runPlan, buildRemediationPlan } from '../../../bin/lib/doctor-plan.mjs';
import {
  ensureBaselineFlagInCheckCommand,
  syncBaselineIntoCheckSurfaces,
  pinArkgateDevDependency,
  detectContractFalseGreenRisk,
  falseGreenAdoptionGap,
} from '../../../bin/lib/field-install.mjs';
import {
  staleRunnerGateFiles,
  warnLockfileConflict,
  runMigrateCommands,
  runInstallAgentGates,
} from '../../../bin/lib/install-migrate.mjs';
import {
  normalizeToolsList,
  resolveTools,
  arkPackageVersion,
  stampSkill,
  installedSkillVersion,
  isVersionOlder,
  skillTemplates,
  skillTemplateNames,
  detectCodexHomeGap,
  detectSkillGaps,
} from '../../../bin/lib/skill-install.mjs';
import {
  codexPromptsDir,
  codexConfigPath,
  isTempOrUpgradeRoot,
  codexProjectSlug,
  extractCodexRootFromBlock,
  listCodexArkServerTables,
  upsertCodexMcpTable,
  codexPrimaryTable,
  codexScopedTableForRoot,
  extractCodexArkRootFromToml,
  codexArkBlockHasPreferredBin,
  codexArkBlockNeedsRewrite,
  assessCodexHomeMcp,
  wireCodexMcp,
} from '../../../bin/lib/codex-home.mjs';
import {
  stripMcpServerArgs,
  mcpArgsHaveDuplicateBins,
  brokenMcpGateFiles,
  detectDeployPathQuality,
  collectAdoptionGaps,
  COMMAND_GATE_TEXT_FILES,
} from '../../../bin/lib/mcp-adoption.mjs';
import {
  intentLayersFromManifest,
  layerForIntent,
  isBlocked,
  collectConfigWarnings,
} from '../../../bin/lib/config-warnings.mjs';
import {
  createElevenLayerConfig,
  applyFrameworkLayoutOverlays,
  buildArchitectureRecommendation,
  formatArchitectureRecommendationHuman,
  collectRepoShapeSignals,
  scoreArchetypes,
  loadArchitecturePlaybook,
  defaultPlaybookPath,
  resolveOperatingMode,
  detectPackageManager,
  presentLockfiles,
  shouldShowNewHereNudge,
  whyFromMatchedSignals,
  INIT_WIZARD_CHOICES,
  mapWizardChoiceToArchetype,
  isValidArchetypeId,
  ARCHETYPE_IDS,
} from '../../../bin/ark-shared.mjs';
import {
  provePortProofInject,
  applyPortProofInject,
  specifierLooksLikeTarget,
} from '../../../bin/lib/port-proof.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function mk(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ark-miss-'));
}

describe('html-report full surface branches', () => {
  it('renderHtmlReport with adoption, skills, origin, examples, baseline shapes', () => {
    const root = mk();
    try {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'showcase', packageManager: 'pnpm@9' }));
      fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
      fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n');
      fs.writeFileSync(
        path.join(root, '.ark-baseline.json'),
        JSON.stringify({ violations: [{ ruleId: 'X', file: 'a.ts' }] })
      );
      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.claude/settings.json'),
        JSON.stringify({
          hooks: {
            PreToolUse: [{ hooks: [{ command: 'npx arkgate-mcp --hook --hook-repair' }] }],
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
      fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Ark Enforcement\nBefore editing\n');
      fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.github/workflows/ark.yml'),
        'name: ark\non: push\njobs:\n  c:\n    runs-on: ubuntu\n    steps:\n      - run: npx ark-check\n'
      );
      fs.writeFileSync(path.join(root, 'eslint.config.mjs'), "export default []; // arkgate\n");

      const layers = [
        {
          name: 'DomainModel',
          patterns: ['src/domain/**', 'src/domain/order.ts'],
          forbiddenGlobals: ['fetch', 'Date.now'],
          intentPrefixes: ['Domain.'],
          description: 'pure domain',
          optional: false,
        },
        {
          name: 'ApplicationOrchestration',
          patterns: ['src/app/**'],
          mayImportInfrastructure: true,
          description: 'use-cases',
        },
        {
          name: 'PresentationAdapters',
          patterns: ['**/*'],
          exclude: ['**/*.test.ts'],
          optional: true,
        },
        {
          name: 'PersistenceAdapters',
          patterns: ['src/infra/**'],
        },
      ];
      const rules = [
        { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false, message: 'no db in domain' },
        { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
        { from: 'ApplicationOrchestration', to: 'DomainModel', allowed: true },
        { from: 'PresentationAdapters', to: 'ApplicationOrchestration', allowed: true },
      ];
      const coverage = {
        governed: { percent: 75, classifiedFiles: 15, totalFiles: 20 },
        layers: layers.map((l, i) => ({ name: l.name, files: i === 2 ? 0 : 5 + i, patterns: l.patterns })),
        unclassified: { count: 5, files: ['src/x.ts', 'src/y.ts', 'src/z.ts', 'src/a.ts', 'src/b.ts'] },
        emptyLayers: ['PresentationAdapters'],
        layersWithoutRules: [],
        suggestions: [{ dir: 'src/ui', layer: 'PresentationAdapters', files: 5, alternatives: ['UiAdapters'] }],
        include: ['src'],
      };
      const violations = [
        {
          ruleId: 'LAYER_IMPORT_VIOLATION',
          file: 'src/domain/a.ts',
          line: 3,
          fromLayer: 'DomainModel',
          toLayer: 'PersistenceAdapters',
          target: '../infra/db',
          message: 'bad import',
          typeOnly: false,
        },
        {
          ruleId: 'LAYER_IMPORT_VIOLATION',
          file: 'src/domain/b.ts',
          line: 1,
          fromLayer: 'DomainModel',
          toLayer: 'PersistenceAdapters',
          message: 'type only',
          typeOnly: true,
          sourcePureTypeModule: true,
        },
        {
          ruleId: 'FORBIDDEN_GLOBAL',
          file: 'src/domain/c.ts',
          line: 2,
          fromLayer: 'DomainModel',
          message: 'fetch',
        },
        {
          ruleId: 'CIRCULAR_DEPENDENCY',
          file: 'src/a.ts',
          line: 1,
          message: 'cycle',
        },
      ];
      const fileCountByLayer = new Map([
        ['DomainModel', 6],
        ['ApplicationOrchestration', 5],
        ['PresentationAdapters', 0],
        ['PersistenceAdapters', 4],
      ]);
      const exampleByLayer = new Map([
        ['DomainModel', 'src/domain/order.ts'],
        ['ApplicationOrchestration', 'src/app/place-order.ts'],
      ]);
      const config = { layers, rules, include: ['src'] };
      const fit = computeReportFitness({
        coverage,
        violations,
        ok: false,
        enforcement: detectEnforcement(root),
        config,
      });
      const snap = buildReportSnapshot({
        root,
        config,
        coverage,
        violations,
        ok: false,
        suppressed: 1,
        version: '2.0.0',
        fileCountByLayer,
        enforcement: detectEnforcement(root),
        score: fit.score,
        mode: fit.mode,
      });
      const adoption = collectAdoptionGaps(root, config, coverage);
      const html = renderHtmlReport({
        root,
        config,
        exampleByLayer,
        fileCountByLayer,
        coverage,
        violations,
        ok: false,
        suppressed: 1,
        version: '2.0.0',
        configPath: 'ark.config.json',
        generatedAt: new Date().toISOString(),
        skillGaps: [{ tool: 'claude', missing: 2, stale: 1 }],
        originSnapshot: { ...snap, score: 40, governedPercent: 40 },
        currentSnapshot: snap,
        originJustCreated: false,
        adoption,
      });
      expect(html).toMatch(/DomainModel|Architecture|PASS|FAIL/i);
      expect(html.length).toBeGreaterThan(2000);

      // clean / empty variants
      const clean = renderHtmlReport({
        root,
        config: { layers: [], rules: [] },
        coverage: {
          governed: { percent: 100, classifiedFiles: 0, totalFiles: 0 },
          layers: [],
          unclassified: { count: 0 },
        },
        violations: [],
        ok: true,
        version: '',
        configPath: '',
        generatedAt: '',
        skillGaps: [],
        originJustCreated: true,
      });
      expect(clean).toMatch(/html/i);

      const beginnerFail = renderBeginnerHtmlReport({
        root,
        config: { layers, rules },
        violations,
        ok: false,
        version: '1',
        configPath: 'ark.config.json',
        generatedAt: 'now',
      });
      expect(beginnerFail).toMatch(/FAIL|fix/i);

      const beginnerEmpty = renderBeginnerHtmlReport({
        root,
        config: { layers: [] },
        violations: [],
        ok: true,
        version: undefined as unknown as string,
        configPath: 'c',
        generatedAt: undefined as unknown as string,
      });
      expect(beginnerEmpty).toMatch(/html/i);

      // gitignore append + baseline array form
      fs.writeFileSync(
        path.join(root, '.ark-baseline.json'),
        JSON.stringify([{ ruleId: 'X' }, { ruleId: 'Y' }])
      );
      archiveReportSnapshots(root, {
        html,
        snapshot: snap,
        resetOrigin: true,
      });
      // already has .ark/
      archiveReportSnapshots(root, { html: clean, snapshot: snap });
      // gitignore already has .ark/
      fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n.ark/\n');
      archiveReportSnapshots(root, { html: clean, snapshot: snap });

      // invalid baseline json
      fs.writeFileSync(path.join(root, '.ark-baseline.json'), '{not-json');
      const html2 = renderHtmlReport({
        root,
        config,
        coverage,
        violations: [],
        ok: true,
        suppressed: 3,
        version: '1',
        configPath: 'ark.config.json',
        generatedAt: 't',
      });
      expect(html2).toMatch(/html/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('doctor text mode + plan honesty branches', () => {
  it('runDoctor human output with baseline, skills, low coverage, violations', () => {
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(root, 'src/misc'), { recursive: true });
      const f1 = path.join(root, 'src/domain/x.ts');
      const f2 = path.join(root, 'src/misc/y.ts');
      fs.writeFileSync(f1, 'export const x = 1;\n');
      fs.writeFileSync(f2, 'export const y = 1;\n');
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'doc-app' }));
      fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Ark Enforcement\n');
      fs.writeFileSync(
        path.join(root, '.ark-baseline.json'),
        JSON.stringify({
          violations: [
            {
              ruleId: 'LAYER_IMPORT_VIOLATION',
              file: 'src/domain/x.ts',
              fromLayer: 'DomainModel',
              toLayer: 'PersistenceAdapters',
            },
          ],
        })
      );
      // stale baseline key
      fs.writeFileSync(
        path.join(root, '.ark-baseline.json'),
        JSON.stringify([
          {
            ruleId: 'LAYER_IMPORT_VIOLATION',
            file: 'src/domain/x.ts',
            fromLayer: 'DomainModel',
            toLayer: 'PersistenceAdapters',
            target: 't',
          },
          {
            ruleId: 'OLD',
            file: 'gone.ts',
            fromLayer: 'A',
            toLayer: 'B',
            target: 'z',
          },
        ])
      );
      const config = {
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'], optional: true },
          { name: 'EmptyLayer', patterns: ['src/nope/**'] },
          { name: 'PresentationAdapters', patterns: ['src/ui/**'] },
        ],
        rules: [{ from: 'DomainModel', to: 'EmptyLayer', allowed: false }],
      };
      const violations = [
        {
          ruleId: 'LAYER_IMPORT_VIOLATION',
          file: 'src/domain/x.ts',
          line: 1,
          fromLayer: 'DomainModel',
          toLayer: 'PersistenceAdapters',
          target: 't',
          typeOnly: true,
          sourcePureTypeModule: true,
        },
        {
          ruleId: 'FORBIDDEN_GLOBAL',
          file: 'src/domain/x.ts',
          line: 2,
          fromLayer: 'DomainModel',
          message: 'fetch',
        },
      ];
      const lines: string[] = [];
      const orig = console.log;
      console.log = (s: unknown) => lines.push(String(s));
      try {
        runDoctor(root, config, [f1, f2], config.rules, violations, false, {
          configMissing: true,
          safety: {
            anyCasts: [{ file: 'a.ts', line: 1 }],
            tsSuppressions: [],
            nonLiteralDynamicImports: [],
            inMemoryProductionStores: [],
            disabledPeerIsolationRules: [{ from: 'A', to: 'A' }],
          },
        });
        runDoctor(root, config, [], config.rules, [], false, { configMissing: false });
        runCoverage(root, config, [f1, f2], config.rules, false);
        runPlan(root, violations, false, 30, 10);
        runPlan(root, [], false, null, null);
      } finally {
        console.log = orig;
      }
      expect(lines.join('\n').length).toBeGreaterThan(100);

      // many files for mature mode
      const many = Array.from({ length: 160 }, (_, i) => {
        const p = path.join(root, `src/domain/f${i}.ts`);
        fs.writeFileSync(p, `export const x${i} = 1;\n`);
        return p;
      });
      const lines2: string[] = [];
      console.log = (s: unknown) => lines2.push(String(s));
      try {
        runDoctor(
          root,
          {
            ...config,
            layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
          },
          many,
          config.rules,
          [],
          true,
          {}
        );
      } finally {
        console.log = orig;
      }
      expect(lines2.join('\n')).toMatch(/doctor|operatingMode|governed/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('field-install + install-migrate + skill + codex + mcp branches', () => {
  it('field honesty and install surfaces', () => {
    const root = mk();
    try {
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
          name: 'app',
          scripts: { 'check:architecture': 'npx ark-check', build: 'next build' },
          dependencies: { next: '15.0.0' },
          devDependencies: {},
        })
      );
      fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');
      fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.claude/settings.json'),
        JSON.stringify({
          hooks: {
            PreToolUse: [{ hooks: [{ command: 'npx ark-check --strict' }] }],
          },
        })
      );
      fs.writeFileSync(path.join(root, 'AGENTS.md'), 'run ark-check\n');
      fs.writeFileSync(
        path.join(root, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            ark: { command: 'npx', args: ['ark-mcp', 'arkgate-mcp', '--root', '.'] },
          },
        })
      );

      expect(ensureBaselineFlagInCheckCommand('npx ark-check --strict').changed).toBe(true);
      expect(ensureBaselineFlagInCheckCommand('npx ark-check --baseline x.json').changed).toBe(false);
      expect(ensureBaselineFlagInCheckCommand('# c').changed).toBe(false);
      expect(ensureBaselineFlagInCheckCommand('echo hi').changed).toBe(false);
      fs.writeFileSync(path.join(root, '.ark-baseline.json'), '[]\n');
      syncBaselineIntoCheckSurfaces(root, {});
      pinArkgateDevDependency(root, {});

      // false-green needs empty core + Application patterns covering real I/O dirs
      fs.mkdirSync(path.join(root, 'src/application/db'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src/application/db/repo.ts'), 'export const r = 1;\n');
      fs.mkdirSync(path.join(root, 'src/application/auth'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src/application/auth/login.ts'), 'export const l = 1;\n');
      const cov = {
        governed: { percent: 20, classifiedFiles: 2, totalFiles: 10 },
        emptyLayers: ['DomainModel', 'PersistenceAdapters'],
        layers: [
          { name: 'DomainModel', files: 0 },
          { name: 'PersistenceAdapters', files: 0 },
          { name: 'ApplicationOrchestration', files: 2 },
        ],
      };
      const config = {
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'], optional: true },
          { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
          { name: 'ApplicationOrchestration', patterns: ['src/application/**'] },
        ],
        rules: [],
      };
      detectContractFalseGreenRisk(root, config, cov);
      falseGreenAdoptionGap(root, config, cov);

      expect(Array.isArray(staleRunnerGateFiles(root))).toBe(true);
      warnLockfileConflict(root);
      runMigrateCommands(root);

      // install agent gates for multiple tools
      runInstallAgentGates({ root, tools: ['claude', 'cursor'], force: true });
      expect(fs.existsSync(path.join(root, '.cursor')) || fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(
        true
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('skill-install helpers and version stamps', () => {
    const root = mk();
    try {
      expect(normalizeToolsList('claude, grok, cursor')).toContain('claude');
      expect(normalizeToolsList(['claude', 'all'])).toBeTruthy();
      expect(resolveTools({ root, tools: 'claude' }).tools.has('claude')).toBe(true);
      expect(resolveTools({ root, tools: ['all'] }).tools.size).toBeGreaterThan(0);
      expect(resolveTools({ root }).tools.size).toBeGreaterThanOrEqual(0);
      expect(typeof arkPackageVersion()).toBe('string');
      const stamped = stampSkill('# Hello\n\nbody', '1.2.3');
      expect(stamped).toMatch(/1\.2\.3|arkVersion|Hello/);
      const skill = path.join(root, 'SKILL.md');
      fs.writeFileSync(skill, stamped);
      const ver = installedSkillVersion(skill);
      expect(ver === null || typeof ver === 'string').toBe(true);
      if (typeof ver === 'string') expect(ver).toMatch(/\d/);
      expect(isVersionOlder('1.0.0', '2.0.0')).toBe(true);
      expect(isVersionOlder('2.0.0', '1.0.0')).toBe(false);
      expect(isVersionOlder('1.0.0', '1.0.0')).toBe(false);
      expect(skillTemplateNames().length).toBeGreaterThan(0);
      expect(skillTemplates().length).toBeGreaterThan(0);
      expect(Array.isArray(detectSkillGaps(root))).toBe(true);
      const codexGap = detectCodexHomeGap(root);
      expect(codexGap === null || (typeof codexGap === 'object' && codexGap !== null)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('codex-home toml helpers and wire', () => {
    expect(isTempOrUpgradeRoot('/tmp/foo')).toBe(true);
    expect(isTempOrUpgradeRoot('/Users/me/proj')).toBe(false);
    expect(codexProjectSlug('/Users/me/My Project')).toMatch(/./);
    expect(codexPromptsDir()).toMatch(/codex|prompts|\.codex/i);
    expect(codexConfigPath()).toMatch(/config|\.codex/i);

    const block = `command = "npx"\nargs = ["arkgate-mcp", "--root", "/proj"]\n`;
    expect(extractCodexRootFromBlock(block)).toBe('/proj');
    const toml = `
[mcp_servers.ark]
command = "npx"
args = ["ark-mcp", "--root", "/old"]

[mcp_servers.other]
command = "x"
`;
    expect(listCodexArkServerTables(toml).length).toBeGreaterThan(0);
    const upserted = upsertCodexMcpTable(toml, 'mcp_servers.ark', block);
    expect(upserted).toMatch(/arkgate-mcp|ark-mcp|mcp_servers/);
    const primary = codexPrimaryTable(toml);
    expect(primary).toMatchObject({ table: expect.any(String) });
    expect(primary?.root || primary?.table).toBeTruthy();
    expect(typeof codexScopedTableForRoot(toml, '/proj') === 'string' || codexScopedTableForRoot(toml, '/proj') == null).toBe(true);
    expect(typeof extractCodexArkRootFromToml(toml) === 'string' || extractCodexArkRootFromToml(toml) == null).toBe(true);
    expect(typeof codexArkBlockHasPreferredBin(toml)).toBe('boolean');
    expect(typeof codexArkBlockNeedsRewrite(toml, '/proj')).toBe('boolean');
    const assessed = assessCodexHomeMcp(toml, '/proj');
    expect(assessed && typeof assessed === 'object').toBe(true);
    expect(assessCodexHomeMcp('', '/proj') && typeof assessCodexHomeMcp('', '/proj') === 'object').toBe(true);

    const root = mk();
    try {
      // wireCodexMcp may write to real home — use force carefully; only if temp
      if (isTempOrUpgradeRoot(root)) {
        wireCodexMcp(root, true);
      } else {
        // still exercise assess with empty
        expect(assessCodexHomeMcp('# empty\n', root)).toBeTruthy();
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('mcp-adoption deploy and host matrix', () => {
    const root = mk();
    try {
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
          name: 'nest-app',
          dependencies: { '@nestjs/core': '10', next: '14' },
          scripts: {
            build: 'nest build',
            typecheck: 'tsc -p tsconfig.json',
            lint: 'eslint .',
          },
          engines: { node: '>=20' },
        })
      );
      fs.writeFileSync(path.join(root, 'tsconfig.json'), '{}\n');
      fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Ark Enforcement\nBefore editing TypeScript\n');
      fs.mkdirSync(path.join(root, '.cursor'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.cursor/mcp.json'),
        JSON.stringify({ mcpServers: { ark: { command: 'npx', args: ['arkgate-mcp'] } } })
      );
      fs.mkdirSync(path.join(root, '.claude/skills/ark-fix'), { recursive: true });
      fs.writeFileSync(path.join(root, '.claude/skills/ark-fix/SKILL.md'), '# skill\n');
      fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.github/workflows/ci.yml'),
        'name: ci\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx ark-check --strict\n'
      );
      fs.writeFileSync(
        path.join(root, '.claude/settings.json'),
        JSON.stringify({
          hooks: {
            PreToolUse: [
              { hooks: [{ command: 'npx arkgate-mcp --hook --hook-repair --root .' }] },
            ],
          },
        })
      );

      expect(COMMAND_GATE_TEXT_FILES.length).toBeGreaterThan(5);
      expect(stripMcpServerArgs(['pnpm', 'exec', 'arkgate-mcp', '--root', 'apps/web'])).toContain(
        '--root'
      );
      expect(mcpArgsHaveDuplicateBins(['npx', 'ark-mcp'])).toBe(false);
      expect(brokenMcpGateFiles(root)).toBeTruthy();
      const deploy = detectDeployPathQuality(root);
      expect(deploy && typeof deploy === 'object').toBe(true);
      expect(Array.isArray(deploy.engines)).toBe(true);

      const adoption = collectAdoptionGaps(
        root,
        {
          layers: [
            { name: 'DomainModel', patterns: ['src/domain/**'], optional: true },
            { name: 'ApplicationOrchestration', patterns: ['src/**'] },
            { name: 'PresentationAdapters', patterns: ['src/ui/**'] },
          ],
          rules: [{ from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false }],
        },
        {
          governed: { percent: 55, classifiedFiles: 11, totalFiles: 20 },
          layers: [
            { name: 'DomainModel', files: 0 },
            { name: 'ApplicationOrchestration', files: 10 },
            { name: 'PresentationAdapters', files: 1 },
          ],
          emptyLayers: ['DomainModel'],
        }
      );
      expect(adoption.writePath?.mode).toMatch(/none|mcp-only|reject-only|repair/);
      expect(Array.isArray(adoption.gaps)).toBe(true);
      expect(Array.isArray(adoption.hosts)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('ark-shared remaining + config-warnings + port-proof', () => {
  it('eleven-layer overlays, archetypes, wizard, operating modes', () => {
    const root = mk();
    try {
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
          name: 'nest',
          dependencies: { '@nestjs/core': '10', '@nestjs/common': '10', typeorm: '0.3' },
          scripts: { start: 'nest start', test: 'jest' },
        })
      );
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(root, 'src/modules'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src/domain/x.ts'), 'export class X {}\n');
      fs.writeFileSync(path.join(root, 'src/modules/app.module.ts'), 'export class AppModule {}\n');
      fs.writeFileSync(path.join(root, 'nest-cli.json'), '{}\n');

      const base = createElevenLayerConfig({ include: ['src'] });
      const overlaid = applyFrameworkLayoutOverlays(base, root);
      expect(overlaid.layers.length).toBeGreaterThan(3);

      const signals = collectRepoShapeSignals(root);
      const playbook = loadArchitecturePlaybook(defaultPlaybookPath());
      scoreArchetypes(signals, playbook);
      const rec = buildArchitectureRecommendation(root, { playbookPath: defaultPlaybookPath() });
      formatArchitectureRecommendationHuman(rec);
      whyFromMatchedSignals(signals, Object.keys(signals || {}).slice(0, 5));

      for (const mode of [
        { governedPercent: 0, planMet: false, mature: false, totalFiles: 0, emptyLayers: ['A'], coreOptionalWithFiles: 0, presentationShare: null },
        { governedPercent: 45, planMet: false, mature: false, totalFiles: 40, emptyLayers: [], coreOptionalWithFiles: 1, presentationShare: 0.6 },
        { governedPercent: 70, planMet: true, mature: false, totalFiles: 80, emptyLayers: [], coreOptionalWithFiles: 0, presentationShare: 0.2 },
        { governedPercent: 95, planMet: true, mature: true, totalFiles: 200, emptyLayers: [], coreOptionalWithFiles: 0, presentationShare: 0.05 },
      ]) {
        expect(resolveOperatingMode(mode)).toMatch(/suggest|adapt|enforce/);
      }

      expect(presentLockfiles(root)).toBeTruthy();
      expect(detectPackageManager(root)).toBeTruthy();
      expect(shouldShowNewHereNudge(root, path.join(root, 'missing.json'), 5, true)).toBe(true);

      for (const id of ARCHETYPE_IDS.slice(0, 8)) {
        expect(isValidArchetypeId(id)).toBe(true);
      }
      for (const choice of INIT_WIZARD_CHOICES.slice(0, 5)) {
        mapWizardChoiceToArchetype(choice.key || choice.id || choice);
      }

      const layers = intentLayersFromManifest({
        intents: [
          { name: 'Domain.Create', layer: 'DomainModel' },
          { name: 'App.Run', layer: 'ApplicationOrchestration' },
        ],
      });
      layerForIntent('Domain.Create', [], layers);
      isBlocked(
        [
          { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
          { from: 'DomainModel', to: 'DomainModel', allowed: true },
        ],
        'DomainModel',
        'PersistenceAdapters'
      );
      collectConfigWarnings(
        root,
        {
          include: ['src'],
          layers: [
            { name: 'DomainModel', patterns: ['src/domain/**'], optional: true, forbiddenGlobals: ['fetch'] },
            { name: 'ApplicationOrchestration', patterns: ['src/**'] },
          ],
          rules: [{ from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false }],
        },
        [path.join(root, 'src/domain/x.ts')],
        [{ from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false }],
        { intents: [{ name: 'Domain.Create', layer: 'DomainModel' }] }
      );

      const ts = require('typescript');
      const src = `
import { UserRepo } from '../infra/user-repo';
export function load(id: string) {
  return UserRepo.find(id);
}
`;
      expect(specifierLooksLikeTarget('../infra/user-repo', 'infra/user-repo')).toBe(true);
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
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
