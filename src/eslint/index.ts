/**
 * arkgate/eslint — editor-side architecture gate.
 *
 * Layer / import / forbidden-globals rules load `ark.config.json` from the linted
 * project (walk-up from the file) and use the same glob specificity + edge semantics
 * as ark-check. Matching primitives come from the canonical
 * `src/domain/layerMatch.ts` (CLI loads the generated `bin/ark-layer-match.mjs`) —
 * no Kernel imports.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  globToRegExp,
  patternSpecificity,
  layerForRelativePath,
  isEdgeDenied,
  findDeniedEdgeDecision,
  peerIsolationDenyExplanation,
  isScanExcludedRelative,
} from '../domain/layerMatch';
import {
  capabilityForModuleSpecifier,
  effectiveCapabilityDeny,
  forbiddenGlobalForModuleSpecifier,
} from '../domain/capabilities';
import { parseArkConfigJson, type ArkConfig } from '../domain/configContract';
import {
  toAdapterDiagnostic,
  type AdapterDiagnostic,
  type AdapterViolationInput,
} from '../domain/adapterContract';
import {
  classifyPublishFacts,
} from '../domain/sourcePolicy';
import { createArkRunEslintRules } from './arkRunRules';
import { createArkOrderEslintRules } from './arkOrderRules';

export { globToRegExp, patternSpecificity, layerForRelativePath, isEdgeDenied };

type RuleContext = {
  report(descriptor: Record<string, unknown>): void;
  /** ESLint 9+ / 10: preferred path on the context object. */
  filename?: string;
  /** ESLint 8-style physical path when linting with processors / virtual files. */
  physicalFilename?: string;
  /** ESLint ≤8 API — still present on some hosts; removed in ESLint 10. */
  getFilename?: () => string;
  /** ESLint 9+ source/scope API. */
  sourceCode?: SourceCode;
  /** ESLint ≤8 source/scope API. */
  getSourceCode?: () => SourceCode;
  options?: unknown[];
};

type ScopeVariable = { defs?: unknown[] };
type ScopeReference = {
  identifier?: AstNode;
  resolved?: ScopeVariable | null;
  isValueReference?: boolean;
};
type Scope = {
  set?: Map<string, ScopeVariable>;
  references?: ScopeReference[];
  upper?: Scope | null;
};
type SourceCode = { getScope?: (node: AstNode) => Scope };

/** Resolve the file path being linted across ESLint 8–10 context shapes. */
function lintedFilename(context: RuleContext): string {
  if (typeof context.physicalFilename === 'string' && context.physicalFilename.length > 0) {
    return context.physicalFilename;
  }
  if (typeof context.filename === 'string' && context.filename.length > 0) {
    return context.filename;
  }
  if (typeof context.getFilename === 'function') {
    try {
      const name = context.getFilename();
      if (typeof name === 'string' && name.length > 0) return name;
    } catch {
      /* ignore */
    }
  }
  return '';
}

type RuleListener = Record<string, (node: AstNode) => void>;

type AstNode = {
  type?: string;
  name?: string;
  value?: unknown;
  source?: AstNode;
  callee?: AstNode;
  object?: AstNode;
  property?: AstNode;
  key?: AstNode;
  arguments?: AstNode[];
  properties?: AstNode[];
  body?: AstNode[];
  declaration?: AstNode;
  importKind?: string;
  exportKind?: string;
  specifiers?: AstNode[];
  parent?: AstNode;
  init?: AstNode;
  computed?: boolean;
  loc?: { start?: { line?: number; column?: number } };
};

function reportAdapterDiagnostic(
  context: RuleContext,
  node: AstNode,
  messageId: string,
  violation: AdapterViolationInput,
  data?: Record<string, unknown>
): AdapterDiagnostic {
  const diagnostic = toAdapterDiagnostic({
    ...violation,
    line: violation.line ?? node.loc?.start?.line,
    column: violation.column ??
      (typeof node.loc?.start?.column === 'number' ? node.loc.start.column + 1 : undefined),
  });
  context.report({ node, messageId, ...(data ? { data } : {}), diagnostic });
  return diagnostic;
}

type ArkRule = {
  meta: {
    type: 'problem';
    docs: { description: string };
    messages: Record<string, string>;
    schema: unknown[];
  };
  create(context: RuleContext): RuleListener;
};

type ArkEslintPlugin = {
  rules: Record<string, ArkRule>;
  configs?: Record<string, unknown>;
};

// ── Config I/O (editor-only; matching primitives come from ark-layer-match.mjs) ──

export function findConfigPath(startFile: string): string | null {
  if (!startFile || startFile === '<input>' || startFile.startsWith('stdin')) return null;
  let dir = path.dirname(path.resolve(startFile));
  for (;;) {
    const candidate = path.join(dir, 'ark.config.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const _configCache = new Map<string, { source: string; config: ArkConfig }>();

export function loadArkConfig(configPath: string): ArkConfig | null {
  if (!fs.existsSync(configPath)) return null;
  const source = fs.readFileSync(configPath, 'utf8');
  const cached = _configCache.get(configPath);
  if (cached?.source === source) return cached.config;
  const config = parseArkConfigJson(source, configPath).config;
  _configCache.set(configPath, { source, config });
  return config;
}

function sourceIsInAnalysisScope(config: ArkConfig, relativePath: string): boolean {
  const included = (config.include ?? []).some((entry) => {
    const root = String(entry).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
    return root === '.' || relativePath === root || relativePath.startsWith(`${root}/`);
  });
  return included && !isScanExcludedRelative(relativePath, config);
}

/** Probe on-disk TS/JS candidates for a resolved base path (no package resolution). */
function existingSourceFile(base: string): string | null {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.cts`,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch {
      /* continue */
    }
  }
  return null;
}

/**
 * Read tsconfig paths/baseUrl for ESLint alias parity (P0-C).
 * JSONC-tolerant strip of // and /* comments; supports simple extends of a relative JSON.
 * Does not claim full TypeScript resolution (project refs, complex multi-target, wildcards beyond trailing *).
 */
export function readTsconfigPathAliases(
  startDir: string
): { baseUrl: string; aliases: Array<{ from: string; to: string }> } {
  let dir = path.resolve(startDir);
  let configPath: string | null = null;
  for (;;) {
    const candidate = path.join(dir, 'tsconfig.json');
    if (fs.existsSync(candidate)) {
      configPath = candidate;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (!configPath) return { baseUrl: startDir, aliases: [] };

  const loadJsonc = (file: string): Record<string, unknown> | null => {
    try {
      let text = fs.readFileSync(file, 'utf8');
      // Strip // line comments and /* */ blocks outside strings (best-effort).
      text = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const mergePaths = (
    file: string,
    depth: number
  ): { baseUrl?: string; paths?: Record<string, string[]> } => {
    if (depth > 4) return {};
    const json = loadJsonc(file);
    if (!json) return {};
    const compilerOptions = (json.compilerOptions ?? {}) as {
      baseUrl?: string;
      paths?: Record<string, string[]>;
    };
    let baseUrl = compilerOptions.baseUrl;
    let paths = compilerOptions.paths;
    const ext = json.extends;
    if (typeof ext === 'string' && !ext.startsWith('@')) {
      const parentPath = path.resolve(path.dirname(file), ext.endsWith('.json') ? ext : `${ext}.json`);
      if (fs.existsSync(parentPath)) {
        const parent = mergePaths(parentPath, depth + 1);
        baseUrl = baseUrl ?? parent.baseUrl;
        paths = { ...(parent.paths ?? {}), ...(paths ?? {}) };
      }
    }
    return { baseUrl, paths };
  };

  const merged = mergePaths(configPath, 0);
  const configDir = path.dirname(configPath);
  const baseUrl = path.resolve(configDir, merged.baseUrl || '.');
  const aliases: Array<{ from: string; to: string }> = [];
  for (const [pattern, targets] of Object.entries(merged.paths || {})) {
    if (!Array.isArray(targets) || targets.length === 0) continue;
    const from = pattern.replace(/\*$/, '');
    if (!from) continue; // skip catch-all `*`
    aliases.push({ from, to: String(targets[0]).replace(/\*$/, '') });
  }
  aliases.sort((a, b) => b.from.length - a.from.length);
  return { baseUrl, aliases };
}

/** Resolve relative import specifier to an absolute path candidate (TS-oriented). */
export function resolveRelativeImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  return existingSourceFile(base);
}

/**
 * Resolve relative or tsconfig path-alias import to an on-disk file.
 * Bare packages (no matching alias) return null — CI/TS remain source of truth there.
 */
export function resolveImportSpecifier(
  fromFile: string,
  specifier: string,
  projectRoot?: string | null
): string | null {
  if (!specifier) return null;
  if (specifier.startsWith('.')) return resolveRelativeImport(fromFile, specifier);

  const startDir = projectRoot || path.dirname(fromFile);
  const { baseUrl, aliases } = readTsconfigPathAliases(startDir);
  const alias = aliases.find((a) => specifier.startsWith(a.from));
  if (!alias) return null;
  const mapped = path.resolve(baseUrl, `${alias.to}${specifier.slice(alias.from.length)}`);
  return existingSourceFile(mapped);
}

// ── AST helpers ────────────────────────────────────────────────────────────

function stringValue(node: AstNode | undefined): string | undefined {
  return typeof node?.value === 'string' ? node.value : undefined;
}

function propertyName(node: AstNode | undefined): string | undefined {
  return node?.name ?? stringValue(node);
}

function sourceCodeFor(context: RuleContext): SourceCode | undefined {
  return context.sourceCode ?? context.getSourceCode?.();
}

function referenceFor(context: RuleContext, node: AstNode): ScopeReference | undefined {
  let scope = sourceCodeFor(context)?.getScope?.(node);
  while (scope) {
    const reference = scope.references?.find((candidate) => candidate.identifier === node);
    if (reference) return reference;
    scope = scope.upper ?? undefined;
  }
  return undefined;
}

function isLocallyBound(context: RuleContext, node: AstNode, name: string): boolean {
  const reference = referenceFor(context, node);
  if (reference?.resolved) return (reference.resolved.defs?.length ?? 0) > 0;

  let scope = sourceCodeFor(context)?.getScope?.(node);
  while (scope) {
    const variable = scope.set?.get(name);
    if (variable) return (variable.defs?.length ?? 0) > 0;
    scope = scope.upper ?? undefined;
  }
  return false;
}

function isValueIdentifierReference(context: RuleContext, node: AstNode): boolean {
  const reference = referenceFor(context, node);
  if (reference) return reference.isValueReference !== false;
  return node.parent?.type === 'VariableDeclarator' && node.parent.init === node;
}

function memberExpressionPath(
  node: AstNode | undefined
): { root: AstNode; segments: string[] } | undefined {
  if (node?.type === 'Identifier' && node.name) {
    return { root: node, segments: [node.name] };
  }
  if (!node) return undefined;
  const memberLike =
    node.type === 'MemberExpression' || Boolean(node.object && node.property);
  if (!memberLike || node.computed === true) return undefined;
  const base = memberExpressionPath(node.object);
  const property = propertyName(node.property);
  if (!base || !property) return undefined;
  return { root: base.root, segments: [...base.segments, property] };
}

function calleePropertyName(node: AstNode): string | undefined {
  return propertyName(node.callee?.property);
}

function objectProperty(node: AstNode | undefined, name: string): AstNode | undefined {
  return node?.properties?.find((property) => propertyName(property.key) === name);
}

function objectHasProperty(node: AstNode | undefined, name: string): boolean {
  return objectProperty(node, name) !== undefined;
}

function objectHasMetadataSource(node: AstNode | undefined): boolean {
  const metadata = objectProperty(node, 'metadata')?.value as AstNode | undefined;
  return objectHasProperty(metadata, 'source');
}

function isPublishCall(node: AstNode): boolean {
  return calleePropertyName(node) === 'publish';
}

function declarationIsTypeOnly(node: AstNode): boolean {
  if (node.importKind === 'type' || node.exportKind === 'type') return true;
  const specifiers = (node.specifiers ?? []) as Array<{
    type?: string;
    importKind?: string;
    exportKind?: string;
  }>;
  if (specifiers.length === 0) return false;
  if (specifiers.every((specifier) => specifier.type === 'ImportSpecifier')) {
    return specifiers.every((specifier) => specifier.importKind === 'type');
  }
  return specifiers.every((specifier) => specifier.exportKind === 'type');
}

function containingProgram(node: AstNode): AstNode | undefined {
  let current: AstNode | undefined = node;
  while (current?.parent) current = current.parent;
  return current?.type === 'Program' ? current : undefined;
}

/** Conservative ESTree counterpart of sourceFileExportsOnlyTypes for the ESLint envelope. */
function sourceProgramExportsOnlyTypes(node: AstNode): boolean {
  const statements = containingProgram(node)?.body;
  if (!statements) return false;
  let sawTypeExport = false;
  for (const statement of statements) {
    if (statement.type === 'ImportDeclaration') {
      if (!declarationIsTypeOnly(statement)) return false;
      continue;
    }
    if (statement.type === 'TSInterfaceDeclaration' || statement.type === 'TSTypeAliasDeclaration') {
      continue;
    }
    if (statement.type === 'ExportNamedDeclaration') {
      if (statement.declaration) {
        if (
          statement.declaration.type !== 'TSInterfaceDeclaration' &&
          statement.declaration.type !== 'TSTypeAliasDeclaration'
        ) {
          return false;
        }
      } else if (!declarationIsTypeOnly(statement)) {
        return false;
      }
      sawTypeExport = true;
      continue;
    }
    return false;
  }
  return sawTypeExport;
}

// ── Rules ──────────────────────────────────────────────────────────────────

/**
 * Config-driven layer import boundary (primary editor gate).
 * Replaces path-token domain/infra heuristics when ark.config.json is present.
 * Rule id kept as `no-domain-infra-imports` for recommended-config / upgrade stability.
 */
export const noDomainInfraImports: ArkRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow imports that violate ark.config.json layer rules (same contract as arkgate-check).',
    },
    messages: {
      forbiddenImport:
        'Architecture: {{fromLayer}} must not import {{toLayer}} (ark.config.json). Specifier: {{specifier}}',
      forbiddenImportHeuristic:
        'Domain code must not import infrastructure, adapters, repositories, or database modules.',
    },
    schema: [],
  },
  create(context) {
    const filename = lintedFilename(context);
    const configPath = findConfigPath(filename);
    const config = configPath ? loadArkConfig(configPath) : null;
    const root = configPath ? path.dirname(configPath) : null;

    const check = (node: AstNode) => {
      const source = stringValue(node.source);
      if (!source) return;

      if (config && root && filename) {
        const absFile = path.isAbsolute(filename) ? filename : path.resolve(filename);
        const relFile = path.relative(root, absFile).split(path.sep).join('/');
        if (!sourceIsInAnalysisScope(config, relFile)) return;
        const fromLayer = layerForRelativePath(relFile, config.layers);
        if (!fromLayer) return;

        // P0-C: relative + tsconfig path aliases (`@/*`); bare packages still skip.
        const targetAbs = resolveImportSpecifier(absFile, source, root);
        if (!targetAbs) return; // package / unresolved alias — CI resolves via TS

        const relTarget = path.relative(root, targetAbs).split(path.sep).join('/');
        // Outside project or up-and-out: skip
        if (relTarget.startsWith('..')) return;

        const toLayer = layerForRelativePath(relTarget, config.layers);
        if (!toLayer) return;
        const edgeOpts = {
          fromPath: relFile,
          toPath: relTarget,
          layers: config.layers,
        };
        const decision = findDeniedEdgeDecision(config.rules, fromLayer, toLayer, edgeOpts);
        const deniedRule = decision?.rule;
        if (deniedRule || isEdgeDenied(config.rules, fromLayer, toLayer, edgeOpts)) {
          const edgeKind = node.type?.startsWith('Export') ? 'export' : 'import';
          const typeOnlyEdge = declarationIsTypeOnly(node);
          const peerIsolation = Boolean(deniedRule?.peerIsolation);
          // Align with graphEvaluate: peerIsolation stays hard even for type-only;
          // pure type-only (non-peer) is placement debt (warning + SharedTypes hint).
          // sourcePureTypeModule alone never softens a value import.
          const typePlacementDebt = typeOnlyEdge && !peerIsolation;
          const baseMsg =
            deniedRule?.message ??
            (peerIsolation && decision
              ? `${fromLayer} must not ${edgeKind} another slice of ${toLayer} (${relFile} → ${relTarget}): ${peerIsolationDenyExplanation(
                  decision.peerIsolationReason ?? 'cross-slice',
                  {
                    fromPath: relFile,
                    toPath: relTarget,
                    fromSlice: decision.fromSlice,
                    toSlice: decision.toSlice,
                  }
                )}`
              : `${fromLayer} must not ${edgeKind} ${toLayer}.`);
          reportAdapterDiagnostic(
            context,
            node,
            'forbiddenImport',
            {
              ruleId: 'LAYER_IMPORT_VIOLATION',
              file: relFile,
              fromLayer,
              toLayer,
              target: relTarget,
              edgeKind,
              ...(peerIsolation ? { peerIsolation: true } : {}),
              ...(typeOnlyEdge ? { typeOnly: true } : {}),
              ...(typePlacementDebt ? { severity: 'warning' as const } : {}),
              ...(sourceProgramExportsOnlyTypes(node)
                ? { sourcePureTypeModule: true }
                : {}),
              message: typePlacementDebt
                ? `${baseMsg} (type-only — type placement debt; prefer SharedTypes / owning layer; not runtime coupling)`
                : baseMsg,
            },
            { fromLayer, toLayer, specifier: source }
          );
        }
        return;
      }

      // No contract means no architecture policy. CI and editor stay equally contract-driven.
    };

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    };
  },
};

export const noRawEventPublish: ArkRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require event bus publish calls to use registered intent creators instead of raw event objects or intent strings.',
    },
    messages: {
      rawPublish:
        'Publish through a registered intent creator; raw event objects or intent strings bypass Ark contracts.',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const firstArg = node.arguments?.[0];
        const firstValue = stringValue(firstArg);
        const findings = classifyPublishFacts({
          publishCall: isPublishCall(node),
          rawIntentName: firstValue,
          objectHasIntent: objectHasProperty(firstArg, 'intent'),
          arkPublishCandidate: false,
          hasSource: true,
        });
        if (findings.some((finding) => finding.ruleId === 'RAW_EVENT_PUBLISH')) {
          const finding = findings.find((item) => item.ruleId === 'RAW_EVENT_PUBLISH')!;
          reportAdapterDiagnostic(context, node, 'rawPublish', {
            ...finding,
            file: lintedFilename(context),
          });
        }
      },
    };
  },
};

export const requirePublishSource: ArkRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require event bus publish calls to include source metadata.',
    },
    messages: {
      missingSource: 'Strict Ark publish calls must include metadata.source.',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const firstArg = node.arguments?.[0];
        const metadataArg = node.arguments?.[2];
        const findings = classifyPublishFacts({
          publishCall: isPublishCall(node),
          rawIntentName: stringValue(firstArg),
          objectHasIntent: objectHasProperty(firstArg, 'intent'),
          arkPublishCandidate: true,
          hasSource:
            objectHasMetadataSource(firstArg) || objectHasProperty(metadataArg, 'source'),
        });
        const finding = findings.find((item) => item.ruleId === 'PUBLISH_MISSING_SOURCE');
        if (finding) {
          reportAdapterDiagnostic(context, node, 'missingSource', {
            ...finding,
            file: lintedFilename(context),
          });
        }
      },
    };
  },
};

export const noForbiddenGlobals: ArkRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow ambient globals from the layer’s forbiddenGlobals in ark.config.json (same purity surface as ark-check). Option `globals` is a standalone fallback when no project config applies.',
    },
    messages: {
      forbiddenGlobal:
        'Ambient global "{{name}}" is forbidden in {{layer}} (ark.config.json); inject the capability through a port instead.',
      forbiddenGlobalDefault:
        'Ambient global "{{name}}" is forbidden here; inject the capability through a port instead.',
      forbiddenModule:
        '{{layer}} must not use module "{{specifier}}" because it is the import form of forbidden global "{{name}}".',
    },
    schema: [
      {
        type: 'object',
        properties: {
          globals: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const filename = lintedFilename(context);
    const option = context.options?.[0] as { globals?: string[] } | undefined;
    const configPath = findConfigPath(filename);
    const config = configPath ? loadArkConfig(configPath) : null;
    const root = configPath ? path.dirname(configPath) : null;

    let globals: Set<string> | null = null;
    let layerName = 'this layer';

    if (config && root && filename) {
      const absFile = path.isAbsolute(filename) ? filename : path.resolve(filename);
      const relFile = path.relative(root, absFile).split(path.sep).join('/');
      if (!sourceIsInAnalysisScope(config, relFile)) return {} as RuleListener;
      const layer = config.layers?.find(
        (l) => l.name === layerForRelativePath(relFile, config.layers)
      );
      if (layer?.forbiddenGlobals?.length) {
        globals = new Set(layer.forbiddenGlobals);
        layerName = layer.name;
      } else {
        // Layer has no purity list — do not invent defaults (matches CI).
        globals = null;
      }
    } else if (option?.globals) {
      // Standalone linting only. A rule-local option must never replace a
      // project contract and create a zero-voice gap with capability dedup.
      globals = new Set(option.globals);
    }

    if (!globals) {
      return {} as RuleListener;
    }

    const scopeAware = typeof sourceCodeFor(context)?.getScope === 'function';

    const report = (node: AstNode, name: string) => {
      const absFile = path.isAbsolute(filename) ? filename : path.resolve(filename);
      const reportFile = root
        ? path.relative(root, absFile).split(path.sep).join('/')
        : filename;
      reportAdapterDiagnostic(
        context,
        node,
        config ? 'forbiddenGlobal' : 'forbiddenGlobalDefault',
        {
          ruleId: 'FORBIDDEN_GLOBAL',
          file: reportFile,
          fromLayer: layerName,
          target: name,
          message: `${layerName} must not use the ambient global "${name}".`,
        },
        { name, layer: layerName }
      );
    };

    const reportModule = (
      node: AstNode,
      specifier: unknown,
      typeOnly: boolean,
      importKind: string
    ) => {
      if (typeOnly || typeof specifier !== 'string') return;
      const forbiddenGlobal = forbiddenGlobalForModuleSpecifier(specifier, globals!);
      if (!forbiddenGlobal) return;
      const absFile = path.isAbsolute(filename) ? filename : path.resolve(filename);
      const reportFile = root
        ? path.relative(root, absFile).split(path.sep).join('/')
        : filename;
      reportAdapterDiagnostic(
        context,
        node,
        'forbiddenModule',
        {
          ruleId: 'FORBIDDEN_GLOBAL',
          file: reportFile,
          fromLayer: layerName,
          target: specifier,
          edgeKind: importKind,
          message: `${layerName} must not use module "${specifier}" because it is the import form of forbidden global "${forbiddenGlobal}".`,
        },
        { layer: layerName, name: forbiddenGlobal, specifier, importKind }
      );
    };

    return {
      MemberExpression(node) {
        if (node.parent?.type === 'MemberExpression' && node.parent.object === node) return;
        const path = memberExpressionPath(node);
        if (!path || isLocallyBound(context, path.root, path.segments[0])) return;
        const explicitGlobalThis = path.segments[0] === 'globalThis';
        const normalized = explicitGlobalThis ? path.segments.slice(1) : path.segments;
        let match: string | undefined;
        for (let length = normalized.length; length >= (explicitGlobalThis ? 1 : 2); length -= 1) {
          const candidate = normalized.slice(0, length).join('.');
          if (globals!.has(candidate)) {
            match = candidate;
            break;
          }
        }
        if (match) report(node, match);
        else if (!scopeAware && globals!.has(path.segments[0])) {
          report(node, path.segments[0]);
        }
      },
      CallExpression(node) {
        const call = node as AstNode & {
          callee?: { type?: string; name?: string };
          arguments?: Array<{ type?: string; value?: unknown }>;
        };
        if (
          call.callee?.type === 'Identifier' &&
          call.callee.name === 'require' &&
          call.arguments?.[0]?.type === 'Literal' &&
          !isLocallyBound(context, node, 'require')
        ) {
          reportModule(node, call.arguments[0].value, false, 'require');
        }
        if (scopeAware) return;
        const callee = call.callee?.type === 'Identifier' ? call.callee.name : undefined;
        if (callee && globals!.has(callee)) report(node, callee);
      },
      ImportDeclaration(node) {
        const importNode = node as AstNode & {
          source?: { value?: unknown };
          importKind?: string;
          specifiers?: Array<{ importKind?: string; type?: string }>;
        };
        const named = (importNode.specifiers ?? []).filter(
          (specifier) => specifier.type === 'ImportSpecifier'
        );
        const allNamedTypeOnly =
          named.length > 0 &&
          named.length === (importNode.specifiers ?? []).length &&
          named.every((specifier) => specifier.importKind === 'type');
        reportModule(
          node,
          importNode.source?.value,
          importNode.importKind === 'type' || allNamedTypeOnly,
          'import'
        );
      },
      ImportExpression(node) {
        const importNode = node as AstNode & { source?: { type?: string; value?: unknown } };
        if (importNode.source?.type === 'Literal') {
          reportModule(node, importNode.source.value, false, 'dynamic-import');
        }
      },
      TSImportEqualsDeclaration(node) {
        const importNode = node as AstNode & {
          importKind?: string;
          isTypeOnly?: boolean;
          moduleReference?: { expression?: { value?: unknown } };
        };
        reportModule(
          node,
          importNode.moduleReference?.expression?.value,
          importNode.importKind === 'type' || importNode.isTypeOnly === true,
          'require'
        );
      },
      ExportNamedDeclaration(node) {
        const exportNode = node as AstNode & {
          source?: { value?: unknown };
          exportKind?: string;
          specifiers?: Array<{ exportKind?: string }>;
        };
        if (!exportNode.source) return;
        const specifiers = (exportNode.specifiers ?? []) as Array<{ exportKind?: string }>;
        const allTypeOnly =
          specifiers.length > 0 &&
          specifiers.every((specifier) => specifier.exportKind === 'type');
        reportModule(
          node,
          exportNode.source.value,
          exportNode.exportKind === 'type' || allTypeOnly,
          'export'
        );
      },
      ExportAllDeclaration(node) {
        const exportNode = node as AstNode & {
          source?: { value?: unknown };
          exportKind?: string;
        };
        reportModule(
          node,
          exportNode.source?.value,
          exportNode.exportKind === 'type',
          'export'
        );
      },
      NewExpression(node) {
        if (scopeAware) return;
        const callee = node.callee?.type === 'Identifier' ? node.callee.name : undefined;
        if (callee && globals!.has(callee)) report(node, callee);
      },
      Identifier(node) {
        if (
          !scopeAware ||
          !node.name ||
          !globals!.has(node.name) ||
          !isValueIdentifierReference(context, node) ||
          isLocallyBound(context, node, node.name)
        ) {
          return;
        }
        report(node, node.name);
      },
    };
  },
};

export const noDeniedCapabilities: ArkRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow importing modules whose effect capability the layer denies (ark.config.json capabilities.deny / pure — same wall surface as ark-check). Import dimension only: ambient globals stay with no-forbidden-globals and the CLI/hook symbol path.',
    },
    messages: {
      deniedCapability:
        '{{layer}} denies the {{capability}} capability (ark.config.json); "{{specifier}}" imports it. Define a port and bind the implementation in an adapter layer.',
    },
    schema: [],
  },
  create(context) {
    const filename = lintedFilename(context);
    const configPath = findConfigPath(filename);
    const config = configPath ? loadArkConfig(configPath) : null;
    const root = configPath ? path.dirname(configPath) : null;
    if (!config || !root || !filename) return {} as RuleListener;
    const absFile = path.isAbsolute(filename) ? filename : path.resolve(filename);
    const relFile = path.relative(root, absFile).split(path.sep).join('/');
    if (!sourceIsInAnalysisScope(config, relFile)) return {} as RuleListener;
    const layer = config.layers?.find(
      (l) => l.name === layerForRelativePath(relFile, config.layers)
    );
    if (!layer) return {} as RuleListener;
    const deny = new Set(effectiveCapabilityDeny(layer));
    if (deny.size === 0) return {} as RuleListener;

    const check = (
      node: AstNode,
      specifier: unknown,
      typeOnly: boolean,
      edgeKind: string
    ) => {
      if (typeOnly || typeof specifier !== 'string') return;
      if (forbiddenGlobalForModuleSpecifier(specifier, layer.forbiddenGlobals ?? [])) return;
      const capability = capabilityForModuleSpecifier(specifier);
      if (!capability || !deny.has(capability)) return;
      reportAdapterDiagnostic(
        context,
        node,
        'deniedCapability',
        {
          ruleId: 'CAPABILITY_VIOLATION',
          file: relFile,
          fromLayer: layer.name,
          target: specifier,
          capability,
          edgeKind,
          message: `${layer.name} denies the ${capability} capability; found import of "${specifier}".`,
        },
        { layer: layer.name, capability, specifier }
      );
    };

    return {
      ImportDeclaration(node) {
        const importNode = node as AstNode & {
          source?: { value?: unknown };
          importKind?: string;
          specifiers?: Array<{ importKind?: string; type?: string }>;
        };
        // Parity with the symbol path (isTypeOnlyReference): a braced list whose
        // named specifiers are ALL `type` is erased at runtime too.
        const named = (importNode.specifiers ?? []).filter(
          (s) => s.type === 'ImportSpecifier'
        );
        const allNamedTypeOnly =
          named.length > 0 &&
          named.length === (importNode.specifiers ?? []).length &&
          named.every((s) => s.importKind === 'type');
        check(
          node,
          importNode.source?.value,
          importNode.importKind === 'type' || allNamedTypeOnly,
          'import'
        );
      },
      ImportExpression(node) {
        const importNode = node as AstNode & { source?: { type?: string; value?: unknown } };
        if (importNode.source?.type === 'Literal') {
          check(node, importNode.source.value, false, 'dynamic-import');
        }
      },
      TSImportEqualsDeclaration(node) {
        const importNode = node as AstNode & {
          importKind?: string;
          isTypeOnly?: boolean;
          moduleReference?: { expression?: { value?: unknown } };
        };
        check(
          node,
          importNode.moduleReference?.expression?.value,
          importNode.importKind === 'type' || importNode.isTypeOnly === true,
          'require'
        );
      },
      ExportNamedDeclaration(node) {
        const exportNode = node as AstNode & {
          source?: { value?: unknown };
          exportKind?: string;
          specifiers?: Array<{ exportKind?: string; type?: string }>;
        };
        if (!exportNode.source) return;
        const specifiers = (exportNode.specifiers ?? []) as Array<{ exportKind?: string }>;
        const allTypeOnly =
          specifiers.length > 0 && specifiers.every((s) => s.exportKind === 'type');
        check(
          node,
          exportNode.source.value,
          exportNode.exportKind === 'type' || allTypeOnly,
          'export'
        );
      },
      ExportAllDeclaration(node) {
        const exportNode = node as AstNode & { source?: { value?: unknown }; exportKind?: string };
        check(node, exportNode.source?.value, exportNode.exportKind === 'type', 'export');
      },
      CallExpression(node) {
        const call = node as AstNode & {
          callee?: { type?: string; name?: string };
          arguments?: Array<{ type?: string; value?: unknown }>;
        };
        if (
          call.callee?.type === 'Identifier' &&
          call.callee.name === 'require' &&
          call.arguments?.[0]?.type === 'Literal' &&
          !isLocallyBound(context, node, 'require')
        ) {
          check(node, call.arguments[0].value, false, 'require');
        }
      },
    };
  },
};

const {
  noArkRunKernelInDomain,
  noArkRunDirectNew,
  noArkRunTransportBypass,
} = createArkRunEslintRules({
  findConfigPath,
  loadArkConfig,
  resolveImportSpecifier,
  lintedFilename,
  sourceIsInAnalysisScope,
  isLocallyBound,
  reportAdapterDiagnostic,
});

export { noArkRunKernelInDomain, noArkRunDirectNew, noArkRunTransportBypass };

function toProjectRelative(configPath: string, filename: string): string {
  const root = path.dirname(path.resolve(configPath));
  return path.relative(root, path.resolve(filename)).split(path.sep).join('/');
}

const {
  noArkOrderKernelInDomain,
  noArkOrderGenericUpdate,
} = createArkOrderEslintRules({
  findConfigPath,
  loadArkConfig,
  lintedFilename,
  sourceIsInAnalysisScope,
  reportAdapterDiagnostic,
  toProjectRelative,
});

export { noArkOrderKernelInDomain, noArkOrderGenericUpdate };

const rules = {
  'no-domain-infra-imports': noDomainInfraImports,
  'no-raw-event-publish': noRawEventPublish,
  'require-publish-source': requirePublishSource,
  'no-forbidden-globals': noForbiddenGlobals,
  'no-denied-capabilities': noDeniedCapabilities,
  'no-arkrun-kernel-in-domain': noArkRunKernelInDomain,
  'no-arkrun-direct-new': noArkRunDirectNew,
  'no-arkrun-transport-bypass': noArkRunTransportBypass,
  'no-arkorder-kernel-in-domain': noArkOrderKernelInDomain,
  'no-arkorder-generic-update': noArkOrderGenericUpdate,
};

const plugin: ArkEslintPlugin = { rules };

plugin.configs = {
  recommended: {
    plugins: { ark: plugin },
    rules: {
      'ark/no-domain-infra-imports': 'error',
      'ark/no-raw-event-publish': 'error',
      'ark/require-publish-source': 'error',
      'ark/no-forbidden-globals': 'error',
      'ark/no-denied-capabilities': 'error',
      'ark/no-arkrun-kernel-in-domain': 'error',
      'ark/no-arkrun-direct-new': 'error',
      'ark/no-arkrun-transport-bypass': 'error',
      'ark/no-arkorder-kernel-in-domain': 'error',
      'ark/no-arkorder-generic-update': 'error',
    },
  },
};

export { plugin };
export default plugin;
