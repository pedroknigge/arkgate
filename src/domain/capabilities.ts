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
  // Subpath matching via O(1) lookups on the package root (and, for scoped or
  // node:-style entries, the first two segments) — never a linear entry walk,
  // never substring matching.
  const first = specifier.indexOf('/');
  if (first < 0) return null;
  const root = specifier.slice(0, first);
  const rootHit = IMPORT_CAPABILITY_MODULES[root];
  if (rootHit) return rootHit;
  const second = specifier.indexOf('/', first + 1);
  if (second < 0) return null;
  return IMPORT_CAPABILITY_MODULES[specifier.slice(0, second)] ?? null;
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

/** The layer-policy slice this module reads (structural subset of ArkConfigLayer). */
export type CapabilityLayerPolicy = {
  capabilities?: { deny?: readonly string[] };
  pure?: boolean;
  forbiddenGlobals?: readonly string[];
};

/**
 * Effective capability deny set for a layer (ADR 0009 D2): `pure: true` denies
 * all seven; otherwise the declared deny list (deduped, sorted, unknown ids
 * dropped — the schema rejects them before this runs).
 */
export function effectiveCapabilityDeny(layer: CapabilityLayerPolicy | null | undefined): CapabilityId[] {
  if (layer?.pure === true) return [...CAPABILITY_IDS].sort();
  const declared = layer?.capabilities?.deny ?? [];
  const known = declared.filter((id): id is CapabilityId =>
    (CAPABILITY_IDS as readonly string[]).includes(id)
  );
  return [...new Set(known)].sort();
}

/**
 * D7 dedup helper: an ambient use whose matched path is already covered by the
 * layer's forbiddenGlobals must report only FORBIDDEN_GLOBAL — the surface the
 * user declared wins; one violation, one voice.
 */
export function ambientCoveredByForbiddenGlobals(
  symbol: string,
  forbiddenGlobals: readonly string[]
): boolean {
  if (forbiddenGlobals.length === 0) return false;
  const entries = new Set(forbiddenGlobals);
  const segments = symbol.split('.');
  for (let length = segments.length; length >= 1; length -= 1) {
    if (entries.has(segments.slice(0, length).join('.'))) return true;
  }
  return false;
}

/**
 * D6: a layer's protection expressed as COVERAGE ATOMS — the finest-grained
 * units either surface can protect. `ambient:<entry>` atoms are the known
 * ambient map entries a forbiddenGlobals prefix or a wall covers; `import:<id>`
 * atoms are a wall's module-import enforcement (forbiddenGlobals never cover
 * imports). Policy-delta classifies on atoms, never on keys or bare capability
 * ids: losing ANY atom is a real loss (fetch → XMLHttpRequest, Date → Date.now,
 * wall → forbiddenGlobals all weaken), while an equivalent-or-stronger
 * migration never needs an acknowledgment. Unlowerable custom globals stay in
 * `rawGlobals` for the key-by-key comparison.
 */
export function loweredLayerCoverage(layer: CapabilityLayerPolicy | null | undefined): {
  atoms: string[];
  rawGlobals: string[];
} {
  const atoms = new Set<string>();
  const rawGlobals = new Set<string>();
  const ambientEntries = Object.keys(AMBIENT_CAPABILITY_MAP);
  for (const entry of layer?.forbiddenGlobals ?? []) {
    // The shipped matcher is prefix-based: fg `Date` also flags `Date.now`,
    // fg `process` also flags `process.env` — expand to every covered entry.
    const covered = ambientEntries.filter(
      (candidate) => candidate === entry || candidate.startsWith(`${entry}.`)
    );
    if (covered.length === 0) rawGlobals.add(entry);
    else for (const candidate of covered) atoms.add(`ambient:${candidate}`);
  }
  for (const capability of effectiveCapabilityDeny(layer)) {
    atoms.add(`import:${capability}`);
    // A wall's ambient dimension uses longest-match classification, so it
    // covers exactly the entries that CLASSIFY as this capability (bare
    // `process` does not cover `process.env` — that is `environment`).
    for (const entry of ambientEntries) {
      if (capabilityForAmbientName(entry) === capability) atoms.add(`ambient:${entry}`);
    }
  }
  return { atoms: [...atoms].sort(), rawGlobals: [...rawGlobals].sort() };
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
