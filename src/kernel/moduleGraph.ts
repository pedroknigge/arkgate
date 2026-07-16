/**
 * Module-specifier scanning and import-edge building (U02 pilot 2).
 *
 * Pure string scanning — no backtracking regular expression and no runtime
 * TypeScript dependency. Full compiler resolution stays outside C02's IR
 * contract; src/kernel/semanticAnalysis.ts owns the symbol-aware path.
 */
import type {
  AnalysisCapabilityUse,
  AnalysisEvidence,
  AnalysisFile,
  AnalysisImportEdge,
  AnalysisViolation,
} from '../domain/analysis';
import { capabilityForModuleSpecifier } from '../domain/capabilities';
import type { ArkConfig } from '../domain/configTypes';
import { findDeniedEdgeRule } from '../domain/layerMatch';

export function normalizePath(value: string): string {
  const segments: string[] = [];
  for (const segment of value.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..' && segments.length > 0 && segments.at(-1) !== '..') segments.pop();
    else segments.push(segment);
  }
  return segments.join('/');
}

type ModuleSpecifier = {
  value: string;
  offset: number;
  excerpt: string;
  typeOnly?: boolean;
  /** Found via `require(...)`: capability evidence only, never a graph edge (verdict stability). */
  requireCall?: boolean;
};

function isIdentifierCharacter(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_$]/.test(value);
}

function skipWhitespace(source: string, index: number): number {
  while (index < source.length && /\s/.test(source[index])) index += 1;
  return index;
}

function readString(source: string, index: number): ModuleSpecifier | undefined {
  const quote = source[index];
  if (quote !== "'" && quote !== '"') return undefined;
  const start = index;
  let value = '';
  for (index += 1; index < source.length; index += 1) {
    const current = source[index];
    if (current === quote) {
      return { value, offset: start, excerpt: source.slice(start, index + 1) };
    }
    if (current === '\\' && index + 1 < source.length) {
      value += source[index + 1];
      index += 1;
    } else {
      value += current;
    }
  }
  return undefined;
}

function isWordAt(source: string, word: string, index: number): boolean {
  return (
    source.startsWith(word, index) &&
    !isIdentifierCharacter(source[index - 1]) &&
    !isIdentifierCharacter(source[index + word.length])
  );
}

function specifierAfterImport(source: string, index: number): ModuleSpecifier | undefined {
  index = skipWhitespace(source, index + 'import'.length);
  if (source[index] === '(') return readString(source, skipWhitespace(source, index + 1));
  // Conservative textual `import type …` detection: statements that begin with the
  // type keyword are erased at runtime and must not count as capability evidence.
  // Documented envelope (ADR 0009 D3): ANY braced named-binding list — including
  // all-type `{ type A }` — stays a value import here, as does a comment between
  // the keywords; the symbol-aware collector owns that precision. Template-literal
  // bodies are scanned like the rest of the file (pre-existing scanner envelope).
  let typeOnly = false;
  if (isWordAt(source, 'type', index)) {
    const after = skipWhitespace(source, index + 'type'.length);
    if (source[after] !== ',' && !isWordAt(source, 'from', after)) typeOnly = true;
  }
  const specifier = specifierInStaticStatement(source, index, true);
  return specifier && typeOnly ? { ...specifier, typeOnly: true } : specifier;
}

function specifierAfterExport(source: string, index: number): ModuleSpecifier | undefined {
  // `export type { X } from '…'` is erased at runtime exactly like `import type`.
  index = index + 'export'.length;
  const afterKeyword = skipWhitespace(source, index);
  let typeOnly = false;
  if (isWordAt(source, 'type', afterKeyword)) {
    const next = skipWhitespace(source, afterKeyword + 'type'.length);
    if (source[next] === '{' || source[next] === '*') typeOnly = true;
  }
  const specifier = specifierInStaticStatement(source, index, false);
  return specifier && typeOnly ? { ...specifier, typeOnly: true } : specifier;
}

function specifierInStaticStatement(
  source: string,
  index: number,
  allowDirectSpecifier: boolean
): ModuleSpecifier | undefined {
  for (; index < source.length; index += 1) {
    if (source[index] === ';') return undefined;
    if (isWordAt(source, 'from', index)) {
      return readString(source, skipWhitespace(source, index + 'from'.length));
    }
    if (allowDirectSpecifier && (source[index] === "'" || source[index] === '"')) {
      return readString(source, index);
    }
    if (index > 0 && (isWordAt(source, 'import', index) || isWordAt(source, 'export', index))) {
      return undefined;
    }
  }
  return undefined;
}

/** Skip a template literal (backtick to backtick, escapes honored). Interpolation
 * contents are skipped with it — specifiers inside `${…}` are the symbol path's
 * job (documented envelope); template TEXT must never become capability evidence. */
function skipTemplateLiteral(source: string, index: number): number {
  for (index += 1; index < source.length; index += 1) {
    const current = source[index];
    if (current === '\\') {
      index += 1;
    } else if (current === '`') {
      return index;
    }
  }
  return source.length;
}

function specifierAfterRequire(source: string, index: number): ModuleSpecifier | undefined {
  // Property/optional-chain access (`x.require(…)`, `x?.require(…)`) is not the
  // ambient require; the symbol-aware path owns shadowing precision.
  let previous = index - 1;
  while (previous >= 0 && /\s/.test(source[previous])) previous -= 1;
  if (source[previous] === '.') return undefined;
  let cursor = skipWhitespace(source, index + 'require'.length);
  if (source[cursor] !== '(') return undefined;
  cursor = skipWhitespace(source, cursor + 1);
  const specifier = readString(source, cursor);
  return specifier ? { ...specifier, requireCall: true } : undefined;
}

function moduleSpecifiers(source: string): ModuleSpecifier[] {
  const result: ModuleSpecifier[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    if (current === '/' && source[index + 1] === '/') {
      index = source.indexOf('\n', index + 2);
      if (index < 0) break;
      continue;
    }
    if (current === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      if (end < 0) break;
      index = end + 1;
      continue;
    }
    if (current === '`') {
      index = skipTemplateLiteral(source, index);
      continue;
    }
    if (current === "'" || current === '"') {
      const string = readString(source, index);
      if (string) index = string.offset + string.excerpt.length - 1;
      continue;
    }
    const specifier = isWordAt(source, 'import', index)
      ? specifierAfterImport(source, index)
      : isWordAt(source, 'export', index)
        ? specifierAfterExport(source, index)
        : isWordAt(source, 'require', index)
          ? specifierAfterRequire(source, index)
          : undefined;
    if (specifier) result.push(specifier);
  }
  return result;
}

export type ModuleFacts = {
  edges: AnalysisImportEdge[];
  capabilityUses: AnalysisCapabilityUse[];
};

/**
 * ONE specifier scan per file producing both import edges and import-based
 * capability evidence (V01 budgets: analyzeProject must not walk content twice).
 */
export function moduleFactsFor(
  file: AnalysisFile,
  files: ReadonlyMap<string, AnalysisFile>
): ModuleFacts {
  const edges: AnalysisImportEdge[] = [];
  const capabilityUses: AnalysisCapabilityUse[] = [];
  for (const moduleSpecifier of moduleSpecifiers(file.content)) {
    const specifier = moduleSpecifier.value;
    // require() specifiers feed capability evidence only — a relative require
    // never becomes a graph edge here, preserving pre-U04 edge verdicts.
    if (moduleSpecifier.requireCall && specifier.startsWith('.')) continue;
    if (!specifier.startsWith('.')) {
      if (moduleSpecifier.typeOnly) continue;
      const capability = capabilityForModuleSpecifier(specifier);
      if (!capability) continue;
      const line = file.content.slice(0, moduleSpecifier.offset).split('\n').length;
      capabilityUses.push({
        file: file.path,
        symbol: specifier,
        capability,
        evidence: { kind: 'import', file: file.path, line, excerpt: moduleSpecifier.excerpt },
      });
      continue;
    }
    const line = file.content.slice(0, moduleSpecifier.offset).split('\n').length;
    const evidence: AnalysisEvidence = {
      kind: 'import',
      file: file.path,
      line,
      excerpt: moduleSpecifier.excerpt,
    };
    const target = resolveSpecifier(file.path, specifier, files);
    edges.push({
      from: file.path,
      specifier,
      to: target?.path ?? null,
      resolution: target ? 'resolved' : 'unresolved',
      fromLayer: file.layer,
      toLayer: target?.layer ?? null,
      evidence,
    });
  }
  return { edges, capabilityUses };
}

export function importEdges(
  file: AnalysisFile,
  files: ReadonlyMap<string, AnalysisFile>
): AnalysisImportEdge[] {
  return moduleFactsFor(file, files).edges;
}

function resolveSpecifier(
  from: string,
  specifier: string,
  files: ReadonlyMap<string, AnalysisFile>
): AnalysisFile | undefined {
  const segments = from.split('/');
  segments.pop();
  for (const segment of specifier.split('/')) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  const base = segments.join('/');
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.cts`, `${base}/index.ts`, `${base}/index.tsx`]) {
    const found = files.get(candidate);
    if (found) return found;
  }
  return undefined;
}

/**
 * Import-based capability evidence the pure engine can prove from content
 * alone (ADR 0009 — U03). Ambient globals need symbols and belong to
 * src/kernel/capabilityAnalysis.ts; relative specifiers are project code.
 * Prefer moduleFactsFor when edges are needed too — one scan, both facts.
 */
export function capabilityUsesFor(file: AnalysisFile): AnalysisCapabilityUse[] {
  return moduleFactsFor(file, new Map()).capabilityUses;
}

export function violationsFor(
  edges: readonly AnalysisImportEdge[],
  config: ArkConfig
): AnalysisViolation[] {
  const violations: AnalysisViolation[] = [];
  for (const edge of edges) {
    if (!edge.to || !edge.fromLayer || !edge.toLayer) continue;
    const rule = findDeniedEdgeRule(config.rules, edge.fromLayer, edge.toLayer, {
      fromPath: edge.from,
      toPath: edge.to,
      layers: config.layers,
    });
    if (!rule) continue;
    violations.push({
      ruleId: `layer-dependency:${rule.from}->${rule.to}`,
      message: rule.message ?? `${rule.from} must not depend on ${rule.to}.`,
      edge,
      evidence: edge.evidence,
    });
  }
  return violations;
}
