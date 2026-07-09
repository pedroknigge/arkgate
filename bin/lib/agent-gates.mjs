/**
 * Agent gate install, migrate, Codex, skills, adoption (roadmap #11).
 */
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  arkCommand,
  detectPackageManager,
  execCommandParts,
  execRunner,
  presentLockfiles,
  usableTypescript,
  typescriptUsabilityHint,
  DEFAULT_INTENT_PREFIXES,
  DEFAULT_LAYER_DIRECTORIES,
  DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
  DEFAULT_RULES,
  createElevenLayerConfig,
  applyFrameworkLayoutOverlays
} from '../ark-shared.mjs';

/** Package root (parent of bin/). All modules live under bin/lib/. */
const __packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const __arkCheckCli = path.join(__packageRoot, 'bin', 'ark-check.mjs');

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

export const REQUIRED_GATE_FILES = [
  'AGENTS.md',
  '.mcp.json',
];
const REQUIRED_GATE_WORKFLOW = '.github/workflows/*.yml running ark-check';

export function hasArkWorkflow(root) {
  const workflowsDir = path.join(root, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) return false;
  return fs
    .readdirSync(workflowsDir)
    .filter((file) => /\.ya?ml$/i.test(file))
    .some((file) => {
      try {
        const content = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
        return /\bark-check\b/.test(content) || /\bcheck:architecture\b/.test(content);
      } catch {
        return false;
      }
    });
}

export function missingGates(root) {
  const missing = REQUIRED_GATE_FILES.filter(
    (relativePath) => !fs.existsSync(path.join(root, relativePath))
  );
  if (!hasArkWorkflow(root)) missing.push(REQUIRED_GATE_WORKFLOW);
  return missing;
}

export function checkArchitectureScriptSnippet(root) {
  // The package manager's runner resolves the installed binary; `node bin/ark-check.mjs`
  // only works inside Ark's own repo. Package-manager aware so a pnpm/yarn repo isn't
  // handed an `npx` alias that violates its "never npx" policy.
  return `"check:architecture": "${arkCheckCommand(root)}"`;
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

export function writeTemplate(root, relativePath, content, force) {
  const fullPath = path.join(root, relativePath);
  if (relativePath === 'AGENTS.md' && fs.existsSync(fullPath)) {
    let existing = '';
    try {
      existing = fs.readFileSync(fullPath, 'utf8');
    } catch {
      existing = '';
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

/**
 * Load a TypeScript module with a working JS API host (`sys` + AST + resolve).
 * Prefer the project's install when API-compatible (TS 5/6 + any TS 7 that still
 * exposes the classic JS host). TypeScript 7.0.x main entry is version-only
 * (`{ version, versionMajorMinor }`); programmatic APIs live under
 * `typescript/unstable/*` and are not yet the gate's host — we fall through to
 * ArkGate's own `typescript` dependency (JS-API 5.x) or a bare import.
 * Returns `{ ts, source, version, fallbackReason? }` or null.
 */
export async function loadTypeScript(root) {
  const { createRequire } = await import('node:module');
  const loaders = [];
  try {
    const req = createRequire(path.join(root, 'package.json'));
    loaders.push({
      label: 'project',
      load: () => req('typescript'),
      resolvePath: () => {
        try {
          return req.resolve('typescript');
        } catch {
          return null;
        }
      },
    });
  } catch {
    /* project has no package.json resolvable tree */
  }
  // Nested under arkgate (production dependency) — must work when project has only TS7.
  try {
    const req = createRequire(__arkCheckCli);
    loaders.push({
      label: 'arkgate',
      load: () => req('typescript'),
      resolvePath: () => {
        try {
          return req.resolve('typescript');
        } catch {
          return null;
        }
      },
    });
  } catch {
    /* ark install tree unavailable */
  }
  loaders.push({
    label: 'import',
    load: async () => {
      const m = await import('typescript');
      return m;
    },
    resolvePath: () => null,
  });

  let projectRejected = null;
  const triedPaths = new Set();
  for (const { label, load, resolvePath } of loaders) {
    try {
      const resolved = typeof resolvePath === 'function' ? resolvePath() : null;
      if (resolved && triedPaths.has(resolved)) {
        // Same physical package already rejected (e.g. project === hoisted arkgate path).
        continue;
      }
      if (resolved) triedPaths.add(resolved);

      const mod = await load();
      const ts = usableTypescript(mod);
      if (ts) {
        const version =
          typeof ts.version === 'string'
            ? ts.version
            : typeof mod?.version === 'string'
              ? mod.version
              : undefined;
        return {
          ts,
          source: label,
          version,
          ...(projectRejected ? { fallbackReason: projectRejected } : {}),
        };
      }
      if (label === 'project' && mod) {
        projectRejected = `project typescript is not API-compatible (${typescriptUsabilityHint(mod)}); using ArkGate's JS-API TypeScript fallback (TypeScript 7.0 main export is version-only). See docs/typescript-support.md.`;
      }
    } catch {
      /* try next loader */
    }
  }
  return null;
}

/**
 * Args for every emitted `ark-check` (AGENTS.md, package.json, Cursor rule, CI).
 * If `.ark-baseline.json` exists, include `--baseline` so agent/local/CI paths
 * match the ratchet — otherwise agents re-fail on frozen debt (field-test bug).
 */
export function checkArgsForRoot(root, { requireGates = false } = {}) {
  const baselineFlag = fs.existsSync(path.join(root, '.ark-baseline.json'))
    ? ' --baseline .ark-baseline.json'
    : '';
  const gatesFlag = requireGates ? ' --require-gates' : '';
  return `--root . --config ark.config.json --strict-config${baselineFlag}${gatesFlag}`;
}

export function packageManager(root) {
  // CI always require-gates; baseline follows checkArgsForRoot.
  const checkArgs = checkArgsForRoot(root, { requireGates: true });
  // Same detection as every emitted command (execRunner): honors the packageManager field and
  // won't let a stray pnpm-lock.yaml hijack an npm project (package-lock.json wins the tie).
  const pm = detectPackageManager(root);
  if (pm === 'pnpm') {
    return {
      cache: 'pnpm',
      setup: ['corepack enable'],
      install: 'pnpm install --frozen-lockfile',
      // Same runner as execRunner(): skip pnpm's verify-deps gate (ERR_PNPM_IGNORED_BUILDS).
      run: `pnpm --config.verify-deps-before-run=false exec ark-check ${checkArgs}`,
    };
  }
  if (pm === 'yarn') {
    return {
      cache: 'yarn',
      setup: ['corepack enable'],
      install: 'yarn install --frozen-lockfile',
      run: `yarn ark-check ${checkArgs}`,
    };
  }
  // Monorepo hosts (e.g. Next app under frontend/) often have a root package.json only for
  // arkgate while real app deps live in frontend/package.json. Install both so CI can resolve
  // the tree; ark-check itself only needs the root arkgate install.
  const frontendPkg = fs.existsSync(path.join(root, 'frontend', 'package.json'));
  const rootInstall = fs.existsSync(path.join(root, 'package-lock.json')) ? 'npm ci' : 'npm install';
  const install = frontendPkg
    ? `${rootInstall} && (cd frontend && ${fs.existsSync(path.join(root, 'frontend', 'package-lock.json')) ? 'npm ci' : 'npm install'})`
    : rootInstall;
  return {
    cache: 'npm',
    setup: [],
    install,
    run: `npx ark-check ${checkArgs}`,
  };
}

// The runner prefix (npx / pnpm exec / yarn) is added per project by arkCheckCommand
// so a pnpm-only repo never gets an `npx` instruction — see execRunner() in ark-shared.mjs.
export function arkCheckCommand(root) {
  return arkCommand(root, 'ark-check', checkArgsForRoot(root));
}

// Canonical agent contract. AGENTS.md and the Cursor rule both derive from this single
// source so the steps can never drift out of sync between the two files. `steps(checkCommand)`
// is a builder because the check command's runner prefix varies with the package manager.
const AGENT_CONTRACT = {
  manifestResource: 'ark://manifest',
  steps: (checkCommand) => [
    `Read the Ark contract from \`ark://manifest\` when the MCP server is available.`,
    `Keep source files inside the layer boundaries declared in \`ark.config.json\`.`,
    `Do not bypass Ark publishers, event contracts, or source metadata for runtime mutations.`,
    `After edits, run \`${checkCommand}\`.`,
    `If Ark reports violations, fix the architecture instead of weakening the gate.`,
  ],
  // Cursor-only guidance: the write-time validate_code tool is available in
  // Cursor's runtime but has no equivalent in a plain AGENTS.md read.
  cursorValidateStep: `Validate the full post-edit file content with the \`validate_code\` tool before writing whenever your runtime supports it.`,
};

export function layerPlacementTable() {
  const rows = DEFAULT_INTENT_PREFIXES.map((entry) => {
    const dirs = (DEFAULT_LAYER_DIRECTORIES[entry.layer] ?? [])
      .map((directory) => `\`${directory}/\``)
      .join(', ');
    return `| ${entry.layer} | ${dirs} | ${entry.prefixes.map((p) => `\`${p}\``).join(', ')} |`;
  }).join('\n');
  return `| Layer | Conventional directories (under the source root) | Intent prefixes |
|-------|---------------------------------------------------|-----------------|
${rows}`;
}

export function agentInstructions(root) {
  const checkCmd = arkCheckCommand(root);
  const startCmd = arkCommand(root, 'ark', 'start');
  const doctorCmd = arkCommand(root, 'ark-check', '--doctor');
  const steps = AGENT_CONTRACT.steps(checkCmd)
    .map((step, index) => `${index + 1}. ${step}`)
    .join('\n');
  return `# Ark Enforcement

## Default agent flow (if unsure, do only this)

1. If \`ark.config.json\` is missing: run \`${startCmd}\` once.
2. For adoption / cleanup / “make architecture sound”: run the **\`/ark-autopilot\`** skill
   (origin report → adopt → plan → safe fixes → gates). Do **not** invent a parallel workflow
   from the long skill list.
3. Status anytime: \`${doctorCmd}\` (status light + next action — not a mode picker).
4. After ordinary feature edits: run \`${checkCmd}\`. On violations → **\`/ark-fix\`** (or
   \`/ark-place\` for new files, \`/ark-contract\` only if the contract itself is wrong).

Other \`/ark-*\` skills are optional escapes (adopt, coverage, runtime, …), not required steps.

## Before editing TypeScript or JavaScript source files

${steps}

## Where new code belongs

\`ark.config.json\` is authoritative for this project. When creating a NEW kind of code
that no existing layer covers (a saga, a background job, a read model, ...), use the
default 11-layer placement below and add the layer to \`ark.config.json\` — do not invent
an ungoverned location:

${layerPlacementTable()}

The project is only considered Ark-enforced when the write gate and CI gate pass
(runtime path only if this project opted into the kernel).
`;
}

export function mcpJson(root) {
  return `${JSON.stringify({
    mcpServers: {
      ark: {
        type: 'stdio',
        // Prefer arkgate-mcp; ark-mcp alias still works for one major.
        ...execCommandParts(root, PREFERRED_MCP_BIN, ['--root', '.', '--config', 'ark.config.json']),
      },
    },
  }, null, 2)}\n`;
}

// Sample for docs/ — `ark-check --install-agent-gates --tools codex` auto-merges the real
// block (with absolute paths) into ~/.codex/config.toml. This copy is a reference only, so
// it flags the two gotchas of hand-editing the global config: absolute paths (config.toml is
// loaded without the project as cwd) and the required restart.
export function codexTomlSnippet(root) {
  const { command, args } = execCommandParts(root, PREFERRED_MCP_BIN, [
    '--root',
    '/absolute/path/to/project',
    '--config',
    '/absolute/path/to/project/ark.config.json',
  ]);
  const argsToml = args.map((value) => `"${value}"`).join(', ');
  return `# Add to ~/.codex/config.toml (or $CODEX_HOME/config.toml), then RESTART Codex —
# it does not hot-load MCP servers. Use ABSOLUTE paths: config.toml is global, so
# "." would resolve against Codex's launch dir, not this project. Prefer:
#   ark-check --install-agent-gates --tools codex   (auto-merges the absolute paths)
[mcp_servers.ark]
command = "${command}"
args = [${argsToml}]
`;
}

/**
 * Compact always-on rule for instruction-tier hosts (Windsurf, Cline, GitHub Copilot,
 * Kiro, ...): agents that read a project rule file but have no MCP tools or hooks.
 * Derived from the same AGENT_CONTRACT as AGENTS.md and the Cursor rule so the steps
 * can never drift; points at AGENTS.md for the full placement table.
 */
export function instructionRule(root) {
  const steps = AGENT_CONTRACT.steps(arkCheckCommand(root))
    .map((step, index) => `${index + 1}. ${step}`)
    .join('\n');
  return `# Ark architecture contract

This project's architecture is governed by Ark (\`ark.config.json\` is authoritative).
Before writing or editing TypeScript or JavaScript source files:

${steps}

See \`AGENTS.md\` for the full contract and the layer placement table.
`;
}

export function cursorRule(root) {
  return `---
description: Ark architecture contract
alwaysApply: true
---

Before writing or editing TypeScript or JavaScript source files, read the
\`${AGENT_CONTRACT.manifestResource}\` resource from the \`ark\` MCP server when available.

${AGENT_CONTRACT.cursorValidateStep} After edits, run:

\`\`\`bash
${arkCheckCommand(root)}
\`\`\`

If Ark reports violations, fix the architecture instead of bypassing the gate.
`;
}

// Default CI Node when the project declares nothing. A current LTS, NOT the
// oldest supported: the npm-ci-lockfile-mismatch failure only happens when CI's
// npm is OLDER than the npm that wrote the lockfile, so defaulting high is safer.
const DEFAULT_CI_NODE_VERSION = '22';

// Decide the Node the generated CI should use, preferring the project's own
// declaration so CI's npm matches the dev's (a mismatch makes `npm ci` fail with
// "missing from lock file" — a red gate unrelated to architecture). In order:
//   1. .nvmrc / .node-version → setup-node's node-version-file (exact, best)
//   2. package.json engines.node → its concrete major
//   3. a current-LTS default
export function detectCiNode(root) {
  for (const file of ['.nvmrc', '.node-version']) {
    if (fs.existsSync(path.join(root, file))) return { kind: 'file', value: file };
  }
  const enginesNode = readPackageJson(root)?.engines?.node;
  if (typeof enginesNode === 'string') {
    const major = enginesNode.match(/\d+/)?.[0];
    if (major) return { kind: 'version', value: major };
  }
  return { kind: 'default', value: DEFAULT_CI_NODE_VERSION };
}

export function githubWorkflow(pm, ciNode) {
  // pnpm/yarn setup (corepack enable) MUST run before actions/setup-node so the package
  // manager is on PATH when setup-node's `cache: pnpm|yarn` tries to resolve the store —
  // otherwise the cache step fails on a fresh runner ("Unable to locate executable file: pnpm").
  const setupSteps = pm.setup.map((command) => `      - run: ${command}`).join('\n');
  // node-version-file keeps CI locked to the dev's exact toolchain; an explicit
  // version comes from engines.node; the default carries a hint for the mismatch
  // symptom since we can't know which npm wrote the lockfile.
  const nodeSetup =
    ciNode.kind === 'file'
      ? `          node-version-file: ${ciNode.value}`
      : ciNode.kind === 'version'
        ? `          node-version: '${ciNode.value}'`
        : `          # If the install step fails with "missing from lock file" / lockfile out
          # of sync, your local package manager is newer than this Node's — add a
          # .nvmrc with your Node version so CI matches the dev environment.
          node-version: '${ciNode.value}'`;
  return `name: Ark architecture gate

on:
  pull_request:
  push:
    branches: [main, master]

jobs:
  ark-check:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
${setupSteps ? `${setupSteps}\n` : ''}      - name: Setup Node
        uses: actions/setup-node@v4
        with:
${nodeSetup}
          cache: ${pm.cache}
      - name: Install dependencies
        run: ${pm.install}
      - name: Ark architecture check
        run: ${pm.run}
`;
}

export function claudeSettings(root) {
  const runner = execRunner(root);
  return `${JSON.stringify({
    hooks: {
      // Inject the contract at session start so the agent knows the architecture from
      // the first token. Project-scoped by design; --session-context is also a silent
      // no-op when no ark.config.json exists, so it can never leak into other projects.
      SessionStart: [
        {
          hooks: [
            {
              type: 'command',
              command: `${runner} ${PREFERRED_MCP_BIN} --session-context --root "$CLAUDE_PROJECT_DIR" --config ark.config.json`,
            },
          ],
        },
      ],
      PreToolUse: [
        {
          matcher: 'Write|Edit|MultiEdit',
          hooks: [
            {
              type: 'command',
              command: `${runner} ${PREFERRED_MCP_BIN} --hook --root "$CLAUDE_PROJECT_DIR" --config ark.config.json`,
            },
          ],
        },
      ],
    },
  }, null, 2)}\n`;
}

// Grok Build project config: MCP registration (commit-friendly relative paths — unlike
// Codex's global config.toml, Grok loads .grok/config.toml from the project).
export function grokProjectConfig(root) {
  const { command, args } = execCommandParts(root, PREFERRED_MCP_BIN, [
    '--root',
    '.',
    '--config',
    'ark.config.json',
  ]);
  const argsToml = args.map((value) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(', ');
  return `# Generated by ark-check --install-agent-gates (Grok Build project scope).
# Restart Grok (or /mcps → refresh) after changes. Also loads repo-root .mcp.json.
[mcp_servers.ark]
command = "${command.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
args = [${argsToml}]
`;
}

// Grok Build hooks: same arkgate-mcp contracts as Claude. Grok sets both
// GROK_WORKSPACE_ROOT and CLAUDE_PROJECT_DIR (Claude-compatible alias). Prefer
// GROK_* with fallback so hooks still work if only one is present.
// Matcher keeps Claude names (Write|Edit|MultiEdit) and Grok natives
// (write|search_replace) — Grok aliases both directions.
export function grokHooks(root) {
  const runner = execRunner(root);
  // Nested defaults: Grok native → Claude alias → project cwd (hook cwd is the workspace).
  const grokRoot = '${GROK_WORKSPACE_ROOT:-${CLAUDE_PROJECT_DIR:-.}}';
  return `${JSON.stringify({
    hooks: {
      SessionStart: [
        {
          hooks: [
            {
              type: 'command',
              timeout: 30,
              command: `${runner} ${PREFERRED_MCP_BIN} --session-context --root "${grokRoot}" --config ark.config.json`,
            },
          ],
        },
      ],
      PreToolUse: [
        {
          matcher: 'Write|Edit|MultiEdit|write|search_replace',
          hooks: [
            {
              type: 'command',
              timeout: 30,
              command: `${runner} ${PREFERRED_MCP_BIN} --hook --root "${grokRoot}" --config ark.config.json`,
            },
          ],
        },
      ],
    },
  }, null, 2)}\n`;
}

/** Normalize --tools from array or comma-separated string (never character-split a string). */
export function normalizeToolsList(tools) {
  if (tools == null) return [];
  if (Array.isArray(tools)) {
    return tools
      .flatMap((t) => String(t).split(','))
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof tools === 'string') {
    return tools
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

export function resolveTools(args) {
  const explicit = normalizeToolsList(args.tools);
  if (explicit.length > 0) {
    return { tools: new Set(explicit), source: 'explicit' };
  }
  const root = args.root;
  const detected = new Set();
  if (fs.existsSync(path.join(root, '.claude'))) detected.add('claude');
  if (fs.existsSync(path.join(root, '.cursor'))) detected.add('cursor');
  if (fs.existsSync(path.join(root, '.codex'))) detected.add('codex');
  if (fs.existsSync(path.join(root, '.grok'))) detected.add('grok');
  if (fs.existsSync(path.join(root, '.windsurf'))) detected.add('windsurf');
  // .clinerules can also be a single FILE (older Cline convention); only a directory
  // can receive .clinerules/ark.md, so a file must not trigger detection.
  if (fs.statSync(path.join(root, '.clinerules'), { throwIfNoEntry: false })?.isDirectory()) {
    detected.add('cline');
  }
  if (fs.existsSync(path.join(root, '.kiro'))) detected.add('kiro');
  if (fs.existsSync(path.join(root, '.roo'))) detected.add('roo');
  if (fs.existsSync(path.join(root, '.continue'))) detected.add('continue');
  if (fs.existsSync(path.join(root, '.gemini'))) detected.add('gemini');
  // copilot has no reliable directory signal (.github exists in most repos),
  // so it is explicit-only via --tools.
  // No signal at all: fall back to writing the primary tools' templates so a fresh
  // project still gets a complete, reviewable starter set.
  if (detected.size === 0) {
    return { tools: new Set(['claude', 'cursor', 'codex']), source: 'default' };
  }
  return { tools: detected, source: 'detected' };
}

const KNOWN_TOOLS = [
  'claude',
  'cursor',
  'codex',
  'grok',
  'windsurf',
  'cline',
  'copilot',
  'kiro',
  'roo',
  'continue',
  'gemini',
];

// One canonical markdown per skill (templates/skills/*.md, shipped in the npm
// package); installed into each tool's slash-command location. The YAML
// frontmatter (name/description) is understood or harmlessly ignored by every
// host. Kiro has no command mechanism — its steering rule file is the only gate.
const SKILL_TOOL_TARGETS = {
  claude: (name) => `.claude/skills/${name}/SKILL.md`,
  cursor: (name) => `.cursor/commands/${name}.md`,
  codex: (name) => `.codex/prompts/${name}.md`,
  // Grok Build: project skills at .grok/skills/<name>/SKILL.md (slash-invocable).
  grok: (name) => `.grok/skills/${name}/SKILL.md`,
  windsurf: (name) => `.windsurf/workflows/${name}.md`,
  cline: (name) => `.clinerules/workflows/${name}.md`,
  copilot: (name) => `.github/prompts/${name}.prompt.md`,
};

// The version of the arkgate package these bins ship with. Used to
// stamp installed skills so a normal ark-check can tell "outdated skill from an
// older Ark" apart from "user-customized skill" — the stamp moves with the
// package, editing the body doesn't.
export function arkPackageVersion() {
  try {
    const pkg = readJson(path.join(__packageRoot, 'package.json'));
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

// Insert `arkVersion: <v>` into a skill's YAML frontmatter (before its closing
// `---`). No frontmatter → returned unchanged. Idempotent for a given version.
export function stampSkill(content, version) {
  if (!version) return content;
  const lines = content.split('\n');
  if (lines[0] !== '---') return content;
  const closeIdx = lines.indexOf('---', 1);
  if (closeIdx === -1) return content;
  const existing = lines.findIndex(
    (line, i) => i > 0 && i < closeIdx && /^arkVersion:/.test(line)
  );
  if (existing !== -1) {
    lines[existing] = `arkVersion: ${version}`;
  } else {
    lines.splice(closeIdx, 0, `arkVersion: ${version}`);
  }
  return lines.join('\n');
}

// Read the `arkVersion:` stamp from an installed skill file. Returns null when
// the file is absent or has no stamp (installed by a pre-stamp Ark, or hand-authored).
export function installedSkillVersion(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  const match = content.match(/^arkVersion:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

// Numeric-tuple compare of dotted versions; true when `a` is strictly older than
// `b`. Non-numeric/absent segments compare as 0, so "1.7" < "1.7.5".
export function isVersionOlder(a, b) {
  const parse = (v) => String(v).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const av = parse(a);
  const bv = parse(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i += 1) {
    const x = av[i] ?? 0;
    const y = bv[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

export function skillTemplates() {
  const dir = path.join(__packageRoot, 'templates', 'skills');
  // A missing/mispackaged templates dir would otherwise install zero skills with
  // exit 0 — warn so a packaging regression (e.g. "templates" dropped from the
  // package.json files array) is visible instead of a silent no-op.
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    console.error(
      `Warning: skill templates directory not found (${dir}); no /ark-* skills installed.`
    );
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && /^[a-z0-9-]+\.md$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .map((name) => [path.basename(name, '.md'), fs.readFileSync(path.join(dir, name), 'utf8')]);
}

// Skill names only, silent on a missing templates dir — for the freshness
// advisory below, which must not print packaging warnings on every check run.
export function skillTemplateNames() {
  const dir = path.join(__packageRoot, 'templates', 'skills');
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && /^[a-z0-9-]+\.md$/.test(entry.name))
    .map((entry) => path.basename(entry.name, '.md'));
}

// A normal ark-check run is the reliable discovery point for new /ark-* skills.
// Ark ships no install lifecycle script (a postinstall banner would be blocked by
// modern package managers' script-approval policy anyway, so careful users never
// saw it — and it broke hardened installs). When a project has adopted Ark agent
// gates (AGENTS.md present) but a detected tool is missing
// skills this version ships, surface it here so agents and CI actually notice.
// Advisory only — never affects the exit code. Copilot has no reliable directory
// signal, so it is not auto-detected (explicit --tools only), matching resolveTools.
// Where Codex loads slash-command prompts from. Codex reads $CODEX_HOME/prompts
// (defaulting to ~/.codex/prompts), NOT the repo — so home copies of the /ark-*
// skills drift out of date when a repo refresh only touches in-repo tool dirs.
export function codexPromptsDir() {
  const base = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.join(base, 'prompts');
}

// Where Codex reads its MCP server registrations. Unlike Claude (.claude/settings.json)
// and Cursor (.cursor/mcp.json), Codex loads MCP servers only from $CODEX_HOME/config.toml
// (~/.codex/config.toml) — never from .mcp.json — so wiring Codex means editing the user's
// home config, not a repo file.
export function codexConfigPath() {
  const base = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.join(base, 'config.toml');
}

// Merge the [mcp_servers.ark] table into Codex's config.toml so `ark://manifest` and the
// AI write gate are live from the first edit — the piece that was previously only shipped as
// a copy-me sample in docs/ark-codex-config.toml. Idempotent: an existing ark table is left
// untouched unless `force` replaces it; other content in the file is preserved. Returns a
// status for the install summary. The table match runs from the [mcp_servers.ark] header to
// the line before the next top-level table header (a line starting with `[`) or EOF.
//
// Unlike .mcp.json / .cursor/mcp.json (loaded relative to the project), config.toml is a
// GLOBAL file — Codex launches it without the project as cwd — so `--root .` would resolve
// against the wrong directory. The paths must be absolute, and TOML string values need the
// backslashes/quotes escaped (matters on Windows and for repo paths containing quotes).
export function wireCodexMcp(root, force) {
  const file = codexConfigPath();
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const absRoot = path.resolve(root);
  const absConfig = path.join(absRoot, 'ark.config.json');
  // Preferred product bin; absolute --root so Codex (cwd ≠ project) resolves correctly.
  const preferredBin = 'arkgate-mcp';
  const { command, args } = execCommandParts(root, preferredBin, [
    '--root',
    esc(absRoot),
    '--config',
    esc(absConfig),
  ]);
  const argsToml = args.map((value) => `"${value}"`).join(', ');
  const makeBlock = (table) =>
    `[mcp_servers.${table}]
command = "${command}"
args = [${argsToml}]`;
  let existing = '';
  try {
    if (fs.existsSync(file)) existing = fs.readFileSync(file, 'utf8');
  } catch (error) {
    return { status: 'failed', file, message: error.message };
  }
  const tableRe = /(^|\n)\[mcp_servers\.ark\][^\n]*\n(?:(?!\[)[^\n]*\n?)*/;
  const hasTable = tableRe.test(existing);
  const existingRoot = hasTable ? extractCodexArkRootFromToml(existing) : null;
  let differentProject = false;
  try {
    differentProject = Boolean(
      existingRoot && path.resolve(existingRoot) !== absRoot
    );
  } catch {
    differentProject = Boolean(existingRoot);
  }
  // Fail-closed: rewrite temp/upgrade roots and dual/wrong bins even without --force.
  const mustRewrite = hasTable && codexArkBlockNeedsRewrite(existing, absRoot);

  // Multi-project: another project's [mcp_servers.ark] is present. Without --force,
  // add a project-scoped table so we do not steal the primary binding.
  if (hasTable && differentProject && !force && !mustRewrite) {
    const slug =
      path
        .basename(absRoot)
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 48) || 'project';
    const table = `ark_${slug}`;
    const multiRe = new RegExp(
      `(^|\\n)\\[mcp_servers\\.${table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\][^\\n]*\\n(?:(?!\\[)[^\\n]*\\n?)*`
    );
    const block = makeBlock(table);
    let next;
    if (multiRe.test(existing)) {
      next = existing.replace(multiRe, (match) => `${match.startsWith('\n') ? '\n' : ''}${block}\n`);
    } else {
      const sep =
        existing.length === 0
          ? ''
          : existing.endsWith('\n\n')
            ? ''
            : existing.endsWith('\n')
              ? '\n'
              : '\n\n';
      next = `${existing}${sep}${block}\n`;
    }
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, next);
    } catch (error) {
      return { status: 'failed', file, message: error.message };
    }
    return { status: 'written-multi', file, table, primaryUnchanged: true };
  }

  if (hasTable && !force && !mustRewrite) {
    return { status: 'skipped', file };
  }
  const block = makeBlock('ark');
  let next;
  if (hasTable) {
    next = existing.replace(tableRe, (match) => `${match.startsWith('\n') ? '\n' : ''}${block}\n`);
  } else {
    const sep = existing.length === 0 ? '' : existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
    next = `${existing}${sep}${block}\n`;
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, next);
  } catch (error) {
    return { status: 'failed', file, message: error.message };
  }
  return {
    status: hasTable ? 'updated' : 'written',
    file,
    ...(mustRewrite && !force ? { reason: 'temp-or-stale-root' } : {}),
  };
}

// Detects stale/missing /ark-* skills in the Codex home prompts dir. Only nags
// when at least one ark-* prompt already lives there (evidence Codex was set up
// for this user) — never introduces Codex to someone who doesn't use it. Same
// guards as detectSkillGaps (adopted repo, not the Ark source tree).
export function detectCodexHomeGap(root) {
  if (!fs.existsSync(path.join(root, 'AGENTS.md'))) return null;
  if (fs.existsSync(path.join(root, 'templates', 'skills'))) return null;
  const skillNames = skillTemplateNames();
  if (skillNames.length === 0) return null;
  const dir = codexPromptsDir();
  if (!fs.existsSync(dir)) return null;
  const present = skillNames.filter((name) => fs.existsSync(path.join(dir, `${name}.md`)));
  if (present.length === 0) return null; // Codex home never set up for Ark — don't nag.
  const version = arkPackageVersion();
  const missing = skillNames.length - present.length;
  let stale = 0;
  if (version) {
    for (const name of present) {
      const installed = installedSkillVersion(path.join(dir, `${name}.md`));
      if (installed === null || isVersionOlder(installed, version)) stale += 1;
    }
  }
  return missing > 0 || stale > 0 ? { missing, stale } : null;
}

export function detectSkillGaps(root) {
  if (!fs.existsSync(path.join(root, 'AGENTS.md'))) return [];
  // The Ark source tree keeps the skill templates at templates/skills/ — it's the
  // producer, not a consumer, so it must not nag itself to "install" its own skills.
  if (fs.existsSync(path.join(root, 'templates', 'skills'))) return [];
  const skillNames = skillTemplateNames();
  if (skillNames.length === 0) return [];
  const detected = [];
  if (fs.existsSync(path.join(root, '.claude'))) detected.push('claude');
  if (fs.existsSync(path.join(root, '.cursor'))) detected.push('cursor');
  if (fs.existsSync(path.join(root, '.codex'))) detected.push('codex');
  if (fs.existsSync(path.join(root, '.grok'))) detected.push('grok');
  if (fs.existsSync(path.join(root, '.windsurf'))) detected.push('windsurf');
  if (fs.statSync(path.join(root, '.clinerules'), { throwIfNoEntry: false })?.isDirectory()) {
    detected.push('cline');
  }
  const version = arkPackageVersion();
  const gaps = [];
  for (const tool of detected) {
    const target = SKILL_TOOL_TARGETS[tool];
    if (!target) continue;
    let missing = 0;
    let stale = 0;
    for (const name of skillNames) {
      const file = path.join(root, target(name));
      if (!fs.existsSync(file)) {
        missing += 1;
      } else if (version) {
        // An installed skill with no stamp predates stamping (older Ark), or one
        // stamped behind the current version is left over from an older install.
        // Either way the shipped skill has moved on — offer a --force refresh.
        const installed = installedSkillVersion(file);
        if (installed === null || isVersionOlder(installed, version)) stale += 1;
      }
    }
    if (missing > 0 || stale > 0) gaps.push({ tool, missing, stale });
  }
  return gaps;
}

// Files carrying an emitted Ark command whose runner (npx / pnpm exec / yarn) should match
// the project's package manager. .mcp.json / .cursor/mcp.json hold it structurally
// (command/args); the rest hold it as text ("npx ark-check …", incl. .claude/settings.json
// hook strings and the package.json check:architecture script).
const COMMAND_GATE_TEXT_FILES = [
  '.claude/settings.json', 'AGENTS.md', '.cursor/rules/ark.mdc', '.windsurf/rules/ark.md',
  '.clinerules/ark.md', '.github/copilot-instructions.md', '.kiro/steering/ark.md',
  '.roo/rules/ark.md', '.continue/rules/ark.md', 'GEMINI.md', 'package.json',
  '.grok/hooks/ark-write-gate.json', '.grok/config.toml',
];
const COMMAND_GATE_JSON_FILES = ['.mcp.json', '.cursor/mcp.json'];
// Primary CLI names (product) + one-major aliases. migrate-commands must strip ALL of these
// before re-emitting a single preferred bin — otherwise a partial rename leaves
// args: ["ark-mcp", "arkgate-mcp", ...] which breaks stdio MCP hosts.
const ARK_MCP_BINS = new Set(['arkgate-mcp', 'ark-mcp']);
const ARK_CHECK_BINS = new Set(['arkgate-check', 'ark-check']);
const ARK_CLI_BINS = new Set(['arkgate', 'ark']);
const PREFERRED_MCP_BIN = 'arkgate-mcp';
const PREFERRED_CHECK_BIN = 'arkgate-check';
const PREFERRED_CLI_BIN = 'arkgate';
// Runner argv noise that is not a bin argument (pnpm exec form).
const MCP_RUNNER_ARGV = new Set(['exec', '--config.verify-deps-before-run=false']);
// The runner token immediately before an ark command in a text command string.
// Matches npm/yarn runners and both pnpm forms (legacy `pnpm exec` + verify-deps-safe form).
// Longer bin names first so `arkgate-check` is not partially matched as `ark`.
const RUNNER_BEFORE_ARK =
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

/** Core layers whose optionality matters once they match files (presets share these names). */
const CORE_LAYER_NAMES = new Set([
  'DomainModel',
  'ApplicationOrchestration',
  'PresentationAdapters',
  'PersistenceAdapters',
]);

/** Temp / upgrade sandbox roots must never remain as Codex MCP --root. */
export function isTempOrUpgradeRoot(p) {
  if (!p || typeof p !== 'string') return false;
  const n = p.replace(/\\/g, '/');
  return (
    /\/var\/folders\//i.test(n) ||
    /\/tmp\//i.test(n) ||
    /\/Temp\//i.test(n) ||
    /ark-upgrade/i.test(n) ||
    /\/T\/(?:ark-|grok-)/i.test(n) ||
    /[\\/]AppData[\\/]Local[\\/]Temp[\\/]/i.test(n)
  );
}

/** Extract --root value from Codex [mcp_servers.ark] args array text. */
export function extractCodexArkRootFromToml(tomlText) {
  if (!tomlText || typeof tomlText !== 'string') return null;
  const start = tomlText.search(/(^|\n)\[mcp_servers\.ark\]/);
  if (start < 0) return null;
  const rest = tomlText.slice(start);
  const endMatch = rest.slice(1).search(/\n\[/);
  const block = endMatch >= 0 ? rest.slice(0, endMatch + 1) : rest;
  // args = ["arkgate-mcp", "--root", "/abs/path", ...]
  const rootIdx = block.search(/"--root"\s*,\s*"/);
  if (rootIdx < 0) {
    // alternate: --root as adjacent string after any bin
    const m = block.match(/"--root"\s*,\s*"([^"]+)"/);
    return m ? m[1] : null;
  }
  const m = block.slice(rootIdx).match(/"--root"\s*,\s*"([^"]+)"/);
  return m ? m[1] : null;
}

export function codexArkBlockHasPreferredBin(tomlText) {
  if (!tomlText) return false;
  const start = tomlText.search(/(^|\n)\[mcp_servers\.ark\]/);
  if (start < 0) return false;
  const rest = tomlText.slice(start);
  const endMatch = rest.slice(1).search(/\n\[/);
  const block = endMatch >= 0 ? rest.slice(0, endMatch + 1) : rest;
  const bins = [...block.matchAll(/"(arkgate-mcp|ark-mcp)"/g)].map((m) => m[1]);
  if (bins.length > 1) return false;
  return bins.length === 1 && bins[0] === PREFERRED_MCP_BIN;
}

/**
 * True when the primary [mcp_servers.ark] block is broken (temp root / dual bin)
 * and should be rewritten fail-closed. Different permanent project roots are NOT
 * "broken" — multi-project wiring uses a secondary table instead.
 */
export function codexArkBlockNeedsRewrite(tomlText, absRoot) {
  if (!tomlText || !tomlText.includes('[mcp_servers.ark]')) return true;
  const rootArg = extractCodexArkRootFromToml(tomlText);
  if (!rootArg || isTempOrUpgradeRoot(rootArg)) return true;
  // Permanent different project: multi-project path handles this (do not steal primary).
  try {
    if (path.resolve(rootArg) !== path.resolve(absRoot)) {
      if (!isTempOrUpgradeRoot(rootArg)) return false;
      return true;
    }
  } catch {
    return true;
  }
  if (!codexArkBlockHasPreferredBin(tomlText)) return true;
  return false;
}

/**
 * Production deploy path quality (universal — any consumer repo).
 * Detects when the production build host runs ESLint / typecheck as part of
 * `build` (e.g. Next.js "Linting and checking validity of types") so failures
 * surface first on Vercel/Netlify/etc. unless CI/pre-merge runs the same checks.
 * Framework signals only (deps + scripts + config) — never project-specific.
 *
 * @returns {{
 *   embedsLintInBuild: boolean,
 *   embedsTypecheckInBuild: boolean,
 *   engines: string[],
 *   hasLintScript: boolean,
 *   hasTypecheckScript: boolean,
 *   ciRunsLint: boolean,
 *   ciRunsTypecheck: boolean,
 *   eslintIgnoreDuringBuilds: boolean,
 * }}
 */
export function detectDeployPathQuality(root) {
  const pkg = readPackageJson(root) || {};
  const deps = {
    ...(pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {}),
    ...(pkg.devDependencies && typeof pkg.devDependencies === 'object' ? pkg.devDependencies : {}),
    ...(pkg.peerDependencies && typeof pkg.peerDependencies === 'object' ? pkg.peerDependencies : {}),
  };
  const scripts =
    pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  const buildScript = typeof scripts.build === 'string' ? scripts.build : '';

  const engines = [];
  // Next.js production build runs ESLint + typecheck by default (unless opted out).
  if (deps.next || /\bnext\s+build\b/.test(buildScript)) engines.push('next');
  // Nuxt 3+ can lint via modules; only flag when build clearly invokes nuxt build + eslint tooling present.
  if ((deps.nuxt || deps['nuxt3'] || /\bnuxt\s+build\b/.test(buildScript)) && (deps.eslint || hasEslintConfig(root))) {
    engines.push('nuxt');
  }
  // Create React App historically failed build on ESLint errors.
  if (deps['react-scripts'] || /\breact-scripts\s+build\b/.test(buildScript)) engines.push('cra');

  const eslintIgnoreDuringBuilds = engines.includes('next') && nextIgnoresEslintDuringBuilds(root);
  const embedsLintInBuild = engines.length > 0 && !eslintIgnoreDuringBuilds;
  // Next still typechecks during build even when eslint.ignoreDuringBuilds is true.
  const embedsTypecheckInBuild = engines.includes('next') || engines.includes('nuxt');

  const scriptHasLint = (s) =>
    Boolean(
      s &&
        ((typeof s.lint === 'string' && s.lint.trim()) ||
          (typeof s.eslint === 'string' && s.eslint.trim()) ||
          (typeof s['lint:ci'] === 'string' && s['lint:ci'].trim()) ||
          (typeof s['check:lint'] === 'string' && s['check:lint'].trim()))
    );
  const scriptHasTypecheck = (s) =>
    Boolean(
      s &&
        ((typeof s.typecheck === 'string' && s.typecheck.trim()) ||
          (typeof s['type-check'] === 'string' && s['type-check'].trim()) ||
          (typeof s['check:types'] === 'string' && s['check:types'].trim()) ||
          (typeof s.tsc === 'string' && /\btsc\b/.test(s.tsc)))
    );

  let hasLintScript = scriptHasLint(scripts);
  let hasTypecheckScript = scriptHasTypecheck(scripts);
  const packageLintScripts = [];
  // Monorepo: package-level scripts count (apps/web, packages/ui, …).
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const candidates = [path.join(root, entry.name)];
      // one more level: packages/foo
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
          const ns = nested.scripts && typeof nested.scripts === 'object' ? nested.scripts : {};
          if (scriptHasLint(ns)) {
            hasLintScript = true;
            packageLintScripts.push(path.relative(root, dir).split(path.sep).join('/'));
          }
          if (scriptHasTypecheck(ns)) hasTypecheckScript = true;
          const nd = {
            ...(nested.dependencies || {}),
            ...(nested.devDependencies || {}),
          };
          if (nd.next && !engines.includes('next')) engines.push('next');
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }

  const ciTexts = collectCiWorkflowTexts(root);
  const ciJoined = ciTexts.join('\n');
  const ciRunsLint =
    ciTexts.length > 0 &&
    (/\bnpm\s+run\s+lint\b/i.test(ciJoined) ||
      /\bpnpm\s+(?:run\s+)?lint\b/i.test(ciJoined) ||
      /\byarn\s+(?:run\s+)?lint\b/i.test(ciJoined) ||
      /\bbun\s+run\s+lint\b/i.test(ciJoined) ||
      /\beslint\b/i.test(ciJoined) ||
      /\blint:ci\b/i.test(ciJoined) ||
      /\bcheck:lint\b/i.test(ciJoined) ||
      // package-level: working-directory + lint, or path/filter lint
      (packageLintScripts.length > 0 &&
        packageLintScripts.some((p) => ciJoined.includes(p) && /lint/i.test(ciJoined))));
  const ciRunsTypecheck =
    ciTexts.length > 0 &&
    (/\btypecheck\b/i.test(ciJoined) ||
      /\btype-check\b/i.test(ciJoined) ||
      /\bcheck:types\b/i.test(ciJoined) ||
      /\btsc\s+--noEmit\b/i.test(ciJoined));

  return {
    embedsLintInBuild,
    embedsTypecheckInBuild,
    engines,
    hasLintScript,
    hasTypecheckScript,
    ciRunsLint,
    ciRunsTypecheck,
    eslintIgnoreDuringBuilds,
    hasCiWorkflows: ciTexts.length > 0,
    packageLintScripts,
  };
}

function hasEslintConfig(root) {
  return [
    'eslint.config.mjs',
    'eslint.config.js',
    'eslint.config.cjs',
    'eslint.config.ts',
    '.eslintrc.json',
    '.eslintrc.cjs',
    '.eslintrc.js',
    '.eslintrc.yml',
    '.eslintrc.yaml',
  ].some((f) => fs.existsSync(path.join(root, f)));
}

/** next.config.* eslint.ignoreDuringBuilds: true → production build will not fail on ESLint. */
function nextIgnoresEslintDuringBuilds(root) {
  const names = [
    'next.config.ts',
    'next.config.mts',
    'next.config.js',
    'next.config.mjs',
    'next.config.cjs',
  ];
  for (const name of names) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    try {
      const text = fs.readFileSync(file, 'utf8');
      // Common patterns: ignoreDuringBuilds: true | ignoreDuringBuilds: true,
      if (/ignoreDuringBuilds\s*:\s*true/.test(text)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

function collectCiWorkflowTexts(root) {
  const texts = [];
  const pushFile = (rel) => {
    try {
      const full = path.join(root, rel);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        texts.push(fs.readFileSync(full, 'utf8'));
      }
    } catch {
      /* ignore */
    }
  };
  pushFile('.gitlab-ci.yml');
  pushFile('bitbucket-pipelines.yml');
  pushFile('azure-pipelines.yml');
  pushFile('.circleci/config.yml');
  const wfDir = path.join(root, '.github', 'workflows');
  try {
    if (fs.existsSync(wfDir)) {
      for (const f of fs.readdirSync(wfDir)) {
        if (!/\.ya?ml$/i.test(f)) continue;
        pushFile(path.join('.github', 'workflows', f));
      }
    }
  } catch {
    /* ignore */
  }
  return texts;
}

/**
 * Adoption completeness (separate from 0–100 fitness). Pure-ish: filesystem + config.
 * @returns {{ gaps: object[], hosts: object[], mcp: object, codexHome: object|null, coreOptional: object[], originReport: object, baseline: object, layerBalance: object|null, deployPath: object|null }}
 */
export function collectAdoptionGaps(root, config, coverage) {
  const gaps = [];
  const adopted = fs.existsSync(path.join(root, 'AGENTS.md'));
  const isProducer = fs.existsSync(path.join(root, 'templates', 'skills'));

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

  // --- Codex home MCP (temp path / wrong root / dual bin) ---
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
      const rootArg = extractCodexArkRootFromToml(toml);
      const absRoot = path.resolve(root);
      const temp = isTempOrUpgradeRoot(rootArg);
      let wrongRoot = false;
      try {
        wrongRoot = rootArg ? path.resolve(rootArg) !== absRoot : true;
      } catch {
        wrongRoot = true;
      }
      const preferredBin = codexArkBlockHasPreferredBin(toml);
      const needsRewrite = codexArkBlockNeedsRewrite(toml, absRoot);
      codexHome = {
        file: codexFile,
        root: rootArg,
        tempPath: temp,
        wrongRoot,
        preferredBin,
        needsRewrite,
      };
      if (needsRewrite) {
        gaps.push({
          id: 'codex-home-mcp',
          severity: temp || wrongRoot ? 'warn' : 'info',
          message: temp
            ? `Codex home MCP --root points at a temp/upgrade path (${rootArg})`
            : wrongRoot
              ? `Codex home MCP --root is not this project (${rootArg || 'missing'} ≠ ${absRoot})`
              : `Codex home MCP should use a single ${PREFERRED_MCP_BIN} bin with absolute project paths`,
          fix: arkCommand(
            root,
            'ark-check',
            '--install-agent-gates --codex-home --force'
          ),
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
        fix: `Edit ark.config.json: remove optional on ${layer.name} (or set false), then ${arkCommand(root, 'ark-check', '--strict-config')}`,
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
  };
}

// Gate files whose Ark command runner doesn't match this project's package manager — the
// advisory (and --migrate-commands) target. Returns [] for npm/unknown projects (npx is right)
// so the check is silent unless there's a real mismatch.
export function staleRunnerGateFiles(root) {
  const want = execRunner(root);
  if (want === 'npx') return [];
  const stale = [];
  for (const rel of COMMAND_GATE_TEXT_FILES) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue;
    }
    RUNNER_BEFORE_ARK.lastIndex = 0;
    let match;
    while ((match = RUNNER_BEFORE_ARK.exec(text))) {
      if (match[0] !== want) {
        stale.push(rel);
        break;
      }
    }
  }
  for (const rel of COMMAND_GATE_JSON_FILES) {
    let json;
    try {
      json = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
    } catch {
      continue;
    }
    const ark = json?.mcpServers?.ark;
    if (ark && ark.command && ark.command !== want.split(' ')[0]) stale.push(rel);
  }
  return stale;
}

// When more than one lockfile is present the project is ambiguous. detectPackageManager()
// resolves it (package-lock.json wins so a stray pnpm-lock.yaml can't hijack an npm project),
// but the user should know it happened and how to make it explicit — otherwise a leftover
// lockfile silently steers which runner every emitted command uses.
export function warnLockfileConflict(root) {
  const locks = presentLockfiles(root);
  if (locks.length <= 1) return;
  const chosen = detectPackageManager(root);
  const files = { pnpm: 'pnpm-lock.yaml', yarn: 'yarn.lock', npm: 'package-lock.json' };
  console.log('');
  console.log(
    `Note: multiple lockfiles present (${locks.map((pm) => files[pm]).join(', ')}). Treating this`
  );
  console.log(
    `as a ${chosen} project — Ark commands use "${execRunner(root)}". If that's wrong, set`
  );
  console.log(
    '"packageManager" in package.json (e.g. "pnpm@9") to declare it, or remove the stray lockfile.'
  );
}

// --migrate-commands: rewrite ONLY the Ark command runner in existing gate files to the
// project's package manager (no --force clobber). Closes the upgrade gap where a repo that
// adopted before the package-manager-aware templates keeps a stale `npx`.
// Also normalizes MCP JSON to a single preferred bin (arkgate-mcp), stripping any dual
// ark-mcp + arkgate-mcp residue left by partial renames during package identity cutover.
export function runMigrateCommands(root) {
  const runner = execRunner(root);
  const changed = [];
  for (const rel of COMMAND_GATE_TEXT_FILES) {
    const full = path.join(root, rel);
    let text;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    let next = text.replace(RUNNER_BEFORE_ARK, runner);
    // Prefer primary product bins in command strings (aliases still work if left alone).
    next = next
      .replace(/\bark-mcp\b/g, PREFERRED_MCP_BIN)
      .replace(/\bark-check\b/g, PREFERRED_CHECK_BIN);
    // Do not blanket-replace bare `ark` — it appears in prose ("Ark check", product name).
    if (next !== text) {
      fs.writeFileSync(full, next);
      changed.push(rel);
    }
  }
  for (const rel of COMMAND_GATE_JSON_FILES) {
    const full = path.join(root, rel);
    let json;
    try {
      json = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch {
      continue;
    }
    const ark = json?.mcpServers?.ark;
    if (!ark) continue;
    const binArgs = stripMcpServerArgs(ark.args);
    const parts = execCommandParts(root, PREFERRED_MCP_BIN, binArgs);
    if (ark.command !== parts.command || JSON.stringify(ark.args) !== JSON.stringify(parts.args)) {
      json.mcpServers.ark = { ...ark, ...parts };
      fs.writeFileSync(full, `${JSON.stringify(json, null, 2)}\n`);
      changed.push(rel);
    }
  }
  const pm = runner === 'pnpm exec' || runner.startsWith('pnpm ') ? 'pnpm' : runner;
  console.log(`Migrated ArkGate command runners to "${pm}" and normalized MCP bins in gate files.`);
  if (changed.length === 0) {
    console.log('  Nothing to change — runners and MCP bins already look correct.');
  } else {
    for (const rel of changed) console.log(`  updated ${rel}`);
    console.log(
      `  (runner + single MCP bin \`${PREFERRED_MCP_BIN}\`; customized non-command content is untouched.)`
    );
  }
  warnLockfileConflict(root);
}

export function runInstallAgentGates(args) {
  const root = args.root;
  if (args.migrateCommands) {
    runMigrateCommands(root);
    return;
  }
  if (args.tools != null) {
    const list = normalizeToolsList(args.tools);
    args.tools = list;
    const unknown = list.filter((tool) => !KNOWN_TOOLS.includes(tool));
    if (list.length === 0 || unknown.length > 0) {
      console.error(
        `--tools expects a comma-separated subset of: ${KNOWN_TOOLS.join(', ')}` +
          (unknown.length > 0 ? ` (unknown: ${unknown.join(', ')})` : '')
      );
      process.exitCode = 2;
      return;
    }
  }
  const pm = packageManager(root);
  const hasCheckScript = hasCheckArchitectureScript(root);
  const { tools, source } = resolveTools(args);
  const toolSource =
    source === 'explicit'
      ? 'from --tools'
      : source === 'detected'
        ? 'auto-detected from config dirs'
        : 'default set — no agent config dirs found';
  console.log(`Agent gates for: ${[...tools].sort().join(', ')} (${toolSource})`);
  const templates = [];
  // --skills-only refreshes just the canonical /ark-* skills, which are safe to
  // overwrite (they track the package). The gate/instruction files (AGENTS.md,
  // settings.json, CI workflow, rules) are the ones users customize, so a plain
  // `--force` clobbers them — this is the safe way to pick up new skill versions.
  if (!args.skillsOnly) {
    // Base gates: tool-agnostic contract + CI backstop, always written.
    templates.push(['AGENTS.md', agentInstructions(root)]);
    templates.push(['.mcp.json', mcpJson(root)]);
    templates.push([
      '.github/workflows/ark-check.yml',
      githubWorkflow(pm, detectCiNode(root)),
    ]);
    if (tools.has('cursor')) {
      templates.push(['.cursor/mcp.json', mcpJson(root)]);
      templates.push(['.cursor/rules/ark.mdc', cursorRule(root)]);
    }
    if (tools.has('claude')) {
      templates.push(['.claude/settings.json', claudeSettings(root)]);
    }
    if (tools.has('codex')) {
      templates.push(['docs/ark-codex-config.toml', codexTomlSnippet(root)]);
    }
    if (tools.has('grok')) {
      templates.push(['.grok/config.toml', grokProjectConfig(root)]);
      templates.push(['.grok/hooks/ark-write-gate.json', grokHooks(root)]);
    }
    // Instruction-tier hosts: one shared rule text, host-specific path.
    if (tools.has('windsurf')) {
      templates.push(['.windsurf/rules/ark.md', instructionRule(root)]);
    }
    if (tools.has('cline')) {
      templates.push(['.clinerules/ark.md', instructionRule(root)]);
    }
    if (tools.has('copilot')) {
      templates.push(['.github/copilot-instructions.md', instructionRule(root)]);
    }
    if (tools.has('kiro')) {
      templates.push(['.kiro/steering/ark.md', instructionRule(root)]);
    }
    if (tools.has('roo')) {
      templates.push(['.roo/rules/ark.md', instructionRule(root)]);
    }
    if (tools.has('continue')) {
      templates.push(['.continue/rules/ark.md', instructionRule(root)]);
    }
    // Gemini CLI reads GEMINI.md as its primary project context (it also reads
    // AGENTS.md, but GEMINI.md wins when both are present), so the rule lives there.
    if (tools.has('gemini')) {
      templates.push(['GEMINI.md', instructionRule(root)]);
    }
  }
  // /ark-* skills for every detected tool that supports project-level commands.
  // Stamp each with the shipping version so a later ark-check can flag skills
  // left behind by an older Ark (see detectSkillGaps) without nagging about
  // user edits to the body.
  const version = arkPackageVersion();
  const skills = skillTemplates().map(([name, content]) => [name, stampSkill(content, version)]);
  const skillPaths = new Set();
  for (const tool of tools) {
    const target = SKILL_TOOL_TARGETS[tool];
    if (!target) continue;
    for (const [name, content] of skills) {
      const relativePath = target(name);
      skillPaths.add(relativePath);
      templates.push([relativePath, content]);
    }
  }

  const results = templates.map(([relativePath, content]) =>
    writeTemplate(root, relativePath, content, args.force)
  );

  console.log('Ark agent gate templates:');
  let staleSkipped = 0;
  for (const result of results) {
    const marker =
      result.status === 'written'
        ? 'wrote'
        : result.status === 'merged'
          ? 'merged'
          : result.status === 'skipped-non-ark'
            ? 'kept'
            : result.status === 'failed'
              ? 'FAILED'
              : 'skipped';
    // A skipped skill reads as "you're fine" — but it may be a version behind.
    // Say which, so the user isn't left guessing (and knows the safe refresh cmd).
    let note = '';
    if (result.status === 'skipped' && skillPaths.has(result.relativePath) && version) {
      const installed = installedSkillVersion(path.join(root, result.relativePath));
      if (installed === null || isVersionOlder(installed, version)) {
        staleSkipped += 1;
        note = `  (stale: ${installed ?? 'no stamp'} < ${version})`;
      } else {
        note = '  (up to date)';
      }
    }
    console.log(`  ${marker.padEnd(7)} ${result.relativePath}${note}`);
  }
  if (staleSkipped > 0 && !args.skillsOnly) {
    console.log('');
    console.log(
      `  ${staleSkipped} skill(s) are outdated but were left untouched. Refresh them with:`
    );
    console.log(`    ${arkCommand(root, 'ark-check', '--install-agent-gates --skills-only --force')}`);
  }

  // --codex-home writes the canonical skills straight to $CODEX_HOME/prompts.
  // Codex reads prompts from there (not the repo), so this is the only way to
  // refresh them for a repo that isn't itself configured for Codex. It writes to
  // the user's home dir, hence explicit opt-in rather than part of a normal run.
  const homeResults = [];
  if (args.codexHome) {
    const dir = codexPromptsDir();
    console.log('');
    console.log(`Codex home skills (${dir}):`);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      console.error(`  FAILED to create ${dir} (${error.message})`);
      homeResults.push({ status: 'failed' });
    }
    if (homeResults.length === 0) {
      for (const [name, content] of skills) {
        const file = path.join(dir, `${name}.md`);
        if (fs.existsSync(file) && !args.force) {
          const installed = installedSkillVersion(file);
          const behind = installed === null || (version && isVersionOlder(installed, version));
          const note = behind
            ? `  (stale: ${installed ?? 'no stamp'} < ${version}; use --force)`
            : '  (up to date)';
          console.log(`  ${'skipped'.padEnd(7)} ${name}.md${note}`);
          homeResults.push({ status: 'skipped' });
          continue;
        }
        try {
          fs.writeFileSync(file, content);
          console.log(`  ${'wrote'.padEnd(7)} ${name}.md`);
          homeResults.push({ status: 'written' });
        } catch (error) {
          console.log(`  ${'FAILED'.padEnd(7)} ${name}.md (${error.message})`);
          homeResults.push({ status: 'failed' });
        }
      }
    }
  }

  // Auto-wire the ark MCP server into Codex's home config.toml. Claude and Cursor get
  // machine-readable registrations (.claude/settings.json, .cursor/mcp.json) written as repo
  // templates above; Codex reads MCP servers only from ~/.codex/config.toml, so it needs a
  // home-dir merge instead. Fires whenever Codex is in play so `ark://manifest` is live
  // without a manual copy step.
  let codexMcp = null;
  if (tools.has('codex') || args.codexHome) {
    codexMcp = wireCodexMcp(root, args.force);
    console.log('');
    console.log(`Codex MCP registration (${codexMcp.file}):`);
    if (codexMcp.status === 'written-multi') {
      console.log(
        `  ${'wrote'.padEnd(7)} [mcp_servers.${codexMcp.table}] (multi-project — primary [mcp_servers.ark] left unchanged; --force rebinds primary)`
      );
    } else if (codexMcp.status === 'skipped') {
      console.log(`  ${'skipped'.padEnd(7)} [mcp_servers.ark] already present (use --force to overwrite)`);
    } else if (codexMcp.status === 'failed') {
      console.log(`  ${'FAILED'.padEnd(7)} [mcp_servers.ark] (${codexMcp.message})`);
    } else {
      const verb = codexMcp.status === 'updated' ? 'updated' : 'wrote';
      console.log(`  ${verb.padEnd(7)} [mcp_servers.ark] with absolute paths`);
      console.log('          RESTART Codex — it does not hot-load MCP servers.');
      console.log('          Then expect: resource ark://manifest + tools validate_code, ark_check, ark_coverage, ark_place.');
    }
  }

  const failed = [...results, ...homeResults, ...(codexMcp ? [codexMcp] : [])].filter((result) => result.status === 'failed');
  if (failed.length > 0) {
    console.error(`\nFailed to write ${failed.length} template(s).`);
    process.exitCode = 1;
    return;
  }
  console.log('');
  console.log('Next steps:');
  console.log('  1. Review the generated files and commit the ones that match your tools.');
  console.log(`  2. Run: ${arkCheckCommand(root)}`);
  if (!hasCheckScript) {
    console.log('  3. Add the package.json alias if you want `run check:architecture`:');
    console.log(`     ${checkArchitectureScriptSnippet(root)}`);
  }
  if ((tools.has('codex') || args.codexHome)) {
    console.log('');
    if (codexMcp && codexMcp.status !== 'failed') {
      console.log(`  Codex: ark MCP registered in ${codexMcp.file} — restart Codex so \`ark://manifest\` loads.`);
    }
    if (args.codexHome) {
      console.log(`  Codex: refreshed the /ark-* skills in ${codexPromptsDir()} — Codex loads them from there.`);
    } else if (skills.length > 0) {
      console.log('  Codex loads slash-command prompts from $CODEX_HOME/prompts (~/.codex/prompts),');
      console.log('  not the repo. Install the /ark-* skills there with:');
      console.log(`    ${arkCommand(root, 'ark-check', '--install-agent-gates --codex-home')}`);
      console.log('  (writes to your home dir; agents driving this setup should offer to run it).');
    }
  }
  warnLockfileConflict(root);
}