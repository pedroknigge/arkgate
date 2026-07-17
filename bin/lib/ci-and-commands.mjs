/**
 * Package-manager commands, agent instruction text, and CI workflow templates.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  arkCommand,
  detectPackageManager,
  execCommandParts,
  execRunner,
  DEFAULT_INTENT_PREFIXES,
  DEFAULT_LAYER_DIRECTORIES,
} from '../ark-shared.mjs';
import { falseGreenAdoptionGap } from './field-install.mjs';
import { renderHostSupportMatrixMarkdown } from './host-support-matrix.mjs';
import { PREFERRED_MCP_BIN } from './hook-templates.mjs';
import { readPackageJson } from './gate-files.mjs';

// Field-install helpers re-exported for callers that import from this module.
export {
  ensureBaselineFlagInCheckCommand,
  syncBaselineIntoCheckSurfaces,
  pinArkgateDevDependency,
  IO_DIR_SEGMENTS,
  detectContractFalseGreenRisk,
  FALSE_GREEN_GAP_ID,
  falseGreenAdoptionGap,
} from './field-install.mjs';

export function checkArgsForRoot(root, { requireGates = false } = {}) {
  const baselineFlag = fs.existsSync(path.join(root, '.ark-baseline.json'))
    ? ' --baseline .ark-baseline.json'
    : '';
  const profile = requireGates ? '--strict-merge' : '--strict-config';
  return `--root . --config ark.config.json ${profile}${baselineFlag}`;
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

export function checkArchitectureScriptSnippet(root) {
  // The package manager's runner resolves the installed binary; `node bin/ark-check.mjs`
  // only works inside Ark's own repo. Package-manager aware so a pnpm/yarn repo isn't
  // handed an `npx` alias that violates its "never npx" policy.
  return `"check:architecture": "${arkCheckCommand(root)}"`;
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
   (explore first → dual plan: remediation + pattern bets → safe fixes → gates). Day-zero
   origin is frozen by \`ark start\`/\`ark init\` (or autopilot if missing) **before** agent docs.
   Do **not** invent a second architecture curriculum outside the routing table below — when a
   trigger matches, use that skill; when unsure, stay on autopilot.
3. Status anytime: \`${doctorCmd}\` (status light + next action — not a mode picker).
4. After ordinary feature edits: run \`${checkCmd}\`. On violations → **\`/ark-fix\`** (or
   \`/ark-place\` for new files, \`/ark-contract\` only if the contract itself is wrong).

Skills are **dual-engine**: deterministic CLI sensors + exploratory read of *this* repo — not JSON-only wrappers.
When a skill says **STOP — do not continue this skill as complete**, stop and invoke the named handoff skill.

## Host enforcement support

${renderHostSupportMatrixMarkdown()}

### Subagent fan-out
If the host supports **parallel subagents**, skills may ask you to fan out **read-only**
scouts (disjoint path scopes) and merge in the parent. If the host does **not**,
**fall back to sequential** — one cluster/step at a time. Never parallel-write the same
files; never weaken the gate via subagents.

## Skill routing (triggers → skill)

Do **not** run overlapping skills for the same job. Pick **one** primary skill from the table.

| When | Invoke | Not this |
|------|--------|----------|
| Unsure / make architecture sound (apply path) | **/ark-autopilot** (default) | explore-only, coverage-only |
| **Messy / spaghetti / design-weak after green / clarify for AI** | **Single path:** \`/ark-explore\` shape-focus → dual-plan B, then \`/ark-autopilot\` only to apply B with OK | coverage, think, loop-as-done, skill-shopping |
| Map / residual / dual-plan seed only (no apply, already know you want recon) | \`/ark-explore\` | coverage (fitness only) |
| Greenfield shape / empty tree | \`/ark-architect\` | adopt |
| Brownfield / wrong contract / false-green | \`/ark-adopt\` then \`/ark-contract\` if globs wrong | architect |
| Edit \`ark.config.json\` layers/rules/intents | \`/ark-contract\` | fix/loop for config |
| New file “where does this go?” | \`/ark-place\` | architect (unless greenfield shape missing) |
| Gate violation on a change (small cluster) | \`/ark-fix\` | loop/autopilot unless bulk |
| Drive plan **A** to goal.met | \`/ark-loop\` | explore (unless A empty + design residual → single Shape path above) |
| Ark **fitness** only (governed%, gates, baseline, install gaps) | \`/ark-coverage\` | Shape / design-weak (use single path above) |
| One design decision, 2–3 options | \`/ark-think\` | full Shape residual (use single path) |
| Explain / HTML report tour | \`/ark-explain\` | explore |
| Bump arkgate + refresh hosts | \`/ark-upgrade\` | — |
| Optional runtime kernel evaluate | \`/ark-runtime\` | — |

**Post-green door (Q01):** when doctor reports ENFORCE · design-weak, the **primary** next action is the single Shape path above — not a choice among explore / coverage / think. Doctor JSON: \`postGreenPath\` / \`primaryNextAction\`.

**Phases (brownfield honesty):** Align (contract truth) → Stabilize (real baseline) → Shape (golden pattern + pilot). Empty plan A after Stabilize still leaves Shape work — that is the single post-green path, not “healthy finished.”

## Before editing TypeScript or JavaScript source files

${steps}

## Where new code belongs

\`ark.config.json\` is authoritative for this project. When creating a NEW kind of code
that no existing layer covers (a saga, a background job, a read model, ...), use the
default 11-layer placement below and add the layer to \`ark.config.json\` — do not invent
an ungoverned location:

${layerPlacementTable()}

The project is only considered Ark-enforced when its host-appropriate write path is configured
and the CI check passes. Only Claude/Grok provide a hard local write boundary; Cursor/Codex use
advisory MCP plus CI. The experimental runtime is not required.
`;
}

/**
 * Compact onboarding uses one project router instead of copied slash-command
 * skills. The package and ark MCP resources remain the canonical capability
 * source; the marker makes the selected host verifiable by the strict gate.
 */
export function compactAgentInstructions(root, host = null) {
  const selectedHost = host || 'none';
  const checkCmd = arkCheckCommand(root);
  const doctorCmd = arkCommand(root, 'ark-check', '--doctor');
  const installSkills = arkCommand(
    root,
    'ark-check',
    `--install-agent-gates --skills-only --tools ${selectedHost === 'none' ? '<host>' : selectedHost}`
  );
  return `# Ark Enforcement

<!-- arkgate:compact-router host=${selectedHost} -->
## Compact router

This project uses the ArkGate package and its \`ark\` MCP resources as its one
agent router. Before editing TypeScript or JavaScript, read \`ark://manifest\`
when available; use \`ark_place\` for new files and \`validate_code\` after edits.
If MCP is unavailable, inspect \`ark.config.json\` and run \`${checkCmd}\`.

For architecture status, run \`${doctorCmd}\`. The selected host is
\`${selectedHost}\`; its host registration and CI gate are installed alongside
this file. Full \`/ark-*\` guided workflows are optional and can be added later
with \`${installSkills}\`.
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

// Optional home fallback reference. Normal Codex installs write the project-scoped
// `.codex/config.toml`; `--codex-home` is for older clients or an explicit global binding.
export function codexTomlSnippet(root) {
  const { command, args } = execCommandParts(root, PREFERRED_MCP_BIN, [
    '--root',
    '/absolute/path/to/project',
    '--config',
    '/absolute/path/to/project/ark.config.json',
  ]);
  const argsToml = args.map((value) => `"${value}"`).join(', ');
  return `# Optional global fallback for older Codex clients. Modern Codex uses the generated
# project-scoped .codex/config.toml instead. If you install this fallback manually, restart
# Codex and keep ABSOLUTE paths because $CODEX_HOME/config.toml is global.
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
// Bumped 20 → 22 → 24 as consumer lockfiles moved with newer local npm.
const DEFAULT_CI_NODE_VERSION = '24';

/**
 * Read Node majors from sibling GitHub Actions workflows (not ark-check.yml).
 * A stale generated ark gate must not pin us to an old default when the project's
 * real CI already runs a newer Node (classic "CI green / Ark red" false gate).
 * @param {string} root
 * @returns {string | null} highest major found, or null
 */
export function detectNodeMajorFromWorkflows(root) {
  const dir = path.join(root, '.github', 'workflows');
  if (!fs.existsSync(dir)) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const majors = [];
  for (const name of entries) {
    if (!/\.ya?ml$/i.test(name)) continue;
    // Ignore our own template so regenerating does not re-read a stale 20/22 pin.
    if (/^ark-check\.ya?ml$/i.test(name)) continue;
    let text;
    try {
      text = fs.readFileSync(path.join(dir, name), 'utf8');
    } catch {
      continue;
    }
    // node-version: '24' | "24" | 24 | 24.x  (skip node-version-file: lines)
    for (const match of text.matchAll(/(?:^|\n)\s*(?:- )?node-version:\s*['"]?(\d+)/g)) {
      majors.push(Number(match[1]));
    }
  }
  if (majors.length === 0) return null;
  // Highest major: older CI npm is the class that fails against modern lockfiles.
  return String(Math.max(...majors));
}

// Decide the Node the generated CI should use, preferring the project's own
// declaration so CI's npm matches the dev's (a mismatch makes `npm ci` fail with
// "missing from lock file" — a red gate unrelated to architecture). In order:
//   1. .nvmrc / .node-version → setup-node's node-version-file (exact, best)
//   2. package.json engines.node → its concrete major
//   3. sibling workflows' node-version (highest major; excludes ark-check.yml)
//   4. a current-LTS default
export function detectCiNode(root) {
  for (const file of ['.nvmrc', '.node-version']) {
    if (fs.existsSync(path.join(root, file))) return { kind: 'file', value: file };
  }
  const enginesNode = readPackageJson(root)?.engines?.node;
  if (typeof enginesNode === 'string') {
    const major = enginesNode.match(/\d+/)?.[0];
    if (major) return { kind: 'version', value: major };
  }
  const fromWorkflows = detectNodeMajorFromWorkflows(root);
  if (fromWorkflows) return { kind: 'version', value: fromWorkflows };
  return { kind: 'default', value: DEFAULT_CI_NODE_VERSION };
}

/**
 * @param {{ name: string, install: string, run: string, cache: string, setup: string[] }} pm
 * @param {{ kind: string, value: string }} ciNode
 * @param {{ hasLintScript?: boolean, hasTypecheckScript?: boolean }} [quality]
 */
export function githubWorkflow(pm, ciNode, quality = {}) {
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
  // When package.json already has lint/typecheck, emit CI steps so deploy-path
  // honesty matches local scripts (Next/CRA often run these in production build).
  const install = pm.install || '';
  const runPrefix = install.startsWith('pnpm')
    ? 'pnpm run'
    : install.startsWith('yarn')
      ? 'yarn'
      : install.startsWith('bun')
        ? 'bun run'
        : 'npm run';
  const qualityBlock = [
    quality.hasTypecheckScript
      ? `      - name: Typecheck\n        run: ${runPrefix} typecheck`
      : '',
    quality.hasLintScript ? `      - name: Lint\n        run: ${runPrefix} lint` : '',
  ]
    .filter(Boolean)
    .join('\n');
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
        with:
          fetch-depth: 0
${setupSteps ? `${setupSteps}\n` : ''}      - name: Setup Node
        uses: actions/setup-node@v4
        with:
${nodeSetup}
          cache: ${pm.cache}
      - name: Install dependencies
        run: ${pm.install}
${qualityBlock ? `${qualityBlock}\n` : ''}      - name: Ark architecture check
        env:
          ARK_POLICY_BASE_REF: \${{ github.event.pull_request.base.sha || github.event.before }}
        run: ${pm.run}
`;
}
