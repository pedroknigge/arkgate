/**
 * ark/no-forbidden-globals — the layer's `forbiddenGlobals` purity surface in the editor.
 *
 * Same forms as ark-check: dotted access (`Date.now`), static bracket access
 * (`Date['now']`, `globalThis['fetch']`), destructuring from a global
 * (`const { now } = Date`), bare references, and the module import form of a global.
 */
import path from 'node:path';
import { forbiddenGlobalForModuleSpecifier } from '../domain/capabilities';
import {
  isLocallyBound,
  isValueIdentifierReference,
  memberExpressionPath,
  moduleSourceListeners,
  staticKeyName,
} from './astHelpers';
import { configForRule, findConfigPath, lintedFileInScope } from './contractLoad';
import {
  lintedFilename,
  reportAdapterDiagnostic,
  sourceCodeFor,
  type ArkRule,
  type AstNode,
  type RuleListener,
} from './ruleSupport';

/** Longest dotted candidate (at least `minLength` segments) that the layer forbids. */
function longestForbidden(
  globals: Set<string>,
  segments: string[],
  minLength: number
): string | undefined {
  for (let length = segments.length; length >= minLength; length -= 1) {
    const candidate = segments.slice(0, length).join('.');
    if (globals.has(candidate)) return candidate;
  }
  return undefined;
}

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
    const config = configForRule(configPath);
    const root = configPath ? path.dirname(configPath) : null;

    let globals: Set<string> | null = null;
    let layerName = 'this layer';

    if (config && root && filename) {
      const located = lintedFileInScope(config, root, filename);
      if (!located) return {} as RuleListener;
      const { layer } = located;
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
    const forbidden = globals;

    const scopeAware = typeof sourceCodeFor(context)?.getScope === 'function';
    const absFile = path.isAbsolute(filename) ? filename : path.resolve(filename);
    const reportFile = root ? path.relative(root, absFile).split(path.sep).join('/') : filename;

    const report = (node: AstNode, name: string) => {
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
      const forbiddenGlobal = forbiddenGlobalForModuleSpecifier(specifier, forbidden);
      if (!forbiddenGlobal) return;
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

    /** `const { now } = Date`, `const { now: n } = globalThis.Date`, nested patterns. */
    const checkPattern = (pattern: AstNode | undefined, base: string[]) => {
      if (pattern?.type !== 'ObjectPattern') return;
      for (const property of pattern.properties ?? []) {
        if (property.type === 'RestElement') continue;
        const key = staticKeyName(property.key, property.computed);
        if (!key) continue;
        const segments = [...base, key];
        const match = longestForbidden(forbidden, segments, base.length + 1);
        if (match) {
          report(property, match);
          continue;
        }
        const value = property.value as AstNode | undefined;
        const nested = value?.type === 'AssignmentPattern' ? value.left : value;
        checkPattern(nested, segments);
      }
    };

    const checkDestructure = (pattern: AstNode | undefined, init: AstNode | undefined) => {
      if (pattern?.type !== 'ObjectPattern') return;
      const initPath = memberExpressionPath(init);
      if (!initPath || isLocallyBound(context, initPath.root, initPath.segments[0]!)) return;
      const base =
        initPath.segments[0] === 'globalThis' ? initPath.segments.slice(1) : initPath.segments;
      checkPattern(pattern, base);
    };

    const moduleListeners = moduleSourceListeners(context, reportModule);

    return {
      MemberExpression(node) {
        if (node.parent?.type === 'MemberExpression' && node.parent.object === node) return;
        const memberPath = memberExpressionPath(node);
        if (!memberPath || isLocallyBound(context, memberPath.root, memberPath.segments[0]!)) {
          return;
        }
        const explicitGlobalThis = memberPath.segments[0] === 'globalThis';
        const normalized = explicitGlobalThis ? memberPath.segments.slice(1) : memberPath.segments;
        const match = longestForbidden(forbidden, normalized, explicitGlobalThis ? 1 : 2);
        if (match) report(node, match);
        else if (!scopeAware && forbidden.has(memberPath.segments[0]!)) {
          report(node, memberPath.segments[0]!);
        }
      },
      VariableDeclarator(node) {
        checkDestructure(node.id, node.init);
      },
      AssignmentExpression(node) {
        checkDestructure(node.left, (node as AstNode & { right?: AstNode }).right);
      },
      CallExpression(node) {
        moduleListeners.CallExpression(node);
        if (scopeAware) return;
        const callee = node.callee?.type === 'Identifier' ? node.callee.name : undefined;
        if (callee && forbidden.has(callee)) report(node, callee);
      },
      ImportDeclaration: moduleListeners.ImportDeclaration,
      ImportExpression: moduleListeners.ImportExpression,
      TSImportEqualsDeclaration: moduleListeners.TSImportEqualsDeclaration,
      ExportNamedDeclaration: moduleListeners.ExportNamedDeclaration,
      ExportAllDeclaration: moduleListeners.ExportAllDeclaration,
      NewExpression(node) {
        if (scopeAware) return;
        const callee = node.callee?.type === 'Identifier' ? node.callee.name : undefined;
        if (callee && forbidden.has(callee)) report(node, callee);
      },
      Identifier(node) {
        if (
          !scopeAware ||
          !node.name ||
          !forbidden.has(node.name) ||
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
