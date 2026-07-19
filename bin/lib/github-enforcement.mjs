/** Exact local workflow evidence plus GitHub classic-protection/ruleset correlation. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const IF_LINE = /^[ \t]*(?:-\s+)?(?:"if"|'if'|if):\s*(.*?)\s*(?:#.*)?$/i;
const CONTINUE_LINE = /^[ \t]*(?:-\s+)?(?:"continue-on-error"|'continue-on-error'|continue-on-error):\s*(.*?)\s*(?:#.*)?$/i;
const SAFE_IF = /^(?:['"]?true['"]?|['"]?\$\{\{\s*(?:true|always\(\))\s*\}\}['"]?)$/i;
const SAFE_NEEDS_IF = /^['"]?\$\{\{\s*always\(\)\s*\}\}['"]?$/i;
const SAFE_CONTINUE = /^['"]?false['"]?$/i;
const ENV_PREFIX = /^(?:(?:env\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)*)/;
const DIRECT_ARK = /^(?:(?:npx|yarn)\s+(?:arkgate-check|ark-check)(?=\s|$)|pnpm(?:\s+--\S+)*\s+exec\s+(?:arkgate-check|ark-check)(?=\s|$)|node\s+(?:\S+\/)?bin\/(?:arkgate-check|ark-check)\.mjs(?=\s|$)|(?:arkgate-check|ark-check)(?=\s|$))/;
const CHECK_SCRIPT = /^(?:(?:npm|pnpm)\s+run\s+check:architecture(?=\s|$)|yarn(?:\s+run)?\s+check:architecture(?=\s|$))/;
const FAIL_CLOSED = /(?:^|\s)--(?:strict|strict-merge|require-gates)(?=\s|$)/;

function shellSegments(text) {
  const segments = [];
  let current = '';
  let quote = null;
  let escaped = false;
  const push = (terminator) => {
    if (current.trim()) segments.push({ text: current.trim(), terminator });
    current = '';
  };
  const input = String(text || '');
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (quote) {
      current += char;
      if (char === '\\' && quote === '"') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === '#') {
      while (index + 1 < input.length && input[index + 1] !== '\n') index++;
      continue;
    }
    const pair = input.slice(index, index + 2);
    if (pair === '&&' || pair === '||') {
      push(pair);
      index++;
      continue;
    }
    if (char === ';' || char === '|' || char === '\n') {
      push(char);
      continue;
    }
    current += char;
  }
  push(null);
  return segments;
}

function executableText(segment) {
  return String(segment || '').trim().replace(ENV_PREFIX, '');
}

function analyzeCommands(commands, script = '') {
  const scriptArk = shellSegments(script)
    .filter((segment) => DIRECT_ARK.test(executableText(segment.text)))
    .map((segment) => ({
      text: segment.text,
      enforcing: segment.terminator !== '||' && segment.terminator !== '|',
    }));
  const found = [];
  for (const segment of shellSegments(commands)) {
    const executable = executableText(segment.text);
    const outerEnforcing = segment.terminator !== '||' && segment.terminator !== '|';
    if (DIRECT_ARK.test(executable)) {
      found.push({ text: segment.text, enforcing: outerEnforcing });
    } else if (CHECK_SCRIPT.test(executable)) {
      for (const inner of scriptArk) {
        found.push({ text: inner.text, enforcing: outerEnforcing && inner.enforcing });
      }
    }
  }
  return found;
}

function architectureScript(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return typeof pkg?.scripts?.['check:architecture'] === 'string'
      ? pkg.scripts['check:architecture']
      : '';
  } catch {
    return '';
  }
}

function workflowJobs(text) {
  const lines = String(text || '').split('\n');
  const jobsLine = lines.findIndex((line) => /^(?:"jobs"|'jobs'|jobs):\s*(?:#.*)?$/.test(line));
  if (jobsLine < 0) return [];
  const jobsIndent = lines[jobsLine].match(/^\s*/)?.[0].length ?? 0;
  let childIndent = null;
  let jobsEnd = lines.length;
  const headers = [];
  for (let index = jobsLine + 1; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (indent <= jobsIndent) {
      jobsEnd = index;
      break;
    }
    const hit = line.match(/^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+)):\s*(?:#.*)?$/);
    if (!hit) continue;
    childIndent ??= indent;
    if (indent === childIndent) headers.push({ id: hit[1] ?? hit[2] ?? hit[3], index });
  }
  return headers.map((header, index) => ({
    id: header.id,
    body: lines.slice(header.index, headers[index + 1]?.index ?? jobsEnd).join('\n'),
    indent: childIndent,
  }));
}

function jobPropertyIndent(job) {
  const indents = job.body.split('\n').slice(1)
    .filter((line) => line.trim() && !/^\s*#/.test(line))
    .map((line) => line.match(/^\s*/)?.[0].length ?? 0)
    .filter((indent) => indent > Number(job.indent));
  return indents.length > 0 ? Math.min(...indents) : Number(job.indent) + 2;
}

function propertyValue(line, pattern) {
  return line.match(pattern)?.[1]?.trim() ?? null;
}

function unsafeControl(lines, propertyIndent, needs = false) {
  const atIndent = lines.filter((line) => {
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    return indent + (/^\s*-\s+/.test(line) ? 2 : 0) === propertyIndent;
  });
  const condition = atIndent.map((line) => propertyValue(line, IF_LINE)).find((value) => value !== null);
  const continuation = atIndent
    .map((line) => propertyValue(line, CONTINUE_LINE))
    .find((value) => value !== null);
  if (condition !== undefined && !SAFE_IF.test(condition)) return true;
  if (continuation !== undefined && !SAFE_CONTINUE.test(continuation)) return true;
  return needs && (condition === undefined || !SAFE_NEEDS_IF.test(condition));
}

function stepBounds(lines, runIndex, runIndent, inline) {
  let start = runIndex;
  let stepIndent = inline ? runIndent : null;
  if (!inline) {
    for (let index = runIndex - 1; index >= 0; index--) {
      const indent = lines[index].match(/^\s*/)?.[0].length ?? 0;
      if (/^\s*-\s+/.test(lines[index]) && indent < runIndent) {
        start = index;
        stepIndent = indent;
        break;
      }
    }
  }
  if (stepIndent === null) return { start: runIndex, end: runIndex + 1, propertyIndent: runIndent };
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (!lines[index].trim()) continue;
    const indent = lines[index].match(/^\s*/)?.[0].length ?? 0;
    if (indent < stepIndent + 2 || (indent === stepIndent && /^\s*-\s+/.test(lines[index]))) {
      end = index;
      break;
    }
  }
  return { start, end, propertyIndent: stepIndent + 2 };
}

function unquoteRun(value) {
  const trimmed = String(value || '').trim();
  if (/^"(?:\\.|[^"\\])*"$/.test(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return '';
    }
  }
  if (/^'[^']*'$/.test(trimmed)) return trimmed.slice(1, -1).replace(/''/g, "'");
  return trimmed;
}

export function workflowRunText(text) {
  const lines = String(text || '').split('\n');
  const commands = [];
  for (let index = 0; index < lines.length; index++) {
    const hit = lines[index].match(/^(\s*)(?:-\s+)?run:\s*(.*)$/);
    if (!hit) continue;
    const inline = /^\s*-\s+run:/.test(lines[index]);
    const bounds = stepBounds(lines, index, hit[1].length, inline);
    if (unsafeControl(lines.slice(bounds.start, bounds.end), bounds.propertyIndent)) continue;
    if (hit[2] && !/^[|>][-+]?\s*$/.test(hit[2])) commands.push(unquoteRun(hit[2]));
    else {
      const folded = /^>/.test(hit[2]);
      const indent = hit[1].length;
      const block = [];
      while (index + 1 < lines.length) {
        const next = lines[index + 1];
        if (next.trim() && (next.match(/^\s*/)?.[0].length ?? 0) <= indent) break;
        block.push(next.trim());
        index++;
      }
      commands.push(block.join(folded ? ' ' : '\n'));
    }
  }
  return commands.join('\n');
}

function jobCannotEnforce(job) {
  const propertyIndent = jobPropertyIndent(job);
  const lines = job.body.split('\n');
  const needs = lines.some((line) =>
    (line.match(/^\s*/)?.[0].length ?? 0) === propertyIndent &&
    /^\s*(?:"needs"|'needs'|needs):/.test(line)
  );
  return unsafeControl(lines, propertyIndent, needs);
}

function commandsRunArk(commands, script) {
  return analyzeCommands(commands, script).length > 0;
}

function commandsEnforceArk(commands, script) {
  return analyzeCommands(commands, script).some((entry) => entry.enforcing && FAIL_CLOSED.test(entry.text));
}

export function activeWorkflowRunText(text) {
  const jobs = workflowJobs(text);
  return jobs.filter((job) => !jobCannotEnforce(job)).map((job) => workflowRunText(job.body)).join('\n');
}

export function runsArkCheck(text, script = '') {
  return commandsRunArk(activeWorkflowRunText(text), script);
}

export function enforcingArkRunText(text, script = '') {
  return analyzeCommands(activeWorkflowRunText(text), script)
    .filter((entry) => entry.enforcing)
    .map((entry) => entry.text)
    .join('\n');
}

function workflowFiles(root) {
  const directory = path.join(root, '.github', 'workflows');
  try {
    return fs.readdirSync(directory)
      .filter((file) => /\.ya?ml$/i.test(file))
      .map((file) => ({ file, text: fs.readFileSync(path.join(directory, file), 'utf8') }));
  } catch {
    return [];
  }
}

function jobName(job) {
  const propertyIndent = jobPropertyIndent(job);
  const line = job.body.split('\n').find((candidate) =>
    (candidate.match(/^\s*/)?.[0].length ?? 0) === propertyIndent &&
    /^\s*(?:"name"|'name'|name):/.test(candidate)
  );
  const raw = line?.match(/^\s*(?:"name"|'name'|name):\s*(.+?)\s*$/)?.[1];
  if (!raw) return { name: null, dynamic: false };
  const name = raw.replace(/^(['"])(.*)\1$/, '$2');
  return { name: name.includes('${{') ? null : name, dynamic: name.includes('${{') };
}

function jobHasMatrix(job) {
  const propertyIndent = jobPropertyIndent(job);
  const lines = job.body.split('\n');
  const strategy = lines.findIndex((line) =>
    (line.match(/^\s*/)?.[0].length ?? 0) === propertyIndent &&
    /^\s*(?:"strategy"|'strategy'|strategy):/.test(line)
  );
  if (strategy < 0) return false;
  for (let index = strategy + 1; index < lines.length; index++) {
    if (!lines[index].trim()) continue;
    const indent = lines[index].match(/^\s*/)?.[0].length ?? 0;
    if (indent <= propertyIndent) break;
    if (/^\s*(?:"matrix"|'matrix'|matrix):/.test(lines[index])) return true;
  }
  return false;
}

function localArkContexts(root) {
  const script = architectureScript(root);
  const known = new Set();
  const occurrences = new Map();
  const arkOccurrences = new Map();
  let dynamic = false;
  for (const workflow of workflowFiles(root)) {
    for (const job of workflowJobs(workflow.text)) {
      const explicit = jobName(job);
      const matrix = jobHasMatrix(job);
      const enforcing = !jobCannotEnforce(job) &&
        commandsEnforceArk(workflowRunText(job.body), script);
      if (enforcing) {
        known.add(job.id);
        if (explicit.name) known.add(explicit.name);
      }
      if (explicit.dynamic || matrix) {
        dynamic ||= enforcing;
        continue;
      }
      const context = explicit.name ?? job.id;
      occurrences.set(context, (occurrences.get(context) ?? 0) + 1);
      if (enforcing) arkOccurrences.set(context, (arkOccurrences.get(context) ?? 0) + 1);
    }
  }
  const contexts = new Set();
  for (const [context, count] of arkOccurrences) {
    if (count === 1 && occurrences.get(context) === 1) contexts.add(context);
    else dynamic = true;
  }
  return { contexts, known, dynamic };
}

/** Historical name retained; the set also contains literal, non-dynamic job names. */
export function jobIdsThatRunArkCheck(root) {
  return localArkContexts(root).known;
}

export function isArkRequiredStatusCheck(root, requiredNames) {
  if (!Array.isArray(requiredNames) || requiredNames.length === 0) return false;
  const local = localArkContexts(root).contexts;
  return requiredNames.some((name) => local.has(String(name)));
}

function classifyRequired(root, legacyContexts, checks, bindingField) {
  const local = localArkContexts(root);
  const exact = (name) => local.contexts.has(String(name));
  const matching = checks.filter((check) => exact(check.context));
  if (matching.some((check) => check[bindingField] == null || check[bindingField] === -1)) return true;
  if (matching.length > 0) return 'unverified';
  if (legacyContexts.some(exact)) return true;
  return local.dynamic && (legacyContexts.length > 0 || checks.length > 0)
    ? 'unverified'
    : false;
}

function combineRequired(classic, rules, classicAvailable, rulesAvailable, hasWorkflowRule) {
  if (classic === true || rules === true) return true;
  if (classic === 'unverified' || rules === 'unverified' || hasWorkflowRule) return 'unverified';
  return classicAvailable && rulesAvailable ? false : 'unverified';
}

function parseJson(result) {
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout || 'null');
  } catch {
    return null;
  }
}

/** Query classic branch protection and all active branch rules before reporting absence. */
export function reportGithubBranchProtection(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const env = opts.env ?? process.env;
  if (spawnSync('gh', ['--version'], { encoding: 'utf8', env }).status !== 0) {
    return { available: false, reason: 'gh-cli-unavailable' };
  }
  let repo = opts.repo;
  let branch = opts.branch;
  if (!repo || !branch) {
    const args = ['repo', 'view', ...(repo ? [repo] : []), '--json', 'nameWithOwner,defaultBranchRef'];
    const metadata = parseJson(spawnSync('gh', args, { cwd, encoding: 'utf8', env }));
    if (!metadata?.nameWithOwner || !metadata?.defaultBranchRef?.name) {
      return { available: false, reason: 'gh-repo-unavailable' };
    }
    repo ??= metadata.nameWithOwner;
    branch ??= metadata.defaultBranchRef.name;
  }

  const classicResult = spawnSync('gh', [
    'api', `repos/${repo}/branches/${encodeURIComponent(branch)}/protection`, '--jq',
    '{strict: .required_status_checks.strict, contexts: .required_status_checks.contexts, checks: .required_status_checks.checks, enforcesAdmins: .enforce_admins.enabled}',
  ], { cwd, encoding: 'utf8', env });
  const rulesResult = spawnSync(
    'gh', ['api', `repos/${repo}/rules/branches/${encodeURIComponent(branch)}`],
    { cwd, encoding: 'utf8', env }
  );
  const classic = parseJson(classicResult);
  const rules = parseJson(rulesResult);
  const classicAvailable = classic !== null && !Array.isArray(classic);
  const rulesAvailable = Array.isArray(rules);

  const contexts = classicAvailable && Array.isArray(classic.contexts)
    ? classic.contexts.map(String)
    : [];
  const checks = classicAvailable && Array.isArray(classic.checks)
    ? classic.checks.map((check) => ({
        context: String(check?.context || check?.name || ''),
        app_id: Number.isInteger(check?.app_id) ? check.app_id : null,
      })).filter((check) => check.context)
    : [];
  const statusRules = rulesAvailable
    ? rules.filter((rule) => rule?.type === 'required_status_checks')
        .flatMap((rule) => rule?.parameters?.required_status_checks ?? [])
        .map((check) => ({
          context: String(check?.context || ''),
          integration_id: Number.isInteger(check?.integration_id) ? check.integration_id : null,
        })).filter((check) => check.context)
    : [];
  const hasWorkflowRule = rulesAvailable && rules.some((rule) => rule?.type === 'workflows');
  const classicRequired = classicAvailable
    ? classifyRequired(cwd, contexts, checks, 'app_id')
    : 'unverified';
  const rulesRequired = rulesAvailable
    ? classifyRequired(cwd, [], statusRules, 'integration_id')
    : 'unverified';
  const arkCheckRequired = combineRequired(
    classicRequired, rulesRequired, classicAvailable, rulesAvailable, hasWorkflowRule
  );
  const arkCheckSourceBound = arkCheckRequired === true ? false : 'unverified';
  const available = arkCheckRequired === true || (classicAvailable && rulesAvailable);
  const all = [...new Set([...contexts, ...checks.map((check) => check.context), ...statusRules.map((check) => check.context)])];
  const error = `${classicResult.stderr || ''}${rulesResult.stderr || ''}`.slice(0, 400);

  return {
    available,
    reason: available ? 'ok' : 'provider-enforcement-unverified',
    repo,
    branch,
    requiredStatusChecks: all,
    requiredStatusCheckDetails: checks,
    requiredStatusRuleDetails: statusRules,
    strict: classicAvailable ? Boolean(classic.strict) : null,
    enforcesAdmins: classicAvailable ? Boolean(classic.enforcesAdmins) : null,
    arkCheckRequired,
    arkCheckSourceBound,
    raw: { classic, rules, ...(error ? { error } : {}) },
  };
}
