/**
 * Architecture starter presets for ark-check init/coverage suggestions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyFrameworkLayoutOverlays,
  cloneArchetypeForLayer,
  createElevenLayerConfig,
  DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
  discoverRepoUnits,
  DEFAULT_INTENT_PREFIXES,
  monorepoRoleSourceGlobs,
  resolveIncludeRoots,
  sealMonorepoRoleRoots,
  sharedLibraryLayer,
} from '../ark-shared.mjs';
import { withArkConfigMetadata } from './config-contract.mjs';

const PRESETS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ARKRULES_TEMPLATES_DIR = path.join(PRESETS_DIR, '../../templates/arkrules');

function denyUpward(names) {
  const rules = [];
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      rules.push({ from: names[j], to: names[i], allowed: false });
    }
  }
  return rules;
}

/**
 * peerIsolation matrix: deny only when importer/importee sit under different slices.
 * Covers same-layer and cross-layer pairs (honest DDD / vertical-slice isolation).
 */
function peerIsolationEdges(layerNames, sliceFolders, message) {
  const rules = [];
  for (const from of layerNames) {
    for (const to of layerNames) {
      rules.push({
        from,
        to,
        allowed: false,
        peerIsolation: true,
        sliceFolders,
        ...(message ? { message } : {}),
      });
    }
  }
  return rules;
}

// `**` covers flat and modular layouts. Layers stay optional so a greenfield strict check stays green.
// Exclude only src/kernel/** — `**/kernel/**` would drop legitimate src/shared/kernel/** paths.
const FRAMEWORK_INTERNAL_EXCLUDE = ['src/kernel/**', '**/src/kernel/**'];

/** Interior domain globs. They outrank broad src/lib bags. src/kernel exclude still applies. */
export const DOMAIN_PATH_PATTERNS = Object.freeze([
  '**/domain/**',
  '**/entities/**',
  '**/kernel/domain/**',
  'src/**/domain/**',
  'src/**/entities/**',
  'src/domain/**',
  'src/entities/**',
]);

/**
 * Next / App Router API shells — Application orchestration, not Presentation UI.
 * High-spec patterns win over broad app Presentation globs (P0-A / DL-P0A-RETROFIT).
 */
export const NEXT_API_APPLICATION_PATTERNS = Object.freeze([
  '**/app/api/**',
  '**/pages/api/**',
  '**/app/**/api/**',
  '**/pages/**/api/**',
  'app/api/**',
  'pages/api/**',
  'src/app/api/**',
  'src/pages/api/**',
  'src/app/**/api/**',
  'app/**/api/**',
  // Explicit route handlers under api/ — beat Presentation src/**/route.ts when present.
  'src/app/api/**/route.ts',
  'src/app/api/**/route.tsx',
  'src/app/api/**/route.js',
  'app/api/**/route.ts',
  'app/api/**/route.tsx',
  '**/app/api/**/route.ts',
  '**/app/api/**/route.tsx',
  '**/pages/api/**/*.ts',
  '**/pages/api/**/*.js',
]);

/**
 * Data-client / repository / auth-client bags. Higher path-anchored specificity than
 * bare `lib/**` or `src/lib/**` Application vacuum (NEW-APP-VACUUM-LIB, NEW-ADOPT-LIB-AS-PRESENTATION).
 */
export const PERSISTENCE_PATH_PATTERNS = Object.freeze([
  '**/repositories/**',
  '**/repository/**',
  '**/persistence/**',
  '**/infrastructure/**',
  '**/infra/**',
  '**/db/**',
  '**/data/**',
  '**/supabase/**',
  '**/airtable/**',
  '**/prisma/**',
  '**/turso/**',
  '**/drizzle/**',
  '**/kysely/**',
  '**/mongoose/**',
  '**/mongodb/**',
  '**/firebase/**',
  '**/firestore/**',
  '**/planetscale/**',
  '**/neon/**',
  '**/lib/db/**',
  '**/lib/prisma/**',
  '**/lib/supabase/**',
  '**/lib/airtable/**',
  '**/lib/turso/**',
  '**/lib/drizzle/**',
  '**/lib/firebase/**',
  '**/lib/firestore/**',
  '**/lib/mongodb/**',
  '**/lib/mongoose/**',
  '**/lib/kysely/**',
  '**/lib/auth/**',
  'src/db/**',
  'src/data/**',
  'src/repositories/**',
  'src/persistence/**',
  'src/infrastructure/**',
  'src/lib/db/**',
  'src/lib/prisma/**',
  'src/lib/supabase/**',
  'src/lib/airtable/**',
  'src/lib/turso/**',
  'src/lib/drizzle/**',
  'src/lib/firebase/**',
  'src/lib/firestore/**',
  'src/lib/mongodb/**',
  'src/lib/mongoose/**',
  'src/lib/kysely/**',
  'src/lib/auth/**',
  'src/server/db/**',
  'lib/db/**',
  'lib/prisma/**',
  'lib/supabase/**',
  'lib/airtable/**',
  'lib/turso/**',
  'lib/auth/**',
  // Single-file clients at lib root (SPA / Vercel serverless companions)
  'lib/turso.js',
  'lib/turso.ts',
  'lib/prisma.js',
  'lib/prisma.ts',
  'lib/supabase.js',
  'lib/supabase.ts',
  'lib/airtable.js',
  'lib/airtable.ts',
  'lib/auth.js',
  'lib/auth.ts',
  'lib/db.js',
  'lib/db.ts',
]);

/**
 * Application orchestration under lib without the whole-src-lib vacuum.
 * Never use lone `src/**` or bare `src/lib/**` as Application on Next/event trees.
 */
/** Types and constants — SharedKernel, not Application vacuum. */
export const SHARED_KERNEL_PATH_PATTERNS = Object.freeze([
  'src/shared/**',
  'src/types/**',
  'src/**/types.ts',
  'src/**/constants.ts',
  'src/**/types/**',
  'src/**/constants/**',
  '**/shared/kernel/**',
  'src/shared/kernel/**',
]);

/** Wiring / DI / bootstrap — CompositionRoot, not Domain. */
export const COMPOSITION_ROOT_PATH_PATTERNS = Object.freeze([
  'src/**/composition/**',
  'src/**/factories/**',
  'src/**/container.ts',
  'src/**/bootstrap.ts',
  '**/composition/**',
  '**/factories/**',
]);

export const APPLICATION_LIB_ORCHESTRATION_PATTERNS = Object.freeze([
  'src/lib/actions/**',
  'src/lib/services/**',
  'src/lib/server/**',
  'src/lib/use-cases/**',
  'src/lib/usecases/**',
  'src/lib/api-handlers/**',
  'src/lib/handlers/**',
  '**/lib/actions/**',
  '**/lib/services/**',
  '**/lib/server/**',
  '**/lib/api-handlers/**',
]);

/** Sensor roles used when selecting or synthesizing per-layer templates. */
export const ARKRULES_SENSOR_ROLES = Object.freeze({
  DOMAIN_STRUCTURE: 'domain-structure',
  ORCHESTRATION: 'orchestration',
  ADAPTER_THIN: 'adapter-thin',
  GENERIC: 'generic',
});

/**
 * Exact-name aliases → sensor role. Prefer this table over heuristics when the
 * project uses a known vocabulary (hexagonal, monorepo field renames, etc.).
 */
const LAYER_SENSOR_ROLE_ALIASES = Object.freeze({
  // Domain / pure model
  DomainModel: ARKRULES_SENSOR_ROLES.DOMAIN_STRUCTURE,
  Domain: ARKRULES_SENSOR_ROLES.DOMAIN_STRUCTURE,
  Entities: ARKRULES_SENSOR_ROLES.DOMAIN_STRUCTURE,
  // Application / use cases
  ApplicationOrchestration: ARKRULES_SENSOR_ROLES.ORCHESTRATION,
  Application: ARKRULES_SENSOR_ROLES.ORCHESTRATION,
  UseCases: ARKRULES_SENSOR_ROLES.ORCHESTRATION,
  // Presentation / UI adapters
  PresentationAdapters: ARKRULES_SENSOR_ROLES.ADAPTER_THIN,
  Presentation: ARKRULES_SENSOR_ROLES.ADAPTER_THIN,
  UI: ARKRULES_SENSOR_ROLES.ADAPTER_THIN,
  WebPresentation: ARKRULES_SENSOR_ROLES.ADAPTER_THIN,
  ApiComposition: ARKRULES_SENSOR_ROLES.ADAPTER_THIN,
  // Persistence / infrastructure adapters
  PersistenceAdapters: ARKRULES_SENSOR_ROLES.ADAPTER_THIN,
  Infrastructure: ARKRULES_SENSOR_ROLES.ADAPTER_THIN,
  Persistence: ARKRULES_SENSOR_ROLES.ADAPTER_THIN,
  Data: ARKRULES_SENSOR_ROLES.ADAPTER_THIN,
});

/**
 * Resolve a stable sensor role for a project layer name.
 * Exact alias first, then specific adapter/domain cues, then broad application
 * heuristics (so ApplicationAdapters → thin-adapter, not orchestration).
 */
export function resolveLayerSensorRole(layerName) {
  if (typeof layerName !== 'string' || layerName.length === 0) {
    return ARKRULES_SENSOR_ROLES.GENERIC;
  }
  if (LAYER_SENSOR_ROLE_ALIASES[layerName]) return LAYER_SENSOR_ROLE_ALIASES[layerName];
  const n = layerName.toLowerCase();
  if (/(^|[^a-z])(domain|entit)/.test(n) || n.includes('domainmodel')) {
    return ARKRULES_SENSOR_ROLES.DOMAIN_STRUCTURE;
  }
  // Adapter / I/O cues before broad "application" — ApplicationAdapters must not
  // inherit orchestration-only sensors.
  if (
    n.includes('present') ||
    n.includes('persist') ||
    n.includes('infra') ||
    n.includes('adapter') ||
    n.includes('repository') ||
    /(^|[^a-z])(ui|web|data)([^a-z]|$)/.test(n)
  ) {
    return ARKRULES_SENSOR_ROLES.ADAPTER_THIN;
  }
  if (
    n.includes('application') ||
    n.includes('orchestr') ||
    n.includes('usecase') ||
    n.includes('use-case') ||
    n.includes('use_case')
  ) {
    return ARKRULES_SENSOR_ROLES.ORCHESTRATION;
  }
  return ARKRULES_SENSOR_ROLES.GENERIC;
}

/**
 * Pick the shipped archetype filename for a layer (role + presentation vs persistence cue).
 * Returns null for generic molds.
 */
export function archetypeTemplateFileForLayer(layerName, role = resolveLayerSensorRole(layerName)) {
  if (role === ARKRULES_SENSOR_ROLES.DOMAIN_STRUCTURE) return 'DomainModel.json';
  if (role === ARKRULES_SENSOR_ROLES.ORCHESTRATION) return 'ApplicationOrchestration.json';
  if (role === ARKRULES_SENSOR_ROLES.ADAPTER_THIN) {
    const n = String(layerName).toLowerCase();
    if (
      n.includes('present') ||
      n.includes('ui') ||
      n.includes('web') ||
      n.includes('page') ||
      n.includes('widget') ||
      n.includes('api')
    ) {
      return 'PresentationAdapters.json';
    }
    return 'PersistenceAdapters.json';
  }
  return null;
}

/**
 * Layer names used as single path segments under arkrules/ must not escape the dir
 * (reject `/`, `\`, `..`, absolute, empty). Mirrors managed-upgrade isSafeRelativePath.
 */
export function isSafeArkRulesLayerName(layerName) {
  if (typeof layerName !== 'string' || layerName.length === 0) return false;
  if (layerName.includes('\0') || layerName.includes('/') || layerName.includes('\\')) return false;
  if (layerName === '.' || layerName === '..' || layerName.includes('..')) return false;
  // Single path segment: letters/digits/underscore/hyphen; optional leading letter preferred
  // but allow common PascalCase layer vocabularies.
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(layerName)) return false;
  return true;
}

/** Relative path for a layer's arkrules file (always arkrules/<exactLayerName>.json). */
export function arkRulesPathForLayer(layerName) {
  if (!isSafeArkRulesLayerName(layerName)) {
    throw new Error(
      `unsafe arkRules layer name ${JSON.stringify(layerName)}: must be a single path segment (A-Za-z0-9_-) under arkrules/`
    );
  }
  return `arkrules/${layerName}.json`;
}

/** True when rel is a safe project-relative arkrules/*.json path (no escape). */
export function isSafeArkRulesRelativePath(rel) {
  if (typeof rel !== 'string' || rel.length === 0) return false;
  if (rel.includes('\0') || rel.includes('\\') || path.isAbsolute(rel)) return false;
  const normalized = path.posix.normalize(rel);
  if (normalized !== rel || normalized === '.' || normalized.startsWith('../')) return false;
  if (!normalized.startsWith('arkrules/') || !normalized.endsWith('.json')) return false;
  // Exactly one segment under arkrules/ (no nested dirs).
  const rest = normalized.slice('arkrules/'.length);
  if (!rest || rest.includes('/') || rest === '..' || rest.includes('..')) return false;
  return true;
}

/**
 * Build starter ArkRules JSON for a project layer: archetype clone with rewritten
 * `layer` field, or an empty generic mold the agent can refine.
 */
export function buildArkRulesTemplateForLayer(layerName, role = resolveLayerSensorRole(layerName)) {
  const archetype = archetypeTemplateFileForLayer(layerName, role);
  if (archetype) {
    const sourcePath = path.join(ARKRULES_TEMPLATES_DIR, archetype);
    if (fs.existsSync(sourcePath)) {
      try {
        // Unique ids across arkrules/*.json so `--promote <id> --apply` works on the starter.
        return cloneArchetypeForLayer(JSON.parse(fs.readFileSync(sourcePath, 'utf8')), layerName);
      } catch {
        // Fall through to generic mold.
      }
    }
  }
  // Generic mold: valid empty contract keyed to the exact project layer name.
  // Structure is empty so agents refine without inheriting the wrong sensors.
  return {
    $schema: 'https://unpkg.com/arkgate/schemas/ark.arkrules.schema.json',
    schemaVersion: '1.0',
    layer: layerName,
    structure: [],
    invariants: [],
  };
}

/**
 * Attach arkRules map for every declared layer. Keys = exact layer names.
 * Existing map entries are preserved (never overwritten).
 */
export function withDefaultArkRules(config) {
  const layers = config.layers ?? [];
  if (layers.length === 0) return config;
  const arkRules = { ...(config.arkRules ?? {}) };
  let changed = false;
  for (const layer of layers) {
    const name = layer?.name;
    if (typeof name !== 'string' || name.length === 0) continue;
    if (arkRules[name]) continue;
    if (!isSafeArkRulesLayerName(name)) continue;
    arkRules[name] = arkRulesPathForLayer(name);
    changed = true;
  }
  if (!changed) return config;
  return { ...config, arkRules };
}

/** Write arkrules/*.json per arkRules entry (AR08). Skips existing files unless force. Rejects escaping paths. */
export function writeArkRulesTemplates(root, config, { force = false } = {}) {
  const refs = config?.arkRules;
  if (!refs || typeof refs !== 'object') return [];
  const written = [];
  const resolvedRoot = path.resolve(root);
  for (const [layerName, rel] of Object.entries(refs)) {
    if (typeof rel !== 'string' || !rel.endsWith('.json')) continue;
    if (!isSafeArkRulesRelativePath(rel)) {
      throw new Error(
        `refusing arkRules write for unsafe path ${JSON.stringify(rel)} (layer ${JSON.stringify(layerName)})`
      );
    }
    const target = path.resolve(resolvedRoot, rel);
    const relToRoot = path.relative(resolvedRoot, target);
    if (!relToRoot || relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
      throw new Error(`arkRules path escapes project root: ${rel}`);
    }
    const underArkRules = path.relative(path.join(resolvedRoot, 'arkrules'), target);
    if (!underArkRules || underArkRules.startsWith('..') || path.isAbsolute(underArkRules)) {
      throw new Error(`arkRules path escapes arkrules/: ${rel}`);
    }
    if (fs.existsSync(target) && !force) continue;
    const role = resolveLayerSensorRole(layerName);
    const body = buildArkRulesTemplateForLayer(layerName, role);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(body, null, 2)}\n`);
    written.push(rel);
  }
  return written;
}

/**
 * Deny edges shared by the ports-and-adapters presets after their DomainModel
 * rules: orchestration never reaches adapters, adapters never reach each other,
 * and presentation never reaches the domain directly. Fresh objects per call.
 */
function portsAndAdaptersRules() {
  return [
    { from: 'ApplicationOrchestration', to: 'PersistenceAdapters', allowed: false },
    { from: 'ApplicationOrchestration', to: 'PresentationAdapters', allowed: false },
    { from: 'PresentationAdapters', to: 'PersistenceAdapters', allowed: false },
    { from: 'PresentationAdapters', to: 'DomainModel', allowed: false },
    { from: 'PersistenceAdapters', to: 'ApplicationOrchestration', allowed: false },
    { from: 'PersistenceAdapters', to: 'PresentationAdapters', allowed: false },
  ];
}

/** UI-surface rules. Presentation may reach data clients (soft). Persistence → Presentation stays denied. */
function uiSurfaceRules(presentationToPersistenceMessage) {
  return [
    { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
    { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
    { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
    { from: 'ApplicationOrchestration', to: 'PresentationAdapters', allowed: false },
    {
      from: 'PresentationAdapters',
      to: 'PersistenceAdapters',
      allowed: true,
      message: presentationToPersistenceMessage,
    },
    { from: 'PersistenceAdapters', to: 'PresentationAdapters', allowed: false },
    { from: 'PersistenceAdapters', to: 'ApplicationOrchestration', allowed: false },
  ];
}

function presetWithOverlays(baseConfig, root) {
  const config = root ? applyFrameworkLayoutOverlays(baseConfig, root) : baseConfig;
  return withArkConfigMetadata(withDefaultArkRules(config));
}

export const ARCHITECTURE_PRESETS = {
  // Second arg `root` is optional — when provided (init/start on a real repo), framework
  // filename conventions (Nest/Next/express) are overlaid so starters get real governed%.
  hexagonal: (_workspaces, root) =>
    presetWithOverlays(
      {
        include: ['src'],
        layers: [
          {
            name: 'DomainModel',
            description: 'Pure business rules and entities. No I/O, no framework, no ambient globals.',
            patterns: [...DOMAIN_PATH_PATTERNS],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            forbiddenGlobals: DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
            optional: true,
          },
          {
            name: 'ApplicationOrchestration',
            description: 'Use cases that coordinate the domain through ports. No I/O of its own.',
            // Never lone src/** — Application is intentional orchestration folders only.
            patterns: [
              'src/**/application/**',
              'src/**/use-cases/**',
              'src/**/usecases/**',
              ...APPLICATION_LIB_ORCHESTRATION_PATTERNS,
              ...NEXT_API_APPLICATION_PATTERNS,
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
          {
            name: 'PresentationAdapters',
            description: 'Entrypoints — HTTP routes, controllers, UI. Drives use cases.',
            patterns: [
              'src/**/presentation/**',
              'src/**/controllers/**',
              'src/**/interface-adapters/**',
              'src/**/http/**',
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
          {
            name: 'PersistenceAdapters',
            description: 'Implements ports with real infrastructure: DB, external APIs, filesystem.',
            patterns: [
              'src/**/infrastructure/**',
              'src/**/adapters/**',
              ...PERSISTENCE_PATH_PATTERNS,
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
        ],
        rules: [
          { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
          { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
          { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
          ...portsAndAdaptersRules(),
        ],
      },
      root
    ),
  layered: (_workspaces, root) =>
    presetWithOverlays(
      {
        include: ['src'],
        layers: [
          {
            name: 'PresentationAdapters',
            description: 'UI and API entrypoints.',
            patterns: [
              'src/**/presentation/**',
              'src/**/controllers/**',
              'src/**/ui/**',
              'src/**/http/**',
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
          {
            name: 'ApplicationOrchestration',
            description:
              'Business services and use-case coordination. Residual `src/**` is Application on non-Next layered trees only (specific domain/ui/db patterns win by specificity).',
            patterns: [
              'src/**/application/**',
              'src/**/services/**',
              'src/**/use-cases/**',
              ...APPLICATION_LIB_ORCHESTRATION_PATTERNS,
              ...NEXT_API_APPLICATION_PATTERNS,
              // Residual src/**. Specific patterns win. Next overlay must not put a lone src/** on App Router trees.
              'src/**',
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
          {
            name: 'DomainModel',
            description: 'Pure business rules and entities. No I/O, no framework, no ambient globals.',
            patterns: [...DOMAIN_PATH_PATTERNS],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            forbiddenGlobals: DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
            optional: true,
          },
          {
            name: 'PersistenceAdapters',
            description: 'Data access and infrastructure.',
            patterns: [...PERSISTENCE_PATH_PATTERNS],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
        ],
        rules: denyUpward([
          'PresentationAdapters',
          'ApplicationOrchestration',
          'DomainModel',
          'PersistenceAdapters',
        ]),
      },
      root
    ),
  'feature-sliced': (_workspaces, root) => {
    const order = ['App', 'Pages', 'Widgets', 'Features', 'Entities', 'Shared'];
    const purpose = {
      App: 'App-wide setup, providers, and routing (FSD app/ + Next app router when co-located under src/app).',
      Pages: 'Route-level compositions (FSD pages/ and Next pages router).',
      Widgets: 'Self-contained UI blocks composed from features and entities.',
      Features: 'User-facing feature units.',
      Entities: 'Business entities with their UI and logic.',
      Shared: 'Reusable primitives with no business knowledge.',
    };
    // Canonical FSD under src/<layer>/**; also root <layer>/** for packages that hoist segments.
    const fsdPatterns = (dir) => [`src/${dir}/**`, `${dir}/**`];
    return presetWithOverlays(
      {
        include: ['src', 'app', 'pages'],
        layers: order.map((name) => ({
          name,
          description: purpose[name],
          patterns: fsdPatterns(name.toLowerCase()),
          optional: true,
        })),
        rules: denyUpward(order),
      },
      root
    );
  },
  // Directory-name globs (`**/domain/**`) cover every workspace package. include is the detected roots.
  monorepo: (includeDirs, root) => {
    let include =
      includeDirs && includeDirs.length > 0 ? [...includeDirs] : [];
    let units = [];
    if (root) {
      const resolved = resolveIncludeRoots(root);
      if (resolved.length > 0) include = resolved;
      units = discoverRepoUnits(root);
      const nonProductRoots = new Set(
        units
          .filter((unit) => ['docs', 'example', 'test'].includes(unit.role))
          .map((unit) => unit.root)
      );
      include = include.filter((entry) => !nonProductRoots.has(entry));
    }
    // Turborepo: apps/ + packages/; Nx enterprise: apps/ + libs/ (+ packages/).
    if (include.length === 0) include = ['packages', 'apps', 'libs'];
    // Per-package library layer (#366). Globs stay under packages/ or libs/.
    const libraryGlobs = (layer) =>
      monorepoRoleSourceGlobs(
        units.filter((unit) => sharedLibraryLayer(unit) === layer),
        ['library'],
        { root, domainScoped: true }
      );
    const domainLibraryGlobs = libraryGlobs('DomainModel');
    const applicationLibraryGlobs = libraryGlobs('ApplicationOrchestration');
    const presentationLibraryGlobs = libraryGlobs('PresentationAdapters');
    const persistenceLibraryGlobs = libraryGlobs('PersistenceAdapters');
    const applicationSourcePatterns = monorepoRoleSourceGlobs(units, ['application', 'cli'], {
      root,
      uiMode: 'not-ui',
    });
    const uiApplicationSourcePatterns = monorepoRoleSourceGlobs(units, ['application', 'cli'], {
      root,
      uiMode: 'ui',
    });
    const sealed = presetWithOverlays(
      {
        include,
        layers: [
          {
            name: 'DomainModel',
            description:
              'Pure business rules and entities, in any package. No I/O, no framework, no ambient globals.',
            // Domain by intentional folders only — NOT bare **/types.ts (that mis-classifies
            // application bags like frontend/src/core/**/types.ts as Domain and creates false edges).
            patterns: [
              ...DOMAIN_PATH_PATTERNS,
              '**/cinematic/types.ts',
              ...domainLibraryGlobs,
            ],
            forbiddenGlobals: DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
            optional: true,
          },
          {
            name: 'ApplicationOrchestration',
            description: 'Use cases and services that coordinate the domain through ports.',
            patterns: [
              '**/application/**',
              '**/use-cases/**',
              '**/services/**',
              // Next API route handlers (higher specificity than **/app/** Presentation).
              // Route groups: app/(marketing)/api/** also match **/app/**/api/**
              ...NEXT_API_APPLICATION_PATTERNS,
              ...APPLICATION_LIB_ORCHESTRATION_PATTERNS,
              ...applicationSourcePatterns,
              ...applicationLibraryGlobs,
            ],
            optional: true,
          },
          {
            name: 'PresentationAdapters',
            description:
              'Entrypoints — UI, pages, controllers when present. Never bare lib/** (data clients are Persistence).',
            patterns: [
              '**/app/**',
              '**/pages/**',
              '**/components/**',
              '**/controllers/**',
              '**/http/**',
              '**/routes/**',
              '**/hooks/**',
              ...uiApplicationSourcePatterns,
              ...presentationLibraryGlobs,
              // No bare **/lib/** — NEW-ADOPT-LIB-AS-PRESENTATION / NEW-APP-VACUUM-LIB.
            ],
            optional: true,
          },
          {
            name: 'PersistenceAdapters',
            description: 'Implements ports with real infrastructure: DB, external APIs, filesystem.',
            patterns: [
              '**/adapters/**',
              ...PERSISTENCE_PATH_PATTERNS,
              ...persistenceLibraryGlobs,
            ],
            optional: true,
          },
        ],
        rules: [
          { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
          { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
          { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
          ...portsAndAdaptersRules(),
        ],
      },
      root
    );
    sealMonorepoRoleRoots(sealed.layers, {
      DomainModel: domainLibraryGlobs,
      ApplicationOrchestration: [...applicationSourcePatterns, ...applicationLibraryGlobs],
      PresentationAdapters: [...uiApplicationSourcePatterns, ...presentationLibraryGlobs],
      PersistenceAdapters: persistenceLibraryGlobs,
    });
    return sealed;
  },

  /**
   * UI / Vite / Remotion-style surface: presentation-heavy trees with hooks, lib, routes,
   * components. Use when the TS surface is mostly UI (no deep domain folders yet).
   */
  'ui-surface': (_workspaces, root) =>
    presetWithOverlays(
      {
        include: (() => {
          if (!root) return ['src'];
          try {
            const roots = resolveIncludeRoots(root);
            return roots.length > 0 ? roots : ['src'];
          } catch {
            return ['src'];
          }
        })(),
        layers: [
          {
            name: 'DomainModel',
            description: 'Shared types and pure view-models (optional on UI-first trees).',
            // Avoid bare **/types.ts — see monorepo DomainModel note (false Domain on core/**/types.ts).
            patterns: [
              ...DOMAIN_PATH_PATTERNS,
              '**/cinematic/types.ts',
              // Common pure types bag (not **/types.ts — that traps core/**/types.ts).
              'src/lib/types.ts',
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            forbiddenGlobals: DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
            optional: true,
          },
          {
            name: 'ApplicationOrchestration',
            description:
              'Server actions, features, and non-UI lib orchestration (when present).',
            patterns: [
              'src/features/**',
              'src/server/**',
              'src/services/**',
              'src/use-cases/**',
              'src/actions/**',
              // Specific lib orchestration only — never bare src/lib/** (NEW-APP-VACUUM-LIB).
              ...APPLICATION_LIB_ORCHESTRATION_PATTERNS,
              // Next API = Application shell (wins over **/app/** Presentation by specificity).
              ...NEXT_API_APPLICATION_PATTERNS,
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
          {
            name: 'PersistenceAdapters',
            description: 'Client data access and external API adapters (when present).',
            // Prefer specific data-client bags over a presentation catch-all on **/lib/**
            patterns: [
              '**/adapters/**',
              ...PERSISTENCE_PATH_PATTERNS,
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
          {
            name: 'PresentationAdapters',
            description: 'UI, routes, hooks, components (not a whole-src bag).',
            // No **/src/** or bare **/lib/** — those swallowed data clients and forced false ENFORCE.
            patterns: [
              '**/components/**',
              '**/hooks/**',
              '**/routes/**',
              '**/app/**',
              '**/pages/**',
              'src/app/**',
              'src/pages/**',
              'src/components/**',
              'src/hooks/**',
              'src/ui/**',
              'src/layouts/**',
              'app/**',
              'pages/**',
              'components/**',
              // Next middleware edge entry (classic + Next 16 proxy rename)
              'src/middleware.ts',
              'src/middleware.js',
              'middleware.ts',
              'middleware.js',
              'src/proxy.ts',
              'src/proxy.js',
              'proxy.ts',
              'proxy.js',
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
        ],
        // Day-one UI may reach data clients. Persistence → Presentation stays denied.
        rules: uiSurfaceRules(
          'UI/routes may reach data clients on day one (RSC); prefer application ports as the product grows.'
        ),
      },
      root
    ),

  /** Feature folders own UI+logic+api. peerIsolation blocks cross-feature imports. */
  'vertical-slice': (_workspaces, root) =>
    presetWithOverlays(
      {
        include: ['src'],
        layers: [
          {
            name: 'Features',
            description:
              'Feature / use-case slices (co-located API, UI, hooks, types). No import across sibling slices.',
            patterns: ['src/features/**', 'src/modules/**'],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
          {
            name: 'Shared',
            description: 'Reusable UI primitives, utils, and types with no feature knowledge.',
            patterns: ['src/shared/**'],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
          {
            name: 'Lib',
            description: 'Infrastructure clients (db, HTTP, env) shared across features.',
            patterns: ['src/lib/**', 'src/infra/**', 'src/infrastructure/**'],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
          {
            name: 'App',
            description: 'App shell, routing, providers, composition root.',
            patterns: ['src/app/**', 'app/**', 'src/pages/**', 'pages/**'],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
        ],
        rules: [
          {
            from: 'Features',
            to: 'Features',
            allowed: false,
            peerIsolation: true,
            sliceFolders: ['features', 'modules'],
            message:
              'Features must not import other feature slices. Extract shared code to Shared/Lib or coordinate via events.',
          },
          // Features must not pull in the composition root (re-coupling via App).
          { from: 'Features', to: 'App', allowed: false },
          { from: 'Shared', to: 'Features', allowed: false },
          { from: 'Shared', to: 'App', allowed: false },
          { from: 'Lib', to: 'Features', allowed: false },
          { from: 'Lib', to: 'Shared', allowed: false },
          { from: 'Lib', to: 'App', allowed: false },
          // App may compose Features + Shared + Lib (no deny).
          // Features may import Shared + Lib (no deny).
        ],
      },
      root
    ),

  /** Per-context layers plus SharedKernel. peerIsolation blocks cross-context imports; hexagonal denies stay. */
  'ddd-bounded-contexts': (_workspaces, root) => {
    const contextLayers = [
      'DomainModel',
      'ApplicationOrchestration',
      'PresentationAdapters',
      'PersistenceAdapters',
    ];
    const sliceFolders = ['contexts', 'bounded-contexts'];
    return presetWithOverlays(
      {
        include: ['src'],
        layers: [
          {
            name: 'DomainModel',
            description:
              'Per-context pure domain (entities, VOs, domain events). No I/O, no framework.',
            patterns: [
              'src/contexts/**/domain/**',
              'src/bounded-contexts/**/domain/**',
              'src/**/domain/**',
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            forbiddenGlobals: DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
            optional: true,
          },
          {
            name: 'ApplicationOrchestration',
            description: 'Per-context use cases / application services.',
            patterns: [
              'src/contexts/**/application/**',
              'src/bounded-contexts/**/application/**',
              'src/**/application/**',
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
          {
            name: 'PresentationAdapters',
            description: 'Per-context controllers, HTTP, UI adapters.',
            patterns: [
              'src/contexts/**/presentation/**',
              'src/contexts/**/controllers/**',
              'src/bounded-contexts/**/presentation/**',
              'src/**/presentation/**',
              'src/**/controllers/**',
              'src/**/http/**',
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
          {
            name: 'PersistenceAdapters',
            description: 'Per-context infrastructure: repositories, DB, external APIs.',
            patterns: [
              'src/contexts/**/infrastructure/**',
              'src/contexts/**/adapters/**',
              'src/bounded-contexts/**/infrastructure/**',
              'src/**/infrastructure/**',
              'src/**/adapters/**',
              'src/**/persistence/**',
              'src/**/repositories/**',
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
          {
            name: 'SharedKernel',
            description: 'Truly shared kernel types and primitives across contexts.',
            patterns: ['src/shared/kernel/**', 'src/shared/**'],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
        ],
        rules: [
          { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
          { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
          { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
          ...portsAndAdaptersRules(),
          { from: 'SharedKernel', to: 'DomainModel', allowed: false },
          { from: 'SharedKernel', to: 'ApplicationOrchestration', allowed: false },
          { from: 'SharedKernel', to: 'PresentationAdapters', allowed: false },
          { from: 'SharedKernel', to: 'PersistenceAdapters', allowed: false },
          ...peerIsolationEdges(
            contextLayers,
            sliceFolders,
            'Bounded contexts must not import each other. Use shared kernel or integration events.'
          ),
        ],
      },
      root
    );
  },

  /**
   * Vite SPA + root Vercel `api/` / `lib/` (NEW-SPA-DEFAULT-LAYOUT).
   * include covers src + serverless api + shared lib; never hexagonal src-only vacuum.
   */
  'vite-vercel-spa': (_workspaces, root) =>
    presetWithOverlays(
      {
        include: (() => {
          if (!root) return ['src', 'api', 'lib'];
          const dirs = ['src', 'api', 'lib'];
          try {
            return dirs.filter((d) => fs.existsSync(path.join(root, d)));
          } catch {
            return dirs;
          }
        })(),
        layers: [
          {
            name: 'DomainModel',
            description: 'Pure domain folders when present (optional on SPA trees).',
            patterns: [...DOMAIN_PATH_PATTERNS],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            forbiddenGlobals: DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
            optional: true,
          },
          {
            name: 'ApplicationOrchestration',
            description:
              'Vercel/serverless `api/**` handlers and non-UI orchestration (not Presentation).',
            patterns: [
              'api/**',
              '**/api/**',
              'src/api/**',
              'src/server/**',
              'src/services/**',
              'src/actions/**',
              ...APPLICATION_LIB_ORCHESTRATION_PATTERNS,
              ...NEXT_API_APPLICATION_PATTERNS,
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
          {
            name: 'PersistenceAdapters',
            description: 'DB / CRM / auth clients under lib/ and data folders.',
            patterns: [...PERSISTENCE_PATH_PATTERNS, '**/adapters/**'],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
          {
            name: 'PresentationAdapters',
            description:
              'React/Vite UI surface. Not bare lib/** (data clients stay Persistence).',
            patterns: [
              'src/components/**',
              'src/hooks/**',
              'src/pages/**',
              'src/routes/**',
              'src/ui/**',
              'src/layouts/**',
              'src/App.tsx',
              'src/App.jsx',
              'src/App.ts',
              'src/App.js',
              'src/main.tsx',
              'src/main.jsx',
              'src/main.ts',
              'src/main.js',
              'src/index.tsx',
              'src/index.jsx',
              '**/components/**',
              '**/hooks/**',
              '**/pages/**',
              '**/routes/**',
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
        ],
        rules: uiSurfaceRules(
          'SPA day-one UI may reach data clients; prefer ports as the product grows.'
        ),
      },
      root
    ),
};

// Aliases: Clean / Onion map to the hexagonal factory (same matrix + globs). Avoid dual maintenance.
ARCHITECTURE_PRESETS['clean-architecture'] = ARCHITECTURE_PRESETS.hexagonal;
ARCHITECTURE_PRESETS['onion-architecture'] = ARCHITECTURE_PRESETS.hexagonal;

/** Stable public preset keys (CLI help, score fit, docs). Order is display order. */
export const ARCHITECTURE_PRESET_NAMES = Object.keys(ARCHITECTURE_PRESETS);

/** Inject missing Next API → Application patterns (DL-P0A-RETROFIT). Does not write files. */
export function retrofitP0aApiApplicationPatterns(config) {
  const layers = Array.isArray(config?.layers) ? config.layers : [];
  const appLayer =
    layers.find((l) => l?.name === 'ApplicationOrchestration') ||
    layers.find((l) => /application|orchestr/i.test(l?.name ?? ''));
  if (!appLayer) {
    return { changed: false, injected: [], targetLayer: null, config };
  }
  const existing = new Set(appLayer.patterns ?? []);
  const injected = NEXT_API_APPLICATION_PATTERNS.filter((p) => !existing.has(p));
  if (injected.length === 0) {
    return { changed: false, injected: [], targetLayer: appLayer.name, config };
  }
  const nextLayers = layers.map((layer) => {
    if (layer.name !== appLayer.name) return layer;
    return {
      ...layer,
      patterns: [...new Set([...(layer.patterns ?? []), ...injected])],
    };
  });
  return {
    changed: true,
    injected: [...injected],
    targetLayer: appLayer.name,
    config: { ...config, layers: nextLayers },
  };
}

// Suggestions use only DEFAULT_LAYER_DIRECTORIES and named presets. Unknown dirs stay unrecognized.
export const CANONICAL_LAYER_NAMES = new Set(DEFAULT_INTENT_PREFIXES.map((entry) => entry.layer));
