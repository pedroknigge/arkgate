import {
  ANALYSIS_IR_SCHEMA_VERSION,
  deterministicHash,
  stableSerialize,
  type AnalysisCapabilityUse,
  type AnalysisCompilerOptions,
  type AnalysisEvidence,
  type AnalysisFile,
  type AnalysisFileChange,
  type AnalysisFileInput,
  type AnalysisImportEdge,
  type AnalysisIr,
  type AnalysisViolation,
} from '../domain/analysis';
import {
  loadArkConfigContract,
  parseArkConfigJson,
  type ArkConfig,
  type ArkConfigLoadResult,
} from '../domain/configContract';
import { findDeniedEdgeRule, layerForRelativePath } from '../domain/layerMatch';

export type AnalysisContract = ArkConfigLoadResult & { policyHash: string };

export type AnalyzeProjectInput = {
  contract: AnalysisContract;
  files: readonly AnalysisFileInput[];
  compilerOptions?: AnalysisCompilerOptions;
};

export type AnalyzeChangeInput = AnalyzeProjectInput & {
  changes: readonly AnalysisFileChange[];
};

export type AnalysisResult = {
  ir: AnalysisIr;
};

export function loadContract(input: unknown, source?: string): AnalysisContract {
  const loaded =
    typeof input === 'string'
      ? parseArkConfigJson(input, source)
      : loadArkConfigContract(input, source);
  return { ...loaded, policyHash: deterministicHash(stableSerialize(loaded.config)) };
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

type ModuleSpecifier = { value: string; offset: number; excerpt: string };

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
  return specifierInStaticStatement(source, index, true);
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

/**
 * Extract module specifiers without a backtracking regular expression or a runtime
 * TypeScript dependency. Full compiler resolution stays outside C02's IR contract.
 */
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

function importEdges(file: AnalysisFile, files: ReadonlyMap<string, AnalysisFile>): AnalysisImportEdge[] {
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

function violationsFor(
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

export function analyzeProject(input: AnalyzeProjectInput): AnalysisResult {
  const files = input.files
    .map((inputFile) => {
      const path = normalizePath(inputFile.path);
      return {
        path,
        content: inputFile.content,
        contentHash: deterministicHash(inputFile.content),
        layer: layerForRelativePath(path, input.contract.config.layers) ?? null,
      } satisfies AnalysisFile;
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  const fileByPath = new Map(files.map((file) => [file.path, file]));
  const edges = files.flatMap((file) => importEdges(file, fileByPath));
  const capabilityUses: AnalysisCapabilityUse[] = [];
  const violations = violationsFor(edges, input.contract.config);

  return {
    ir: {
      schemaVersion: ANALYSIS_IR_SCHEMA_VERSION,
      policyHash: input.contract.policyHash,
      compilerOptionsHash: deterministicHash(stableSerialize(input.compilerOptions ?? {})),
      files,
      layers: input.contract.config.layers.map((layer) => layer.name),
      edges,
      capabilityUses,
      violations,
    },
  };
}

export function analyzeChange(input: AnalyzeChangeInput): AnalysisResult {
  const files = new Map(input.files.map((file) => [normalizePath(file.path), file]));
  for (const change of input.changes) {
    const path = normalizePath(change.path);
    if ('delete' in change && change.delete) files.delete(path);
    else if ('content' in change) files.set(path, { path, content: change.content });
  }
  return analyzeProject({
    contract: input.contract,
    files: [...files.values()],
    compilerOptions: input.compilerOptions,
  });
}

export function explainViolation(violation: AnalysisViolation): string {
  const location = `${violation.evidence.file}:${violation.evidence.line}`;
  if (!violation.edge) return `${violation.ruleId} at ${location}: ${violation.message}`;
  const target = violation.edge.to ?? violation.edge.specifier;
  return `${violation.ruleId} at ${location}: ${violation.edge.from} imports ${target}. ${violation.message}`;
}
