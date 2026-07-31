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
import { hasCheckArchitectureScript, readPackageJson } from './gate-files.mjs';

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

/**
 * Insert a package.json scripts entry while preserving indentation / formatting
 * (same contract as pinArkgateDevDependency format-preserving edits).
 * @param {string} source
 * @param {string} scriptName
 * @param {string} scriptValue
 */
function addPackageScriptPreservingFormat(source, scriptName, scriptValue) {
  const multiline = /\r?\n/.test(source);
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const rootPropertyIndent = source.match(/\r?\n([ \t]+)"[^"\n]+"\s*:/)?.[1] ?? '  ';
  const indentUnit = rootPropertyIndent;
  const encoded = JSON.stringify(scriptValue);
  const key = JSON.stringify(scriptName);
  const scriptsMatch = /"scripts"\s*:\s*\{/.exec(source);

  if (scriptsMatch) {
    const open = source.indexOf('{', scriptsMatch.index);
    let depth = 0;
    let quoted = false;
    let escaped = false;
    let close = -1;
    for (let index = open; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') quoted = true;
      else if (char === '{') depth += 1;
      else if (char === '}' && --depth === 0) {
        close = index;
        break;
      }
    }
    if (close === -1) throw new Error('Unbalanced package.json scripts object');
    const body = source.slice(open + 1, close);
    if (!multiline) {
      const addition = body.trim() ? `,${key}:${encoded}` : `${key}:${encoded}`;
      return `${source.slice(0, close)}${addition}${source.slice(close)}`;
    }
    const beforeClose = source.slice(0, close);
    const trailing = beforeClose.match(/\s*$/)?.[0] ?? '';
    const contentEnd = close - trailing.length;
    const closingIndent = trailing.slice(trailing.lastIndexOf('\n') + 1);
    const propertyIndent = `${closingIndent}${indentUnit}`;
    const addition = body.trim()
      ? `,${eol}${propertyIndent}${key}: ${encoded}`
      : `${propertyIndent}${key}: ${encoded}`;
    return `${source.slice(0, contentEnd)}${addition}${eol}${closingIndent}${source.slice(close)}`;
  }

  const rootClose = source.lastIndexOf('}');
  if (rootClose === -1) throw new Error('Unbalanced package.json object');
  const rootBody = source.slice(0, rootClose);
  if (!multiline) {
    const separator = rootBody.trim().endsWith('{') ? '' : ',';
    return `${rootBody}${separator}"scripts":{${key}:${encoded}}${source.slice(rootClose)}`;
  }
  const trailing = rootBody.match(/\s*$/)?.[0] ?? '';
  const contentEnd = rootClose - trailing.length;
  const rootClosingIndent = trailing.slice(trailing.lastIndexOf('\n') + 1);
  const separator = source.slice(0, contentEnd).trimEnd().endsWith('{') ? '' : ',';
  const addition = `${separator}${eol}${rootPropertyIndent}"scripts": {${eol}${rootPropertyIndent}${indentUnit}${key}: ${encoded}${eol}${rootPropertyIndent}}`;
  return `${source.slice(0, contentEnd)}${addition}${eol}${rootClosingIndent}${source.slice(rootClose)}`;
}

/**
 * Ensure package.json has `check:architecture` so local/CI parity is not a post-start gap.
 * Never overwrites an existing script (even if stale). Preserves package.json formatting.
 *
 * @param {string} root
 * @param {{ write?: boolean }} [opts]
 * @returns {{ changed: boolean, reason: 'added'|'already'|'no-package-json', script?: string }}
 */
export function ensureCheckArchitectureScript(root, opts = {}) {
  const write = opts.write !== false;
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return { changed: false, reason: 'no-package-json' };
  if (hasCheckArchitectureScript(root)) return { changed: false, reason: 'already' };
  const script = arkCheckCommand(root);
  if (write) {
    const source = fs.readFileSync(pkgPath, 'utf8');
    const next = addPackageScriptPreservingFormat(source, 'check:architecture', script);
    fs.writeFileSync(pkgPath, next.endsWith('\n') ? next : `${next}\n`);
  }
  return { changed: true, reason: 'added', script };
}

// Canonical agent contract. AGENTS.md and the Cursor rule both derive from this single
// source so the steps can never drift out of sync between the two files. `steps(checkCommand)`
// is a builder because the check command's runner prefix varies with the package manager.
const AGENT_CONTRACT = {
  manifestTool: 'ark_manifest',
  compatibilityManifestResource: 'ark://manifest',
  steps: (checkCommand) => [
    `Before trusting Ark MCP evidence, call \`ark_identity\` with \`project.expectedRoot\` set to the exact project root's absolute path. Reuse that root plus the returned \`projectIdentity.projectId\` on every Ark MCP call. A descendant path is authoritative only when the matching project id is also supplied. If the tool is missing, the binding is not \`matched\`, or the reported root differs, restart the host and use the local CLI until identity matches.`,
    `Read the authoritative Ark contract with \`ark_manifest\` using the same project expectation. The \`ark://manifest\` resource is compatibility-only and always unverified/non-authoritative.`,
    `Keep source files inside the layer boundaries declared in \`ark.config.json\`.`,
    `Do not bypass Ark publishers, event contracts, or source metadata for runtime mutations.`,
    `After edits, run \`${checkCommand}\`.`,
    `If Ark reports violations, fix the architecture instead of weakening the gate.`,
  ],
  // Cursor-only guidance: the write-time validate_code tool is available in
  // Cursor's runtime but has no equivalent in a plain AGENTS.md read.
  cursorValidateStep: `Validate the full post-edit file content with the \`validate_code\` tool before writing whenever your runtime supports it.`,
};

/**
 * Placement table for AGENTS.md. Prefer live `ark.config.json` layers when provided
 * so custom contracts (e.g. 8-layer monorepo) do not get a stock 11-layer table.
 *
 * @param {Array<{ name?: string, layer?: string, patterns?: string[], intentPrefixes?: string[], prefixes?: string[] }>|null|undefined} [layers]
 */
export function layerPlacementTable(layers) {
  if (Array.isArray(layers) && layers.length > 0) {
    const rows = layers
      .map((layer) => {
        const name = layer.name ?? layer.layer ?? 'Unknown';
        const patterns = (layer.patterns ?? [])
          .map((pattern) => `\`${pattern}\``)
          .join(', ') || '—';
        const prefixes = (layer.intentPrefixes ?? layer.prefixes ?? [])
          .map((prefix) => `\`${prefix}\``)
          .join(', ') || '—';
        return `| ${name} | ${patterns} | ${prefixes} |`;
      })
      .join('\n');
    return `| Layer | Patterns (from ark.config.json) | Intent prefixes |
|-------|----------------------------------|-----------------|
${rows}`;
  }
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

/**
 * Load project layers for AGENTS generation. Returns null when config is absent/invalid
 * so callers fall back to the stock 11-layer table.
 * @param {string} root
 */
export function loadConfigLayersForAgents(root) {
  try {
    const cfgPath = path.join(root, 'ark.config.json');
    if (!fs.existsSync(cfgPath)) return null;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (!Array.isArray(cfg?.layers) || cfg.layers.length === 0) return null;
    return cfg.layers;
  } catch {
    return null;
  }
}

export function agentInstructions(root) {
  const checkCmd = arkCheckCommand(root);
  const startCmd = arkCommand(root, 'ark', 'start');
  const doctorCmd = arkCommand(root, 'ark-check', '--doctor');
  const steps = AGENT_CONTRACT.steps(checkCmd)
    .map((step, index) => `${index + 1}. ${step}`)
    .join('\n');
  const liveLayers = loadConfigLayersForAgents(root);
  const placementTable = layerPlacementTable(liveLayers);
  const placementBody = liveLayers
    ? `\`ark.config.json\` is authoritative for this project. Place new code in these **${liveLayers.length}** configured layer(s) — do not invent an ungoverned location or assume the stock 11-layer layout:

${placementTable}

When creating a NEW kind of code that no existing layer covers, add a layer to \`ark.config.json\` first (via \`/ark-contract\`), then place the file.`
    : `\`ark.config.json\` is authoritative for this project. When creating a NEW kind of code
that no existing layer covers (a saga, a background job, a read model, ...), use the
default 11-layer placement below and add the layer to \`ark.config.json\` — do not invent
an ungoverned location:

${placementTable}`;
  return `# Ark Enforcement

## Default agent flow (if unsure, do only this)

1. Status anytime: \`${doctorCmd}\` — **control plane** (one status light, one next action; not a mode picker).
2. If \`ark.config.json\` is missing: run \`${startCmd}\` once (preview), then \`${startCmd} --apply\`.
3. Guided end-to-end work (“make architecture sound”): **\`/ark-autopilot\`** — explore → dual plan A (edges) + B (shape) → mechanical-safe fixes; B only with user OK. Day-zero origin is frozen by \`ark start\`/\`ark init\` (or autopilot if missing) **before** agent docs.
4. After ordinary feature edits: run \`${checkCmd}\`. On violations → **\`/ark-fix\`** (or \`/ark-place\` for new files, \`/ark-contract\` only if the contract itself is wrong).

Do **not** skill-shop the full table for routine work. When unsure, do doctor top action #1 only
(re-run doctor after). Do **not** jump to \`/ark-autopilot\` unless #1 or a STOP handoff names it.
Skills are **dual-engine**: deterministic CLI sensors + exploratory read of *this* repo — not JSON-only wrappers.
When a skill says **STOP — do not continue this skill as complete**, stop and invoke the named handoff skill.

## Host enforcement support

${renderHostSupportMatrixMarkdown()}

### Subagent fan-out
If the host supports **parallel subagents**, skills may ask you to fan out **read-only**
scouts (disjoint path scopes) and merge in the parent. If the host does **not**,
**fall back to sequential** — one cluster/step at a time. Never parallel-write the same
files; never weaken the gate via subagents.

## Skill routing (expert depth — triggers → skill)

**Escapes, not a second curriculum.** Do **not** run overlapping skills for the same job.
Pick **one** primary skill. Prefer doctor top action #1 when unsure.

| When | Invoke | Not this |
|------|--------|----------|
| Unsure what to do next | **Doctor top action #1** (\`${doctorCmd}\`), then re-run doctor | skill-shopping, defaulting to autopilot |
| Make architecture sound (guided apply path) | **/ark-autopilot** | explore-only, coverage-only |
| **Messy / spaghetti / design-weak after green / Shape residual** | **Single path:** \`/ark-explore\` shape-focus → dual-plan B, then \`/ark-autopilot\` only to apply B with OK | coverage, think, loop-as-done, skill-shopping |
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

${placementBody}

The project is only considered Ark-enforced when its host-appropriate write path is configured
and the CI check passes. Only Claude/Grok provide a hard local write boundary; Cursor/Codex use
advisory MCP plus CI. The experimental runtime is not required.
`;
}

/**
 * Compact onboarding uses one project router instead of copied slash-command
 * skills. The package and ark MCP tools remain the canonical capability
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
  // Progressive disclosure: primary path only. Full /ark-* catalog is expert depth
  // (install via --skills-only). See docs/product-voice.md.
  return `# Ark Enforcement

<!-- arkgate:compact-router host=${selectedHost} -->
## Compact router

**Primary path (do this):**

1. Status anytime: \`${doctorCmd}\` — one status light, one next action (control plane).
2. Before trusting MCP evidence: call \`ark_identity\` with \`project.expectedRoot\` set to this project's exact absolute root, then reuse that root plus the returned \`projectIdentity.projectId\` on every Ark MCP call. A descendant path is authoritative only with that matching id. Missing tool, non-\`matched\` binding, or wrong root means the process is stale: restart the host and use the local CLI meanwhile.
3. Day to day: call \`ark_manifest\` with the same project expectation; place new files with \`ark_place\`; validate after edits; run \`${checkCmd}\`. The \`ark://manifest\` resource is compatibility-only and always unverified/non-authoritative. On a gate deny, fix the architecture — do not weaken the contract.
4. If MCP is unavailable: inspect \`ark.config.json\` and run \`${checkCmd}\`.

The selected host is \`${selectedHost}\`. Host registration and CI are installed with this file.
This compact router is enough for normal feature work.

## Expert depth (optional)

Full \`/ark-*\` skills (including guided end-to-end \`/ark-autopilot\`) are **not** the default
curriculum. Install them only when doctor top action #1 or a STOP handoff names a skill:

\`${installSkills}\`
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

Before trusting Ark MCP evidence, call \`ark_identity\` with \`project.expectedRoot\`
set to the exact project root's absolute path. Reuse that root plus the returned
\`projectIdentity.projectId\` on every Ark MCP call. A descendant path is authoritative only
when that matching id is also supplied. If the tool is missing, the binding is not \`matched\`,
or the root differs, restart the host and use the local CLI until identity matches. Then call
\`${AGENT_CONTRACT.manifestTool}\` with the same project expectation. The
\`${AGENT_CONTRACT.compatibilityManifestResource}\` resource is compatibility-only and always
unverified/non-authoritative.

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
        run: |
          set -euo pipefail
          # EH04: first push uses all-zero github.event.before — skip delta smells, keep full merge gate.
          BASE_REF="\${ARK_POLICY_BASE_REF:-}"
          if [[ "\$BASE_REF" =~ ^0{40,64}$ ]]; then
            BASE_REF=""
          fi
          if [ -n "\$BASE_REF" ] && ! git cat-file -e "\${BASE_REF}^{commit}" 2>/dev/null; then
            git fetch --no-tags --depth=1 origin "\$BASE_REF" 2>/dev/null || true
          fi
          if [ -n "\$BASE_REF" ] && git cat-file -e "\${BASE_REF}^{commit}" 2>/dev/null; then
            export ARK_POLICY_BASE_REF="\$BASE_REF"
            ${pm.run} --fail-on-new-smells --base-ref "\$BASE_REF"
          else
            export ARK_POLICY_BASE_REF=""
            ${pm.run}
          fi
`;
}
