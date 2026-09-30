/**
 * Compact importer index for doctor and report (ADR 0037 D1).
 *
 * The scan releases the resolved facts right after the verdict (memory). This
 * keeps only what the files-nothing-imports advisory and the flat-parent
 * suggestion read: governed paths, incoming edge counts, the edge list as
 * typed-array pairs, and which export names each target is imported by. It is
 * a projection of facts that already exist — never an input to the verdict.
 */

/** Unresolved project-looking specifiers kept for `maybe-unresolved` matching. */
const MAX_UNRESOLVED_SPECIFIERS = 200;
/** A bare specifier that looks like a project alias rather than a package. */
const ALIAS_LIKE = /^(?:[@~#$]\/|[~#$])/;

function looksLikeProjectSpecifier(specifier) {
  return typeof specifier === 'string' && (specifier.startsWith('.') || ALIAS_LIKE.test(specifier));
}

/**
 * @param {{ files?: Array<{ path: string, parseStatus?: string }>, dependencies?: Array<object>, completeness?: string }} facts
 * @returns {{
 *   files: string[],
 *   importerCount: Uint32Array,
 *   edges: Int32Array,
 *   namedUse: Map<number, Set<string> | '*'>,
 *   unresolved: Array<{ from: string, specifier: string }>,
 *   unresolvedTotal: number,
 *   dynamicSites: number,
 *   invalidFiles: number,
 *   completeness: string,
 * }}
 */
export function projectImporterIndex(facts) {
  const files = [];
  const indexOf = new Map();
  let invalidFiles = 0;
  for (const file of Array.isArray(facts?.files) ? facts.files : []) {
    if (typeof file?.path !== 'string' || indexOf.has(file.path)) continue;
    indexOf.set(file.path, files.length);
    files.push(file.path);
    if (file.parseStatus === 'invalid') invalidFiles += 1;
  }
  const importerCount = new Uint32Array(files.length);
  const pairs = [];
  const namedUse = new Map();
  const unresolved = [];
  let unresolvedTotal = 0;
  let dynamicSites = 0;
  for (const dep of Array.isArray(facts?.dependencies) ? facts.dependencies : []) {
    if (dep?.resolution === 'dynamic') {
      dynamicSites += 1;
      continue;
    }
    if (dep?.resolution === 'unresolved') {
      if (!looksLikeProjectSpecifier(dep.specifier)) continue;
      unresolvedTotal += 1;
      if (unresolved.length < MAX_UNRESOLVED_SPECIFIERS) {
        unresolved.push({ from: dep.from, specifier: dep.specifier });
      }
      continue;
    }
    if (dep?.resolution !== 'resolved-project') continue;
    const from = indexOf.get(dep.from);
    const to = indexOf.get(dep.target);
    if (from === undefined || to === undefined || from === to) continue;
    pairs.push(from, to);
    importerCount[to] += 1;
    const previous = namedUse.get(to);
    if (previous === '*') continue;
    // Default, namespace, side-effect, dynamic, require and `export *` carry no
    // names: any export may be used through them.
    const named = Array.isArray(dep.namedBindings) && dep.namedBindings.length > 0 ? dep.namedBindings : null;
    if (!named) {
      namedUse.set(to, '*');
      continue;
    }
    const set = previous ?? new Set();
    for (const name of named) set.add(name);
    namedUse.set(to, set);
  }
  return {
    files,
    importerCount,
    edges: Int32Array.from(pairs),
    namedUse,
    unresolved,
    unresolvedTotal,
    dynamicSites,
    invalidFiles,
    completeness: typeof facts?.completeness === 'string' ? facts.completeness : 'unavailable',
  };
}

/**
 * target path → every governed file that imports it (the flat-parent graph).
 * @param {ReturnType<typeof projectImporterIndex>} index
 */
export function importerGraphFromIndex(index) {
  const graph = new Map();
  const { files, edges } = index;
  for (let i = 0; i + 1 < edges.length; i += 2) {
    const target = files[edges[i + 1]];
    let set = graph.get(target);
    if (!set) {
      set = new Set();
      graph.set(target, set);
    }
    set.add(files[edges[i]]);
  }
  return graph;
}
