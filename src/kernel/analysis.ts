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
import {
  findDeniedEdgeRule,
  globToRegExp,
  layerForRelativePath,
  patternSpecificity,
} from '../domain/layerMatch';

export {
  collectForbiddenCapabilityUses,
  extractSemanticDependencies,
  type ForbiddenCapabilityUse,
  type SemanticDependency,
  type SemanticDependencyKind,
} from './semanticAnalysis';

export {
  SOURCE_POLICY_MESSAGES,
  classifyPublishFacts,
  looksLikeArkIntent,
  type PublishSyntaxFacts,
  type SourcePolicyFinding,
} from '../domain/sourcePolicy';

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

export type ArchitectureEngineViolation = {
  ruleId: string;
  message: string;
  file?: string;
  line?: number;
  target?: string;
  fromLayer?: string;
  toLayer?: string;
  [key: string]: unknown;
};

export type ArchitectureEngineEdge = {
  from: string;
  fromLayer: string;
  to?: string;
  toLayer?: string;
  line: number;
  kind: string;
  typeOnly?: boolean;
  targetTypeOnlyExports?: boolean;
  sourcePureTypeModule?: boolean;
  namedBindingsTypeOnly?: boolean;
  portProofEligible?: boolean;
};

export type EvaluateArchitectureGraphInput = {
  config: ArkConfig;
  rules: ArkConfig['rules'];
  files: readonly string[];
  contentViolations: readonly ArchitectureEngineViolation[];
  edges: readonly ArchitectureEngineEdge[];
  warnings?: readonly ArchitectureEngineViolation[];
  safety?: unknown;
};

export type ArchitectureEngineResult = {
  violations: ArchitectureEngineViolation[];
  warnings: ArchitectureEngineViolation[];
  safety?: unknown;
};

export type CollectAnalysisConfigWarningsInput = {
  config: ArkConfig;
  rules: ArkConfig['rules'];
  files: readonly string[];
  manifest?: {
    architecture?: { layers?: readonly { name?: string; prefixes?: readonly string[] }[] };
  };
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

export function detectArchitectureCycles(
  graph: ReadonlyMap<string, ReadonlySet<string>>
): ArchitectureEngineViolation[] {
  let index = 0;
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];

  const connect = (file: string): void => {
    indices.set(file, index);
    low.set(file, index);
    index += 1;
    stack.push(file);
    onStack.add(file);

    for (const target of [...(graph.get(file) ?? [])].sort()) {
      if (!graph.has(target)) continue;
      if (!indices.has(target)) {
        connect(target);
        low.set(file, Math.min(low.get(file) ?? 0, low.get(target) ?? 0));
      } else if (onStack.has(target)) {
        low.set(file, Math.min(low.get(file) ?? 0, indices.get(target) ?? 0));
      }
    }

    if (low.get(file) !== indices.get(file)) return;
    const component: string[] = [];
    let member: string | undefined;
    do {
      member = stack.pop();
      if (member === undefined) break;
      onStack.delete(member);
      component.push(member);
    } while (member !== file);
    if (component.length > 1) components.push(component.sort());
  };

  for (const file of [...graph.keys()].sort()) {
    if (!indices.has(file)) connect(file);
  }

  return components
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map((members) => ({
      ruleId: 'CIRCULAR_DEPENDENCY',
      file: members[0],
      line: 1,
      target: members.join(' → '),
      message: `Circular dependency among ${members.length} files: ${members.join(' → ')} → ${members[0]}.`,
      cycleKind: 'value',
    }));
}

/** Canonical graph and layer-policy evaluator shared by library, CLI, and MCP adapters. */
export function evaluateArchitectureGraph(
  input: EvaluateArchitectureGraphInput
): ArchitectureEngineResult {
  const violations = input.contentViolations.map((violation) => ({ ...violation }));
  const warnings = (input.warnings ?? []).map((warning) => ({ ...warning }));
  const graph = new Map<string, Set<string>>(
    input.files.map((file) => [file, new Set<string>()])
  );

  for (const edge of input.edges) {
    if (edge.to && edge.to !== edge.from && !edge.typeOnly && graph.has(edge.from)) {
      graph.get(edge.from)?.add(edge.to);
    }
    if (!edge.to || !edge.toLayer) continue;
    const rule = findDeniedEdgeRule(input.rules, edge.fromLayer, edge.toLayer, {
      fromPath: edge.from,
      toPath: edge.to,
      layers: input.config.layers,
    });
    if (!rule) continue;

    const peerIsolation = Boolean(rule.peerIsolation);
    violations.push({
      ruleId: 'LAYER_IMPORT_VIOLATION',
      file: edge.from,
      line: edge.line,
      fromLayer: edge.fromLayer,
      toLayer: edge.toLayer,
      target: edge.to,
      ...(edge.typeOnly ? { typeOnly: true } : {}),
      ...(edge.targetTypeOnlyExports ? { targetTypeOnlyExports: true } : {}),
      ...(edge.sourcePureTypeModule ? { sourcePureTypeModule: true } : {}),
      ...(edge.namedBindingsTypeOnly ? { namedBindingsTypeOnly: true } : {}),
      ...(!peerIsolation && edge.portProofEligible ? { portProofEligible: true } : {}),
      ...(edge.kind ? { edgeKind: edge.kind } : {}),
      ...(peerIsolation ? { peerIsolation: true } : {}),
      message:
        rule.message ??
        (peerIsolation
          ? `${edge.fromLayer} must not ${edge.kind} another slice of ${edge.toLayer} (${edge.from} → ${edge.to}). Extract shared code or use events/ports across slices.`
          : `${edge.fromLayer} must not ${edge.kind} ${edge.toLayer}.`),
    });
  }

  const cyclePolicy = String(input.config.cyclePolicy ?? 'strict').toLowerCase();
  if (cyclePolicy !== 'off') {
    const cycles = detectArchitectureCycles(graph);
    if (cyclePolicy === 'soft' || cyclePolicy === 'framework-soft') {
      warnings.push(
        ...cycles.map((cycle) => ({
          ...cycle,
          message: `${cycle.message} (soft cycle policy — advisory only; set cyclePolicy: "strict" to fail the check)`,
          failsStrict: false,
        }))
      );
    } else {
      violations.push(...cycles);
    }
  }

  return { violations, warnings, safety: input.safety };
}

function configWarning(
  ruleId: string,
  message: string,
  extra: Record<string, unknown> = {}
): ArchitectureEngineViolation {
  return { ruleId, message, ...extra };
}

/** Canonical config diagnostics over repo-relative file paths. */
export function collectAnalysisConfigWarnings(
  input: CollectAnalysisConfigWarningsInput
): ArchitectureEngineViolation[] {
  const { config, rules, files, manifest } = input;
  const warnings: ArchitectureEngineViolation[] = [];
  if (
    config.dynamicImportAllowlist !== undefined &&
    (!Array.isArray(config.dynamicImportAllowlist) ||
      config.dynamicImportAllowlist.some((entry) => typeof entry !== 'string'))
  ) {
    warnings.push(
      configWarning(
        'CONFIG_INVALID_DYNAMIC_IMPORT_ALLOWLIST',
        'dynamicImportAllowlist must be an array of file globs.'
      )
    );
  }
  if (
    config.safety !== undefined &&
    (config.safety === null || typeof config.safety !== 'object' || Array.isArray(config.safety))
  ) {
    warnings.push(configWarning('CONFIG_INVALID_SAFETY', 'safety must be an object.'));
  } else if (config.safety) {
    for (const key of ['maxTsSuppressions', 'maxAnyCasts'] as const) {
      const value = config.safety[key];
      if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
        warnings.push(
          configWarning(
            'CONFIG_INVALID_SAFETY_THRESHOLD',
            `safety.${key} must be a non-negative integer.`
          )
        );
      }
    }
  }

  const layers = Array.isArray(config.layers) ? config.layers : [];
  const manifestLayers = Array.isArray(manifest?.architecture?.layers)
    ? manifest.architecture.layers
    : [];
  const knownLayers = new Set([
    ...layers.map((layer) => layer.name).filter(Boolean),
    ...manifestLayers.map((layer) => layer.name).filter((name): name is string => Boolean(name)),
  ]);

  if (layers.length === 0) {
    warnings.push(
      configWarning(
        'CONFIG_NO_LAYERS',
        'No file layers are configured; ark-check cannot classify files for import-boundary enforcement.'
      )
    );
  }

  const seenLayers = new Set<string>();
  const duplicateLayers = new Set<string>();
  for (const layer of layers) {
    if (!layer.name) {
      warnings.push(configWarning('CONFIG_LAYER_WITHOUT_NAME', 'A configured layer is missing a name.'));
      continue;
    }
    if (seenLayers.has(layer.name)) duplicateLayers.add(layer.name);
    seenLayers.add(layer.name);

    if (
      layer.forbiddenGlobals !== undefined &&
      (!Array.isArray(layer.forbiddenGlobals) ||
        layer.forbiddenGlobals.some((entry) => typeof entry !== 'string'))
    ) {
      warnings.push(
        configWarning(
          'CONFIG_INVALID_FORBIDDEN_GLOBALS',
          `Layer "${layer.name}" has an invalid forbiddenGlobals value; expected an array of strings (e.g. ["fetch", "Date.now"]). The entry is ignored.`,
          { layer: layer.name }
        )
      );
    }

    const patterns = Array.isArray(layer.patterns) ? layer.patterns : [];
    if (patterns.length === 0) {
      warnings.push(
        configWarning(
          'CONFIG_LAYER_WITHOUT_PATTERNS',
          `Layer "${layer.name}" has no file patterns and will never classify files.`,
          { layer: layer.name }
        )
      );
      continue;
    }

    for (const pattern of patterns) {
      let expression: RegExp;
      try {
        expression = globToRegExp(pattern);
      } catch (error) {
        warnings.push(
          configWarning(
            'CONFIG_INVALID_LAYER_PATTERN',
            `Layer "${layer.name}" has an invalid pattern "${pattern}": ${
              error instanceof Error ? error.message : String(error)
            }`,
            { layer: layer.name, pattern }
          )
        );
        continue;
      }
      if (!files.some((file) => expression.test(file)) && !layer.optional) {
        warnings.push(
          configWarning(
            'CONFIG_LAYER_PATTERN_NO_MATCHES',
            `Layer "${layer.name}" pattern "${pattern}" matched no included files.`,
            { layer: layer.name, pattern, failsStrict: false }
          )
        );
      }
    }
  }

  for (const name of duplicateLayers) {
    warnings.push(
      configWarning('CONFIG_DUPLICATE_LAYER', `Layer "${name}" is configured more than once.`, {
        layer: name,
      })
    );
  }

  if (knownLayers.size > 0) {
    for (const rule of rules ?? []) {
      if (rule.from && !knownLayers.has(rule.from)) {
        warnings.push(
          configWarning(
            'CONFIG_RULE_UNKNOWN_FROM_LAYER',
            `Rule references unknown source layer "${rule.from}".`,
            { fromLayer: rule.from, toLayer: rule.to }
          )
        );
      }
      if (rule.to && !knownLayers.has(rule.to)) {
        warnings.push(
          configWarning(
            'CONFIG_RULE_UNKNOWN_TO_LAYER',
            `Rule references unknown target layer "${rule.to}".`,
            { fromLayer: rule.from, toLayer: rule.to }
          )
        );
      }
    }
  }

  const ambiguousPairs = new Set<string>();
  if (layers.length > 1) {
    for (const file of files) {
      let topScore = -1;
      let topLayers: string[] = [];
      for (const layer of layers) {
        for (const pattern of layer.patterns ?? []) {
          if (!globToRegExp(pattern).test(file)) continue;
          const score = patternSpecificity(pattern);
          if (score > topScore) {
            topScore = score;
            topLayers = [layer.name];
          } else if (score === topScore && !topLayers.includes(layer.name)) {
            topLayers.push(layer.name);
          }
        }
      }
      if (topLayers.length > 1) ambiguousPairs.add([...topLayers].sort().join(' + '));
    }
  }
  if (ambiguousPairs.size > 0) {
    warnings.push(
      configWarning(
        'CONFIG_AMBIGUOUS_LAYERS',
        `Some files match multiple layers at equal specificity; classification falls back to declaration order. Disambiguate the overlapping patterns: ${[...ambiguousPairs].join(', ')}.`,
        { pairs: [...ambiguousPairs] }
      )
    );
  }

  const unclassified = files.filter((file) => !layerForRelativePath(file, layers));
  if (unclassified.length > 0) {
    warnings.push(
      configWarning(
        'CONFIG_UNCLASSIFIED_FILES',
        `${unclassified.length} included source file(s) are not matched by any configured layer; ark-check will not enforce import rules for those source files.`,
        { count: unclassified.length, samples: unclassified.slice(0, 5) }
      )
    );
  }

  return warnings;
}
