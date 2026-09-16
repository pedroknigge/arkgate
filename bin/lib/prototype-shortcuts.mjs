/**
 * Soft prototype-shortcut residual (P2 §3 / Guiar).
 * Tooling I/O. Never a gate fail.
 *
 * SQLite / JSON-file stores standing in for a declared Persistence home,
 * and admin / god-mode literals sitting outside Domain or an auth tag.
 * Silent when the contract does not imply those houses, the shortcut is
 * already in the right house, or the tree has no such markers.
 */

import fs from 'node:fs';
import path from 'node:path';
import { layerForFile } from '../ark-shared.mjs';
import { isDomainRoleLayerName } from './arkrules-sensors.mjs';
import { isNonProductionPilotPath } from './design-smells.mjs';

export const PROTOTYPE_KIND = Object.freeze({
  SQLITE: 'sqlite',
  JSON_FILE: 'json-file',
  ADMIN: 'admin-literals',
});

export const PROTOTYPE_SQLITE_ASK =
  'SQLite is the standing store, and it is not in Persistence.';

export const PROTOTYPE_JSON_ASK =
  'A JSON file is standing in for Persistence.';

export const PROTOTYPE_ADMIN_ASK =
  'Admin / god-mode literals sit outside Domain (or an auth tag).';

export const PROTOTYPE_PACK_ASK =
  'Prototype shortcuts are still standing in for Persistence or Domain policy.';

export const PROTOTYPE_PERSISTENCE_NEXT =
  'Create a Persistence adapter (/ark-place), then move the file store behind it (/ark-autopilot). Do not harden the shortcut.';

export const PROTOTYPE_ADMIN_NEXT =
  'Move admin / god-mode literals behind Domain or an auth tag (/ark-place). Then one small refactor with /ark-autopilot.';

export const PROTOTYPE_PACK_NEXT =
  'Create a Persistence adapter (/ark-place) for the file store, and move admin literals behind Domain or an auth tag. Then one small refactor with /ark-autopilot.';

const SOURCE_EXT = /\.(?:ts|tsx|js|jsx|mts|cts)$/;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_SCAN_FILES = 800;

const SQLITE_IMPORT_RE =
  /\b(?:from|require\()\s*['"](?:better-sqlite3|sqlite3|sql\.js|bun:sqlite|node:sqlite)['"]/;

const JSON_DB_IMPORT_RE = /\b(?:from|require\()\s*['"](?:lowdb|node-json-db)['"]/;

const JSON_DB_PATH_RE =
  /['"`](?:[^'"`]*[\\/])?(?:db|database|store|data-store|dump)\.json['"`]/i;

const FS_OR_JSON_RE = /\b(?:readFile|writeFile|readFileSync|writeFileSync|JSON\.parse|JSON\.stringify)\b/;

const PRIVILEGE_LITERAL_RE =
  /['"](?:admin|superadmin|super-admin|superuser|god|god-mode|godmode)['"]/i;

const PRIVILEGE_CONTEXT_RE =
  /\b(?:role|roles|privilege|permission|permissions|acl|isAdmin|isSuperuser|godMode|GOD_MODE)\b/;

const HARDCODED_ADMIN_RE = /\bisAdmin\s*=\s*true\b/;

const GOD_IDENT_RE = /\b(?:isGodMode|godMode|GOD_MODE|isSuperuser)\b/;

/** Persistence-role house by name. Align with design-smells persistence heuristic. */
export function isPersistenceRoleLayerName(name) {
  return typeof name === 'string' && /persist|repository|data.?access/i.test(name);
}

function configLayers(input) {
  return Array.isArray(input.config?.layers) ? input.config.layers : [];
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

function readTextLimited(absPath) {
  try {
    const st = fs.statSync(absPath);
    if (!st.isFile() || st.size === 0 || st.size > MAX_FILE_BYTES) return null;
    return fs.readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
}

function normalizeRel(root, filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  let rel = path.relative(root, abs).split(path.sep).join('/');
  if (rel.startsWith('./')) rel = rel.slice(2);
  return { abs, rel };
}

function hasSqliteShortcut(source) {
  return SQLITE_IMPORT_RE.test(source);
}

function hasJsonFileShortcut(source) {
  if (JSON_DB_IMPORT_RE.test(source)) return true;
  return JSON_DB_PATH_RE.test(source) && FS_OR_JSON_RE.test(source);
}

function hasAdminLiteral(source) {
  if (HARDCODED_ADMIN_RE.test(source) || GOD_IDENT_RE.test(source)) return true;
  return PRIVILEGE_LITERAL_RE.test(source) && PRIVILEGE_CONTEXT_RE.test(source);
}

function layerNameFor(root, rel, config) {
  try {
    return layerForFile(root, rel, config?.layers ?? []) ?? null;
  } catch {
    return null;
  }
}

function layerByName(config, name) {
  return configLayers({ config }).find((layer) => layer.name === name) ?? null;
}

function isTrustPolicyLayer(layer) {
  const tag = layer?.trustBoundary;
  return tag === 'auth' || tag === 'admin';
}

function composeAsk(kinds) {
  if (kinds.length === 1) {
    if (kinds[0] === PROTOTYPE_KIND.SQLITE) return PROTOTYPE_SQLITE_ASK;
    if (kinds[0] === PROTOTYPE_KIND.JSON_FILE) return PROTOTYPE_JSON_ASK;
    return PROTOTYPE_ADMIN_ASK;
  }
  return PROTOTYPE_PACK_ASK;
}

function composeNext(kinds) {
  const persist = kinds.includes(PROTOTYPE_KIND.SQLITE) || kinds.includes(PROTOTYPE_KIND.JSON_FILE);
  const admin = kinds.includes(PROTOTYPE_KIND.ADMIN);
  if (persist && admin) return PROTOTYPE_PACK_NEXT;
  if (admin) return PROTOTYPE_ADMIN_NEXT;
  return PROTOTYPE_PERSISTENCE_NEXT;
}

/**
 * Soft residual when prototype stores or privilege literals are standing in
 * for a declared Persistence / Domain (or auth) house. Never flips valid.
 *
 * @param {{ root?: string, config?: object, coverage?: object, files?: readonly string[] }} [input]
 * @returns {{ kinds: string[], ask: string, nextAction: string, evidence: string[], persistenceLayers: string[], domainLayers: string[] } | null}
 */
export function collectPrototypeShortcutsResidual(input = {}) {
  const declared = configLayers(input);
  const persistenceLayers = declared.filter((layer) => isPersistenceRoleLayerName(layer.name));
  const domainLayers = declared.filter((layer) =>
    isDomainRoleLayerName(layer.name, layer.intentPrefixes ?? [])
  );
  const trustPolicyLayers = declared.filter((layer) => isTrustPolicyLayer(layer));
  const persistEligible = persistenceLayers.length > 0;
  const adminEligible = domainLayers.length > 0 || trustPolicyLayers.length > 0;
  if (!persistEligible && !adminEligible) return null;

  const root = typeof input.root === 'string' ? input.root : '';
  const files = Array.isArray(input.files) ? input.files : [];
  if (files.length === 0) return null;

  const persistNames = new Set(persistenceLayers.map((layer) => layer.name));
  const domainNames = new Set(domainLayers.map((layer) => layer.name));

  const sqliteHits = [];
  const jsonHits = [];
  const adminHits = [];
  let scanned = 0;

  for (const file of files) {
    if (scanned >= MAX_SCAN_FILES) break;
    const { abs, rel } = normalizeRel(root, file);
    if (!rel || rel.startsWith('..')) continue;
    if (!SOURCE_EXT.test(rel)) continue;
    if (rel.includes('node_modules/') || rel.endsWith('.d.ts')) continue;
    if (isNonProductionPilotPath(rel)) continue;
    const source = readTextLimited(abs);
    if (source == null) continue;
    scanned += 1;
    const code = stripComments(source);
    const layer = layerNameFor(root, rel, input.config);
    const inPersistence = Boolean(layer && persistNames.has(layer));
    const policyHome =
      Boolean(layer && domainNames.has(layer)) || isTrustPolicyLayer(layerByName(input.config, layer));

    if (persistEligible && !inPersistence) {
      if (hasSqliteShortcut(code)) sqliteHits.push(rel);
      if (hasJsonFileShortcut(code)) jsonHits.push(rel);
    }
    if (adminEligible && !policyHome && hasAdminLiteral(code)) adminHits.push(rel);
  }

  const kinds = [];
  const evidence = [];
  if (persistEligible && sqliteHits.length > 0) {
    kinds.push(PROTOTYPE_KIND.SQLITE);
    evidence.push(...sqliteHits);
  }
  if (persistEligible && jsonHits.length > 0) {
    kinds.push(PROTOTYPE_KIND.JSON_FILE);
    evidence.push(...jsonHits);
  }
  if (adminEligible && adminHits.length > 0) {
    kinds.push(PROTOTYPE_KIND.ADMIN);
    evidence.push(...adminHits);
  }
  if (kinds.length === 0) return null;

  const uniqueEvidence = [...new Set(evidence)].slice(0, 12);
  return {
    kinds,
    ask: composeAsk(kinds),
    nextAction: composeNext(kinds),
    evidence: uniqueEvidence,
    persistenceLayers: persistenceLayers.map((layer) => layer.name),
    domainLayers: domainLayers.map((layer) => layer.name),
  };
}
