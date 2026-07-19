/**
 * Q3 — Weakest-link enforcement sensors (local, pure FS; optional gh for protection).
 * Missing CI, config drift, pre-commit human-edit path, and honest branch-protection report.
 */
import fs from 'node:fs';
import path from 'node:path';
import { arkCommand } from '../ark-shared.mjs';
import {
  enforcingArkRunText,
  reportGithubBranchProtection,
  runsArkCheck,
} from './github-enforcement.mjs';

export {
  isArkRequiredStatusCheck,
  jobIdsThatRunArkCheck,
  reportGithubBranchProtection,
} from './github-enforcement.mjs';

const PRECOMMIT_MARKERS = [
  'ark-check',
  'arkgate-check',
  'check:architecture',
  'pre-commit-ark',
];

/**
 * @param {string} root
 * @returns {{ present: boolean, arkAware: boolean, path: string|null }}
 */
export function detectPreCommitArk(root) {
  const candidates = [
    path.join(root, '.git', 'hooks', 'pre-commit'),
    path.join(root, '.husky', 'pre-commit'),
    path.join(root, 'templates', 'hooks', 'pre-commit-ark'),
  ];
  let present = false;
  let arkAware = false;
  let hit = null;
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    // templates/hooks is the shipped install source, not an installed hook
    const isTemplate = file.includes(`${path.sep}templates${path.sep}hooks${path.sep}`);
    if (isTemplate) continue;
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    present = true;
    hit = path.relative(root, file) || file;
    if (PRECOMMIT_MARKERS.some((m) => text.includes(m))) {
      arkAware = true;
      break;
    }
  }
  return { present, arkAware, path: hit };
}

/**
 * Classify ark-check flags in a workflow or package script body.
 * CLI: `--strict` and `--strict-merge` both set strictConfig + requireGates (fail-closed).
 * `--strict-config` alone does not require gate files.
 *
 * @param {string} text
 * @returns {{ hasFailClosedFlag: boolean, hasStrictConfigOnly: boolean, hasStrictFlag: boolean }}
 */
export function classifyArkCheckFlags(text) {
  if (!text || typeof text !== 'string') {
    return { hasFailClosedFlag: false, hasStrictConfigOnly: false, hasStrictFlag: false };
  }
  const hasStrictMerge = /(?:^|\s)--strict-merge(?=\s|$)/.test(text);
  const hasRequireGates = /(?:^|\s)--require-gates(?=\s|$)/.test(text);
  // Bare --strict (alias of --strict-merge), not --strict-config / already-matched merge.
  const hasBareStrict = /(?:^|\s)--strict(?=\s|$)/.test(text);
  const hasFailClosedFlag = hasStrictMerge || hasRequireGates || hasBareStrict;
  const hasStrictConfig = /(?:^|\s)--strict-config(?=\s|$)/.test(text);
  const hasStrictConfigOnly = hasStrictConfig && !hasFailClosedFlag;
  const hasStrictFlag = hasFailClosedFlag || hasStrictConfigOnly;
  return { hasFailClosedFlag, hasStrictConfigOnly, hasStrictFlag };
}

/**
 * @param {string} root
 * @returns {{
 *   hasWorkflowsDir: boolean,
 *   workflowFiles: string[],
 *   arkWorkflowFiles: string[],
 *   hasArkCheckWorkflow: boolean,
 *   hasStrictFlag: boolean,
 *   hasFailClosedFlag: boolean,
 *   hasStrictConfigOnly: boolean,
 *   failClosed: boolean,
 *   hasArchitectureJobName: boolean,
 * }}
 */
export function detectCiEnforcement(root) {
  const wfDir = path.join(root, '.github', 'workflows');
  const out = {
    hasWorkflowsDir: fs.existsSync(wfDir),
    workflowFiles: [],
    arkWorkflowFiles: [],
    hasArkCheckWorkflow: false,
    hasStrictFlag: false,
    hasFailClosedFlag: false,
    hasStrictConfigOnly: false,
    failClosed: false,
    hasArchitectureJobName: false,
  };
  if (!out.hasWorkflowsDir) return out;
  let files = [];
  try {
    files = fs.readdirSync(wfDir).filter((f) => /\.ya?ml$/i.test(f));
  } catch {
    return out;
  }
  out.workflowFiles = files;

  let checkArchScript = '';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    checkArchScript =
      typeof pkg?.scripts?.['check:architecture'] === 'string'
        ? pkg.scripts['check:architecture']
        : '';
  } catch {
    checkArchScript = '';
  }
  for (const f of files) {
    let text = '';
    try {
      text = fs.readFileSync(path.join(wfDir, f), 'utf8');
    } catch {
      continue;
    }
    const arkRunText = enforcingArkRunText(text, checkArchScript);
    const mentionsArk = runsArkCheck(text, checkArchScript);
    if (mentionsArk) {
      out.hasArkCheckWorkflow = true;
      out.arkWorkflowFiles.push(`.github/workflows/${f}`);
      const flags = classifyArkCheckFlags(arkRunText);
      if (flags.hasFailClosedFlag) {
        out.hasFailClosedFlag = true;
        out.failClosed = true;
        out.hasStrictFlag = true;
      } else if (flags.hasStrictConfigOnly) {
        out.hasStrictConfigOnly = true;
        out.hasStrictFlag = true;
      } else if (flags.hasStrictFlag) {
        out.hasStrictFlag = true;
      }
      // check:architecture without fail-closed flags in the script is NOT fail-closed.
      if (/architecture|ark-check|arkgate-check/i.test(f) || /name:\s*.*ark/i.test(text)) {
        out.hasArchitectureJobName = true;
      }
    }
  }
  return out;
}

/**
 * Config / gate surface drift (adopted projects only).
 * @param {string} root
 * @param {{ adopted?: boolean, isProducer?: boolean }} [opts]
 */
export function detectConfigGateDrift(root, opts = {}) {
  const adopted =
    opts.adopted ?? fs.existsSync(path.join(root, 'AGENTS.md'));
  const isProducer =
    opts.isProducer ?? fs.existsSync(path.join(root, 'templates', 'skills'));
  const hasConfig = fs.existsSync(path.join(root, 'ark.config.json'));
  const hasAgents = fs.existsSync(path.join(root, 'AGENTS.md'));
  let hasCheckScript = false;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    hasCheckScript = Boolean(pkg?.scripts?.['check:architecture']);
  } catch {
    hasCheckScript = false;
  }
  const issues = [];
  if (adopted && !hasConfig && !isProducer) {
    issues.push({
      id: 'config-drift-agents-without-config',
      severity: 'warn',
      message: 'AGENTS.md present but ark.config.json missing — gates cannot enforce the contract',
      fix: arkCommand(root, 'ark', 'init'),
    });
  }
  if (hasConfig && !hasCheckScript && !isProducer) {
    issues.push({
      id: 'config-drift-no-check-script',
      severity: 'warn',
      message:
        'ark.config.json exists but package.json has no check:architecture script (CI/local parity drift)',
      fix: arkCommand(root, 'ark-check', '--install-agent-gates'),
    });
  }
  if (hasConfig && !hasAgents && !isProducer) {
    issues.push({
      id: 'config-drift-config-without-agents',
      severity: 'info',
      message: 'ark.config.json without AGENTS.md — agent hosts may not see the write-gate contract',
      fix: arkCommand(root, 'ark-check', '--install-agent-gates'),
    });
  }
  return { hasConfig, hasAgents, hasCheckScript, issues };
}

/**
 * Adoption gaps for weakest-link (Q3). Does not require network.
 * @param {string} root
 * @param {{ adopted?: boolean, isProducer?: boolean, includeGithub?: boolean }} [opts]
 */
export function collectWeakestLinkGaps(root, opts = {}) {
  const adopted =
    opts.adopted ?? fs.existsSync(path.join(root, 'AGENTS.md'));
  const isProducer =
    opts.isProducer ?? fs.existsSync(path.join(root, 'templates', 'skills'));
  const gaps = [];

  const ci = detectCiEnforcement(root);
  const pre = detectPreCommitArk(root);
  const drift = detectConfigGateDrift(root, { adopted, isProducer });
  const templatePreCommit = path.join(root, 'templates', 'hooks', 'pre-commit-ark');
  const shipsPreCommitTemplate =
    isProducer && fs.existsSync(templatePreCommit);

  if (adopted && !isProducer && !ci.hasWorkflowsDir) {
    gaps.push({
      id: 'enforcement-ci-missing',
      severity: 'warn',
      message: 'No .github/workflows directory — CI architecture gate cannot be required on merge',
      fix: arkCommand(root, 'ark-check', '--install-agent-gates'),
    });
  } else if (adopted && !isProducer && ci.hasWorkflowsDir && !ci.hasArkCheckWorkflow) {
    gaps.push({
      id: 'enforcement-ci-no-ark-check',
      severity: 'warn',
      message:
        'CI workflows exist but none run ark-check / arkgate-check / check:architecture',
      fix: arkCommand(root, 'ark-check', '--install-agent-gates'),
    });
  } else if (adopted && !isProducer && ci.hasArkCheckWorkflow && !ci.failClosed) {
    gaps.push({
      id: 'enforcement-ci-not-fail-closed',
      severity: 'warn',
      message: ci.hasStrictConfigOnly
        ? 'Architecture CI uses --strict-config only (config coverage without gate-file presence). Prefer the fail-closed profile.'
        : 'Architecture CI job found but does not use the fail-closed profile (--strict-merge / --strict / --require-gates)',
      fix: 'ark-check --root . --config ark.config.json --strict-merge --baseline .ark-baseline.json',
    });
  }

  for (const issue of drift.issues) {
    gaps.push(issue);
  }

  // Human-edit path: recommend pre-commit when adopted consumer has no ark-aware hook
  if (adopted && !isProducer && !pre.arkAware) {
    gaps.push({
      id: 'enforcement-pre-commit-missing',
      severity: 'info',
      message: pre.present
        ? 'pre-commit hook exists but does not run Ark architecture check (human disk edits can bypass agent gates)'
        : 'No ark-aware pre-commit hook — human edits can land without the write gate; install maintained template',
      fix: shipsPreCommitTemplate || fs.existsSync(path.join(process.cwd(), 'templates', 'hooks', 'pre-commit-ark'))
        ? 'Install: cp templates/hooks/pre-commit-ark .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit (or husky equivalent)'
        : 'Copy pre-commit-ark from the arkgate package templates/hooks/ into .git/hooks/pre-commit',
    });
  }

  // Producer tree: ensure template ships
  if (isProducer && !fs.existsSync(templatePreCommit)) {
    gaps.push({
      id: 'enforcement-pre-commit-template-missing',
      severity: 'warn',
      message: 'Producer package missing templates/hooks/pre-commit-ark (Q3 human-edit path)',
      fix: 'Add templates/hooks/pre-commit-ark to the package',
    });
  }

  let github = null;
  if (opts.includeGithub) {
    github = reportGithubBranchProtection({ cwd: root });
    if (
      github.available &&
      github.arkCheckRequired === false &&
      Array.isArray(github.requiredStatusChecks)
    ) {
      gaps.push({
        id: 'enforcement-ark-check-not-required',
        severity: 'warn',
        message:
          'Branch protection exists but no required status check matches a local Ark-running job',
        fix: 'Add the architecture CI job name to required status checks',
      });
    }
  }

  return {
    gaps,
    ci,
    preCommit: pre,
    drift,
    github,
  };
}
