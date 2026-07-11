/**
 * Q3 — Weakest-link enforcement sensors (local, pure FS; optional gh for protection).
 * Missing CI, config drift, pre-commit human-edit path, and honest branch-protection report.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { arkCommand } from '../ark-shared.mjs';

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
 * @param {string} root
 * @returns {{
 *   hasWorkflowsDir: boolean,
 *   workflowFiles: string[],
 *   arkWorkflowFiles: string[],
 *   hasArkCheckWorkflow: boolean,
 *   hasStrictFlag: boolean,
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
  for (const f of files) {
    let text = '';
    try {
      text = fs.readFileSync(path.join(wfDir, f), 'utf8');
    } catch {
      continue;
    }
    const mentionsArk =
      /\barkgate-check\b/.test(text) ||
      /\bark-check\b/.test(text) ||
      /check:architecture/.test(text) ||
      /pedroknigge\/arkgate/.test(text);
    if (mentionsArk) {
      out.hasArkCheckWorkflow = true;
      out.arkWorkflowFiles.push(`.github/workflows/${f}`);
      if (/--strict\b/.test(text) || /check:architecture/.test(text)) {
        out.hasStrictFlag = true;
      }
      if (/architecture|ark-check|arkgate-check/i.test(f) || /name:\s*.*ark/i.test(text)) {
        out.hasArchitectureJobName = true;
      }
    }
  }
  return out;
}

/**
 * Job ids (GitHub Actions) whose job body runs ark-check / check:architecture.
 * Used so required status check "build" counts when the build job runs Ark.
 * @param {string} root
 * @returns {Set<string>}
 */
export function jobIdsThatRunArkCheck(root) {
  const ids = new Set();
  const wfDir = path.join(root, '.github', 'workflows');
  if (!fs.existsSync(wfDir)) return ids;
  let files = [];
  try {
    files = fs.readdirSync(wfDir).filter((f) => /\.ya?ml$/i.test(f));
  } catch {
    return ids;
  }
  for (const f of files) {
    let text = '';
    try {
      text = fs.readFileSync(path.join(wfDir, f), 'utf8');
    } catch {
      continue;
    }
    if (!/\barkgate-check\b|\bark-check\b|check:architecture/.test(text)) continue;
    const jobsIdx = text.search(/^jobs:\s*$/m);
    if (jobsIdx < 0) continue;
    const jobsSection = text.slice(jobsIdx);
    const re = /^ {2}([A-Za-z0-9_-]+):\s*$/gm;
    const matches = [...jobsSection.matchAll(re)];
    for (let i = 0; i < matches.length; i++) {
      const jobId = matches[i][1];
      const start = matches[i].index ?? 0;
      const end = i + 1 < matches.length ? (matches[i + 1].index ?? jobsSection.length) : jobsSection.length;
      const body = jobsSection.slice(start, end);
      if (/\barkgate-check\b|\bark-check\b|check:architecture/.test(body)) {
        ids.add(jobId);
      }
    }
  }
  return ids;
}

/**
 * Whether required status checks include Ark (by name or by matching a job that runs Ark).
 * @param {string} root
 * @param {string[]} requiredNames
 */
export function isArkRequiredStatusCheck(root, requiredNames) {
  if (!Array.isArray(requiredNames) || requiredNames.length === 0) return false;
  if (requiredNames.some((n) => /ark|architecture|arkgate/i.test(String(n)))) return true;
  const jobIds = jobIdsThatRunArkCheck(root);
  return requiredNames.some((n) => jobIds.has(String(n)));
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
 * Optional GitHub branch-protection / required-check report.
 * Never fakes green: unavailable when gh missing, no remote, or API error.
 *
 * @param {{ cwd?: string, repo?: string, branch?: string, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {{
 *   available: boolean,
 *   reason?: string,
 *   requiredStatusChecks?: string[] | null,
 *   strict?: boolean | null,
 *   enforcesAdmins?: boolean | null,
 *   arkCheckRequired?: boolean | null,
 *   raw?: unknown,
 * }}
 */
export function reportGithubBranchProtection(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const env = opts.env ?? process.env;
  const gh = spawnSync('gh', ['--version'], { encoding: 'utf8', env });
  if (gh.status !== 0) {
    return { available: false, reason: 'gh-cli-unavailable' };
  }

  let repo = opts.repo;
  if (!repo) {
    const r = spawnSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], {
      cwd,
      encoding: 'utf8',
      env,
    });
    if (r.status !== 0 || !r.stdout?.trim()) {
      return { available: false, reason: 'gh-repo-unavailable', raw: r.stderr };
    }
    repo = r.stdout.trim();
  }

  let branch = opts.branch;
  if (!branch) {
    const b = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      env,
    });
    branch = b.status === 0 ? b.stdout.trim() : 'main';
    if (branch === 'HEAD') branch = 'main';
  }

  const view = spawnSync(
    'gh',
    [
      'api',
      `repos/${repo}/branches/${encodeURIComponent(branch)}/protection`,
      '--jq',
      '{strict: .required_status_checks.strict, contexts: .required_status_checks.contexts, checks: .required_status_checks.checks, enforcesAdmins: .enforce_admins.enabled}',
    ],
    { cwd, encoding: 'utf8', env }
  );

  if (view.status !== 0) {
    const err = `${view.stderr || ''}${view.stdout || ''}`;
    if (/Not Found|404|Branch not protected/i.test(err)) {
      return {
        available: true,
        reason: 'branch-not-protected',
        requiredStatusChecks: [],
        strict: false,
        enforcesAdmins: false,
        arkCheckRequired: false,
        raw: err.slice(0, 400),
      };
    }
    return { available: false, reason: 'gh-api-error', raw: err.slice(0, 400) };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(view.stdout || '{}');
  } catch {
    return { available: false, reason: 'gh-api-parse-error', raw: view.stdout };
  }

  const contexts = Array.isArray(parsed.contexts) ? parsed.contexts.map(String) : [];
  const checkNames = Array.isArray(parsed.checks)
    ? parsed.checks.map((c) => String(c?.context || c?.name || '')).filter(Boolean)
    : [];
  const all = [...new Set([...contexts, ...checkNames])];
  // Name match OR required check id equals a workflow job that runs ark-check (e.g. "build").
  const arkCheckRequired = isArkRequiredStatusCheck(cwd, all);

  return {
    available: true,
    reason: 'ok',
    requiredStatusChecks: all,
    strict: Boolean(parsed.strict),
    enforcesAdmins: Boolean(parsed.enforcesAdmins),
    arkCheckRequired,
    raw: parsed,
  };
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
  } else if (
    adopted &&
    !isProducer &&
    ci.hasArkCheckWorkflow &&
    !ci.hasStrictFlag
  ) {
    gaps.push({
      id: 'enforcement-ci-not-strict',
      severity: 'info',
      message:
        'Architecture CI job found but does not pass --strict / check:architecture (weaker than recommended)',
      fix: 'Add --strict (or npm run check:architecture) to the architecture workflow step',
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
    if (github.available && github.reason === 'branch-not-protected') {
      gaps.push({
        id: 'enforcement-branch-unprotected',
        severity: 'warn',
        message: 'Default branch has no GitHub branch protection (architecture check cannot be required)',
        fix: 'Enable branch protection and require the architecture / ark-check status check',
      });
    } else if (
      github.available &&
      github.arkCheckRequired === false &&
      Array.isArray(github.requiredStatusChecks)
    ) {
      gaps.push({
        id: 'enforcement-ark-check-not-required',
        severity: 'warn',
        message:
          'Branch protection exists but no required status check looks like ark/architecture',
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
