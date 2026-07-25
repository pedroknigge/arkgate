/**
 * Unclassified-path layer suggestions for coverage/doctor.
 */
import path from 'node:path';
import { DEFAULT_LAYER_DIRECTORIES } from '../ark-shared.mjs';
import {
  ARCHITECTURE_PRESETS,
  ARCHITECTURE_PRESET_NAMES,
  CANONICAL_LAYER_NAMES,
} from './presets.mjs';

export function dirSegmentsFromGlob(pattern) {
  return String(pattern)
    .split('/')
    .filter((segment) => segment && !segment.includes('*'));
}

/**
 * Basename / path tokens that score as Persistence (data clients, auth, CRM).
 * Used so adopt never maps lib/turso → Presentation (NEW-ADOPT-LIB-AS-PRESENTATION).
 */
export const PERSISTENCE_PATH_TOKENS = Object.freeze([
  'turso',
  'prisma',
  'supabase',
  'airtable',
  'drizzle',
  'kysely',
  'mongoose',
  'mongodb',
  'firebase',
  'firestore',
  'planetscale',
  'neon',
  'pipedrive',
  'repository',
  'repositories',
  'persistence',
  'infrastructure',
  'infra',
  'db',
  'auth',
  'session',
]);

/** True when a path/basename looks like a data or auth client (not UI). */
export function isPersistenceClientPath(relPath) {
  const posix = String(relPath || '')
    .split(/[/\\]/)
    .filter(Boolean)
    .join('/');
  if (!posix) return false;
  const lower = posix.toLowerCase();
  const base = path.posix.basename(lower).replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/i, '');
  for (const token of PERSISTENCE_PATH_TOKENS) {
    if (base === token || base.startsWith(`${token}.`) || base.startsWith(`${token}-`) || base.startsWith(`${token}_`)) {
      return true;
    }
    if (lower.includes(`/${token}/`) || lower.endsWith(`/${token}`) || lower.startsWith(`${token}/`)) {
      return true;
    }
  }
  return false;
}

/** True when a path looks like pure domain folders. */
export function isDomainPath(relPath) {
  const posix = String(relPath || '')
    .split(/[/\\]/)
    .filter(Boolean)
    .join('/')
    .toLowerCase();
  return (
    /(?:^|\/)domain(?:\/|$)/.test(posix) ||
    /(?:^|\/)entities(?:\/|$)/.test(posix) ||
    /(?:^|\/)kernel\/domain(?:\/|$)/.test(posix)
  );
}

let _layerByDir;
// Map<dirBasename, string[] layers>. A basename mapping to >1 layer (e.g. `app` — Application
// orchestration in the 11-layer defaults, but Presentation in the monorepo/Next preset) is
// genuinely ambiguous; every candidate is surfaced rather than silently picked.
export function layerByDir() {
  if (_layerByDir) return _layerByDir;
  const map = new Map();
  const add = (segment, layer) => {
    if (!segment) return;
    const existing = map.get(segment) ?? [];
    if (!existing.includes(layer)) existing.push(layer);
    map.set(segment, existing);
  };
  for (const [layer, dirs] of Object.entries(DEFAULT_LAYER_DIRECTORIES)) {
    for (const dir of dirs) add(dirSegmentsFromGlob(dir).pop(), layer);
  }
  // The canonical-named presets reuse the 11 layer names, so their directory synonyms
  // (services→Application, components/pages→Presentation, data/infrastructure→Persistence…)
  // map cleanly onto the same taxonomy. feature-sliced uses a different vocabulary
  // (Widgets/Entities/…) that doesn't reduce to the 11, so it's covered by model-fit, not here.
  for (const preset of ARCHITECTURE_PRESET_NAMES) {
    // feature-sliced uses a different vocabulary (App/Pages/…) — still harvest dirs.
    for (const layer of ARCHITECTURE_PRESETS[preset]([]).layers) {
      if (!CANONICAL_LAYER_NAMES.has(layer.name)) continue;
      for (const pattern of layer.patterns ?? []) {
        add(dirSegmentsFromGlob(pattern).pop(), layer.name);
      }
    }
  }
  _layerByDir = map;
  return map;
}

// Suggest a canonical layer for a directory by its basename. null when Ark doesn't recognize
// it (the honest "you classify this" case), else { layer, alternatives }.
export function suggestLayerForDir(name) {
  const layers = layerByDir().get(name);
  if (!layers || layers.length === 0) return null;
  return { layer: layers[0], alternatives: layers.slice(1) };
}

// Suggest a layer for a directory PATH by finding the deepest segment Ark recognizes, so
// `src/lib/repositories` proposes PersistenceAdapters even though `lib` itself is unknown.
// Next App Router / Pages API shells (`…/app/api`, `…/pages/api`) are Application, not Presentation.
// Never map bare `lib` alone to Presentation (NEW-ADOPT-LIB-AS-PRESENTATION).
export function suggestLayerForPath(relDir) {
  const posix = String(relDir || '')
    .split(/[/\\]/)
    .filter(Boolean)
    .join('/');
  // Prefer the API orchestration shell over a bare `app` / `pages` Presentation match.
  // Direct api/ and route-group shells: app/(marketing)/api/**
  if (
    /(?:^|\/)(?:src\/)?app(?:\/[^/]+)*\/api(?:\/|$)/.test(posix) ||
    /(?:^|\/)(?:src\/)?pages(?:\/[^/]+)*\/api(?:\/|$)/.test(posix)
  ) {
    return {
      layer: 'ApplicationOrchestration',
      alternatives: [],
      matchedDir: posix.includes('pages') && posix.includes('/api') ? 'pages/…/api' : 'app/…/api',
    };
  }
  // Root / Vercel serverless api handlers (SPA layout).
  if (/(?:^|\/)api(?:\/|$)/.test(posix) && !/(?:^|\/)app(?:\/|$)/.test(posix)) {
    return {
      layer: 'ApplicationOrchestration',
      alternatives: [],
      matchedDir: 'api',
    };
  }
  if (isDomainPath(posix)) {
    return { layer: 'DomainModel', alternatives: [], matchedDir: 'domain' };
  }
  if (isPersistenceClientPath(posix)) {
    return {
      layer: 'PersistenceAdapters',
      alternatives: [],
      matchedDir: path.posix.basename(posix) || 'persistence',
    };
  }
  const segments = posix.split('/').filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const seg = segments[i];
    // Bare `lib` is not Presentation — leave unrecognized so agents classify children.
    if (seg === 'lib' || seg === 'src') continue;
    const hit = suggestLayerForDir(seg);
    if (hit) {
      // Never promote Presentation solely because a parent was `lib`.
      if (hit.layer === 'PresentationAdapters' && segments.includes('lib')) {
        // Prefer Persistence when any sibling token smells like data; else skip.
        if (isPersistenceClientPath(posix)) {
          return {
            layer: 'PersistenceAdapters',
            alternatives: [],
            matchedDir: seg,
          };
        }
        continue;
      }
      return { ...hit, matchedDir: seg };
    }
  }
  return null;
}

// Which starter model does this set of directory basenames most resemble? Scored purely by
// how many of the repo's directories each preset's patterns recognize — a hint toward
// `ark init --preset <name>`. null when nothing lines up.
export function detectBestFitModel(dirBasenames) {
  const present = new Set(dirBasenames);
  const scored = ARCHITECTURE_PRESET_NAMES.map((name) => {
    const segments = new Set();
    for (const layer of ARCHITECTURE_PRESETS[name]([]).layers) {
      for (const pattern of layer.patterns ?? []) {
        const seg = dirSegmentsFromGlob(pattern).pop();
        if (seg) segments.add(seg);
      }
    }
    let hits = 0;
    for (const dir of present) if (segments.has(dir)) hits += 1;
    return { name, hits };
  });
  scored.sort((a, b) => b.hits - a.hits);
  return scored[0].hits > 0 ? scored[0] : null;
}

// Group ungoverned files by their parent directory and attach a proposed layer (or the
// honest "unrecognized"). The single source the coverage report and init both format.
export function buildUnclassifiedSuggestions(unclassifiedRelFiles) {
  const byDir = new Map();
  for (const rel of unclassifiedRelFiles) {
    const dir = rel.split('/').slice(0, -1).join('/') || '.';
    byDir.set(dir, (byDir.get(dir) ?? 0) + 1);
  }
  return [...byDir.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dir, files]) => {
    const hit = suggestLayerForPath(dir);
    return hit
      ? {
          dir,
          files,
          layer: hit.layer,
          ...(hit.alternatives.length > 0 ? { alternatives: hit.alternatives } : {}),
        }
      : { dir, files, unrecognized: true };
  });
}

// For `init`: propose a layer for every ungoverned top-level directory, descending one level
// into unrecognized ones so `lib/repositories`, `lib/db` etc. still get a concrete proposal
// instead of a blanket "lib is ungoverned".
