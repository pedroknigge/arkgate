/**
 * Soft states/transitions artifact guidance (P2 §2 / Guiar).
 * Tooling I/O. Never a gate fail. Silent unless a conventional domain
 * (or dedicated states) markdown home is already in play.
 * Does not walk the tree. Does not scan code for status fields.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Product-domain / domain-model homes. Closed list — no tree walk. */
export const STATES_TRANSITIONS_DOMAIN_HOMES = Object.freeze([
  'docs/domain.md',
  'docs/data-model.md',
  'docs/product-domain.md',
  'docs/modelo-de-dominio.md',
  'docs/producto-y-dominio.md',
  'docs/architecture.md',
]);

/** Evolved dedicated homes. Adopt if present; do not force a filename. */
export const STATES_TRANSITIONS_DEDICATED_HOMES = Object.freeze([
  'docs/states.md',
  'docs/transitions.md',
  'docs/states-transitions.md',
  'docs/lifecycle.md',
]);

export const STATES_TRANSITIONS_ASK_MISSING =
  'A domain doc is in play, but there is no states → transitions map yet.';

export const STATES_TRANSITIONS_ASK_INCOMPLETE =
  'The states heading is there, but it is not a map yet — no table or link.';

export const STATES_TRANSITIONS_NEXT =
  'Add a short table (entity · states · allowed from → to) — or one link — on the domain doc. Names from the code. No flag soup.';

function readMarkdown(abs) {
  try {
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
    const text = fs.readFileSync(abs, 'utf8');
    return text.trim().length > 0 ? text : '';
  } catch {
    return null;
  }
}

function cellIsStateVocab(cell) {
  return (
    cell === 'state' ||
    cell === 'states' ||
    cell.startsWith('state ') ||
    cell.endsWith(' state') ||
    cell.endsWith(' states')
  );
}

function cellIsTransitionVocab(cell) {
  return (
    cell.includes('transition') ||
    cell === 'from' ||
    cell === 'to' ||
    cell === 'from → to' ||
    cell === 'from -> to'
  );
}

function cellIsEntityVocab(cell) {
  return cell === 'entity' || cell === 'entities';
}

/** Closed table: entity | states | allowed transitions (or from → to). */
export function markdownHasStatesTable(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .split('|')
      .map((cell) => cell.trim().toLowerCase())
      .filter((cell) => cell.length > 0 && !/^[-:]+$/.test(cell));
    if (cells.length < 2) continue;
    const hasEntity = cells.some((cell) => cellIsEntityVocab(cell));
    const hasState = cells.some((cell) => cellIsStateVocab(cell));
    const hasTransition = cells.some((cell) => cellIsTransitionVocab(cell));
    if ((hasState && hasTransition) || (hasEntity && (hasState || hasTransition))) return true;
  }
  return false;
}

function mentionsStatesTopic(value) {
  return (
    value.includes('transition') ||
    value.includes('lifecycle') ||
    value.includes('states/transitions') ||
    value.includes('states-transitions') ||
    value.includes('state machine')
  );
}

/** One link to the captain’s existing authority. */
export function markdownHasStatesLink(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  let from = 0;
  while (from < text.length) {
    const open = text.indexOf('[', from);
    if (open < 0) break;
    const mid = text.indexOf('](', open + 1);
    if (mid < 0) break;
    const close = text.indexOf(')', mid + 2);
    if (close < 0) break;
    const label = text.slice(open + 1, mid).toLowerCase();
    const href = text.slice(mid + 2, close).toLowerCase();
    if (mentionsStatesTopic(label) || mentionsStatesTopic(href)) return true;
    from = close + 1;
  }
  return false;
}

export function markdownHasStatesHeading(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#')) continue;
    const title = trimmed.replace(/^#+\s*/, '').toLowerCase();
    if (
      title === 'state' ||
      title === 'states' ||
      title === 'transition' ||
      title === 'transitions' ||
      title === 'lifecycle' ||
      title.includes('states/transitions') ||
      title.includes('states and transitions')
    ) {
      return true;
    }
  }
  return false;
}

function scoreMarkdown(text) {
  if (text == null) return 'absent';
  if (text === '') return 'incomplete';
  if (markdownHasStatesTable(text) || markdownHasStatesLink(text)) return 'present';
  if (markdownHasStatesHeading(text)) return 'incomplete';
  return 'missing';
}

function existingHomes(root, relatives) {
  const found = [];
  for (const rel of relatives) {
    const text = readMarkdown(path.join(root, rel));
    if (text == null) continue;
    found.push({ rel, score: scoreMarkdown(text) });
  }
  return found;
}

/**
 * First conventional home already on disk (domain doc or dedicated file).
 * Empty / missing files do not count as a home.
 *
 * @param {string} root
 * @returns {string | null}
 */
export function findStatesTransitionsHome(root) {
  if (typeof root !== 'string' || root.length === 0) return null;
  const homes = [
    ...existingHomes(root, STATES_TRANSITIONS_DOMAIN_HOMES),
    ...existingHomes(root, STATES_TRANSITIONS_DEDICATED_HOMES),
  ];
  return homes[0]?.rel ?? null;
}

function nextActionFor(home) {
  if (!home) return STATES_TRANSITIONS_NEXT;
  return `Add a short table (entity · states · allowed from → to) — or one link — to ${home}. Names from the code. No flag soup.`;
}

/**
 * Soft residual when a domain (or dedicated states) doc is in play and the
 * map is missing or only a heading. Off / no such doc → null (silent).
 *
 * @param {{ root?: string }} [input]
 * @returns {{ kind: 'missing' | 'incomplete', home: string, ask: string, nextAction: string } | null}
 */
export function collectStatesTransitionsResidual(input = {}) {
  const root = input.root ?? '';
  if (typeof root !== 'string' || root.length === 0) return null;
  const homes = [
    ...existingHomes(root, STATES_TRANSITIONS_DOMAIN_HOMES),
    ...existingHomes(root, STATES_TRANSITIONS_DEDICATED_HOMES),
  ];
  if (homes.length === 0) return null;
  if (homes.some((row) => row.score === 'present')) return null;
  const incomplete = homes.find((row) => row.score === 'incomplete');
  const home = (incomplete ?? homes[0]).rel;
  if (incomplete) {
    return {
      kind: 'incomplete',
      home,
      ask: STATES_TRANSITIONS_ASK_INCOMPLETE,
      nextAction: nextActionFor(home),
    };
  }
  return {
    kind: 'missing',
    home,
    ask: STATES_TRANSITIONS_ASK_MISSING,
    nextAction: nextActionFor(home),
  };
}
