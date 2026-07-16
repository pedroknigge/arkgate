/**
 * Effect-capability vocabulary (ADR 0009 D1/D2 — U03).
 *
 * Seven CLOSED capability ids with declared evidence sources; a fixed mapping
 * from ambient globals and known driver/client modules; and the
 * coverage-faithful lowering used by policy-delta classification (D6). Pure
 * data + string matching only — detection lives in the single symbol-aware
 * scanner (src/kernel/semanticAnalysis.ts) and the pure specifier scan
 * (src/kernel/moduleGraph.ts); this module never becomes a second scanner.
 */

export type CapabilityId =
  | 'network'
  | 'filesystem'
  | 'clock'
  | 'randomness'
  | 'environment'
  | 'process'
  | 'persistence';

/** ADR order — fixed and closed; no user-defined capabilities in the MVP. */
export const CAPABILITY_IDS: readonly CapabilityId[] = Object.freeze([
  'network',
  'filesystem',
  'clock',
  'randomness',
  'environment',
  'process',
  'persistence',
]);

/**
 * Ambient global paths → capability. Longest known prefix wins at lookup, so
 * `process.env.NODE_ENV` classifies as environment while `process.cwd()` is
 * process control. `Date` covers both `Date.now()` and `new Date()`.
 */
const AMBIENT_CAPABILITY_MAP: Readonly<Record<string, CapabilityId>> = Object.freeze({
  fetch: 'network',
  XMLHttpRequest: 'network',
  Date: 'clock',
  'Date.now': 'clock',
  'Math.random': 'randomness',
  'process.env': 'environment',
  process: 'process',
});

/** Entries the symbol-aware collector matches (feed to bestForbiddenMatch-style lookup). */
export const AMBIENT_CAPABILITY_ENTRIES: readonly string[] = Object.freeze(
  Object.keys(AMBIENT_CAPABILITY_MAP).sort()
);

/**
 * Known driver/client modules per import-based capability. Matching is exact
 * specifier or a subpath of a listed package — NEVER substring (ADR corpus:
 * pgn-parser / refetch-hints / fsm-machine must not match).
 */
const IMPORT_CAPABILITY_MODULES: Readonly<Record<string, CapabilityId>> = Object.freeze({
  // filesystem
  fs: 'filesystem',
  'node:fs': 'filesystem',
  'fs/promises': 'filesystem',
  'node:fs/promises': 'filesystem',
  'fs-extra': 'filesystem',
  'graceful-fs': 'filesystem',
  memfs: 'filesystem',
  chokidar: 'filesystem',
  // network (bare and node:-prefixed core spellings both classify)
  http: 'network',
  https: 'network',
  http2: 'network',
  net: 'network',
  tls: 'network',
  dgram: 'network',
  dns: 'network',
  'node:http': 'network',
  'node:https': 'network',
  'node:http2': 'network',
  'node:net': 'network',
  'node:tls': 'network',
  'node:dgram': 'network',
  'node:dns': 'network',
  axios: 'network',
  undici: 'network',
  'node-fetch': 'network',
  got: 'network',
  ky: 'network',
  superagent: 'network',
  ws: 'network',
  // process control via module import (the ambient global's module dual).
  // Known limit (ADR 0009): these map to 'process' only — an environment-read
  // through the imported binding is undercounted until U04 decides the dual;
  // node:crypto is deliberately absent (hashing dominates; randomness FPs).
  process: 'process',
  'node:process': 'process',
  child_process: 'process',
  'node:child_process': 'process',
  // persistence
  '@prisma/client': 'persistence',
  prisma: 'persistence',
  pg: 'persistence',
  mysql: 'persistence',
  mysql2: 'persistence',
  mongodb: 'persistence',
  mongoose: 'persistence',
  sqlite3: 'persistence',
  'better-sqlite3': 'persistence',
  redis: 'persistence',
  ioredis: 'persistence',
  typeorm: 'persistence',
  knex: 'persistence',
  'drizzle-orm': 'persistence',
  sequelize: 'persistence',
  kysely: 'persistence',
  '@supabase/supabase-js': 'persistence',
});

/**
 * Classify a module specifier. Exact entry or subpath of an entry only;
 * relative/absolute specifiers are project code, never a capability module.
 */
export function capabilityForModuleSpecifier(specifier: string): CapabilityId | null {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) return null;
  const direct = IMPORT_CAPABILITY_MODULES[specifier];
  if (direct) return direct;
  for (const [entry, capability] of Object.entries(IMPORT_CAPABILITY_MODULES)) {
    if (specifier.startsWith(`${entry}/`)) return capability;
  }
  return null;
}

/** Classify a matched ambient name (as returned by the symbol-aware collector). */
export function capabilityForAmbientName(name: string): CapabilityId | null {
  const segments = name.split('.');
  for (let length = segments.length; length >= 1; length -= 1) {
    const candidate = segments.slice(0, length).join('.');
    const capability = AMBIENT_CAPABILITY_MAP[candidate];
    if (capability) return capability;
  }
  return null;
}

/**
 * Coverage-faithful lowering of a forbiddenGlobals entry (ADR 0009 D6).
 * A prefix-matched global lowers to EVERY capability its matches cover: the
 * shipped matcher flags `process.env.X` when forbiddenGlobals contains bare
 * `process`, so `process` lowers to both environment and process. Sorted,
 * deterministic; unknown entries lower to nothing.
 */
export function lowerForbiddenGlobal(name: string): CapabilityId[] {
  const capabilities = new Set<CapabilityId>();
  const own = capabilityForAmbientName(name);
  if (own) capabilities.add(own);
  for (const [entry, capability] of Object.entries(AMBIENT_CAPABILITY_MAP)) {
    if (entry === name || entry.startsWith(`${name}.`)) capabilities.add(capability);
  }
  return [...capabilities].sort();
}
