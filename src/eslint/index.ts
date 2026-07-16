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
} from '../domain/layerMatch';
import { capabilityForModuleSpecifier, effectiveCapabilityDeny } from '../domain/capabilities';
import { parseArkConfigJson, type ArkConfig } from '../domain/configContract';
import {
  toAdapterDiagnostic,
  type AdapterDiagnostic,
  type AdapterViolationInput,
} from '../domain/adapterContract';
import {
  classifyPublishFacts,
} from '../domain/sourcePolicy';

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
  importKind?: string;
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

const _configCache = new Map<string, ArkConfig | null>();

export function loadArkConfig(configPath: string): ArkConfig | null {
  if (_configCache.has(configPath)) return _configCache.get(configPath) ?? null;
  if (!fs.existsSync(configPath)) return null;
  const config = parseArkConfigJson(fs.readFileSync(configPath, 'utf8'), configPath).config;
  _configCache.set(configPath, config);
  return config;
}

/** Resolve relative import specifier to an absolute path candidate (TS-oriented). */
export function resolveRelativeImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
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
  // Prefer .ts for layer matching when the target is not on disk yet (editor typing).
  return `${base}.ts`;
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
        const fromLayer = layerForRelativePath(relFile, config.layers);
        if (!fromLayer) return;

        const targetAbs = resolveRelativeImport(absFile, source);
        if (!targetAbs) return; // package import — CI resolves via TS; editor skips non-relative

        const relTarget = path.relative(root, targetAbs).split(path.sep).join('/');
        // Outside project or up-and-out: skip
        if (relTarget.startsWith('..')) return;

        const toLayer = layerForRelativePath(relTarget, config.layers);
        if (!toLayer) return;
        if (
          isEdgeDenied(config.rules, fromLayer, toLayer, {
            fromPath: relFile,
            toPath: relTarget,
            layers: config.layers,
          })
        ) {
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
              ...(node.importKind === 'type' ? { typeOnly: true } : {}),
              message: `${fromLayer} must not import ${toLayer}.`,
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
        'Disallow ambient globals from the layer’s forbiddenGlobals in ark.config.json (same purity surface as ark-check). Option `globals` explicitly overrides.',
    },
    messages: {
      forbiddenGlobal:
        'Ambient global "{{name}}" is forbidden in {{layer}} (ark.config.json); inject the capability through a port instead.',
      forbiddenGlobalDefault:
        'Ambient global "{{name}}" is forbidden here; inject the capability through a port instead.',
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

    if (option?.globals) {
      globals = new Set(option.globals);
    } else if (config && root && filename) {
      const absFile = path.isAbsolute(filename) ? filename : path.resolve(filename);
      const relFile = path.relative(root, absFile).split(path.sep).join('/');
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
        if (scopeAware) return;
        const callee = node.callee?.type === 'Identifier' ? node.callee.name : undefined;
        if (callee && globals!.has(callee)) report(node, callee);
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
    const layer = config.layers?.find(
      (l) => l.name === layerForRelativePath(relFile, config.layers)
    );
    if (!layer) return {} as RuleListener;
    const deny = new Set(effectiveCapabilityDeny(layer));
    if (deny.size === 0) return {} as RuleListener;

    const check = (node: AstNode, specifier: unknown, typeOnly: boolean) => {
      if (typeOnly || typeof specifier !== 'string') return;
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
          importNode.importKind === 'type' || allNamedTypeOnly
        );
      },
      ImportExpression(node) {
        const importNode = node as AstNode & { source?: { type?: string; value?: unknown } };
        if (importNode.source?.type === 'Literal') check(node, importNode.source.value, false);
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
        check(node, exportNode.source.value, exportNode.exportKind === 'type' || allTypeOnly);
      },
      ExportAllDeclaration(node) {
        const exportNode = node as AstNode & { source?: { value?: unknown }; exportKind?: string };
        check(node, exportNode.source?.value, exportNode.exportKind === 'type');
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
          check(node, call.arguments[0].value, false);
        }
      },
    };
  },
};

const rules = {
  'no-domain-infra-imports': noDomainInfraImports,
  'no-raw-event-publish': noRawEventPublish,
  'require-publish-source': requirePublishSource,
  'no-forbidden-globals': noForbiddenGlobals,
  'no-denied-capabilities': noDeniedCapabilities,
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
    },
  },
};

export { plugin };
export default plugin;
