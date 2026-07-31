/**
 * Gate file IO: package.json helpers, template writes, required gates.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codexProjectMcpIsValid } from './codex-home.mjs';
import { enforcingArkRunText } from './github-enforcement.mjs';

export const __packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const __arkCheckCli = path.join(__packageRoot, 'bin', 'ark-check.mjs');

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function readPackageJson(root) {
  const file = path.join(root, 'package.json');
  if (!fs.existsSync(file)) return null;
  return readJson(file);
}

export function hasCheckArchitectureScript(root) {
  const pkg = readPackageJson(root);
  return Boolean(pkg?.scripts?.['check:architecture']);
}

/**
 * Whether package.json scripts already expose a typecheck-like command.
 * Shared by deploy-path quality + typecheck bootstrap (single definition).
 * @param {Record<string, unknown>|null|undefined} scripts
 */
export function packageScriptsHaveTypecheck(scripts) {
  if (!scripts || typeof scripts !== 'object') return false;
  return Boolean(
    (typeof scripts.typecheck === 'string' && scripts.typecheck.trim()) ||
      (typeof scripts['type-check'] === 'string' && scripts['type-check'].trim()) ||
      (typeof scripts['check:types'] === 'string' && scripts['check:types'].trim()) ||
      (typeof scripts.tsc === 'string' && /\btsc\b/.test(scripts.tsc))
  );
}

/**
 * Root package (and shallow nested packages) already have a typecheck script.
 * Does not scan CI or framework configs — only package.json scripts.
 * @param {string} root
 */
export function treeHasTypecheckScript(root) {
  const pkg = readPackageJson(root);
  if (packageScriptsHaveTypecheck(pkg?.scripts)) return true;
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const candidates = [path.join(root, entry.name)];
      try {
        for (const child of fs.readdirSync(path.join(root, entry.name), { withFileTypes: true })) {
          if (child.isDirectory() && !child.name.startsWith('.')) {
            candidates.push(path.join(root, entry.name, child.name));
          }
        }
      } catch {
        /* ignore */
      }
      for (const dir of candidates) {
        const pj = path.join(dir, 'package.json');
        if (!fs.existsSync(pj)) continue;
        try {
          const nested = JSON.parse(fs.readFileSync(pj, 'utf8'));
          if (packageScriptsHaveTypecheck(nested.scripts)) return true;
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Add a conservative `typecheck` script when the host has a TS/JS project config
 * but no typecheck-like script yet. Never overwrites an existing script.
 *
 * @param {string} root
 * @param {{ write?: boolean }} [opts]
 * @returns {{
 *   changed: boolean,
 *   reason: 'added' | 'already' | 'no-tsconfig' | 'no-package-json',
 *   script?: string,
 * }}
 */
export function ensureTypecheckScript(root, opts = {}) {
  const write = opts.write !== false;
  const hasTsconfig =
    fs.existsSync(path.join(root, 'tsconfig.json')) ||
    fs.existsSync(path.join(root, 'jsconfig.json'));
  if (!hasTsconfig) return { changed: false, reason: 'no-tsconfig' };

  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return { changed: false, reason: 'no-package-json' };

  if (treeHasTypecheckScript(root)) {
    return { changed: false, reason: 'already' };
  }

  const pkg = readPackageJson(root) || {};
  const scripts =
    pkg.scripts && typeof pkg.scripts === 'object' ? { ...pkg.scripts } : {};
  const script = 'tsc --noEmit';
  scripts.typecheck = script;
  if (write) {
    const next = { ...pkg, scripts };
    fs.writeFileSync(pkgPath, `${JSON.stringify(next, null, 2)}\n`);
  }
  return { changed: true, reason: 'added', script };
}

export const REQUIRED_GATE_FILES = [
  'AGENTS.md',
  '.mcp.json',
];
const REQUIRED_GATE_WORKFLOW = '.github/workflows/*.yml running ark-check';
const COMPACT_ROUTER = /<!--\s*arkgate:compact-router host=([a-z]+)\s*-->/;
const FAIL_CLOSED_ARK_FLAG = /(?:^|\s)--(?:strict|strict-merge|require-gates)(?=\s|$)/;

const COMPACT_HOST_FILES = {
  claude: ['.claude/settings.json'],
  grok: ['.grok/config.toml', '.grok/hooks/ark-write-gate.json'],
  cursor: ['.cursor/mcp.json'],
  codex: ['.codex/hooks.json', '.codex/config.toml'],
  windsurf: ['.windsurf/rules/ark.md'],
  cline: ['.clinerules/ark.md'],
  copilot: ['.github/copilot-instructions.md'],
  kiro: ['.kiro/steering/ark.md'],
  roo: ['.roo/rules/ark.md'],
  continue: ['.continue/rules/ark.md'],
  gemini: ['GEMINI.md'],
};

export function compactRouterHost(root) {
  try {
    const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    return agents.match(COMPACT_ROUTER)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isCompactRouterAgentsContent(text) {
  return typeof text === 'string' && COMPACT_ROUTER.test(text);
}

function hasCompactHostRegistration(root, host) {
  if (host === 'none') return hasArkMcpRegistration(root);
  if (host === 'cursor') return hasArkMcpRegistration(root, '.cursor/mcp.json');
  if (host === 'codex') return hasCodexCompactRegistration(root);
  const files = COMPACT_HOST_FILES[host];
  return Boolean(files) && files.every((relativePath) => fs.existsSync(path.join(root, relativePath)));
}

function executableName(value) {
  return path.basename(String(value).trim().replace(/\\/g, '/')).replace(/\.(?:cmd|exe)$/i, '');
}

function arkMcpArgs(server) {
  if (!server || typeof server !== 'object' || typeof server.command !== 'string') return null;
  if (server.args !== undefined && !Array.isArray(server.args)) return null;
  const args = server.args ?? [];
  if (!args.every((value) => typeof value === 'string')) return null;
  const command = executableName(server.command);
  const isArkBin = (value) => /^(?:arkgate-mcp|ark-mcp)(?:\.mjs)?$/.test(executableName(value));
  if ([server.command, ...args].filter(isArkBin).length !== 1) return null;
  if (isArkBin(server.command)) return args;
  if ((command === 'npx' || command === 'yarn') && isArkBin(args[0])) return args.slice(1);
  if (command === 'pnpm') {
    const binIndex =
      args[0] === 'exec'
        ? 1
        : args[0] === '--config.verify-deps-before-run=false' && args[1] === 'exec'
          ? 2
          : -1;
    return binIndex >= 0 && isArkBin(args[binIndex]) ? args.slice(binIndex + 1) : null;
  }
  if (command === 'node') {
    const script = String(args[0] ?? '').replace(/\\/g, '/');
    return /(?:^|\/)bin\/ark-mcp\.mjs$/.test(script) ? args.slice(1) : null;
  }
  return null;
}

function projectBindingArguments(args) {
  if (args.length !== 4) return null;
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    if ((name !== '--root' && name !== '--config') || values[name] !== undefined) return null;
    const value = args[index + 1];
    if (typeof value !== 'string' || !value.trim() || value.startsWith('-')) return null;
    values[name] = value;
  }
  return values['--root'] && values['--config']
    ? { root: values['--root'], config: values['--config'] }
    : null;
}

function nativePathInput(value) {
  const text = String(value).trim();
  return path.sep === '/' ? text.replace(/\\/g, '/') : text.replace(/\//g, '\\');
}

function canonicalNativePath(value) {
  const absolute = path.resolve(value);
  let canonical = absolute;
  try {
    canonical = fs.realpathSync.native(absolute);
  } catch {
    /* A missing candidate still compares by its normalized absolute path. */
  }
  const normalized = path.normalize(canonical);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function bindingTargetsProject(binding, root, invocationRoot = root) {
  const resolvedRoot = path.resolve(invocationRoot, nativePathInput(binding.root));
  if (canonicalNativePath(resolvedRoot) !== canonicalNativePath(root)) return false;
  const nativeConfig = nativePathInput(binding.config);
  const resolvedConfig = path.isAbsolute(nativeConfig)
    ? nativeConfig
    : path.resolve(resolvedRoot, nativeConfig);
  return (
    canonicalNativePath(resolvedConfig) ===
    canonicalNativePath(path.join(root, 'ark.config.json'))
  );
}

function registrationTargetsProject(server, args, root) {
  const binding = projectBindingArguments(args);
  if (!binding) return false;
  if (server.cwd !== undefined && (typeof server.cwd !== 'string' || !server.cwd.trim())) {
    return false;
  }
  const invocationRoot = server.cwd
    ? path.resolve(root, nativePathInput(server.cwd))
    : root;
  return bindingTargetsProject(binding, root, invocationRoot);
}

export function hasArkMcpRegistration(root, relativePath = '.mcp.json') {
  try {
    const server = readJson(path.join(root, relativePath))?.mcpServers?.ark;
    const args = arkMcpArgs(server);
    return Boolean(args && registrationTargetsProject(server, args, root));
  } catch {
    return false;
  }
}

function commandArkMcpArgs(command) {
  if (typeof command !== 'string') return null;
  const words = [];
  let consumed = 0;
  for (const match of command.matchAll(/"([^"]*)"|'([^']*)'|(&&|\|\||[;|#])|([^\s;&|#]+)/g)) {
    if (command.slice(consumed, match.index).trim() || match[3]) return null;
    words.push(match[1] ?? match[2] ?? match[4]);
    consumed = Number(match.index) + match[0].length;
  }
  if (command.slice(consumed).trim()) return null;
  return arkMcpArgs({ command: words[0], args: words.slice(1) });
}

function codexHookArguments(args, expectedModes) {
  const allowedModes = new Set(expectedModes);
  const seenModes = new Set();
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (allowedModes.has(name)) {
      if (seenModes.has(name)) return null;
      seenModes.add(name);
      continue;
    }
    if (!['--root', '--root-env', '--config'].includes(name) || values[name] !== undefined) {
      return null;
    }
    const value = args[++index];
    if (typeof value !== 'string' || !value.trim() || value.startsWith('-')) return null;
    values[name] = value;
  }
  if (
    seenModes.size !== allowedModes.size ||
    !values['--root'] ||
    !values['--root-env'] ||
    !values['--config']
  ) {
    return null;
  }
  return {
    root: values['--root'],
    rootEnv: values['--root-env'],
    config: values['--config'],
  };
}

function codexHookCommandIsValid(command, root, expectedModes) {
  const args = commandArkMcpArgs(command);
  if (!args) return false;
  const binding = codexHookArguments(args, expectedModes);
  return Boolean(
    binding &&
      binding.rootEnv === 'CODEX_PROJECT_DIR' &&
      bindingTargetsProject(binding, root)
  );
}

function matcherHasExactTools(matcher, expectedTools) {
  if (typeof matcher !== 'string') return false;
  const tools = matcher.split('|').map((tool) => tool.trim()).filter(Boolean);
  const unique = new Set(tools);
  return (
    tools.length === expectedTools.length &&
    unique.size === expectedTools.length &&
    expectedTools.every((tool) => unique.has(tool))
  );
}

function hookGroupHasValidCodexContract(group, root, expectedModes, expectedTools = null) {
  if (!Array.isArray(group)) return false;
  return group.some(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      (!expectedTools || matcherHasExactTools(entry.matcher, expectedTools)) &&
      Array.isArray(entry.hooks) &&
      entry.hooks.some(
        (hook) =>
          hook &&
          typeof hook === 'object' &&
          hook.type === 'command' &&
          codexHookCommandIsValid(hook.command, root, expectedModes)
      )
  );
}

function hasCodexCompactRegistration(root) {
  try {
    const config = fs.readFileSync(path.join(root, '.codex', 'config.toml'), 'utf8');
    const hooks = readJson(path.join(root, '.codex', 'hooks.json'))?.hooks;
    return (
      codexProjectMcpIsValid(config, root) &&
      hookGroupHasValidCodexContract(hooks?.SessionStart, root, ['--session-context']) &&
      hookGroupHasValidCodexContract(hooks?.PreToolUse, root, [
        '--hook',
        '--hook-repair',
        '--fail-on-new-smells',
      ], ['ApplyPatch', 'apply_patch', 'Write', 'Edit', 'MultiEdit'])
    );
  } catch {
    return false;
  }
}

function architectureScript(root) {
  try {
    const script = readPackageJson(root)?.scripts?.['check:architecture'];
    return typeof script === 'string' ? script : '';
  } catch {
    return '';
  }
}

function isFailClosedArchitectureScript(script) {
  if (!script) return false;
  if (
    /(?:^|;|\n|(?<!&)&(?!&))\s*exit(?:\s+\/b)?\s+0(?=\s*(?:;|&&|\|\||#|$))/im.test(
      script
    )
  ) {
    return false;
  }
  const body = script
    .split('\n')
    .map((line) => `          ${line}`)
    .join('\n');
  const workflow = `jobs:
  ark:
    runs-on: ubuntu-latest
    steps:
      - run: |
${body}
`;
  return FAIL_CLOSED_ARK_FLAG.test(enforcingArkRunText(workflow));
}

export function hasArkAgentsContract(root) {
  try {
    const content = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    const directCheck =
      /\b(?:arkgate-check|ark-check)\b[\s\S]{0,240}--(?:strict-config|strict-merge|strict)\b/.test(
        content
      );
    const scriptCheck =
      /\b(?:npm|pnpm)\s+run\s+check:architecture\b|\byarn(?:\s+run)?\s+check:architecture\b/.test(
        content
      ) && isFailClosedArchitectureScript(architectureScript(root));
    return (
      /^#{1,6}\s+Ark(?:Gate)?\s+Enforcement\b/im.test(content) &&
      /\bark\.config\.json\b/i.test(content) &&
      /\bauthoritative\b/i.test(content) &&
      (directCheck || scriptCheck)
    );
  } catch {
    return false;
  }
}

function withFailClosedArkActions(content) {
  const lines = String(content).split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(
      /^(\s*)(-\s+)?uses:\s*['"]?pedroknigge\/arkgate@[^'"\s#]+['"]?\s*(?:#.*)?$/i
    );
    if (!match) continue;
    const propertyIndent = match[1].length + (match[2] ? 2 : 0);
    let start = index;
    let stepIndent = match[2] ? match[1].length : null;
    if (stepIndent === null) {
      for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const indent = lines[cursor].match(/^\s*/)?.[0].length ?? 0;
        if (/^\s*-\s+/.test(lines[cursor]) && indent < propertyIndent) {
          start = cursor;
          stepIndent = indent;
          break;
        }
      }
    }
    if (stepIndent === null) continue;
    let end = lines.length;
    for (let cursor = start + 1; cursor < lines.length; cursor += 1) {
      if (!lines[cursor].trim()) continue;
      const indent = lines[cursor].match(/^\s*/)?.[0].length ?? 0;
      if (indent < stepIndent || (indent === stepIndent && /^\s*-\s+/.test(lines[cursor]))) {
        end = cursor;
        break;
      }
    }
    const block = lines.slice(start, end).join('\n');
    const strictInput = block.match(/^\s*strict-config:\s*(.*?)\s*(?:#.*)?$/im)?.[1];
    if (strictInput !== undefined && !/^['"]?true['"]?$/i.test(strictInput)) {
      continue;
    }
    lines[index] = lines[index].replace(/\buses:/, 'run:').replace(
      /['"]?pedroknigge\/arkgate@[^'"\s#]+['"]?/i,
      'ark-check --strict-merge'
    );
  }
  return lines.join('\n');
}

function workflowJobSections(content) {
  const lines = String(content).split('\n');
  const jobsIndex = lines.findIndex((line) =>
    /^\s*(?:"jobs"|'jobs'|jobs):\s*(?:#.*)?$/.test(line)
  );
  if (jobsIndex < 0) return { lines, jobs: [] };
  const jobsIndent = lines[jobsIndex].match(/^\s*/)?.[0].length ?? 0;
  let jobIndent = null;
  let jobsEnd = lines.length;
  const headers = [];
  for (let index = jobsIndex + 1; index < lines.length; index += 1) {
    if (!lines[index].trim() || /^\s*#/.test(lines[index])) continue;
    const indent = lines[index].match(/^\s*/)?.[0].length ?? 0;
    if (indent <= jobsIndent) {
      jobsEnd = index;
      break;
    }
    const header = lines[index].match(
      /^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+)):\s*(?:#.*)?$/
    );
    if (!header) continue;
    jobIndent ??= indent;
    if (indent === jobIndent) {
      headers.push({ id: header[1] ?? header[2] ?? header[3], start: index });
    }
  }
  const jobs = headers.map((header, index) => {
    const end = headers[index + 1]?.start ?? jobsEnd;
    const propertyIndents = lines
      .slice(header.start + 1, end)
      .filter((line) => line.trim() && !/^\s*#/.test(line))
      .map((line) => line.match(/^\s*/)?.[0].length ?? 0)
      .filter((indent) => indent > Number(jobIndent));
    return {
      ...header,
      end,
      propertyIndent:
        propertyIndents.length > 0 ? Math.min(...propertyIndents) : Number(jobIndent) + 2,
    };
  });
  return { lines, jobs };
}

function jobProperty(lines, job, name) {
  const matcher = new RegExp(
    `^\\s*(?:"${name}"|'${name}'|${name}):\\s*(.*?)\\s*(?:#.*)?$`,
    'i'
  );
  for (let index = job.start + 1; index < job.end; index += 1) {
    if ((lines[index].match(/^\s*/)?.[0].length ?? 0) !== job.propertyIndent) continue;
    const match = lines[index].match(matcher);
    if (match) return { index, value: match[1].trim() };
  }
  return null;
}

function unquoteYamlScalar(value) {
  const text = String(value).trim();
  const match = text.match(/^(['"])(.*)\1$/);
  return match ? match[2].trim() : text;
}

function jobCondition(lines, job) {
  const condition = jobProperty(lines, job, 'if');
  if (!condition) return 'default';
  const value = unquoteYamlScalar(condition.value);
  if (/^(?:\$\{\{\s*)?always\(\)(?:\s*\}\})?$/i.test(value)) return 'always';
  if (/^(?:true|\$\{\{\s*true\s*\}\})$/i.test(value)) return 'true';
  return 'conditional';
}

function jobNeeds(lines, job) {
  const property = jobProperty(lines, job, 'needs');
  if (!property) return { ids: [], indexes: [], valid: true };
  const indexes = [property.index];
  if (property.value) {
    const value = unquoteYamlScalar(property.value);
    const raw = value.startsWith('[') && value.endsWith(']')
      ? value.slice(1, -1).split(',')
      : [value];
    const ids = raw.map(unquoteYamlScalar).filter((id) => /^[A-Za-z0-9_-]+$/.test(id));
    return { ids, indexes, valid: ids.length === raw.length && ids.length > 0 };
  }
  const ids = [];
  for (let index = property.index + 1; index < job.end; index += 1) {
    if (!lines[index].trim() || /^\s*#/.test(lines[index])) {
      indexes.push(index);
      continue;
    }
    const indent = lines[index].match(/^\s*/)?.[0].length ?? 0;
    if (indent <= job.propertyIndent) break;
    indexes.push(index);
    const item = lines[index].match(/^\s*-\s*(['"]?)([A-Za-z0-9_-]+)\1\s*(?:#.*)?$/);
    if (!item) return { ids: [], indexes, valid: false };
    ids.push(item[2]);
  }
  return { ids, indexes, valid: ids.length > 0 };
}

function withVerifiedDependencyJobs(content) {
  const { lines, jobs } = workflowJobSections(content);
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const guaranteed = (job, seen = new Set()) => {
    if (!job || seen.has(job.id)) return false;
    const condition = jobCondition(lines, job);
    if (condition === 'conditional') return false;
    if (condition === 'always') return true;
    const needs = jobNeeds(lines, job);
    if (!needs.valid) return false;
    const nextSeen = new Set(seen).add(job.id);
    return needs.ids.every((id) => guaranteed(byId.get(id), nextSeen));
  };
  for (const job of jobs) {
    const needs = jobNeeds(lines, job);
    if (
      needs.valid &&
      needs.ids.length > 0 &&
      needs.ids.every((id) => guaranteed(byId.get(id)))
    ) {
      // The shared analyzer treats every `needs` as skippable. Hide it only after
      // this dependency chain is proven unconditional; keep uncertain/skipped needs visible.
      for (const index of needs.indexes) lines[index] = '';
    }
  }
  return lines.join('\n');
}

export function hasArkWorkflow(root) {
  const workflowsDir = path.join(root, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) return false;
  const declaredScript = architectureScript(root);
  const script = isFailClosedArchitectureScript(declaredScript) ? declaredScript : '';
  return fs
    .readdirSync(workflowsDir)
    .filter((file) => /\.ya?ml$/i.test(file))
    .some((file) => {
      try {
        const content = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
        return FAIL_CLOSED_ARK_FLAG.test(
          enforcingArkRunText(
            withVerifiedDependencyJobs(withFailClosedArkActions(content)),
            script
          )
        );
      } catch {
        return false;
      }
    });
}

export function missingGates(root) {
  const compactHost = compactRouterHost(root);
  const missing = [];
  if (!hasArkAgentsContract(root)) missing.push('AGENTS.md');
  if (!compactHost && !hasArkMcpRegistration(root)) missing.push('.mcp.json');
  if (compactHost && !hasCompactHostRegistration(root, compactHost)) {
    missing.push(`compact host registration (${compactHost})`);
  }
  if (!hasArkWorkflow(root)) missing.push(REQUIRED_GATE_WORKFLOW);
  return missing;
}

export function ensureDirForFile(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

/**
 * True when AGENTS.md is wholly Ark-owned (header is Ark Enforcement).
 * Project guides that merely append an Ark section must remain non-Ark so --force
 * never wipes them.
 */
export function isArkAgentsContent(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  const head = text.trimStart().slice(0, 120);
  return /^#\s*Ark(Gate)?\s+Enforcement\b/.test(head);
}

/**
 * True when AGENTS.md is the **library mother-repo** self-hosted guide (Identity block).
 * Never replace with the consumer install template — even under `--force`.
 */
export function isSelfHostedLibraryAgents(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  return (
    /##\s*Identity\s*[—\-–-]\s*read this first/i.test(text) ||
    /mother\s*\/\s*canonical development repository/i.test(text) ||
    /Git\s*\/\s*clone only/i.test(text)
  );
}

export function writeTemplate(root, relativePath, content, force) {
  const fullPath = path.join(root, relativePath);
  if (relativePath === 'AGENTS.md' && fs.existsSync(fullPath)) {
    let existing = '';
    try {
      existing = fs.readFileSync(fullPath, 'utf8');
    } catch {
      existing = '';
    }
    // Library authoring tree: keep Identity + 4-layer dogfood contract forever.
    if (existing && isSelfHostedLibraryAgents(existing)) {
      return { relativePath, status: 'skipped-self-hosted' };
    }
    if (existing && !isArkAgentsContent(existing)) {
      // Never clobber a project-owned AGENTS.md — even with --force.
      // If Ark section not present yet, merge once; subsequent runs leave it alone.
      const hasArkSection =
        /#\s*Ark(Gate)?\s+Enforcement\b/.test(existing) ||
        /ark\.config\.json is authoritative/i.test(existing);
      if (force && isArkAgentsContent(content) && !hasArkSection) {
        try {
          const merged = `${existing.replace(/\s*$/, '')}\n\n---\n\n${content}`;
          ensureDirForFile(fullPath);
          fs.writeFileSync(fullPath, merged);
          return { relativePath, status: 'merged' };
        } catch {
          return { relativePath, status: 'failed' };
        }
      }
      return { relativePath, status: 'skipped-non-ark' };
    }
    if (!force && isArkAgentsContent(existing)) {
      return { relativePath, status: 'skipped' };
    }
  } else if (fs.existsSync(fullPath) && !force) {
    return { relativePath, status: 'skipped' };
  }
  try {
    ensureDirForFile(fullPath);
    fs.writeFileSync(fullPath, content);
    return { relativePath, status: 'written' };
  } catch {
    return { relativePath, status: 'failed' };
  }
}
