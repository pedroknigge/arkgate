/**
 * Narrow opt-in status/transition catalog (P2 §2 / Ordenar).
 * Tooling I/O. Never a gate fail.
 *
 * Opt-in: a Domain-role file already has a closed status/state vocabulary
 * (≥2 string literals on a *Status / *State / *Lifecycle type or enum, or a
 * status:/state: field with a literal union). Silent when that shape is
 * absent. Residual only when a domain (or dedicated states) doc is in play
 * AND the map is missing or heading-only — names from the code, not invented.
 *
 * Does not walk docs. Does not scan Application/UI. Does not fail the check.
 */

import fs from 'node:fs';
import path from 'node:path';
import { layerForFile } from '../ark-shared.mjs';
import { isDomainRoleLayerName } from './arkrules-sensors.mjs';
import { collectStatesTransitionsResidual } from './states-transitions-presence.mjs';

export const STATUS_CATALOG_ASK =
  'Domain code already names statuses, but the states → transitions map is still thin.';

export const STATUS_CATALOG_NEXT =
  'Add those names to the table on the domain doc (entity · states · allowed from → to). No flag soup.';

const SOURCE_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']);
const MAX_FILE_BYTES = 200_000;
const MAX_ENTITIES = 8;
const MAX_LITERAL_LEN = 40;

function unique(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function isStatusTypeName(name) {
  return name.endsWith('Status') || name.endsWith('State') || name.endsWith('Lifecycle');
}

function entityFromTypeName(name, fallback) {
  const stripped = name.endsWith('Lifecycle')
    ? name.slice(0, -'Lifecycle'.length)
    : name.endsWith('Status')
      ? name.slice(0, -'Status'.length)
      : name.endsWith('State')
        ? name.slice(0, -'State'.length)
        : name;
  return stripped.length > 0 ? stripped : fallback;
}

function entityFromFile(rel) {
  const stem = path.basename(rel, path.extname(rel));
  if (!stem) return 'Entity';
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

/** Quoted string literals only — linear scan, no regex. */
export function extractQuotedLiterals(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const out = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch !== "'" && ch !== '"') continue;
    const end = text.indexOf(ch, i + 1);
    if (end < 0) break;
    const lit = text.slice(i + 1, end);
    if (lit.length > 0 && lit.length <= MAX_LITERAL_LEN && !lit.includes('\n')) out.push(lit);
    i = end;
  }
  return unique(out);
}

function readBalanced(text, openIndex, openCh, closeCh) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === openCh) depth += 1;
    else if (ch === closeCh) {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex + 1, i);
    }
  }
  return '';
}

function indexOfKeyword(text, keyword, from) {
  let idx = from;
  while (idx < text.length) {
    const found = text.indexOf(keyword, idx);
    if (found < 0) return -1;
    const prev = found === 0 ? ' ' : text[found - 1];
    if (!/[A-Za-z0-9_]/.test(prev)) return found;
    idx = found + keyword.length;
  }
  return -1;
}

function nextIdent(text, from) {
  let i = from;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  if (i >= text.length || !/[A-Za-z_]/.test(text[i])) return null;
  let end = i + 1;
  while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) end += 1;
  return { name: text.slice(i, end), end };
}

function collectTypeAlias(text, keywordIndex, fallbackEntity) {
  const afterKw = keywordIndex + 4;
  const ident = nextIdent(text, afterKw);
  if (!ident || !isStatusTypeName(ident.name)) return null;
  let i = ident.end;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  if (text[i] !== '=') return null;
  const rhsEnd = text.indexOf(';', i + 1);
  const rhs = text.slice(i + 1, rhsEnd < 0 ? Math.min(text.length, i + 400) : rhsEnd);
  const states = extractQuotedLiterals(rhs);
  if (states.length < 2) return null;
  return {
    entity: entityFromTypeName(ident.name, fallbackEntity),
    states,
  };
}

function collectEnum(text, keywordIndex, fallbackEntity) {
  const afterKw = keywordIndex + 4;
  const ident = nextIdent(text, afterKw);
  if (!ident || !isStatusTypeName(ident.name)) return null;
  let i = ident.end;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  if (text[i] !== '{') return null;
  const body = readBalanced(text, i, '{', '}');
  const states = extractQuotedLiterals(body);
  if (states.length < 2) return null;
  return {
    entity: entityFromTypeName(ident.name, fallbackEntity),
    states,
  };
}

function collectInlineFieldUnions(text) {
  const found = [];
  const needles = ['status:', 'state:', 'status?:', 'state?:'];
  for (const needle of needles) {
    let from = 0;
    while (from < text.length) {
      const idx = text.indexOf(needle, from);
      if (idx < 0) break;
      const prev = idx === 0 ? ' ' : text[idx - 1];
      if (/[A-Za-z0-9_]/.test(prev)) {
        from = idx + needle.length;
        continue;
      }
      const rhsEnd = Math.min(text.length, idx + needle.length + 240);
      const rhs = text.slice(idx + needle.length, rhsEnd);
      const states = extractQuotedLiterals(rhs);
      if (states.length >= 2) found.push(states);
      from = idx + needle.length;
    }
  }
  return found;
}

function collectQuotedTransitions(text, allowed) {
  if (allowed.size === 0) return [];
  const pairs = [];
  const arrows = [' → ', ' -> ', '→', '->'];
  for (const quote of ["'", '"']) {
    let from = 0;
    while (from < text.length) {
      const open = text.indexOf(quote, from);
      if (open < 0) break;
      const mid = text.indexOf(quote, open + 1);
      if (mid < 0) break;
      const left = text.slice(open + 1, mid);
      let rest = mid + 1;
      while (rest < text.length && /\s/.test(text[rest])) rest += 1;
      let matched = null;
      for (const arrow of arrows) {
        if (text.startsWith(arrow, rest)) {
          matched = arrow;
          break;
        }
      }
      if (!matched) {
        from = mid + 1;
        continue;
      }
      rest += matched.length;
      while (rest < text.length && /\s/.test(text[rest])) rest += 1;
      if (text[rest] !== quote) {
        from = mid + 1;
        continue;
      }
      const close = text.indexOf(quote, rest + 1);
      if (close < 0) break;
      const right = text.slice(rest + 1, close);
      if (allowed.has(left) && allowed.has(right) && left !== right) {
        pairs.push(`${left} → ${right}`);
      }
      from = close + 1;
    }
  }
  return unique(pairs);
}

/**
 * Catalog closed status/state vocabularies in one Domain source file.
 *
 * @param {string} rel
 * @param {string} content
 * @returns {{ entity: string, file: string, states: string[], transitions: string[] }[]}
 */
export function extractStatusCatalogFromSource(rel, content) {
  if (typeof content !== 'string' || content.length === 0) return [];
  const fallback = entityFromFile(rel);
  const rows = [];
  let from = 0;
  while (from < content.length) {
    const typeIdx = indexOfKeyword(content, 'type ', from);
    const enumIdx = indexOfKeyword(content, 'enum ', from);
    const next =
      typeIdx < 0 ? enumIdx : enumIdx < 0 ? typeIdx : Math.min(typeIdx, enumIdx);
    if (next < 0) break;
    if (content.startsWith('type ', next)) {
      const row = collectTypeAlias(content, next, fallback);
      if (row) rows.push(row);
      from = next + 5;
      continue;
    }
    if (content.startsWith('enum ', next)) {
      const row = collectEnum(content, next, fallback);
      if (row) rows.push(row);
      from = next + 5;
      continue;
    }
    from = next + 1;
  }

  if (rows.length === 0) {
    for (const states of collectInlineFieldUnions(content)) {
      rows.push({ entity: fallback, states });
    }
  }

  const merged = new Map();
  for (const row of rows) {
    const key = row.entity;
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { entity: row.entity, file: rel, states: [...row.states], transitions: [] });
      continue;
    }
    prev.states = unique([...prev.states, ...row.states]);
  }

  const allowed = new Set();
  for (const row of merged.values()) {
    for (const state of row.states) allowed.add(state);
  }
  const transitions = collectQuotedTransitions(content, allowed);
  for (const row of merged.values()) {
    row.transitions = transitions.filter((pair) => {
      const [fromState, toState] = pair.split(' → ');
      return row.states.includes(fromState) && row.states.includes(toState);
    });
  }
  return [...merged.values()];
}

function isSourceFile(rel) {
  return SOURCE_EXT.has(path.extname(rel).toLowerCase());
}

function readSource(abs) {
  try {
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
    const stat = fs.statSync(abs);
    if (stat.size === 0 || stat.size > MAX_FILE_BYTES) return null;
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

function domainLayersFromConfig(config) {
  return (config?.layers ?? []).filter((layer) =>
    isDomainRoleLayerName(layer.name, layer.intentPrefixes ?? [])
  );
}

/**
 * Closed catalog from already-classified Domain-role files. No docs walk.
 *
 * @param {{ root?: string, config?: object, files?: readonly string[] }} [input]
 * @returns {{ entity: string, file: string, states: string[], transitions: string[] }[]}
 */
export function collectStatusTransitionCatalog(input = {}) {
  const root = input.root ?? '';
  const files = Array.isArray(input.files) ? input.files : [];
  if (typeof root !== 'string' || root.length === 0 || files.length === 0) return [];
  const domainLayers = domainLayersFromConfig(input.config);
  if (domainLayers.length === 0) return [];
  const domainNames = new Set(domainLayers.map((layer) => layer.name));
  const layers = input.config?.layers ?? [];
  const catalog = [];
  for (const file of files) {
    if (typeof file !== 'string' || file.length === 0) continue;
    const abs = path.isAbsolute(file) ? file : path.resolve(root, file);
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (rel.startsWith('..') || !isSourceFile(rel)) continue;
    const layer = layerForFile(root, abs, layers);
    if (!layer || !domainNames.has(layer)) continue;
    const content = readSource(abs);
    if (content == null) continue;
    for (const row of extractStatusCatalogFromSource(rel, content)) {
      catalog.push(row);
      if (catalog.length >= MAX_ENTITIES) return catalog;
    }
  }
  return catalog;
}

function formatEntityList(entities) {
  const parts = entities.map((row) => `${row.entity} (${row.states.join(', ')})`);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

function nextActionFor(home, entities) {
  const names = entities.map((row) => row.entity).join(', ');
  const target = home || 'the domain doc';
  return `Add ${names} to the table on ${target} (entity · states · allowed from → to). Names from the code. No flag soup.`;
}

/**
 * Soft residual when Domain already has a status catalog and the domain-doc
 * map is missing or heading-only. Silent when the catalog is empty, the
 * domain doc is absent, or the map is already present.
 *
 * @param {{ root?: string, config?: object, files?: readonly string[], statesTransitions?: { kind?: string, home?: string } | null }} [input]
 * @returns {{ kind: 'thin', home: string, entities: object[], ask: string, nextAction: string } | null}
 */
export function collectStatusTransitionCatalogResidual(input = {}) {
  const catalog = collectStatusTransitionCatalog(input);
  if (catalog.length === 0) return null;
  const map =
    input.statesTransitions === undefined
      ? collectStatesTransitionsResidual({ root: input.root ?? '' })
      : input.statesTransitions;
  if (!map || (map.kind !== 'missing' && map.kind !== 'incomplete')) return null;
  const listed = catalog.slice(0, MAX_ENTITIES);
  return {
    kind: 'thin',
    home: map.home,
    entities: listed,
    ask: `Domain code already names ${formatEntityList(listed)}, but the states → transitions map is still thin.`,
    nextAction: nextActionFor(map.home, listed),
  };
}
