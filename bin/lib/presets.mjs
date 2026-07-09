/**
 * Architecture starter presets for ark-check init/coverage suggestions.
 */
import {
  applyFrameworkLayoutOverlays,
  createElevenLayerConfig,
  DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
  DEFAULT_INTENT_PREFIXES,
  resolveIncludeRoots,
} from '../ark-shared.mjs';

export function denyUpward(names) {
  const rules = [];
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      rules.push({ from: names[j], to: names[i], allowed: false });
    }
  }
  return rules;
}

// Named starter configs. Globs use `**` so they fit both flat (src/domain/**) and
// modular (src/modules/x/domain/**) layouts. Every layer is optional, so the strict
// check passes on a greenfield repo and each layer switches on as its dir gains files.
//
// Framework internals live under conventional names like `kernel/` and are NOT application
// architecture — a broad `src/**/domain/**` would otherwise swallow `src/kernel/domain`
// (DI/runtime wiring) and fire domain-purity rules on it, the false-positive class that
// motivated `exclude`. Carve those out of every wildcard preset layer by default; a config
// author who really does keep app code under kernel/ can drop the exclude.
export const FRAMEWORK_INTERNAL_EXCLUDE = ['**/kernel/**'];
export function presetWithOverlays(baseConfig, root) {
  if (!root) return baseConfig;
  return applyFrameworkLayoutOverlays(baseConfig, root);
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
            patterns: ['src/**/domain/**'],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            forbiddenGlobals: DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
            optional: true,
          },
          {
            name: 'ApplicationOrchestration',
            description: 'Use cases that coordinate the domain through ports. No I/O of its own.',
            patterns: ['src/**/application/**'],
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
              'src/**/persistence/**',
              'src/**/repositories/**',
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
        ],
        rules: [
          { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
          { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
          { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
          { from: 'ApplicationOrchestration', to: 'PersistenceAdapters', allowed: false },
          { from: 'ApplicationOrchestration', to: 'PresentationAdapters', allowed: false },
          { from: 'PresentationAdapters', to: 'PersistenceAdapters', allowed: false },
          { from: 'PresentationAdapters', to: 'DomainModel', allowed: false },
          { from: 'PersistenceAdapters', to: 'ApplicationOrchestration', allowed: false },
          { from: 'PersistenceAdapters', to: 'PresentationAdapters', allowed: false },
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
            description: 'Business services and use-case coordination.',
            patterns: ['src/**/application/**', 'src/**/services/**'],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
          {
            name: 'DomainModel',
            description: 'Pure business rules and entities. No I/O, no framework, no ambient globals.',
            patterns: ['src/**/domain/**'],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            forbiddenGlobals: DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
            optional: true,
          },
          {
            name: 'PersistenceAdapters',
            description: 'Data access and infrastructure.',
            patterns: [
              'src/**/persistence/**',
              'src/**/data/**',
              'src/**/repositories/**',
              'src/**/infrastructure/**',
            ],
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
      App: 'App-wide setup, providers, and routing.',
      Pages: 'Route-level compositions.',
      Widgets: 'Self-contained UI blocks composed from features and entities.',
      Features: 'User-facing feature units.',
      Entities: 'Business entities with their UI and logic.',
      Shared: 'Reusable primitives with no business knowledge.',
    };
    return presetWithOverlays(
      {
        include: ['src'],
        layers: order.map((name) => ({
          name,
          description: purpose[name],
          patterns: [`src/${name.toLowerCase()}/**`],
          optional: true,
        })),
        rules: denyUpward(order),
      },
      root
    );
  },
  // Cross-package profile for workspace monorepos. Patterns match by directory NAME
  // anywhere in the tree (`**/domain/**` hits packages/x/domain AND apps/y/src/domain),
  // so one profile governs every package. include defaults to the detected workspace
  // roots (falls back to packages+apps). Naming varies by repo — adjust and re-check.
  monorepo: (includeDirs, root) => {
    let include =
      includeDirs && includeDirs.length > 0 ? [...includeDirs] : [];
    if (root) {
      const resolved = resolveIncludeRoots(root);
      if (resolved.length > 0) include = resolved;
    }
    if (include.length === 0) include = ['packages', 'apps'];
    return presetWithOverlays(
      {
        include,
        layers: [
          {
            name: 'DomainModel',
            description:
              'Pure business rules and entities, in any package. No I/O, no framework, no ambient globals.',
            // Domain by intentional folders only — NOT bare **/types.ts (that mis-classifies
            // application bags like frontend/src/core/**/types.ts as Domain and creates false edges).
            patterns: ['**/domain/**', '**/entities/**', '**/cinematic/types.ts'],
            forbiddenGlobals: DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
            optional: true,
          },
          {
            name: 'ApplicationOrchestration',
            description: 'Use cases and services that coordinate the domain through ports.',
            patterns: ['**/application/**', '**/use-cases/**', '**/services/**'],
            optional: true,
          },
          {
            name: 'PresentationAdapters',
            description: 'Entrypoints — HTTP routes, controllers, UI, framework app/pages dirs.',
            patterns: [
              '**/app/**',
              '**/pages/**',
              '**/components/**',
              '**/controllers/**',
              '**/http/**',
              '**/routes/**',
              '**/hooks/**',
              '**/lib/**',
            ],
            optional: true,
          },
          {
            name: 'PersistenceAdapters',
            description: 'Implements ports with real infrastructure: DB, external APIs, filesystem.',
            patterns: [
              '**/infrastructure/**',
              '**/adapters/**',
              '**/persistence/**',
              '**/repositories/**',
            ],
            optional: true,
          },
        ],
        rules: [
          { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
          { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
          { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
          { from: 'ApplicationOrchestration', to: 'PresentationAdapters', allowed: false },
          { from: 'PresentationAdapters', to: 'PersistenceAdapters', allowed: false },
          { from: 'PersistenceAdapters', to: 'ApplicationOrchestration', allowed: false },
        ],
      },
      root
    );
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
              '**/domain/**',
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
            description: 'Server actions, features, and non-UI lib orchestration (when present).',
            patterns: [
              'src/features/**',
              'src/server/**',
              'src/services/**',
              'src/use-cases/**',
              'src/actions/**',
              'src/lib/actions/**',
              'src/lib/services/**',
              '**/lib/actions/**',
              '**/lib/services/**',
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
          {
            name: 'PersistenceAdapters',
            description: 'Client data access and external API adapters (when present).',
            // Prefer specific data-client bags over a presentation catch-all on **/lib/**
            patterns: [
              '**/infrastructure/**',
              '**/adapters/**',
              '**/repositories/**',
              '**/persistence/**',
              'src/db/**',
              'src/data/**',
              'src/lib/db/**',
              'src/lib/prisma/**',
              'src/lib/supabase/**',
              'src/lib/airtable/**',
              'src/lib/firebase/**',
              'src/lib/firestore/**',
              'src/lib/mongodb/**',
              'src/lib/mongoose/**',
              'src/lib/drizzle/**',
              'src/lib/kysely/**',
              '**/lib/supabase/**',
              '**/lib/airtable/**',
              '**/lib/prisma/**',
              '**/lib/db/**',
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
        rules: [
          { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
          { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
          { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
          { from: 'ApplicationOrchestration', to: 'PresentationAdapters', allowed: false },
          // Next RSC often imports data clients from routes; deny is ideal but day-one
          // ui-surface keeps this as a soft guidance edge (allowed) until ports exist —
          // Persistence → Presentation stays denied when that edge appears.
          {
            from: 'PresentationAdapters',
            to: 'PersistenceAdapters',
            allowed: true,
            message:
              'UI/routes may reach data clients on day one (RSC); prefer application ports as the product grows.',
          },
          { from: 'PersistenceAdapters', to: 'PresentationAdapters', allowed: false },
          { from: 'PersistenceAdapters', to: 'ApplicationOrchestration', allowed: false },
        ],
      },
      root
    ),
};

// ── Layer suggestion engine ──────────────────────────────────────────────────
// Everything here is HARVESTED from Ark's own canonical sources — the 11-layer defaults
// (DEFAULT_LAYER_DIRECTORIES) and the named presets — so a suggestion can never drift from
// what the gate actually enforces. No ad-hoc directory heuristics: a directory Ark doesn't
// already know about is reported as "unrecognized — you classify", never guessed. This is
// what lets `init`/`--coverage` PROPOSE where ungoverned code belongs instead of silently
// leaving the majority of a repo ungoverned behind a false-green check.
export const CANONICAL_LAYER_NAMES = new Set(DEFAULT_INTENT_PREFIXES.map((entry) => entry.layer));
