/**
 * Upstream GitHub issue draft for ArkGate itself (`arkgate report` / `ark report`).
 * Target is this package's package.json bugs.url (pedroknigge/arkgate), never the consumer repo.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

import { __packageRoot } from './gate-files.mjs';

export const UPSTREAM_OWNER_REPO = 'pedroknigge/arkgate';
export const SUBMIT_PROMPT = 'Type submit to send';

export function ownerRepoFromGithubUrl(url) {
  if (typeof url !== 'string' || url.trim() === '') return null;
  const match = url.trim().match(/github\.com[:/]+([^/]+)\/([^/#?\s]+)/i);
  if (!match) return null;
  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, '');
  if (!owner || !repo) return null;
  return `${owner}/${repo}`;
}

export function resolveUpstreamRepo(pkg) {
  const fromBugs = ownerRepoFromGithubUrl(pkg?.bugs?.url);
  if (fromBugs) return fromBugs;
  const repository = pkg?.repository;
  const repoUrl = typeof repository === 'string' ? repository : repository?.url;
  const fromRepo = ownerRepoFromGithubUrl(repoUrl);
  if (fromRepo) return fromRepo;
  return UPSTREAM_OWNER_REPO;
}

export function posixSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function formatGhIssueCreateCommand({ repo, title, body }) {
  return `gh issue create --repo ${posixSingleQuote(repo)} --title ${posixSingleQuote(title)} --body ${posixSingleQuote(body)}`;
}

export function reportUsage() {
  return `arkgate report (alias ark report) — draft an upstream GitHub issue for ArkGate.

Target: pedroknigge/arkgate (this package's package.json bugs.url). Never the consumer repo.

Usage:
  arkgate report [--root <project>] [--json] [--title <text>] [--finding <ref>]
  arkgate report --submit --i-confirm-submit
  arkgate report --submit          # TTY: type submit to send

Default prints a draft (arkgate version + last-check snippet). Nothing is created.
Create only with --submit AND (--i-confirm-submit after the human said yes, or TTY
"${SUBMIT_PROMPT}"). --yes does not submit.

If gh is missing or not logged in: prints the draft and the exact
gh issue create --repo pedroknigge/arkgate command, then exits 2.
`;
}

export function lastCheckSnippet(latest) {
  if (!latest || typeof latest !== 'object') return null;
  const at =
    typeof latest.generatedAt === 'string'
      ? latest.generatedAt
      : typeof latest.at === 'string'
        ? latest.at
        : null;
  const active =
    typeof latest.activeViolations === 'number'
      ? latest.activeViolations
      : typeof latest.violations?.active === 'number'
        ? latest.violations.active
        : null;
  let verdict = null;
  if (latest.ok === true && (active == null || active === 0)) verdict = 'pass';
  else if (latest.ok === false || (typeof active === 'number' && active > 0)) verdict = 'fail';
  else if (latest.completeness === 'partial' || latest.completeness === 'unavailable') {
    verdict = 'incomplete';
  } else if (latest.ok === true) verdict = 'pass';
  if (at == null && verdict == null && active == null) return null;
  return { at, verdict, activeViolations: active };
}

export function readLastCheckSnapshot(root) {
  const latestPath = path.join(root, '.ark', 'reports', 'latest.json');
  try {
    return JSON.parse(fs.readFileSync(latestPath, 'utf8'));
  } catch {
    return null;
  }
}

export function buildIssueDraft({ repo, arkgateVersion, lastCheck, finding, title }) {
  const resolvedTitle =
    typeof title === 'string' && title.trim()
      ? title.trim()
      : finding
        ? `ArkGate finding ${finding}`
        : 'ArkGate field report';
  const lines = [`## ArkGate version`, String(arkgateVersion ?? 'unknown'), ''];
  if (finding) {
    lines.push('## Finding', String(finding), '');
  }
  if (lastCheck) {
    lines.push('## Last check');
    lines.push(`- at: ${lastCheck.at ?? 'none'}`);
    lines.push(`- verdict: ${lastCheck.verdict ?? 'none'}`);
    lines.push(`- activeViolations: ${lastCheck.activeViolations ?? 'unknown'}`);
    lines.push('');
  } else {
    lines.push('## Last check', 'No last-check snapshot under .ark/reports/latest.json.', '');
  }
  lines.push(
    '## Repro',
    '```bash',
    'npx arkgate-check --doctor',
    'npx arkgate status --json',
    '```',
    '',
    '## What happened',
    '(ArkGate bug, false green, false red, missing doc, or improvable behavior in ArkGate itself — not leftover design in the consumer app.)',
    '',
    `Prepared with \`arkgate report\` against upstream ${repo}. Not the consumer repo.`
  );
  return { repo, title: resolvedTitle, body: lines.join('\n') };
}

export function defaultRunGh(argv, options = {}) {
  const env = { ...(options.env ?? process.env) };
  delete env.GH_REPO;
  const result = spawnSync('gh', argv, {
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error && (result.error.code === 'ENOENT' || result.error.code === 'EACCES')) {
    return { missing: true, status: 127, stdout: '', stderr: result.error.message };
  }
  return {
    missing: false,
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function loadArkgatePackageJson(explicit) {
  if (explicit && typeof explicit === 'object') return explicit;
  try {
    return JSON.parse(fs.readFileSync(path.join(__packageRoot, 'package.json'), 'utf8'));
  } catch {
    return { bugs: { url: `https://github.com/${UPSTREAM_OWNER_REPO}/issues` } };
  }
}

function packageVersion(pkg, fallback) {
  if (typeof fallback === 'string' && fallback.trim()) return fallback;
  return typeof pkg?.version === 'string' ? pkg.version : 'unknown';
}

function renderHumanDraft(draft, arkgateVersion) {
  return [
    `Upstream: ${draft.repo}`,
    '(never the consumer repo)',
    '',
    `ArkGate version: ${arkgateVersion}`,
    '',
    `Title: ${draft.title}`,
    '',
    draft.body,
  ].join('\n');
}

async function defaultPromptSubmit(stdin, stdout) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    return await rl.question(`${SUBMIT_PROMPT}\n`);
  } finally {
    rl.close();
  }
}

export function parseReportArgv(argv = []) {
  const out = {
    submit: false,
    iConfirmSubmit: false,
    json: false,
    yes: false,
    help: false,
    finding: undefined,
    title: undefined,
    root: undefined,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined || String(value).startsWith('-')) {
        throw new Error(`Missing value for ${arg}. Run arkgate report --help for usage.`);
      }
      i += 1;
      return value;
    };
    if (arg === '--submit') out.submit = true;
    else if (arg === '--i-confirm-submit') out.iConfirmSubmit = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--yes' || arg === '-y') out.yes = true;
    else if (arg === '--help' || arg === '-h' || arg === 'help') out.help = true;
    else if (arg === '--finding') out.finding = next();
    else if (arg === '--title') out.title = next();
    else if (arg === '--root') out.root = path.resolve(next());
    else throw new Error(`Unknown argument: ${arg}. Run arkgate report --help for usage.`);
  }
  return out;
}

/**
 * @param {object} options
 * @returns {Promise<number>} process exit code
 */
export async function runUpstreamReportCommand(options = {}) {
  const fromArgv = Array.isArray(options.argv) ? parseReportArgv(options.argv) : {};
  if (fromArgv.help) {
    const writeOut = options.writeOut ?? ((text) => console.log(text));
    writeOut(reportUsage());
    return 0;
  }
  const root = path.resolve(fromArgv.root ?? options.root ?? process.cwd());
  const json = Boolean(fromArgv.json || options.json);
  const submit = Boolean(fromArgv.submit || options.submit);
  const iConfirmSubmit = Boolean(fromArgv.iConfirmSubmit || options.iConfirmSubmit);
  const yes = Boolean(fromArgv.yes || options.yes);
  const finding = fromArgv.finding ?? options.finding;
  const title = fromArgv.title ?? options.title;
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const stdinIsTTY = options.stdinIsTTY ?? Boolean(stdin.isTTY);
  const env = options.env ?? process.env;
  const runGh = options.runGh ?? ((argv) => defaultRunGh(argv, { env }));
  const writeOut = options.writeOut ?? ((text) => console.log(text));
  const writeErr = options.writeErr ?? ((text) => console.error(text));

  const pkg = loadArkgatePackageJson(options.arkgatePackageJson);
  const repo = resolveUpstreamRepo(pkg);
  const arkgateVersion = packageVersion(pkg, options.arkgateVersion);
  const lastCheck = lastCheckSnippet(options.latestSnapshot ?? readLastCheckSnapshot(root));
  const draft = buildIssueDraft({
    repo,
    arkgateVersion,
    lastCheck,
    finding,
    title,
  });
  const ghCommand = formatGhIssueCreateCommand(draft);
  const human = renderHumanDraft(draft, arkgateVersion);

  const payload = {
    schemaVersion: '1.0',
    command: 'report',
    created: false,
    submitted: false,
    repo: draft.repo,
    title: draft.title,
    body: draft.body,
    arkgateVersion,
    lastCheck,
    ghCommand,
    yesDoesNotSubmit: true,
  };

  const emit = (extraHuman, extraPayload) => {
    if (json) writeOut(JSON.stringify({ ...payload, ...extraPayload }, null, 2));
    else writeOut(extraHuman ? `${human}\n\n${extraHuman}` : human);
  };

  if (!submit) {
    emit('Draft only. Nothing was created.\nAfter a human confirms: arkgate report --submit --i-confirm-submit\n--yes does not submit.');
    return 0;
  }

  // --yes never confirms. Confirm is --i-confirm-submit or TTY "submit".
  let confirmed = iConfirmSubmit;
  if (!confirmed && stdinIsTTY) {
    const typed = options.promptSubmit
      ? await options.promptSubmit()
      : await defaultPromptSubmit(stdin, stdout);
    confirmed = /^\s*submit\s*$/i.test(String(typed ?? ''));
  }

  if (!confirmed) {
    const refused =
      'Refused: --submit requires --i-confirm-submit or typing submit on a TTY. --yes does not submit.';
    if (json) {
      writeOut(JSON.stringify({ ...payload, error: 'submit-confirm-required', yesDoesNotSubmit: true }, null, 2));
    } else {
      writeOut(`${human}\n\nDraft only. ${refused}`);
    }
    writeErr(refused);
    return 2;
  }

  const auth = runGh(['auth', 'status']);
  const ghUnavailable = Boolean(auth?.missing) || auth?.status !== 0;
  if (ghUnavailable) {
    const missing =
      'Not filed: gh is missing or not logged in.\nExact command:\n' + ghCommand;
    emit(missing, { created: false, submitted: false, error: 'gh-unavailable', ghCommand });
    if (!json) writeErr('Not filed: gh is missing or not logged in.');
    return 2;
  }

  const created = runGh(['issue', 'create', '--repo', repo, '--title', draft.title, '--body', draft.body]);
  if (created?.missing || created?.status !== 0) {
    const missing =
      'Not filed: gh is missing or not logged in.\nExact command:\n' + ghCommand;
    emit(missing, { created: false, submitted: false, error: 'gh-unavailable', ghCommand });
    if (!json) writeErr('Not filed: gh is missing or not logged in.');
    return 2;
  }

  const url = String(created.stdout ?? '').trim();
  emit(url ? `Created: ${url}` : 'Created.', {
    created: true,
    submitted: true,
    url: url || null,
  });
  return 0;
}
