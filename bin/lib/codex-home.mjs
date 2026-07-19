/**
 * Codex home config ($CODEX_HOME/config.toml) — paths, multi-project wire, adoption assess.
 * Extracted from agent-gates so install/doctor stay orchestration-only (R7 review).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execCommandParts } from '../ark-shared.mjs';

export const PREFERRED_CODEX_MCP_BIN = 'arkgate-mcp';

/** Where Codex loads slash-command prompts ($CODEX_HOME/prompts) — legacy, not the skill catalog. */
export function codexPromptsDir() {
  const base = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.join(base, 'prompts');
}

/**
 * Where Codex loads user/home SKILL.md skills ($CODEX_HOME/skills/<name>/SKILL.md).
 * Repo-scoped skills live at `.agents/skills/<name>/SKILL.md` (Agent Skills standard).
 */
export function codexSkillsDir() {
  const base = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.join(base, 'skills');
}

/** Where Codex loads MCP servers ($CODEX_HOME/config.toml) — global, not project-local. */
export function codexConfigPath() {
  const base = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.join(base, 'config.toml');
}

/** True when CODEX_HOME is unset/empty or resolves to the real default ~/.codex. */
export function usesDefaultCodexHome(env = process.env, homeDir = os.homedir()) {
  const configured = env?.CODEX_HOME;
  if (typeof configured !== 'string' || configured.trim() === '') return true;
  return path.resolve(configured) === path.resolve(homeDir, '.codex');
}

/** Temp / upgrade sandbox roots must never remain as Codex MCP --root. */
export function isTempOrUpgradeRoot(p) {
  if (!p || typeof p !== 'string') return false;
  const n = p.replace(/\\/g, '/');
  return (
    /\/var\/folders\//i.test(n) ||
    /\/tmp\//i.test(n) ||
    /\/Temp\//i.test(n) ||
    /ark-upgrade/i.test(n) ||
    /\/(?:\.claude|\.codex|\.grok)\/worktrees\//i.test(n) ||
    /\/T\/(?:ark-|grok-)/i.test(n) ||
    /[\\/]AppData[\\/]Local[\\/]Temp[\\/]/i.test(n)
  );
}

/**
 * Stable secondary table name: basename + short path hash so two projects named
 * `app` do not collide on `mcp_servers.ark_app`.
 */
export function codexProjectSlug(absRoot) {
  const abs = path.resolve(absRoot);
  const base =
    path
      .basename(abs)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40) || 'project';
  const hash = crypto.createHash('sha1').update(abs).digest('hex').slice(0, 8);
  return `${base}_${hash}`;
}

/** Parse the one generated-style TOML args array from an MCP table body. */
export function extractCodexArgsFromBlock(block) {
  if (!block || typeof block !== 'string') return null;
  const matches = [
    ...block.matchAll(/^[ \t]*args[ \t]*=[ \t]*\[([^\]\r\n]*)\][ \t]*(?:#.*)?$/gm),
  ];
  if (matches.length !== 1) return null;
  const tokens = [...matches[0][1].matchAll(/"(?:\\.|[^"\\])*"|'[^']*'/g)];
  const shape = matches[0][1].replace(/"(?:\\.|[^"\\])*"|'[^']*'/g, '__ARK_STRING__');
  if (!/^[ \t]*(?:__ARK_STRING__(?:[ \t]*,[ \t]*__ARK_STRING__)*[ \t]*,?)?[ \t]*$/.test(shape)) {
    return null;
  }
  try {
    return tokens.map((match) =>
      match[0].startsWith('"') ? JSON.parse(match[0]) : match[0].slice(1, -1)
    );
  } catch {
    return null;
  }
}

/** Extract `--root` from one TOML mcp_servers table body. */
export function extractCodexRootFromBlock(block) {
  const args = extractCodexArgsFromBlock(block);
  const index = args?.indexOf('--root') ?? -1;
  return index >= 0 && typeof args[index + 1] === 'string' ? args[index + 1] : null;
}

/**
 * All Ark MCP server tables in a Codex config.toml.
 * @returns {Array<{ table: string, root: string|null, block: string, start: number, end: number }>}
 */
export function listCodexArkServerTables(tomlText) {
  if (!tomlText || typeof tomlText !== 'string') return [];
  const out = [];
  const headerRe =
    /^[ \t]*\[[ \t]*(?:"mcp_servers"|'mcp_servers'|mcp_servers)[ \t]*\.[ \t]*(?:"(ark(?:_[a-zA-Z0-9_-]*)?)"|'(ark(?:_[a-zA-Z0-9_-]*)?)'|(ark(?:_[a-zA-Z0-9_-]*)?))[ \t]*\][ \t]*(?:#.*)?$/gm;
  const headers = [];
  let hm;
  while ((hm = headerRe.exec(tomlText)) !== null) {
    headers.push({ table: hm[1] ?? hm[2] ?? hm[3], index: hm.index });
  }
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index;
    let end = tomlText.length;
    const rest = tomlText.slice(start + 1);
    const other = rest.search(/\n(?=[ \t]*\[)/);
    if (other >= 0) end = start + 1 + other;
    const block = tomlText.slice(start, end).replace(/\s+$/, '\n');
    out.push({
      table: headers[i].table,
      root: extractCodexRootFromBlock(block),
      block,
      start,
      end,
    });
  }
  return out;
}

/**
 * Replace an existing `[mcp_servers.<table>]` block or append a new one.
 * `block` should include the header line; trailing whitespace is normalized.
 */
export function upsertCodexMcpTable(tomlText, tableName, block) {
  const existing = tomlText || '';
  const normalized = `${String(block).replace(/\s+$/, '')}\n`;
  const tables = listCodexArkServerTables(existing);
  const hit = tables.find((t) => t.table === tableName);
  if (hit) {
    return `${existing.slice(0, hit.start)}${normalized}${existing.slice(hit.end).replace(/^\n+/, '\n')}`;
  }
  if (existing.length === 0) return normalized;
  const sep = existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  return `${existing}${sep}${normalized}`;
}

/** Primary table entry or null. */
export function codexPrimaryTable(tomlText) {
  return listCodexArkServerTables(tomlText).find((t) => t.table === 'ark') ?? null;
}

/** Secondary (non-primary) table whose --root is this project, if any. */
export function codexScopedTableForRoot(tomlText, absRoot) {
  const abs = path.resolve(absRoot);
  for (const entry of listCodexArkServerTables(tomlText)) {
    if (entry.table === 'ark') continue;
    if (!entry.root) continue;
    try {
      if (path.resolve(entry.root) === abs) return entry.table;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** True when project TOML owns the primary Ark MCP binding for that project. */
export function codexProjectMcpIsValid(tomlText, projectRoot) {
  const resolvedRoot = path.resolve(projectRoot);
  if (listCodexArkServerTables(tomlText).filter((entry) => entry.table === 'ark').length !== 1) {
    return false;
  }
  const primary = codexPrimaryTable(tomlText);
  const args = extractCodexArgsFromBlock(primary?.block);
  if (!primary?.root || !args?.some((value) => /^(ark|arkgate)-mcp$/.test(value))) return false;
  const configIndex = args.indexOf('--config');
  const config = configIndex >= 0 ? args[configIndex + 1] : null;
  if (!config) return false;
  try {
    return (
      path.resolve(resolvedRoot, primary.root) === resolvedRoot &&
      path.resolve(resolvedRoot, config) === path.join(resolvedRoot, 'ark.config.json')
    );
  } catch {
    return false;
  }
}

/** Extract --root from primary [mcp_servers.ark]. */
export function extractCodexArkRootFromToml(tomlText) {
  return codexPrimaryTable(tomlText)?.root ?? null;
}

export function codexArkBlockHasPreferredBin(tomlText) {
  const primary = codexPrimaryTable(tomlText);
  if (!primary) return false;
  const bins = (extractCodexArgsFromBlock(primary.block) ?? []).filter((value) =>
    /^(arkgate-mcp|ark-mcp)$/.test(value)
  );
  if (bins.length > 1) return false;
  return bins.length === 1 && bins[0] === PREFERRED_CODEX_MCP_BIN;
}

/**
 * True when primary is broken (temp root / dual bin) and should rewrite fail-closed.
 * Permanent different project roots are NOT broken — multi-project uses a secondary table.
 */
export function codexArkBlockNeedsRewrite(tomlText, absRoot) {
  if (!codexPrimaryTable(tomlText)) return true;
  const rootArg = extractCodexArkRootFromToml(tomlText);
  if (!rootArg || isTempOrUpgradeRoot(rootArg)) return true;
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
 * Assess Codex home MCP vs this project. Pure (no I/O).
 * @returns {{
 *   root: string|null,
 *   tempPath: boolean,
 *   wrongRoot: boolean,
 *   preferredBin: boolean,
 *   needsRewrite: boolean,
 *   multiProject: boolean,
 *   scopedTable: string|null,
 *   gap: null | { id: string, severity: string, message: string, fixArgs: string }
 * }}
 */
export function assessCodexHomeMcp(tomlText, absRoot) {
  const resolvedRoot = path.resolve(absRoot);
  if (!codexPrimaryTable(tomlText)) {
    return {
      root: null,
      tempPath: false,
      wrongRoot: false,
      preferredBin: false,
      needsRewrite: false,
      multiProject: false,
      scopedTable: null,
      gap: null,
    };
  }
  const rootArg = extractCodexArkRootFromToml(tomlText);
  const temp = isTempOrUpgradeRoot(rootArg);
  let wrongRoot = false;
  try {
    wrongRoot = rootArg ? path.resolve(rootArg) !== resolvedRoot : true;
  } catch {
    wrongRoot = true;
  }
  const preferredBin = codexArkBlockHasPreferredBin(tomlText);
  const needsRewrite = codexArkBlockNeedsRewrite(tomlText, resolvedRoot);
  const scopedTable = wrongRoot && !temp ? codexScopedTableForRoot(tomlText, resolvedRoot) : null;
  const multiProject = Boolean(wrongRoot && !temp && !needsRewrite);

  let gap = null;
  if (needsRewrite) {
    gap = {
      id: 'codex-home-mcp',
      severity: temp || wrongRoot ? 'warn' : 'info',
      message: temp
        ? `Codex home MCP --root points at a temp/upgrade path (${rootArg})`
        : wrongRoot
          ? `Codex home MCP --root is not this project (${rootArg || 'missing'} ≠ ${resolvedRoot})`
          : `Codex home MCP should use a single ${PREFERRED_CODEX_MCP_BIN} bin with absolute project paths`,
      fixArgs: '--install-agent-gates --codex-home --force',
    };
  } else if (multiProject) {
    gap = {
      id: 'codex-home-multi-project',
      severity: scopedTable ? 'info' : 'warn',
      message: scopedTable
        ? `Codex primary [mcp_servers.ark] is bound to another project (${rootArg}); ` +
          `this project is registered as [mcp_servers.${scopedTable}]. ` +
          `Install the project-scoped binding so this repo owns ark://manifest when active.`
        : `Codex home primary MCP --root is another permanent project ` +
          `(${rootArg || 'missing'} ≠ ${resolvedRoot}). ` +
          `Install the project-scoped binding for this repo; the global primary can remain unchanged.`,
      fixArgs: '--install-agent-gates --tools codex',
    };
  }

  return {
    root: rootArg,
    tempPath: temp,
    wrongRoot,
    preferredBin,
    needsRewrite,
    multiProject,
    scopedTable,
    gap,
  };
}

/**
 * Merge [mcp_servers.ark] (or scoped secondary) into Codex home config.toml.
 * Without --force, permanent other-project primary is left alone; this project gets
 * [mcp_servers.ark_<slug>]. Temp/stale roots rewrite fail-closed.
 *
 * All mutations go through upsertCodexMcpTable (single table model).
 */
export function wireCodexMcp(root, force) {
  const file = codexConfigPath();
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const absRoot = path.resolve(root);
  const absConfig = path.join(absRoot, 'ark.config.json');
  const { command, args } = execCommandParts(root, PREFERRED_CODEX_MCP_BIN, [
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

  const primary = codexPrimaryTable(existing);
  const hasPrimary = Boolean(primary);
  const existingRoot = primary?.root ?? null;
  let differentProject = false;
  try {
    differentProject = Boolean(existingRoot && path.resolve(existingRoot) !== absRoot);
  } catch {
    differentProject = Boolean(existingRoot);
  }
  const mustRewrite = hasPrimary && codexArkBlockNeedsRewrite(existing, absRoot);

  const writeToml = (next) => {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, next);
      return null;
    } catch (error) {
      return { status: 'failed', file, message: error.message };
    }
  };

  // Multi-project: leave primary alone; upsert scoped secondary for this root.
  if (hasPrimary && differentProject && !force && !mustRewrite) {
    const existingScoped = codexScopedTableForRoot(existing, absRoot);
    const table = existingScoped || `ark_${codexProjectSlug(absRoot)}`;
    const next = upsertCodexMcpTable(existing, table, makeBlock(table));
    const err = writeToml(next);
    if (err) return err;
    return { status: 'written-multi', file, table, primaryUnchanged: true };
  }

  if (hasPrimary && !force && !mustRewrite) {
    return { status: 'skipped', file };
  }

  const next = upsertCodexMcpTable(existing, 'ark', makeBlock('ark'));
  const err = writeToml(next);
  if (err) return err;
  return {
    status: hasPrimary ? 'updated' : 'written',
    file,
    ...(mustRewrite && !force ? { reason: 'temp-or-stale-root' } : {}),
  };
}
