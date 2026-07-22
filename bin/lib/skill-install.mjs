/**
 * Tool detection, skill templates, stamping, and skill freshness gaps.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { arkCommand } from '../ark-shared.mjs';
import { codexPromptsDir, codexSkillsDir } from './codex-home.mjs';
import { __packageRoot, isCompactRouterAgentsContent, readJson } from './gate-files.mjs';

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

  // Grok / xAI Build (include GROK_AGENT — common session signal missing in older detect)
  if (
    envTruthy(env.GROK_BUILD) ||
    envTruthy(env.XAI_GROK) ||
    envTruthy(env.GROK_AGENT) ||
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
// package); installed into each tool's slash-command / skill-catalog location.
// The YAML frontmatter (name/description) is understood or harmlessly ignored
// by every host. Kiro has no command mechanism — its steering rule file is the
// only gate.
//
// Codex: discovers Agent Skills directories with SKILL.md — repo path is the
// official `.agents/skills/<name>/SKILL.md` (not dead `.codex/prompts/*.md`).
// Home install uses `$CODEX_HOME/skills/<name>/SKILL.md` via --codex-home.
export const SKILL_TOOL_TARGETS = {
  claude: (name) => `.claude/skills/${name}/SKILL.md`,
  cursor: (name) => `.cursor/commands/${name}.md`,
  // Official Codex REPO skill scope (Agent Skills standard).
  codex: (name) => `.agents/skills/${name}/SKILL.md`,
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
  return skillVersionFromContent(content);
}

function skillVersionFromContent(content) {
  if (content == null) return null;
  const match = String(content).match(/^arkVersion:\s*(.+)$/m);
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

/**
 * Content identity for managed skills — arkVersion stamp is normalized so a lagging
 * header alone never diverges from the package template (matches managed-upgrade).
 * @param {string|null|undefined} content
 * @returns {string|null}
 */
export function skillContentIdentity(content) {
  if (content == null) return null;
  let text = String(content).replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end >= 0) {
      for (let index = 1; index < end; index += 1) {
        if (/^arkVersion:/.test(lines[index])) lines[index] = 'arkVersion:<managed>';
      }
      text = lines.join('\n');
    }
  }
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

/**
 * True when installed skill body matches the package template for that skill
 * (version stamp ignored). Used so doctor "stale" aligns with managed upgrade.
 *
 * Templates ship without arkVersion; installs are stamped. Identity normalizes
 * the stamp value, so compare against both the raw template and a stamped copy.
 * @param {string} installedContent
 * @param {string|undefined|null} templateContent
 */
export function skillContentMatchesTemplate(installedContent, templateContent) {
  if (templateContent == null || installedContent == null) return false;
  const installedId = skillContentIdentity(installedContent);
  if (installedId === skillContentIdentity(templateContent)) return true;
  // Installed skills are stamped; templates are not — stamp with a dummy version
  // so arkVersion:<managed> lines align under skillContentIdentity.
  return installedId === skillContentIdentity(stampSkill(templateContent, '0.0.0'));
}

/** @returns {Record<string, string>} skill name → template body from package */
export function skillTemplateBodies() {
  return Object.fromEntries(skillTemplates());
}

/**
 * Count a present skill as stale only when content differs from the package
 * template AND the arkVersion stamp is missing or older than the package.
 * Content identity match → never stale (even if header lags).
 */
function isInstalledSkillStale(installedContent, templateContent, packageVersion) {
  if (!packageVersion) return false;
  if (skillContentMatchesTemplate(installedContent, templateContent)) return false;
  const installed = skillVersionFromContent(installedContent);
  return installed === null || isVersionOlder(installed, packageVersion);
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

/**
 * Count present / stale / legacy-only skill files for one catalog root.
 * "stale" means content behind the package template (identity mismatch) with a
 * missing/older arkVersion stamp — not merely a lagging version header when the
 * body still matches the template (aligned with managed-upgrade classify).
 * @param {string[]} skillNames
 * @param {(name: string) => string} skillFile path builder
 * @param {string|null} packageVersion
 * @param {{ legacyFile?: (name: string) => string, templateBodies?: Record<string, string> }} [opts]
 */
export function assessSkillCatalogParity(skillNames, skillFile, packageVersion, opts = {}) {
  const expectedCount = skillNames.length;
  const templates = opts.templateBodies ?? skillTemplateBodies();
  const present = [];
  let stale = 0;
  for (const name of skillNames) {
    const file = skillFile(name);
    if (!fs.existsSync(file)) continue;
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      // Unreadable path is not a usable install — count as missing (matches detectSkillGaps).
      continue;
    }
    present.push(name);
    if (isInstalledSkillStale(content, templates[name], packageVersion)) stale += 1;
  }
  let legacyCount = 0;
  if (typeof opts.legacyFile === 'function') {
    for (const name of skillNames) {
      if (fs.existsSync(opts.legacyFile(name))) legacyCount += 1;
    }
  }
  const presentCount = present.length;
  const missing = expectedCount - presentCount;
  const legacyPromptsOnly = presentCount === 0 && legacyCount > 0;
  const hasLegacyPrompts = legacyCount > 0;
  // Legacy prompts beside a complete modern catalog are not catalog debt.
  const ok = missing === 0 && stale === 0 && !legacyPromptsOnly;
  return {
    ok,
    missing,
    stale,
    presentCount,
    expectedCount,
    packageVersion: packageVersion ?? null,
    legacyPromptsOnly,
    hasLegacyPrompts,
    legacyCount,
    catalogComplete: missing === 0 && stale === 0 && presentCount === expectedCount,
  };
}

/**
 * Repo + home Codex skill parity against the shipping package skill set.
 * Producer trees (templates/skills) and projects without AGENTS.md return null.
 *
 * @param {string} root
 * @returns {null | {
 *   packageVersion: string|null,
 *   expectedCount: number,
 *   repo: object,
 *   home: object,
 *   skillsDir: string,
 *   promptsDir: string,
 *   needsAttention: boolean,
 *   homeNeedsAttention: boolean,
 *   repoNeedsAttention: boolean,
 * }}
 */
export function assessCodexSkillParity(root) {
  if (!fs.existsSync(path.join(root, 'AGENTS.md'))) return null;
  if (fs.existsSync(path.join(root, 'templates', 'skills'))) return null;
  const skillNames = skillTemplateNames();
  if (skillNames.length === 0) return null;

  const packageVersion = arkPackageVersion();
  const skillsDir = codexSkillsDir();
  const promptsDir = codexPromptsDir();
  const repoSkill = (name) => path.join(root, SKILL_TOOL_TARGETS.codex(name));
  const repoLegacy = (name) => path.join(root, '.codex', 'prompts', `${name}.md`);
  const homeSkill = (name) => path.join(skillsDir, name, 'SKILL.md');
  const homeLegacy = (name) => path.join(promptsDir, `${name}.md`);

  const repo = assessSkillCatalogParity(skillNames, repoSkill, packageVersion, {
    legacyFile: repoLegacy,
  });
  const home = assessSkillCatalogParity(skillNames, homeSkill, packageVersion, {
    legacyFile: homeLegacy,
  });

  // Repo catalog matters when .codex is present (Codex host adopted) or repo skills/prompts exist.
  const repoInPlay =
    fs.existsSync(path.join(root, '.codex')) ||
    repo.presentCount > 0 ||
    repo.hasLegacyPrompts;
  // Home is "in play" only when ark skills or legacy prompts were actually installed there
  // (empty $CODEX_HOME/skills is optional multi-project — not debt).
  const homeInPlay = home.presentCount > 0 || home.hasLegacyPrompts;

  if (!repoInPlay && !homeInPlay) return null;

  const repoNeedsAttention =
    repoInPlay && (repo.missing > 0 || repo.stale > 0 || repo.legacyPromptsOnly);
  const homeNeedsAttention =
    homeInPlay && (home.missing > 0 || home.stale > 0 || home.legacyPromptsOnly);

  return {
    packageVersion,
    expectedCount: skillNames.length,
    repo: { ...repo, inPlay: repoInPlay },
    home: {
      ...home,
      inPlay: homeInPlay,
      skillsDir,
      promptsDir,
    },
    skillsDir,
    promptsDir,
    repoNeedsAttention,
    homeNeedsAttention,
    needsAttention: repoNeedsAttention || homeNeedsAttention,
  };
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
  const parity = assessCodexSkillParity(root);
  if (!parity || !parity.homeNeedsAttention) return null;
  const { home, packageVersion, expectedCount, skillsDir } = parity;
  return {
    missing: home.missing,
    stale: home.stale,
    legacyPromptsOnly: Boolean(home.legacyPromptsOnly),
    hasLegacyPrompts: Boolean(home.hasLegacyPrompts),
    presentCount: home.presentCount,
    expectedCount,
    packageVersion,
    skillsDir,
  };
}

/**
 * Repo-side Codex gaps: missing/stale .agents/skills or legacy .codex/prompts only.
 * @param {string} root
 * @returns {null | { missing: number, stale: number, legacyPromptsOnly: boolean, hasLegacyPrompts: boolean, presentCount: number, expectedCount: number, packageVersion: string|null }}
 */
export function detectCodexRepoSkillGap(root) {
  const parity = assessCodexSkillParity(root);
  if (!parity || !parity.repoNeedsAttention) return null;
  const { repo, packageVersion, expectedCount } = parity;
  return {
    missing: repo.missing,
    stale: repo.stale,
    legacyPromptsOnly: Boolean(repo.legacyPromptsOnly),
    hasLegacyPrompts: Boolean(repo.hasLegacyPrompts),
    presentCount: repo.presentCount,
    expectedCount,
    packageVersion,
  };
}

/**
 * Skill names referenced as `/ark-*` in AGENTS.md (or any instruction text).
 * @param {string} text
 * @returns {string[]}
 */
export function agentsMdSkillRefs(text) {
  if (!text || typeof text !== 'string') return [];
  const refs = new Set();
  const re = /\/(ark-[a-z0-9-]+)/g;
  let match;
  while ((match = re.exec(text)) !== null) refs.add(match[1]);
  return [...refs].sort();
}

/**
 * Verify that every `/ark-*` skill referenced by AGENTS.md (and known to this
 * package) is present in each selected host's skill catalog path.
 *
 * Compact routers intentionally omit `/ark-*` — they verify as ok with no checks.
 *
 * @param {string} root
 * @param {Iterable<string>} tools
 * @param {{ skillNames?: string[], agentsText?: string }} [options]
 * @returns {{ ok: boolean, missing: Array<{ tool: string, name: string, path: string }>, referenced: string[], checkedTools: string[], compact?: boolean }}
 */
export function verifyHostSkillCatalog(root, tools, options = {}) {
  const skillNames = new Set(options.skillNames ?? skillTemplateNames());
  let agentsText = options.agentsText;
  if (agentsText == null) {
    try {
      agentsText = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    } catch {
      return { ok: true, missing: [], referenced: [], checkedTools: [] };
    }
  }
  if (isCompactRouterAgentsContent(agentsText)) {
    return { ok: true, missing: [], referenced: [], checkedTools: [], compact: true };
  }
  const referenced = agentsMdSkillRefs(agentsText).filter((name) => skillNames.has(name));
  const missing = [];
  const checkedTools = [];
  for (const tool of tools) {
    const target = SKILL_TOOL_TARGETS[tool];
    if (!target) continue;
    checkedTools.push(tool);
    for (const name of referenced) {
      const relativePath = target(name);
      if (!fs.existsSync(path.join(root, relativePath))) {
        missing.push({ tool, name, path: relativePath });
      }
    }
  }
  return { ok: missing.length === 0, missing, referenced, checkedTools };
}

export function detectSkillGaps(root) {
  if (!fs.existsSync(path.join(root, 'AGENTS.md'))) return [];
  try {
    if (isCompactRouterAgentsContent(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'))) {
      return [];
    }
  } catch {
    // Continue with the ordinary missing-skill detection below.
  }
  // The Ark source tree keeps the skill templates at templates/skills/ — it's the
  // producer, not a consumer, so it must not nag itself to "install" its own skills.
  if (fs.existsSync(path.join(root, 'templates', 'skills'))) return [];
  const skillNames = skillTemplateNames();
  if (skillNames.length === 0) return [];
  const templates = skillTemplateBodies();
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
        continue;
      }
      let content;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        missing += 1;
        continue;
      }
      // Content identity match with package template → not stale (version header may lag).
      if (isInstalledSkillStale(content, templates[name], version)) stale += 1;
    }
    let legacyPromptsOnly = false;
    let hasLegacyPrompts = false;
    let legacyAdvisory = false;
    if (tool === 'codex') {
      const legacyCount = skillNames.filter((name) =>
        fs.existsSync(path.join(root, '.codex', 'prompts', `${name}.md`))
      ).length;
      hasLegacyPrompts = legacyCount > 0;
      // Flat prompts without any SKILL.md catalog entries are not loadable.
      legacyPromptsOnly = hasLegacyPrompts && missing === skillNames.length;
      // Modern catalog complete + leftover flat prompts → advisory only (safe delete).
      legacyAdvisory =
        hasLegacyPrompts && !legacyPromptsOnly && missing === 0 && stale === 0;
    }
    if (missing > 0 || stale > 0 || legacyPromptsOnly || legacyAdvisory) {
      gaps.push({
        tool,
        missing,
        stale,
        ...(legacyPromptsOnly ? { legacyPromptsOnly: true } : {}),
        ...(hasLegacyPrompts ? { hasLegacyPrompts: true } : {}),
        ...(legacyAdvisory
          ? { legacyAdvisory: true, catalogComplete: true }
          : {}),
      });
    }
  }
  return gaps;
}

/**
 * Human-facing skill / Codex catalog gap lines for ark-check (non-JSON).
 * @param {string} root
 * @param {{ skillGaps: object[], codexHomeGap: object|null, codexRepoSkillGap: object|null, codexSessionActive: boolean, color: { dim: Function, yellow: Function } }} opts
 */
export function printSkillAndCodexGapHints(root, opts) {
  const { skillGaps, codexHomeGap, codexRepoSkillGap, codexSessionActive, color } = opts;
  if (skillGaps?.length > 0) {
    const legacyCodex = skillGaps.some((gap) => gap.tool === 'codex' && gap.legacyPromptsOnly);
    const legacyAdvisory = skillGaps.some(
      (gap) => gap.tool === 'codex' && gap.legacyAdvisory && gap.catalogComplete
    );
    // Report Codex legacy separately; never suppress missing/stale for other hosts.
    const remaining = skillGaps.filter(
      (gap) =>
        !(gap.tool === 'codex' && (gap.legacyPromptsOnly || gap.legacyAdvisory))
    );
    const missingTotal = remaining.reduce((sum, gap) => sum + gap.missing, 0);
    const staleTotal = remaining.reduce((sum, gap) => sum + gap.stale, 0);
    const tools = remaining.map((gap) => gap.tool).join(', ');
    if (legacyCodex) {
      console.log(
        color.yellow(
          'Codex has legacy flat .codex/prompts/ark-*.md only — those are not loadable as skills. ' +
            `Install the real catalog: ${arkCommand(root, 'ark-check', '--install-agent-gates --skills-only --tools codex --force')}`
        )
      );
    }
    if (legacyAdvisory) {
      console.log(
        color.dim(
          'Codex .agents/skills catalog is complete; leftover .codex/prompts/ark-*.md are not loadable and safe to delete (not required).'
        )
      );
    }
    if (missingTotal > 0) {
      console.log(
        color.dim(
          `${missingTotal} /ark-* skill(s) not installed for ${tools} (this Ark version ships them). ` +
            `Install: ${arkCommand(root, 'ark-check', '--install-agent-gates')}`
        )
      );
    }
    if (staleTotal > 0) {
      console.log(
        color.dim(
          `${staleTotal} /ark-* skill(s) content behind this Ark package for ${tools}. ` +
            `Refresh: ${arkCommand(root, 'ark-check', '--install-agent-gates --skills-only --force')}`
        )
      );
    }
  }
  if (codexHomeGap) {
    const parts = [];
    if (codexHomeGap.legacyPromptsOnly) parts.push('legacy-prompts-only');
    if (codexHomeGap.missing > 0) parts.push(`${codexHomeGap.missing} missing`);
    if (codexHomeGap.stale > 0) parts.push(`${codexHomeGap.stale} content-behind-package`);
    const deferred = !codexSessionActive;
    const deferredNote = deferred
      ? ' Deferred unless you use Codex — not a blocker for Grok/Claude/Cursor. '
      : ' ';
    const msg =
      `Codex home skill catalog (${codexSkillsDir()}) behind this Ark (${parts.join(', ')}).` +
      deferredNote +
      `Catalog is $CODEX_HOME/skills/<name>/SKILL.md (not flat prompts). ` +
      `When using Codex: ${arkCommand(root, 'ark-check', '--install-agent-gates --skills-only --codex-home --force')}`;
    console.log(deferred ? color.dim(msg) : color.yellow(msg));
  }
  if (codexRepoSkillGap && codexSessionActive) {
    const parts = [];
    if (codexRepoSkillGap.legacyPromptsOnly) parts.push('legacy-prompts-only');
    if (codexRepoSkillGap.missing > 0) parts.push(`${codexRepoSkillGap.missing} missing`);
    if (codexRepoSkillGap.stale > 0) parts.push(`${codexRepoSkillGap.stale} content-behind-package`);
    console.log(
      color.yellow(
        `Codex repo skill catalog (.agents/skills) needs refresh (${parts.join(', ')}). ` +
          `Fix: ${arkCommand(root, 'ark-check', '--install-agent-gates --skills-only --tools codex --force')}`
      )
    );
  }
}
