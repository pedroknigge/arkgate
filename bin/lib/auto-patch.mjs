/**
 * W1 — Write-boundary autoPatch for mechanical-safe kinds that can be fixed
 * by rewriting only the file being written (import type conversions).
 *
 * Multi-file kinds (type-only-import-move, pure-type-file-relocate) are classified
 * but do not emit a single-file autoPatch — they need agent judgment / multi-file moves.
 *
 * Trust: post-patch revalidation must be green or the patch is discarded.
 * Never invents new mechanical-safe kinds beyond classifyRemediation.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  isTypeOnlyModuleReference,
  namedModuleBindings,
  sourceFileExportsOnlyTypes,
  typeOnlyExportNames,
} from './ast-scan.mjs';
import { classifyRemediation } from './remediation.mjs';

const EXT_CANDIDATES = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', ''];

/**
 * Resolve a relative (or simple) import specifier to an absolute file path on disk.
 * @returns {string|null}
 */
/**
 * True when abs stays under root (no path.relative escape).
 * Empty relative path (abs === root) counts as inside.
 * @param {string} root
 * @param {string} abs
 */
function isUnderRoot(root, abs) {
  if (!root || !abs) return false;
  const rel = path.relative(path.resolve(root), path.resolve(abs));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function resolveImportFileAbs(root, fromFilePath, specifier) {
  if (typeof specifier !== 'string' || !specifier) return null;
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  if (!fromFilePath || !root) return null;
  const rootAbs = path.resolve(root);
  const fromAbs = path.isAbsolute(fromFilePath)
    ? path.resolve(fromFilePath)
    : path.resolve(rootAbs, fromFilePath);
  // Refuse resolution when the importer itself is outside the project root.
  if (!isUnderRoot(rootAbs, fromAbs)) return null;
  const base = path.resolve(path.dirname(fromAbs), specifier);
  const tryFile = (candidate) => {
    try {
      if (!isUnderRoot(rootAbs, candidate)) return null;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* continue */
    }
    return null;
  };
  for (const ext of EXT_CANDIDATES) {
    const hit = tryFile(base + ext);
    if (hit) return hit;
  }
  for (const ext of EXT_CANDIDATES) {
    if (!ext) continue;
    const hit = tryFile(path.join(base, `index${ext}`));
    if (hit) return hit;
  }
  return null;
}

/**
 * Classify a target module for import-type conversion eligibility.
 * @returns {{ pureTypeModule: boolean, typeOnlyNames: Set<string> } | null}
 */
export function inspectTargetModule(ts, targetSource) {
  if (!ts || typeof targetSource !== 'string') return null;
  const sf = ts.createSourceFile('target.ts', targetSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const pureTypeModule = sourceFileExportsOnlyTypes(ts, sf);
  const typeOnlyNames = new Set(typeOnlyExportNames(ts, sf));
  return { pureTypeModule, typeOnlyNames };
}

/**
 * Decide remediation kind for converting a non-type-only import of `specifier`
 * with named bindings `bindingNames` (or null for non-named).
 * @returns {{ kind: string, confidence: number } | null}
 */
export function classifyImportTypeConversion(inspect, bindingNames) {
  if (!inspect) return null;
  if (inspect.pureTypeModule) {
    return {
      kind: 'import-type-from-pure-type-module',
      confidence: 0.85,
    };
  }
  if (Array.isArray(bindingNames) && bindingNames.length > 0) {
    if (bindingNames.every((n) => inspect.typeOnlyNames.has(n))) {
      return {
        kind: 'import-type-of-type-exports',
        confidence: 0.86,
      };
    }
  }
  return null;
}

/**
 * Rewrite eligible static imports/exports to type-only form.
 * @returns {{ source: string, remediationKind: string, confidence: number } | null}
 */
export function applyImportTypeAutoPatch(ts, source, opts = {}) {
  if (!ts || typeof source !== 'string') return null;
  const { root, filePath, resolveTargetAbs = resolveImportFileAbs } = opts;
  const sf = ts.createSourceFile(
    filePath || 'file.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  /** @type {Array<{ start: number, end: number, text: string }>} */
  const replacements = [];
  let bestKind = null;
  let bestConfidence = 0;

  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) && !ts.isExportDeclaration(stmt)) continue;
    if (isTypeOnlyModuleReference(ts, stmt)) continue;
    const specNode = stmt.moduleSpecifier;
    if (!specNode || !ts.isStringLiteralLike(specNode)) continue;
    const specifier = specNode.text;
    const abs = resolveTargetAbs(root, filePath, specifier);
    if (!abs) continue;
    let targetText;
    try {
      targetText = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const inspect = inspectTargetModule(ts, targetText);
    const bindings = namedModuleBindings(ts, stmt);
    // Named imports/re-exports only. Default, namespace, and side-effect imports stay
    // judgment (never auto-convert to import type).
    const conversion = classifyImportTypeConversion(inspect, bindings);
    if (ts.isImportDeclaration(stmt)) {
      const clause = stmt.importClause;
      if (!clause) continue; // side-effect
      if (clause.name) continue; // default import — judgment
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) continue;
    }
    if (!conversion) continue;

    const full = source.slice(stmt.getStart(sf), stmt.getEnd());
    let next = full;
    if (ts.isImportDeclaration(stmt)) {
      // `import { A } from 'x'` → `import type { A } from 'x'`
      // `import { type A, B }` partial already type-only per binding — only full convert
      if (/^\s*import\s+type\b/.test(full)) continue;
      next = full.replace(/^(\s*import)(\s+)/, '$1 type$2');
    } else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) {
      if (/^\s*export\s+type\b/.test(full)) continue;
      next = full.replace(/^(\s*export)(\s+)/, '$1 type$2');
    }
    if (next === full) continue;
    replacements.push({ start: stmt.getStart(sf), end: stmt.getEnd(), text: next });
    if (conversion.confidence >= bestConfidence) {
      bestConfidence = conversion.confidence;
      bestKind = conversion.kind;
    }
  }

  if (replacements.length === 0 || !bestKind) return null;
  // Apply from end so offsets stay valid
  replacements.sort((a, b) => b.start - a.start);
  let out = source;
  for (const r of replacements) {
    out = out.slice(0, r.start) + r.text + out.slice(r.end);
  }
  if (out === source) return null;
  return {
    source: out,
    remediationKind: bestKind,
    confidence: bestConfidence,
  };
}

/**
 * Run gate validation, try mechanical-safe single-file autoPatch, re-validate.
 *
 * @param {{
 *   source: string,
 *   filePath?: string,
 *   root: string,
 *   ts: object,
 *   validate: (source: string) => { valid: boolean, violations?: any[] },
 *   resolveTargetAbs?: Function,
 * }} opts
 */
export function validateWithAutoPatch(opts) {
  const { source, filePath, root, ts, validate, resolveTargetAbs } = opts;
  const result = validate(source);
  const base = {
    valid: Boolean(result.valid),
    violations: Array.isArray(result.violations) ? result.violations : [],
  };

  // Attach remediation classification for LAYER_IMPORT violations when flags known
  const violations = base.violations.map((v) => {
    const verdict = classifyRemediation({
      ruleId: v.ruleId || v.code,
      typeOnly: v.typeOnly,
      sourcePureTypeModule: v.sourcePureTypeModule,
      targetTypeOnlyExports: v.targetTypeOnlyExports,
      namedBindingsTypeOnly: v.namedBindingsTypeOnly,
      peerIsolation: v.peerIsolation ?? v.details?.peerIsolation,
      edgeKind: v.edgeKind ?? v.details?.importKind,
      fromLayer: v.fromLayer,
      toLayer: v.toLayer,
      target: v.target,
    });
    return {
      ...v,
      remediationClass: verdict.class,
      remediationKind: verdict.remediationKind,
      remediationConfidence: verdict.confidence,
    };
  });

  if (base.valid) {
    return { valid: true, violations: [], autoPatch: null };
  }

  const attempt = applyImportTypeAutoPatch(ts, source, {
    root,
    filePath,
    resolveTargetAbs: resolveTargetAbs || resolveImportFileAbs,
  });

  if (!attempt) {
    return { valid: false, violations, autoPatch: null };
  }

  const after = validate(attempt.source);
  if (!after.valid) {
    // Discard — never return an unvalidated patch
    return { valid: false, violations, autoPatch: null };
  }

  return {
    valid: false,
    violations,
    autoPatch: {
      source: attempt.source,
      remediationKind: attempt.remediationKind,
      confidence: attempt.confidence,
      valid: true,
    },
  };
}
