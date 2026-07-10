/**
 * MCP bin constants, dual-bin detection, and adoption gap collection.
 * Deploy-path quality lives in deploy-path.mjs (re-exported below).
 */
import fs from 'node:fs';
import path from 'node:path';
import { arkCommand } from '../ark-shared.mjs';
import { CORE_LAYER_NAMES } from './core-layers.mjs';
import { falseGreenAdoptionGap } from './field-install.mjs';
import { assessCodexHomeMcp, codexConfigPath } from './codex-home.mjs';
import { detectWritePathCapabilities } from './write-path-detect.mjs';
import { detectActiveAgentHost, skillTemplateNames } from './skill-install.mjs';
import { detectDeployPathQuality } from './deploy-path.mjs';

export { detectDeployPathQuality };

export const COMMAND_GATE_TEXT_FILES = [
  '.claude/settings.json', 'AGENTS.md', '.cursor/rules/ark.mdc', '.windsurf/rules/ark.md',
  '.clinerules/ark.md', '.github/copilot-instructions.md', '.kiro/steering/ark.md',
  '.roo/rules/ark.md', '.continue/rules/ark.md', 'GEMINI.md', 'package.json',
  '.grok/hooks/ark-write-gate.json', '.grok/config.toml',
];
export const COMMAND_GATE_JSON_FILES = ['.mcp.json', '.cursor/mcp.json'];
// Primary CLI names (product) + one-major aliases. migrate-commands must strip ALL of these
// before re-emitting a single preferred bin — otherwise a partial rename leaves
// args: ["ark-mcp", "arkgate-mcp", ...] which breaks stdio MCP hosts.
export const ARK_MCP_BINS = new Set(['arkgate-mcp', 'ark-mcp']);
export const ARK_CHECK_BINS = new Set(['arkgate-check', 'ark-check']);
export const ARK_CLI_BINS = new Set(['arkgate', 'ark']);
// PREFERRED_MCP_BIN lives in hook-templates.mjs (re-exported above).
export const PREFERRED_CHECK_BIN = 'arkgate-check';
export const PREFERRED_CLI_BIN = 'arkgate';
// Runner argv noise that is not a bin argument (pnpm exec form).
export const MCP_RUNNER_ARGV = new Set(['exec', '--config.verify-deps-before-run=false']);
// The runner token immediately before an ark command in a text command string.
// Matches npm/yarn runners and both pnpm forms (legacy `pnpm exec` + verify-deps-safe form).
// Longer bin names first so `arkgate-check` is not partially matched as `ark`.
export const RUNNER_BEFORE_ARK =
  /\b(?:npx|pnpm --config\.verify-deps-before-run=false exec|pnpm exec|yarn)(?= (?:arkgate-check|arkgate-mcp|arkgate|ark-check|ark-mcp|ark)\b)/g;

/** Keep only MCP server flags from existing args (drop runner tokens + any ark* bin names). */

export function stripMcpServerArgs(args) {
  if (!Array.isArray(args) || args.length === 0) {
    return ['--root', '.', '--config', 'ark.config.json'];
  }
  const kept = args.filter(
    (entry) =>
      typeof entry === 'string' &&
      !MCP_RUNNER_ARGV.has(entry) &&
      !ARK_MCP_BINS.has(entry) &&
      !ARK_CHECK_BINS.has(entry) &&
      !ARK_CLI_BINS.has(entry)
  );
  return kept.length > 0 ? kept : ['--root', '.', '--config', 'ark.config.json'];
}

/** True when mcpServers.ark.args list more than one Ark MCP bin (broken dual rename). */
export function mcpArgsHaveDuplicateBins(args) {
  if (!Array.isArray(args)) return false;
  const hits = args.filter((entry) => ARK_MCP_BINS.has(entry));
  return hits.length > 1 || (hits.length === 1 && args.indexOf(hits[0]) !== args.lastIndexOf(hits[0]));
}

export function brokenMcpGateFiles(root) {
  const bad = [];
  for (const rel of COMMAND_GATE_JSON_FILES) {
    let json;
    try {
      json = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
    } catch {
      continue;
    }
    const ark = json?.mcpServers?.ark;
    if (ark && mcpArgsHaveDuplicateBins(ark.args)) bad.push(rel);
  }
  return bad;
}

/**
 * Adoption completeness (separate from 0–100 fitness). Pure-ish: filesystem + config.
 * @returns {{ gaps: object[], hosts: object[], mcp: object, codexHome: object|null, coreOptional: object[], originReport: object, baseline: object, layerBalance: object|null, deployPath: object|null, writePath: object }}
 */
export function collectAdoptionGaps(root, config, coverage) {
  const gaps = [];
  const adopted = fs.existsSync(path.join(root, 'AGENTS.md'));
  const isProducer = fs.existsSync(path.join(root, 'templates', 'skills'));

  // --- Write path: prepare-write / autoPatch / reject-only (W5) ---
  const writePath = detectWritePathCapabilities(root);
  // Only surface write-path gaps when the project has adopted gates (or has partial install).
  // Producer package tree always has templates — still report capability for dogfood honesty.
  if (writePath.gap && (adopted || writePath.hookPresent || writePath.mcpPresent || isProducer)) {
    // Producer may be repair-capable via own templates; still useful. Skip "none" on pure
    // consumer repos with zero Ark files? missingGates already covers that.
    if (!(writePath.mode === 'none' && !adopted && !isProducer)) {
      gaps.push(writePath.gap);
    }
  }

  // --- Repo MCP dual-bin ---
  const dualMcp = brokenMcpGateFiles(root);
  const mcp = {
    dualBinFiles: dualMcp,
    ok: dualMcp.length === 0,
  };
  if (dualMcp.length > 0) {
    gaps.push({
      id: 'mcp-dual-bin',
      severity: 'warn',
      message: `Broken MCP argv in ${dualMcp.join(', ')}: more than one of ark-mcp/arkgate-mcp`,
      fix: arkCommand(root, 'ark-check', '--install-agent-gates --migrate-commands'),
    });
  }

  // --- Host completeness (only when project already adopted gates) ---
  const hosts = [];
  if (adopted && !isProducer) {
    const skillNames = skillTemplateNames();
    const hostChecks = [
      {
        host: 'grok',
        dir: '.grok',
        skill: (n) => path.join(root, '.grok', 'skills', n, 'SKILL.md'),
        extras: [
          ['.grok/hooks/ark-write-gate.json', 'write-gate hook'],
          ['.grok/config.toml', 'project MCP config'],
        ],
        toolsFlag: 'grok',
      },
      {
        host: 'claude',
        dir: '.claude',
        skill: (n) => path.join(root, '.claude', 'skills', n, 'SKILL.md'),
        extras: [['.claude/settings.json', 'settings/hooks']],
        toolsFlag: 'claude',
      },
      {
        host: 'cursor',
        dir: '.cursor',
        skill: (n) => path.join(root, '.cursor', 'commands', `${n}.md`),
        extras: [['.cursor/mcp.json', 'MCP config']],
        toolsFlag: 'cursor',
      },
    ];
    for (const h of hostChecks) {
      if (!fs.existsSync(path.join(root, h.dir))) continue;
      const missingSkills = skillNames.filter((n) => !fs.existsSync(h.skill(n)));
      const missingExtras = h.extras.filter(([rel]) => !fs.existsSync(path.join(root, rel)));
      const complete = missingSkills.length === 0 && missingExtras.length === 0;
      hosts.push({
        host: h.host,
        present: true,
        complete,
        missingSkills: missingSkills.length,
        missingExtras: missingExtras.map(([, label]) => label),
      });
      if (!complete) {
        gaps.push({
          id: `host-${h.host}-incomplete`,
          severity: 'warn',
          message: `${h.host} dir present but incomplete (${missingSkills.length} skill(s) missing${
            missingExtras.length ? `; missing ${missingExtras.map(([, l]) => l).join(', ')}` : ''
          })`,
          fix: arkCommand(
            root,
            'ark-check',
            `--install-agent-gates --tools ${h.toolsFlag} --force`
          ),
        });
      }
    }
  }

  // --- Codex home MCP (temp path / wrong root / multi-project) ---
  let codexHome = null;
  if (adopted && !isProducer) {
    const codexFile = codexConfigPath();
    let toml = '';
    try {
      if (fs.existsSync(codexFile)) toml = fs.readFileSync(codexFile, 'utf8');
    } catch {
      toml = '';
    }
    if (toml.includes('[mcp_servers.ark]')) {
      const assessed = assessCodexHomeMcp(toml, root);
      codexHome = {
        file: codexFile,
        root: assessed.root,
        tempPath: assessed.tempPath,
        wrongRoot: assessed.wrongRoot,
        preferredBin: assessed.preferredBin,
        needsRewrite: assessed.needsRewrite,
        multiProject: assessed.multiProject,
        scopedTable: assessed.scopedTable,
      };
      if (assessed.gap) {
        // Temp/upgrade MCP roots stay urgent (fail-closed). Non-temp Codex-home debt
        // is deferred only when the session host is known and is not Codex
        // (Grok/Claude/Cursor…). Unknown host (CI/plain shell) keeps original severity.
        const tempUrgent = Boolean(assessed.tempPath);
        const activeHost = detectActiveAgentHost();
        const deferred =
          !tempUrgent && activeHost != null && activeHost !== 'codex';
        const severity = deferred ? 'info' : assessed.gap.severity;
        const message = deferred
          ? `Deferred (fix when using Codex): ${assessed.gap.message}`
          : assessed.gap.message;
        gaps.push({
          id: assessed.gap.id,
          severity,
          deferred,
          message,
          fix: arkCommand(root, 'ark-check', assessed.gap.fixArgs),
        });
      }
    }
  }

  // --- Core layers optional but populated ---
  const coreOptional = [];
  const layerRows = coverage?.layers ?? [];
  const countByName = new Map(layerRows.map((r) => [r.name, r.files]));
  for (const layer of config?.layers ?? []) {
    if (!CORE_LAYER_NAMES.has(layer.name)) continue;
    if (layer.optional !== true) continue;
    const files = countByName.get(layer.name) ?? 0;
    if (files > 0) {
      coreOptional.push({ layer: layer.name, files });
      gaps.push({
        id: `core-optional-${layer.name}`,
        severity: 'info',
        message: `Core layer ${layer.name} has ${files} file(s) but is still optional: true — contract is weaker than the tree`,
        fix: `${arkCommand(root, 'ark-check', '--ratchet-cores')} (when architecture is green: 0 active violations)`,
      });
    }
  }

  // --- Origin report ---
  const originJson = path.join(root, '.ark', 'reports', 'origin.json');
  const originReport = {
    present: fs.existsSync(originJson),
    path: '.ark/reports/origin.json',
  };
  if (adopted && !originReport.present && (coverage?.governed?.percent ?? 0) >= 50) {
    gaps.push({
      id: 'origin-report-missing',
      severity: 'info',
      message: 'No origin architecture snapshot under .ark/reports/ yet',
      fix: arkCommand(root, 'ark-check', '--report ark-report.html'),
    });
  }

  // --- Baseline policy ---
  const baselinePath = path.join(root, '.ark-baseline.json');
  const baselineExists = fs.existsSync(baselinePath);
  let frozenKeys = 0;
  if (baselineExists) {
    try {
      const raw = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      frozenKeys = Array.isArray(raw.violations) ? raw.violations.length : 0;
    } catch {
      frozenKeys = 0;
    }
  }
  let primaryPathUsesBaseline = false;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
    primaryPathUsesBaseline = Object.values(scripts).some(
      (s) => typeof s === 'string' && s.includes('--baseline')
    );
  } catch {
    /* no package.json */
  }
  if (!primaryPathUsesBaseline) {
    try {
      const wfDir = path.join(root, '.github', 'workflows');
      if (fs.existsSync(wfDir)) {
        for (const f of fs.readdirSync(wfDir)) {
          if (!/\.ya?ml$/i.test(f)) continue;
          const text = fs.readFileSync(path.join(wfDir, f), 'utf8');
          if (text.includes('--baseline') && (text.includes('ark-check') || text.includes('arkgate-check'))) {
            primaryPathUsesBaseline = true;
            break;
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  const baseline = {
    exists: baselineExists,
    frozenKeys,
    primaryPathUsesBaseline,
    signal: baselineExists
      ? frozenKeys === 0
        ? 'keep-empty'
        : 'active-ratchet'
      : 'absent',
  };
  if (adopted && baselineExists && frozenKeys === 0 && !primaryPathUsesBaseline) {
    gaps.push({
      id: 'baseline-unused',
      severity: 'info',
      message:
        'Empty .ark-baseline.json exists but primary scripts/CI do not pass --baseline (policy unclear)',
      fix: 'Either add --baseline .ark-baseline.json to check:architecture / CI, or remove the unused baseline file',
    });
  }

  // --- Educational layer balance (not a violation) ---
  let layerBalance = null;
  const total = layerRows.reduce((s, r) => s + (r.files || 0), 0);
  if (total >= 20) {
    const presentation = layerRows.find((r) => r.name === 'PresentationAdapters');
    const domain = layerRows.find((r) => r.name === 'DomainModel');
    if (presentation && domain) {
      const pShare = presentation.files / total;
      const dShare = domain.files / total;
      if (pShare >= 0.5 && dShare < 0.1) {
        layerBalance = {
          kind: 'presentation-heavy-thin-domain',
          presentationFiles: presentation.files,
          domainFiles: domain.files,
          totalFiles: total,
          educational:
            'Presentation holds most of the tree while DomainModel is thin — common for UI apps; consider extracting domain types/use-cases as the product grows. Educational only (not a gate failure).',
        };
      }
    }
  }

  // --- Empty scope: contract matches no TS/JS ---
  if (!isProducer && (coverage?.governed?.totalFiles ?? coverage?.totalFiles) === 0) {
    gaps.push({
      id: 'empty-scope',
      severity: 'warn',
      message:
        'Empty scope: include paths match 0 TypeScript/JS files — checks are not governing this tree',
      fix: `${arkCommand(root, 'ark-check', '--suggest-include')} then ${arkCommand(root, 'ark-check', '--adopt-contract --write')}`,
    });
  }

  // --- Deploy-path quality (ESLint/types that production build hosts run) ---
  // Universal: any Next/CRA/Nuxt (etc.) consumer. Not architecture — still adoption.
  // Skip pure library producer (this monorepo) to avoid self-noise.
  let deployPath = null;
  if (!isProducer) {
    deployPath = detectDeployPathQuality(root);
    const eng =
      deployPath.engines.length > 0 ? deployPath.engines.join('/') : 'production';
    if (deployPath.embedsLintInBuild && !deployPath.hasLintScript) {
      gaps.push({
        id: 'deploy-path-lint-script-missing',
        severity: 'warn',
        message: `${eng} production build runs ESLint — no package.json lint script, so failures often surface first on the deploy host`,
        fix: 'Add a package.json "lint" script (e.g. eslint .) matching production ESLint config; run it in CI and before merge',
      });
    } else if (
      deployPath.embedsLintInBuild &&
      deployPath.hasLintScript &&
      deployPath.hasCiWorkflows &&
      !deployPath.ciRunsLint
    ) {
      gaps.push({
        id: 'deploy-path-lint-not-in-ci',
        severity: 'warn',
        message: `${eng} production build runs ESLint — CI workflows exist but do not run lint, so deploy hosts may be the first fail`,
        fix: 'Add a CI step that runs your package.json lint script (npm run lint / pnpm lint / yarn lint) and require it before deploy',
      });
    } else if (
      deployPath.embedsLintInBuild &&
      deployPath.hasLintScript &&
      !deployPath.hasCiWorkflows
    ) {
      gaps.push({
        id: 'deploy-path-lint-no-ci',
        severity: 'info',
        message: `${eng} production build runs ESLint — no CI workflows detected; push-to-host builds may be the first lint fail`,
        fix: 'Add CI (or a pre-push hook) that runs lint before the deploy host builds; keep branch protection required when using GitHub',
      });
    }

    if (deployPath.embedsTypecheckInBuild && !deployPath.hasTypecheckScript) {
      gaps.push({
        id: 'deploy-path-typecheck-script-missing',
        severity: 'info',
        message: `${eng} production build typechecks — no package.json typecheck script for local/CI parity`,
        fix: 'Add "typecheck": "tsc --noEmit" (or framework equivalent) and run it in CI alongside lint',
      });
    } else if (
      deployPath.embedsTypecheckInBuild &&
      deployPath.hasTypecheckScript &&
      deployPath.hasCiWorkflows &&
      !deployPath.ciRunsTypecheck
    ) {
      gaps.push({
        id: 'deploy-path-typecheck-not-in-ci',
        severity: 'info',
        message: `${eng} production build typechecks — CI does not run typecheck; type errors may appear first on the deploy host`,
        fix: 'Add a CI step for npm run typecheck (or your typecheck script) and require it before deploy',
      });
    }
  }

  // --- False-green contract (field-install detector; doctor skillGaps already cover missing skills) ---
  let contractFalseGreen = null;
  if (!isProducer && config) {
    const gap = falseGreenAdoptionGap(root, config, coverage);
    if (gap) {
      contractFalseGreen = { risk: true, message: gap.message, fix: gap.fix };
      gaps.push(gap);
    }
  }

  return {
    gaps,
    hosts,
    mcp,
    codexHome,
    coreOptional,
    originReport,
    baseline,
    layerBalance,
    deployPath,
    contractFalseGreen,
    writePath,
  };
}

// Gate files whose Ark command runner doesn't match this project's package manager — the
// advisory (and --migrate-commands) target. Returns [] for npm/unknown projects (npx is right)
// so the check is silent unless there's a real mismatch.
