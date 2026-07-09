/**
 * arkgate/eslint — editor-side architecture gate.
 *
 * Layer / import / forbidden-globals rules load `ark.config.json` from the linted
 * project (walk-up from the file) and use the same glob specificity + edge semantics
 * as ark-check. Tooling layer: pure Node + local helpers only (no Kernel imports).
 */
import fs from 'node:fs';
import path from 'node:path';

type RuleContext = {
  report(descriptor: Record<string, unknown>): void;
  getFilename?: () => string;
  options?: unknown[];
};

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
};

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

type LayerConfig = {
  name: string;
  patterns?: string[];
  exclude?: string[];
  forbiddenGlobals?: string[];
};

type EdgeRule = { from: string; to: string; allowed?: boolean };

type ArkConfig = {
  layers?: LayerConfig[];
  rules?: EdgeRule[];
};

// ── Pure helpers (mirror bin/ark-shared.mjs layer matching; no CLI imports) ──

const _regexpCache = new Map<string, RegExp>();

function bracesBalanced(glob: string): boolean {
  let depth = 0;
  for (let i = 0; i < glob.length; i += 1) {
    if (glob[i] === '\\' && i + 1 < glob.length) {
      i += 1;
      continue;
    }
    if (glob[i] === '{') depth += 1;
    else if (glob[i] === '}') {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

function escapeLiteral(c: string): string {
  return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Same glob → RegExp semantics as ark-check / ark-shared.mjs. */
export function globToRegExp(pattern: string): RegExp {
  const cached = _regexpCache.get(pattern);
  if (cached) return cached;
  const glob = pattern.split(path.sep).join('/');
  const useBraces = bracesBalanced(glob);
  let out = '';
  let braceDepth = 0;
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '\\' && i + 1 < glob.length) {
      out += escapeLiteral(glob[i + 1]);
      i += 1;
    } else if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else if (c === '{' && useBraces) {
      out += '(?:';
      braceDepth += 1;
    } else if (c === '}' && useBraces && braceDepth > 0) {
      out += ')';
      braceDepth -= 1;
    } else if (c === ',' && useBraces && braceDepth > 0) {
      out += '|';
    } else {
      out += escapeLiteral(c);
    }
  }
  const re = new RegExp(`^${out}$`);
  _regexpCache.set(pattern, re);
  return re;
}

export function patternSpecificity(pattern: string): number {
  const glob = String(pattern).split(path.sep).join('/');
  const beforeWildcard = glob.split('*')[0];
  const literalSegments = beforeWildcard.split('/').filter(Boolean).length;
  const literalLength = glob.replace(/\*/g, '').length;
  return literalSegments * 10000 + literalLength;
}

/** Same file→layer resolution as ark-check (most-specific pattern wins; exclude honored). */
export function layerForRelativePath(relPath: string, layers: LayerConfig[] | undefined): string | undefined {
  const rel = relPath.split(path.sep).join('/');
  let bestName: string | undefined;
  let bestScore = -1;
  for (const layer of layers ?? []) {
    if ((layer.exclude ?? []).some((pattern) => globToRegExp(pattern).test(rel))) {
      continue;
    }
    for (const pattern of layer.patterns ?? []) {
      if (globToRegExp(pattern).test(rel)) {
        const score = patternSpecificity(pattern);
        if (score > bestScore) {
          bestScore = score;
          bestName = layer.name;
        }
      }
    }
  }
  return bestName;
}

export function isEdgeDenied(rules: EdgeRule[] | undefined, from: string, to: string): boolean {
  if (from === to) return false;
  const hit = (rules ?? []).find((r) => r.from === from && r.to === to);
  return hit?.allowed === false;
}

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
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as ArkConfig;
    _configCache.set(configPath, raw);
    return raw;
  } catch {
    _configCache.set(configPath, null);
    return null;
  }
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

function looksLikeIntent(value: string): boolean {
  return /^(Domain|Application|Adapter|Workflow|Job|Presentation|Reporting|Metadata|Security|Audit|Observability|Kernel)\.[A-Za-z0-9_.]+$/.test(
    value
  );
}

function isPublishCall(node: AstNode): boolean {
  return calleePropertyName(node) === 'publish';
}

/** Heuristic fallback when no ark.config.json (pre-contract projects). */
function isDomainFileHeuristic(filename: string): boolean {
  const normalized = filename.split('\\').join('/').toLowerCase();
  return normalized.includes('/domain/') || normalized.endsWith('/domain.ts');
}

function isInfraImportHeuristic(specifier: string): boolean {
  const normalized = specifier.toLowerCase();
  return [
    'adapter',
    'adapters',
    'infrastructure',
    'persistence',
    'repository',
    'repositories',
    'integration',
    'database',
    'db',
  ].some((token) => normalized.includes(token));
}

const DEFAULT_FORBIDDEN_GLOBALS = ['fetch', 'process', 'Date.now', 'Math.random'];

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
        'Disallow imports that violate ark.config.json layer rules (same contract as arkgate-check). Falls back to domain→infra path heuristics when no config is found.',
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
    const filename = context.getFilename?.() ?? '';
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
        if (isEdgeDenied(config.rules, fromLayer, toLayer)) {
          context.report({
            node,
            messageId: 'forbiddenImport',
            data: { fromLayer, toLayer, specifier: source },
          });
        }
        return;
      }

      // No contract: legacy heuristic so bare domain folders still get a signal.
      if (isDomainFileHeuristic(filename) && isInfraImportHeuristic(source)) {
        context.report({ node, messageId: 'forbiddenImportHeuristic' });
      }
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
        if (!isPublishCall(node)) return;
        const firstArg = node.arguments?.[0];
        const firstValue = stringValue(firstArg);
        if ((firstValue && looksLikeIntent(firstValue)) || objectHasProperty(firstArg, 'intent')) {
          context.report({ node, messageId: 'rawPublish' });
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
        if (!isPublishCall(node)) return;
        const firstArg = node.arguments?.[0];
        const metadataArg = node.arguments?.[2];
        if (objectHasMetadataSource(firstArg) || objectHasProperty(metadataArg, 'source')) {
          return;
        }
        context.report({ node, messageId: 'missingSource' });
      },
    };
  },
};

export const noForbiddenGlobals: ArkRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow ambient globals from the layer’s forbiddenGlobals in ark.config.json (same purity surface as arkgate-check). Option `globals` overrides. Without config, defaults apply only on domain-like paths.',
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
    const filename = context.getFilename?.() ?? '';
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
    } else if (isDomainFileHeuristic(filename)) {
      globals = new Set(DEFAULT_FORBIDDEN_GLOBALS);
    }

    if (!globals) {
      return {} as RuleListener;
    }

    const report = (node: AstNode, name: string) =>
      context.report({
        node,
        messageId: config ? 'forbiddenGlobal' : 'forbiddenGlobalDefault',
        data: { name, layer: layerName },
      });

    return {
      MemberExpression(node) {
        const base = node.object?.type === 'Identifier' ? node.object.name : undefined;
        if (!base) return;
        const dotted = `${base}.${propertyName(node.property) ?? ''}`;
        if (globals!.has(dotted)) report(node, dotted);
        else if (globals!.has(base)) report(node, base);
      },
      CallExpression(node) {
        const callee = node.callee?.type === 'Identifier' ? node.callee.name : undefined;
        if (callee && globals!.has(callee)) report(node, callee);
      },
      NewExpression(node) {
        const callee = node.callee?.type === 'Identifier' ? node.callee.name : undefined;
        if (callee && globals!.has(callee)) report(node, callee);
      },
    };
  },
};

const rules = {
  'no-domain-infra-imports': noDomainInfraImports,
  'no-raw-event-publish': noRawEventPublish,
  'require-publish-source': requirePublishSource,
  'no-forbidden-globals': noForbiddenGlobals,
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
    },
  },
};

export { plugin };
export default plugin;
