import fs from 'node:fs';
import path from 'node:path';

const useColor = process.stderr.isTTY && !process.env.NO_COLOR;
const color = {
  red: (s) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
  green: (s) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  dim: (s) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
};

/** Canonical: src/domain/baselineKey.ts → bin/lib/baseline-key.mjs (R4). */
import { baselineKey, baselineOccurrenceKeys } from './baseline-key.mjs';
export { baselineKey, baselineOccurrenceKeys };

export function readBaseline(root, baselinePath) {
  const fullPath = path.isAbsolute(baselinePath) ? baselinePath : path.join(root, baselinePath);
  if (!fs.existsSync(fullPath)) return { keys: new Set(), fullPath, exists: false };
  const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  return { keys: new Set(raw.violations ?? []), fullPath, exists: true };
}

export function writeBaseline(root, baselinePath, violations) {
  const fullPath = path.isAbsolute(baselinePath) ? baselinePath : path.join(root, baselinePath);
  const keys = baselineOccurrenceKeys(violations).sort();
  fs.writeFileSync(
    fullPath,
    `${JSON.stringify({ version: 1, note: 'Frozen ark-check violations. Only NEW violations fail --baseline runs. Regenerate with: ark-check --update-baseline', violations: keys }, null, 2)}\n`
  );
  return { fullPath, count: keys.length };
}

export const FIX_HINTS = {
  LAYER_IMPORT_VIOLATION:
    'Depend on a port/interface owned by an inner layer instead, or move this code to a layer allowed to make this import.',
  LAYER_INTENT_REFERENCE_VIOLATION:
    'Reference intents through a layer that owns them (e.g. subscribe from an adapter, not from the domain).',
  RAW_EVENT_PUBLISH:
    'Define the intent with ark.registry.define(...) and publish through the returned creator.',
  PUBLISH_MISSING_SOURCE:
    'Add metadata.source (the publishing intent name) to the publish call.',
  PUBLISH_SOURCE_LAYER_MISMATCH:
    'Use a source intent that belongs to the same layer as the publishing file, or move the file.',
  FORBIDDEN_GLOBAL:
    'Inject the capability through a port (e.g. a Clock, IdGenerator, or HttpPort) instead of reaching for the ambient global.',
  CIRCULAR_DEPENDENCY:
    'Break the cycle: extract the shared code into a module both sides import, invert one edge behind a port/interface, or merge the files if they are really one unit.',
};

export function printViolation(violation) {
  const location = `${violation.file}:${violation.line}`;
  console.error(`${color.red('✖')} ${color.bold(violation.ruleId)}  ${location}`);
  if (violation.fromLayer && violation.toLayer) {
    const target = violation.target ? `  ${color.dim(`(${violation.target})`)}` : '';
    console.error(`  ${violation.fromLayer} → ${violation.toLayer}${target}`);
  }
  console.error(`  ${violation.message}`);
  const hint = FIX_HINTS[violation.ruleId];
  if (hint) console.error(`  ${color.dim(`fix: ${hint}`)}`);
  console.error('');
}

// ── Violation diagnosis ──────────────────────────────────────────────────────
// Groups violations by their layer EDGE (and target subtree) so a wall of N violations reads
// as "M distinct problems, ranked by size" — the burn-down order. The killer signal: when
// one edge dominates, the CONTRACT is usually wrong, not the code (e.g. every API route
// importing the kernel through a sanctioned entrypoint). Freezing that as "debt" buries a
// config fix behind a baseline, so --update-baseline refuses a lopsided freeze (see guard).
export const CONCENTRATION_MIN_VIOLATIONS = 10;
export const CONCENTRATION_SHARE = 0.9;

export function violationEdge(violation) {
  if (violation.ruleId === 'CIRCULAR_DEPENDENCY') return 'circular dependency';
  if (violation.ruleId === 'FORBIDDEN_GLOBAL') return `${violation.fromLayer ?? '?'} → ambient global`;
  if (violation.fromLayer && violation.toLayer) return `${violation.fromLayer} → ${violation.toLayer}`;
  return violation.ruleId;
}

// The directory the offending import lands in — the signal for "where does this edge go?".
// For a LAYER_IMPORT_VIOLATION the target is a resolved file path; cluster by its dir prefix
// so `kernel/internal/x` and `kernel/internal/y` collapse to one "into kernel/internal/".
export function violationTargetSubtree(violation) {
  if (!violation.target || typeof violation.target !== 'string' || !violation.target.includes('/')) {
    return undefined;
  }
  const segments = violation.target.split('/');
  return segments.slice(0, Math.min(3, segments.length - 1)).join('/');
}

export function summarizeViolations(violations) {
  const byEdge = new Map();
  let typeOnly = 0;
  for (const violation of violations) {
    if (violation.typeOnly) typeOnly += 1;
    const key = violationEdge(violation);
    const entry = byEdge.get(key) ?? { edge: key, count: 0, typeOnly: 0, targets: new Map() };
    entry.count += 1;
    if (violation.typeOnly) entry.typeOnly += 1;
    const subtree = violationTargetSubtree(violation);
    if (subtree) entry.targets.set(subtree, (entry.targets.get(subtree) ?? 0) + 1);
    byEdge.set(key, entry);
  }
  const edges = [...byEdge.values()]
    .map((entry) => ({
      edge: entry.edge,
      count: entry.count,
      typeOnly: entry.typeOnly,
      topTargets: [...entry.targets.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([dir, count]) => ({ dir, count })),
    }))
    .sort((a, b) => b.count - a.count);
  const total = violations.length;
  const dominant = edges[0];
  const dominantShare = total > 0 && dominant ? dominant.count / total : 0;
  return {
    total,
    // Value edges are real runtime coupling; type-only edges (erased at compile time) are
    // just type placement — fix the value ones first, the type-only ones move with the type.
    valueCount: total - typeOnly,
    typeOnlyCount: typeOnly,
    edges,
    dominant: dominant ? dominant.edge : undefined,
    dominantShare,
    concentrated: total >= CONCENTRATION_MIN_VIOLATIONS && dominantShare >= CONCENTRATION_SHARE,
  };
}

export function printViolationBreakdown(summary, { toStderr = false } = {}) {
  const out = toStderr ? (line) => console.error(line) : (line) => console.log(line);
  out('');
  out(`Violation breakdown — ${summary.total} across ${summary.edges.length} edge(s), largest first:`);
  if (summary.typeOnlyCount > 0) {
    out(
      `  ${summary.valueCount} value (runtime coupling — fix first) · ${summary.typeOnlyCount} type-only (type placement — moves with the type)`
    );
  }
  for (const edge of summary.edges) {
    const pct = Math.round((edge.count / summary.total) * 100);
    const typeNote = edge.typeOnly > 0 ? `, ${edge.typeOnly} type-only` : '';
    out(`  ${String(edge.count).padStart(5)}  ${edge.edge}  (${pct}%${typeNote})`);
    for (const target of edge.topTargets) {
      out(`         ↳ ${target.count}× into ${target.dir}/`);
    }
  }
  if (summary.concentrated) {
    out('');
    out(`⚠ ${Math.round(summary.dominantShare * 100)}% of violations are a SINGLE edge: ${summary.dominant}.`);
    out('  That usually means the CONTRACT is wrong, not the code — e.g. app-land reaching a');
    out('  framework/kernel through a sanctioned entrypoint. Before treating it as debt:');
    out('    • If the edge is intended, allow it — or split the target layer into a public');
    out('      surface app-land may import + internals it may not (see the target dirs above');
    out('      to find the surface). Do it via /ark-contract.');
    out('    • Only the minority hitting real internals is genuine debt for /ark-fix.');
    out(`  Fixing the contract clears ~${summary.edges[0].count} of ${summary.total} at once.`);
  }
}

// Finds strongly-connected components in the resolved import graph. Any component
// with more than one file is a set of files that transitively import each other —
// a circular dependency. One violation per component keeps the output minimal and
// the baseline key stable (anchored at the alphabetically-first member).
