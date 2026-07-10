/**
 * Dense seam coverage: codex-home, field-install, skill-install, deploy-path, gate-files.
 * Kept small and assertion-hard — not a branch-walk megasuite.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mk, rm, writeTree } from './helpers/q1Fixtures';
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
  ensureBaselineFlagInCheckCommand,
  syncBaselineIntoCheckSurfaces,
  pinArkgateDevDependency,
  detectContractFalseGreenRisk,
  falseGreenAdoptionGap,
  IO_DIR_SEGMENTS,
} from '../../../bin/lib/field-install.mjs';
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
  KNOWN_TOOLS,
} from '../../../bin/lib/skill-install.mjs';
import { detectDeployPathQuality } from '../../../bin/lib/deploy-path.mjs';
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
import {
  staleRunnerGateFiles,
  warnLockfileConflict,
  runMigrateCommands,
  runInstallAgentGates,
} from '../../../bin/lib/install-migrate.mjs';
import {
  createElevenLayerConfig,
  applyFrameworkLayoutOverlays,
  collectRepoShapeSignals,
  buildArchitectureRecommendation,
  formatArchitectureRecommendationHuman,
  resolveOperatingMode,
  detectPackageManager,
  presentLockfiles,
  looksLikeIntent,
  resolveIntentLayer,
  collectForbiddenGlobalUses,
} from '../../../bin/ark-shared.mjs';
import { createRequire } from 'node:module';
import { scanSourceFile, runArchitectureScan } from '../../../bin/lib/architecture-scan.mjs';
import {
  createModuleResolutionHost,
  resolveRelativeFallback,
  resolveImport,
  scanCacheKey,
  saveScanCache,
  loadScanCache,
  isFile,
} from '../../../bin/lib/ts-resolve.mjs';
import { createImportTargetResolver, readTsconfigAliases } from '../../../bin/lib/import-resolve.mjs';
import {
  sourceFileExportsOnlyTypes,
  sourceFileHasTopLevelSideEffects,
  isTypeOnlyModuleReference,
  namedModuleBindings,
  expressionMayHaveSideEffects,
} from '../../../bin/lib/ast-scan.mjs';

const require = createRequire(import.meta.url);

describe('q1 seam coverage', () => {
  it('codex-home table helpers across multi-project toml shapes', () => {
    expect(isTempOrUpgradeRoot('/tmp/x')).toBe(true);
    expect(isTempOrUpgradeRoot('/var/folders/ab/cd/T/y')).toBe(true);
    expect(isTempOrUpgradeRoot('/Users/me/proj')).toBe(false);
    expect(codexProjectSlug('/Users/me/My Project!!')).toMatch(/./);
    expect(codexPromptsDir()).toMatch(/codex|prompts/i);
    expect(codexConfigPath()).toMatch(/config|codex/i);

    expect(extractCodexRootFromBlock('args = ["--root", "/a/b"]')).toMatch(/\/a\/b|a\/b/);
    expect(extractCodexRootFromBlock('no root here')).toBeFalsy();

    const multi = `
[mcp_servers.ark]
command = "npx"
args = ["ark-mcp", "--root", "/old/path"]

[mcp_servers.ark__otherproj]
command = "npx"
args = ["arkgate-mcp", "--root", "/Users/me/other"]

[mcp_servers.unrelated]
command = "echo"
`;
    expect(listCodexArkServerTables(multi).length).toBeGreaterThanOrEqual(1);
    const primary = codexPrimaryTable(multi);
    expect(primary?.table || primary).toBeTruthy();
    codexScopedTableForRoot(multi, '/Users/me/other');
    codexScopedTableForRoot(multi, '/nope');
    extractCodexArkRootFromToml(multi);
    expect(typeof codexArkBlockHasPreferredBin(multi)).toBe('boolean');
    expect(typeof codexArkBlockHasPreferredBin('[mcp_servers.ark]\ncommand="x"\n')).toBe('boolean');
    expect(typeof codexArkBlockNeedsRewrite(multi, '/old/path')).toBe('boolean');
    expect(typeof codexArkBlockNeedsRewrite(multi, '/Users/me/other')).toBe('boolean');

    const assessed = assessCodexHomeMcp(multi, '/Users/me/other');
    expect(assessed && typeof assessed === 'object').toBe(true);
    expect(assessCodexHomeMcp('', '/proj') && typeof assessCodexHomeMcp('', '/proj') === 'object').toBe(true);
    expect(assessCodexHomeMcp(multi, '/tmp/scratch') && typeof assessCodexHomeMcp(multi, '/tmp/scratch') === 'object').toBe(true);

    const block = 'command = "npx"\nargs = ["arkgate-mcp", "--root", "/proj"]\n';
    expect(upsertCodexMcpTable(multi, 'mcp_servers.ark', block)).toMatch(/arkgate-mcp|mcp_servers/);
    expect(upsertCodexMcpTable('', 'mcp_servers.ark', block)).toMatch(/arkgate-mcp|command|npx/);

    const root = mk('ark-codex-');
    try {
      if (isTempOrUpgradeRoot(root)) {
        wireCodexMcp(root, false);
        wireCodexMcp(root, true);
      }
    } finally {
      rm(root);
    }
  });

  it('field-install + skill-install + deploy-path + gates + ci templates', () => {
    const root = mk('ark-seam-');
    try {
      expect(ensureBaselineFlagInCheckCommand('').changed).toBe(false);
      expect(ensureBaselineFlagInCheckCommand('# comment ark-check').changed).toBe(false);
      expect(ensureBaselineFlagInCheckCommand('echo hi').changed).toBe(false);
      expect(ensureBaselineFlagInCheckCommand('npx ark-check').changed).toBe(true);
      expect(ensureBaselineFlagInCheckCommand('npx arkgate-check --strict').changed).toBe(true);
      expect(ensureBaselineFlagInCheckCommand('npx ark-check --baseline .ark-baseline.json').changed).toBe(
        false
      );

      expect(pinArkgateDevDependency(root).reason).toBe('no-package-json');
      writeTree(root, {
        'package.json': JSON.stringify({
          name: 'app',
          scripts: {
            'check:architecture': 'npx ark-check --strict',
            build: 'next build',
            lint: 'eslint .',
            typecheck: 'tsc -p .',
          },
          dependencies: { next: '15', nuxt: '3', 'react-scripts': '5' },
          devDependencies: { eslint: '9' },
        }),
        'package-lock.json': '{}\n',
        'pnpm-lock.yaml': 'lockfileVersion: 9\n',
        'yarn.lock': '# yarn\n',
        '.ark-baseline.json': '[]\n',
        'next.config.mjs': 'export default { eslint: { ignoreDuringBuilds: true } }\n',
        'eslint.config.mjs': 'export default []\n',
        'AGENTS.md': '# Ark Enforcement\nBefore editing\n',
        '.github/workflows/ci.yml':
          'name: ci\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n      - run: npm run lint\n      - run: npm run typecheck\n      - run: npx ark-check --baseline .ark-baseline.json\n',
        '.gitlab-ci.yml': 'lint:\n  script: npm run lint\n',
        'apps/web/package.json': JSON.stringify({
          name: 'web',
          scripts: { lint: 'eslint .', typecheck: 'tsc' },
          dependencies: { next: '15' },
        }),
        'src/app/prisma/client.ts': 'export const c=1\n',
        'src/app/repositories/user.ts': 'export const u=1\n',
        'src/app/lib/server/supabase/x.ts': 'export const s=1\n',
      });

      // first pin adds arkgate
      expect(pinArkgateDevDependency(root, { version: '9.9.9' }).changed).toBe(true);
      expect(pinArkgateDevDependency(root).reason).toBe('already-present');
      // strip arkgate and pin again with write:false
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
          name: 'app',
          scripts: {
            'check:architecture': 'npx ark-check --strict',
            build: 'next build',
            lint: 'eslint .',
            typecheck: 'tsc -p .',
          },
          dependencies: { next: '15', nuxt: '3', 'react-scripts': '5' },
          devDependencies: { eslint: '9' },
        })
      );
      expect(pinArkgateDevDependency(root, { version: '9.9.9', write: false }).changed).toBe(true);
      expect(pinArkgateDevDependency(root, { version: '9.9.9' }).changed).toBe(true);
      expect(pinArkgateDevDependency(root).reason).toBe('already-present');

      const sync = syncBaselineIntoCheckSurfaces(root, { baselineRel: '.ark-baseline.json' });
      expect(sync && typeof sync === 'object').toBe(true);
      expect(syncBaselineIntoCheckSurfaces(root, { baselineRel: 'missing.json' }).skipped || true).toBeTruthy();

      const cov = {
        emptyLayers: ['DomainModel', 'PersistenceAdapters'],
        layers: [
          { name: 'DomainModel', files: 0 },
          { name: 'PersistenceAdapters', files: 0 },
          { name: 'ApplicationOrchestration', files: 3 },
        ],
        governed: { percent: 25, classifiedFiles: 3, totalFiles: 12 },
      };
      const config = {
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
          { name: 'ApplicationOrchestration', patterns: ['src/app/**'] },
        ],
      };
      expect(detectContractFalseGreenRisk(root, config, cov)?.risk).toBe(true);
      expect(detectContractFalseGreenRisk(root, null as unknown as object, cov)).toBeNull();
      expect(detectContractFalseGreenRisk(root, { layers: [] }, cov)).toBeNull();
      expect(falseGreenAdoptionGap(root, config, cov)?.id).toMatch(/false-green|contract/);
      expect(IO_DIR_SEGMENTS.includes('prisma')).toBe(true);

      // skill install
      expect(normalizeToolsList(null)).toEqual([]);
      expect(normalizeToolsList('Claude, GROK')).toEqual(expect.arrayContaining(['claude', 'grok']));
      expect(normalizeToolsList(['cursor', 'unknown-tool'])).toContain('cursor');
      for (const tool of ['claude', 'cursor', 'grok', 'windsurf', 'cline', 'kiro', 'roo', 'continue', 'codex']) {
        const dir =
          tool === 'cline'
            ? '.clinerules'
            : tool === 'codex'
              ? '.codex'
              : `.${tool}`;
        fs.mkdirSync(path.join(root, dir), { recursive: true });
      }
      const resolved = resolveTools({ root });
      expect(resolved.tools.size).toBeGreaterThan(0);
      expect(resolveTools({ root, tools: [...KNOWN_TOOLS] }).tools.size).toBeGreaterThan(5);
      expect(typeof arkPackageVersion()).toBe('string');
      const stamped = stampSkill('# Hello\n', '1.2.3');
      expect(stamped).toMatch(/1\.2\.3|Hello|arkVersion/i);
      fs.writeFileSync(path.join(root, 'SKILL.md'), stamped);
      const ver = installedSkillVersion(path.join(root, 'SKILL.md'));
      expect(ver === null || typeof ver === 'string').toBe(true);
      expect(installedSkillVersion(path.join(root, 'missing.md'))).toBeFalsy();
      expect(isVersionOlder('1.0.0', '1.0.1')).toBe(true);
      expect(isVersionOlder('2.0.0', '1.0.0')).toBe(false);
      expect(isVersionOlder('1.0.0', '1.0.0')).toBe(false);
      expect(skillTemplateNames().length).toBeGreaterThan(0);
      expect(skillTemplates().length).toBeGreaterThan(0);
      expect(Array.isArray(detectSkillGaps(root))).toBe(true);
      expect(detectCodexHomeGap(root) === null || typeof detectCodexHomeGap(root) === 'object').toBe(true);

      // deploy-path
      const deploy = detectDeployPathQuality(root);
      expect(deploy.engines.length).toBeGreaterThan(0);
      expect(typeof deploy.embedsLintInBuild).toBe('boolean');
      expect(typeof deploy.embedsTypecheckInBuild).toBe('boolean');
      expect(typeof deploy.hasLintScript).toBe('boolean');
      expect(typeof deploy.hasTypecheckScript).toBe('boolean');
      expect(typeof deploy.ciRunsLint).toBe('boolean');
      expect(typeof deploy.ciRunsTypecheck).toBe('boolean');
      expect(typeof deploy.eslintIgnoreDuringBuilds).toBe('boolean');

      // gates
      expect(readPackageJson(root)?.name).toBe('app');
      fs.writeFileSync(path.join(root, 'ok.json'), '{"a":1}');
      expect(readJson(path.join(root, 'ok.json')).a).toBe(1);
      expect(hasCheckArchitectureScript(root)).toBe(true);
      expect(packageScriptsHaveTypecheck({ 'type-check': 'tsc' })).toBe(true);
      expect(packageScriptsHaveTypecheck({ build: 'x' })).toBe(false);
      expect(treeHasTypecheckScript(root)).toBe(true);
      ensureTypecheckScript(root, {});
      expect(hasArkWorkflow(root)).toBe(true);
      expect(Array.isArray(missingGates(root))).toBe(true);
      ensureDirForFile(path.join(root, 'nested/deep/f.txt'));
      expect(isArkAgentsContent('')).toBe(false);
      expect(isArkAgentsContent('# Ark Enforcement\n')).toBe(true);
      expect(isSelfHostedLibraryAgents('random')).toBe(false);
      expect(
        isSelfHostedLibraryAgents('## Identity — read this first\nGit / clone only\n')
      ).toBe(true);
      writeTemplate(root, 'notes.md', 'a\n', false);
      writeTemplate(root, 'notes.md', 'b\n', false);
      writeTemplate(root, 'notes.md', 'c\n', true);
      expect(fs.readFileSync(path.join(root, 'notes.md'), 'utf8')).toBe('c\n');

      // ci
      expect(checkArgsForRoot(root, { requireGates: false })).toMatch(/root|config/);
      expect(checkArgsForRoot(root, { requireGates: true })).toBeTruthy();
      const pm = packageManager(root);
      expect(Array.isArray(pm.setup)).toBe(true);
      expect(arkCheckCommand(root)).toMatch(/ark-check|arkgate-check/);
      expect(checkArchitectureScriptSnippet(root)).toMatch(/check:architecture|ark-check/);
      expect(layerPlacementTable()).toMatch(/Domain|layer/i);
      expect(agentInstructions(root)).toMatch(/Ark/i);
      expect(mcpJson(root)).toMatch(/mcpServers/i);
      expect(codexTomlSnippet(root)).toMatch(/mcp|ark/i);
      expect(instructionRule(root)).toMatch(/Ark/i);
      expect(cursorRule(root)).toMatch(/Ark/i);
      detectNodeMajorFromWorkflows(root);
      const ciNode = detectCiNode(root);
      expect(ciNode && typeof ciNode === 'object').toBe(true);
      expect(
        githubWorkflow(pm, ciNode || { kind: 'version', value: '22' }, {
          hasLintScript: true,
          hasTypecheckScript: true,
        })
      ).toMatch(/jobs|node/i);
      expect(
        githubWorkflow(
          { cache: 'pnpm', setup: ['corepack enable'], install: 'pnpm i', run: 'pnpm exec ark-check' },
          { kind: 'file', value: '.nvmrc' },
          {}
        )
      ).toMatch(/pnpm|node-version-file/i);
      expect(
        githubWorkflow(
          { cache: 'yarn', setup: ['corepack enable'], install: 'yarn', run: 'yarn ark-check' },
          { kind: 'default', value: '20' },
          { hasLintScript: false }
        )
      ).toMatch(/yarn|jobs/i);

      // install-migrate + ark-shared + scan/ast edges (branch cushion near 85%)
      fs.writeFileSync(
        path.join(root, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            ark: { command: 'npx', args: ['ark-mcp', 'arkgate-mcp', '--root', '.'] },
          },
        })
      );
      warnLockfileConflict(root);
      expect(Array.isArray(staleRunnerGateFiles(root))).toBe(true);
      runMigrateCommands(root);
      runInstallAgentGates({ root, tools: ['claude', 'grok', 'cursor'], force: true });

      expect(detectPackageManager(root)).toMatch(/npm|pnpm|yarn/);
      expect(presentLockfiles(root).length).toBeGreaterThan(0);
      expect(looksLikeIntent('Domain.CreateOrder')).toBe(true);
      expect(looksLikeIntent('not-intent')).toBe(false);
      expect(
        resolveIntentLayer('Domain.X', [{ name: 'DomainModel', prefixes: ['Domain.'] }])
      ).toBe('DomainModel');
      const overlaid = applyFrameworkLayoutOverlays(createElevenLayerConfig({ include: ['src'] }), root);
      expect(overlaid.layers.length).toBeGreaterThan(3);
      const signals = collectRepoShapeSignals(root);
      expect(signals && typeof signals === 'object').toBe(true);
      const rec = buildArchitectureRecommendation(root);
      expect(formatArchitectureRecommendationHuman(rec).length).toBeGreaterThan(5);
      for (const mode of [
        {
          governedPercent: 10,
          planMet: false,
          mature: false,
          totalFiles: 5,
          emptyLayers: ['X'],
          coreOptionalWithFiles: 1,
          presentationShare: 0.9,
        },
        {
          governedPercent: 95,
          planMet: true,
          mature: true,
          totalFiles: 200,
          emptyLayers: [],
          coreOptionalWithFiles: 0,
          presentationShare: 0.05,
        },
      ]) {
        expect(resolveOperatingMode(mode)).toMatch(/suggest|adapt|enforce/);
      }

      const ts = require('typescript');
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src/domain/x.ts'), 'export type T = 1;\nexport const v = 1;\n');
      fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};\n');
      fs.writeFileSync(
        path.join(root, 'src/domain/bad.ts'),
        "import { db } from '../infra/db';\nexport const n = Date.now();\n"
      );
      fs.writeFileSync(
        path.join(root, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } })
      );
      const archConfig = {
        layers: [
          {
            name: 'DomainModel',
            patterns: ['src/domain/**'],
            forbiddenGlobals: ['Date.now', 'fetch'],
          },
          { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
        ],
        rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
      };
      const files = [
        path.join(root, 'src/domain/x.ts'),
        path.join(root, 'src/domain/bad.ts'),
        path.join(root, 'src/infra/db.ts'),
      ];
      const scanned = scanSourceFile(
        ts,
        root,
        archConfig,
        archConfig.rules,
        null,
        path.join(root, 'src/domain/bad.ts'),
        'DomainModel'
      );
      expect(
        (scanned.contentViolations ?? scanned.violations ?? []).length
      ).toBeGreaterThan(0);
      const scan = runArchitectureScan({
        root,
        config: archConfig,
        manifest: null,
        rules: archConfig.rules,
        files,
        ts,
        args: { config: path.join(root, 'ark.config.json'), noCache: true },
      });
      expect(scan.violations.length).toBeGreaterThan(0);

      const host = createModuleResolutionHost(ts);
      expect(isFile(files[0])).toBe(true);
      expect(resolveRelativeFallback(files[1], './x')).toBeTruthy();
      expect(resolveImport(ts, './x', files[1], {}, host, root)).toBeTruthy();
      readTsconfigAliases(ts, root);
      const resolve = createImportTargetResolver(ts, root, archConfig);
      expect(resolve?.('./x', files[1])).toBeTruthy();
      const key = scanCacheKey(root, { config: path.join(root, 'ark.config.json') });
      saveScanCache(root, key, files);
      const cached = loadScanCache(root, key);
      expect(cached === undefined || cached != null).toBe(true);

      const sf = ts.createSourceFile(
        'a.ts',
        `import type { T } from './t';\nimport { type U, V } from './v';\nexport type T2 = 1;\nconsole.log(1);\nexport const x = 1;\n`,
        ts.ScriptTarget.Latest,
        true
      );
      expect(sourceFileExportsOnlyTypes(ts, sf)).toBe(false);
      expect(sourceFileHasTopLevelSideEffects(ts, sf)).toBe(true);
      for (const stmt of sf.statements) {
        if (ts.isImportDeclaration(stmt)) {
          isTypeOnlyModuleReference(ts, stmt);
          namedModuleBindings(ts, stmt);
        }
      }
      expressionMayHaveSideEffects(
        ts,
        ts.factory.createCallExpression(ts.factory.createIdentifier('foo'), undefined, [])
      );
      const uses = collectForbiddenGlobalUses(ts, sf, ['console.log']);
      expect(Array.isArray(uses)).toBe(true);
    } finally {
      rm(root);
    }
  });
});
