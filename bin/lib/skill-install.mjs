/**
 * Tool detection, skill templates, stamping, and skill freshness gaps.
 */
import fs from 'node:fs';
import path from 'node:path';
import { codexPromptsDir } from './codex-home.mjs';
import { __packageRoot, readJson } from './gate-files.mjs';

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

function envTruthy(v) {
  if (v == null || v === '') return false;
  const s = String(v).trim().toLowerCase();
  return s !== '0' && s !== 'false' && s !== 'no' && s !== 'off';
}

/**
 * Best-effort active agent host for this process (session host).
 * Prefer ARK_ACTIVE_HOST when set. Do NOT treat CODEX_HOME alone as Codex —
 * that dir exists for anyone who installed Codex, even when running Grok/Claude.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null} tool id (claude|cursor|codex|grok|…) or null if unknown
 */
export function detectActiveAgentHost(env = process.env) {
  const explicit = String(env.ARK_ACTIVE_HOST || '')
    .trim()
    .toLowerCase();
  if (explicit) return explicit;

  // Grok / xAI Build
  if (
    envTruthy(env.GROK_BUILD) ||
    envTruthy(env.XAI_GROK) ||
    env.GROK_WORKSPACE_ROOT ||
    env.GROK_SESSION_ID
  ) {
    return 'grok';
  }
  // Claude Code
  if (
    env.CLAUDE_PROJECT_DIR ||
    envTruthy(env.CLAUDE_CODE) ||
    envTruthy(env.CLAUDECODE) ||
    env.CLAUDE_CODE_ENTRYPOINT
  ) {
    return 'claude';
  }
  // Cursor agent
  if (env.CURSOR_TRACE_ID || env.CURSOR_AGENT || envTruthy(env.CURSOR_AGENT_CLI)) {
    return 'cursor';
  }
  // Codex session — never CODEX_HOME alone (see above)
  if (
    envTruthy(env.CODEX_SANDBOX) ||
    env.CODEX_THREAD_ID ||
    envTruthy(env.CODEX_CI) ||
    env.CODEX_SESSION_ID
  ) {
    return 'codex';
  }
  return null;
}

/**
 * True when Codex home / MCP / prompts should be treated as an urgent concern
 * for this process. Non-Codex hosts (Grok, Claude, Cursor, …) defer Codex debt.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
export function codexConcernIsActive(env = process.env) {
  return detectActiveAgentHost(env) === 'codex';
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
  // Host signals: Grok Build / xAI agents often have no project `.grok/` yet but
  // set an env marker (or run with GROK_*). Include Grok so skills install there.
  if (
    process.env.GROK_BUILD === '1' ||
    process.env.GROK_BUILD === 'true' ||
    process.env.XAI_GROK === '1' ||
    process.env.XAI_GROK === 'true'
  ) {
    detected.add('grok');
  }
  // No signal at all: fall back to a complete starter set including Grok (field
  // log: default claude+cursor+codex silently omitted Grok skills for Grok hosts).
  if (detected.size === 0) {
    return { tools: new Set(['claude', 'cursor', 'codex', 'grok']), source: 'default' };
  }
  return { tools: detected, source: 'detected' };
}

export const KNOWN_TOOLS = [
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
export const SKILL_TOOL_TARGETS = {
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
