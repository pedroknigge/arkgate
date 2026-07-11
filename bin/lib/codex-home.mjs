/**
 * Codex home config ($CODEX_HOME/config.toml) — paths, multi-project wire, adoption assess.
 * Extracted from agent-gates so install/doctor stay orchestration-only (R7 review).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execCommandParts } from '../ark-shared.mjs';
import { ARK_GENERATION_IDENTITY } from './product-identity.mjs';

export const PREFERRED_CODEX_MCP_BIN = 'arkgate-mcp';

/** Where Codex loads slash-command prompts ($CODEX_HOME/prompts). */
export function codexPromptsDir() {
  const base = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.join(base, 'prompts');
}

/** Where Codex loads MCP servers ($CODEX_HOME/config.toml) — global, not project-local. */
export function codexConfigPath() {
  const base = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.join(base, 'config.toml');
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

/** Extract `--root` from one TOML mcp_servers table body. */
export function extractCodexRootFromBlock(block) {
  if (!block || typeof block !== 'string') return null;
  const m = block.match(/"--root"\s*,\s*"([^"]+)"/);
  return m ? m[1] : null;
}

/**
 * All Ark MCP server tables in a Codex config.toml.
 * @returns {Array<{ table: string, root: string|null, block: string, start: number, end: number }>}
 */
export function listCodexArkServerTables(tomlText) {
  if (!tomlText || typeof tomlText !== 'string') return [];
  const out = [];
  const headerRe = /\[mcp_servers\.((?:ark|structrail)(?:_[a-zA-Z0-9_-]*)?)\]/g;
  const headers = [];
  let hm;
  while ((hm = headerRe.exec(tomlText)) !== null) {
    headers.push({ table: hm[1], index: hm.index });
  }
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index;
    let end = i + 1 < headers.length ? headers[i + 1].index : tomlText.length;
    if (i + 1 >= headers.length) {
      const rest = tomlText.slice(start + 1);
      const other = rest.search(/\n\[/);
      if (other >= 0) end = start + 1 + other;
    }
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
export function codexPrimaryTable(tomlText, serverKey = 'ark') {
  return listCodexArkServerTables(tomlText).find((t) => t.table === serverKey) ?? null;
}

/** Secondary (non-primary) table whose --root is this project, if any. */
export function codexScopedTableForRoot(tomlText, absRoot, serverKey = 'ark') {
  const abs = path.resolve(absRoot);
  for (const entry of listCodexArkServerTables(tomlText)) {
    if (entry.table === serverKey || !entry.table.startsWith(`${serverKey}_`)) continue;
    if (!entry.root) continue;
    try {
      if (path.resolve(entry.root) === abs) return entry.table;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Extract --root from primary [mcp_servers.ark]. */
export function extractCodexArkRootFromToml(tomlText) {
  return codexPrimaryTable(tomlText)?.root ?? null;
}

export function codexArkBlockHasPreferredBin(tomlText, identity = ARK_GENERATION_IDENTITY) {
  const primary = codexPrimaryTable(tomlText, identity.mcpServerKey);
  if (!primary) return false;
  const bins = [...primary.block.matchAll(/"(structrail-mcp|arkgate-mcp|ark-mcp)"/g)].map(
    (m) => m[1]
  );
  if (bins.length > 1) return false;
  return bins.length === 1 && bins[0] === identity.mcpBin;
}

/**
 * True when primary is broken (temp root / dual bin) and should rewrite fail-closed.
 * Permanent different project roots are NOT broken — multi-project uses a secondary table.
 */
export function codexArkBlockNeedsRewrite(
  tomlText,
  absRoot,
  identity = ARK_GENERATION_IDENTITY
) {
  if (!tomlText || !tomlText.includes(`[mcp_servers.${identity.mcpServerKey}]`)) return true;
  const rootArg = codexPrimaryTable(tomlText, identity.mcpServerKey)?.root ?? null;
  if (!rootArg || isTempOrUpgradeRoot(rootArg)) return true;
  try {
    if (path.resolve(rootArg) !== path.resolve(absRoot)) {
      if (!isTempOrUpgradeRoot(rootArg)) return false;
      return true;
    }
  } catch {
    return true;
  }
  if (!codexArkBlockHasPreferredBin(tomlText, identity)) return true;
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
export function assessCodexHomeMcp(
  tomlText,
  absRoot,
  identity = ARK_GENERATION_IDENTITY
) {
  const resolvedRoot = path.resolve(absRoot);
  if (!tomlText || !tomlText.includes(`[mcp_servers.${identity.mcpServerKey}]`)) {
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
  const rootArg = codexPrimaryTable(tomlText, identity.mcpServerKey)?.root ?? null;
  const temp = isTempOrUpgradeRoot(rootArg);
  let wrongRoot = false;
  try {
    wrongRoot = rootArg ? path.resolve(rootArg) !== resolvedRoot : true;
  } catch {
    wrongRoot = true;
  }
  const preferredBin = codexArkBlockHasPreferredBin(tomlText, identity);
  const needsRewrite = codexArkBlockNeedsRewrite(tomlText, resolvedRoot, identity);
  const scopedTable =
    wrongRoot && !temp
      ? codexScopedTableForRoot(tomlText, resolvedRoot, identity.mcpServerKey)
      : null;
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
          : `Codex home MCP should use a single ${identity.mcpBin} bin with absolute project paths`,
      fixArgs: '--install-agent-gates --codex-home --force',
    };
  } else if (multiProject) {
    gap = {
      id: 'codex-home-multi-project',
      severity: scopedTable ? 'info' : 'warn',
      message: scopedTable
        ? `Codex primary [mcp_servers.${identity.mcpServerKey}] is bound to another project (${rootArg}); ` +
          `this project is registered as [mcp_servers.${scopedTable}]. ` +
          `Codex may still prefer the primary binding for ark://manifest — rebind if this repo should own it.`
        : `Codex home primary MCP --root is another permanent project ` +
          `(${rootArg || 'missing'} ≠ ${resolvedRoot}). ` +
          `Install without --force adds a scoped [mcp_servers.${identity.mcpServerKey}_<slug>] table and leaves primary unchanged; ` +
          `--force rebinds primary to this project.`,
      fixArgs: scopedTable
        ? '--install-agent-gates --tools codex --force'
        : '--install-agent-gates --tools codex',
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
export function wireCodexMcp(root, force, identity = ARK_GENERATION_IDENTITY) {
  const file = codexConfigPath();
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const absRoot = path.resolve(root);
  const absConfig = path.join(absRoot, identity.configName);
  const { command, args } = execCommandParts(root, identity.mcpBin, [
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

  const primary = codexPrimaryTable(existing, identity.mcpServerKey);
  const hasPrimary = Boolean(primary);
  const existingRoot = primary?.root ?? null;
  let differentProject = false;
  try {
    differentProject = Boolean(existingRoot && path.resolve(existingRoot) !== absRoot);
  } catch {
    differentProject = Boolean(existingRoot);
  }
  const mustRewrite = hasPrimary && codexArkBlockNeedsRewrite(existing, absRoot, identity);

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
    const existingScoped = codexScopedTableForRoot(
      existing,
      absRoot,
      identity.mcpServerKey
    );
    const table =
      existingScoped || `${identity.mcpServerKey}_${codexProjectSlug(absRoot)}`;
    const next = upsertCodexMcpTable(existing, table, makeBlock(table));
    const err = writeToml(next);
    if (err) return err;
    return { status: 'written-multi', file, table, primaryUnchanged: true };
  }

  if (hasPrimary && !force && !mustRewrite) {
    return { status: 'skipped', file };
  }

  const next = upsertCodexMcpTable(
    existing,
    identity.mcpServerKey,
    makeBlock(identity.mcpServerKey)
  );
  const err = writeToml(next);
  if (err) return err;
  return {
    status: hasPrimary ? 'updated' : 'written',
    file,
    ...(mustRewrite && !force ? { reason: 'temp-or-stale-root' } : {}),
  };
}
