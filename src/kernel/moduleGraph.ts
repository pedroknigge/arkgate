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

type ModuleSpecifier = { value: string; offset: number; excerpt: string; typeOnly?: boolean };

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
  // Mixed `{ type A, B }` named bindings stay value imports here; the symbol-aware
  // collector owns that precision (documented envelope, ADR 0009 D3).
  let typeOnly = false;
  if (isWordAt(source, 'type', index)) {
    const after = skipWhitespace(source, index + 'type'.length);
    if (source[after] !== ',' && !isWordAt(source, 'from', after)) typeOnly = true;
  }
  const specifier = specifierInStaticStatement(source, index, true);
  return specifier && typeOnly ? { ...specifier, typeOnly: true } : specifier;
}

function specifierAfterExport(source: string, index: number): ModuleSpecifier | undefined {
  return specifierInStaticStatement(source, index + 'export'.length, false);
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
    if (current === "'" || current === '"' || current === '`') {
      const string = readString(source, index);
      if (string) index = string.offset + string.excerpt.length - 1;
      continue;
    }
    const specifier = isWordAt(source, 'import', index)
      ? specifierAfterImport(source, index)
      : isWordAt(source, 'export', index)
        ? specifierAfterExport(source, index)
        : undefined;
    if (specifier) result.push(specifier);
  }
  return result;
}

export function importEdges(
  file: AnalysisFile,
  files: ReadonlyMap<string, AnalysisFile>
): AnalysisImportEdge[] {
  const edges: AnalysisImportEdge[] = [];
  for (const moduleSpecifier of moduleSpecifiers(file.content)) {
    const specifier = moduleSpecifier.value;
    if (!specifier.startsWith('.')) continue;
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
  return edges;
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
 * Ordering is deterministic: specifier occurrence order within the file.
 */
export function capabilityUsesFor(file: AnalysisFile): AnalysisCapabilityUse[] {
  const uses: AnalysisCapabilityUse[] = [];
  for (const moduleSpecifier of moduleSpecifiers(file.content)) {
    if (moduleSpecifier.typeOnly || moduleSpecifier.value.startsWith('.')) continue;
    const capability = capabilityForModuleSpecifier(moduleSpecifier.value);
    if (!capability) continue;
    const line = file.content.slice(0, moduleSpecifier.offset).split('\n').length;
    uses.push({
      file: file.path,
      symbol: moduleSpecifier.value,
      capability,
      evidence: { kind: 'import', file: file.path, line, excerpt: moduleSpecifier.excerpt },
    });
  }
  return uses;
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
