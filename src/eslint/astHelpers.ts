/**
 * ESTree helpers shared by the ESLint adapter rules (no project I/O).
 */
import { sourceCodeFor, type AstNode, type RuleContext, type ScopeReference } from './ruleSupport';

export function stringValue(node: AstNode | undefined): string | undefined {
  return typeof node?.value === 'string' ? node.value : undefined;
}

/** String literal or substitution-free template literal text. */
export function staticStringValue(node: AstNode | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === 'TemplateLiteral') {
    if ((node.expressions?.length ?? 0) > 0 || node.quasis?.length !== 1) return undefined;
    const cooked = node.quasis[0]?.value?.cooked;
    return typeof cooked === 'string' ? cooked : undefined;
  }
  return stringValue(node);
}

export function propertyName(node: AstNode | undefined): string | undefined {
  return node?.name ?? stringValue(node);
}

/** Key text of a (possibly computed) member/property key; undefined for dynamic keys. */
export function staticKeyName(key: AstNode | undefined, computed: boolean | undefined): string | undefined {
  if (!computed) return propertyName(key);
  return staticStringValue(key);
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

export function isLocallyBound(context: RuleContext, node: AstNode, name: string): boolean {
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

export function isValueIdentifierReference(context: RuleContext, node: AstNode): boolean {
  const reference = referenceFor(context, node);
  if (reference) return reference.isValueReference !== false;
  return node.parent?.type === 'VariableDeclarator' && node.parent.init === node;
}

/**
 * Dotted path of an identifier / member chain. Computed members count only with a static
 * string key (`Date['now']`, ``Math[`random`]``); dynamic keys (`Date[k]`) return undefined.
 */
export function memberExpressionPath(
  node: AstNode | undefined
): { root: AstNode; segments: string[] } | undefined {
  if (node?.type === 'Identifier' && node.name) {
    return { root: node, segments: [node.name] };
  }
  if (!node) return undefined;
  if (node.type === 'ChainExpression' || node.type === 'TSNonNullExpression') {
    return memberExpressionPath(node.expression);
  }
  const memberLike = node.type === 'MemberExpression' || Boolean(node.object && node.property);
  if (!memberLike) return undefined;
  const base = memberExpressionPath(node.object);
  const property = staticKeyName(node.property, node.computed);
  if (!base || !property) return undefined;
  return { root: base.root, segments: [...base.segments, property] };
}

export function declarationIsTypeOnly(node: AstNode): boolean {
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

/** How a module specifier reaches the linted file. */
export type ModuleSourceKind = 'import' | 'export' | 'dynamic-import' | 'require';

/**
 * Receives each static module source the file names: its specifier (not yet
 * checked to be a string), whether the edge is erased at runtime, and its kind.
 */
export type ModuleSourceCheck = (
  node: AstNode,
  specifier: unknown,
  typeOnly: boolean,
  kind: ModuleSourceKind
) => void;

type ModuleSourceListeners = Record<
  | 'ImportDeclaration'
  | 'ImportExpression'
  | 'TSImportEqualsDeclaration'
  | 'ExportNamedDeclaration'
  | 'ExportAllDeclaration'
  | 'CallExpression',
  (node: AstNode) => void
>;

/**
 * Listeners that hand every static module source to `check`: import / export
 * declarations, `import x = require()`, literal `import()`, and literal
 * `require()` when `require` is not locally bound. A braced import list whose
 * named specifiers are ALL `type` counts as type-only (parity with the symbol
 * path: it is erased at runtime too).
 */
export function moduleSourceListeners(
  context: RuleContext,
  check: ModuleSourceCheck,
  isBound: (context: RuleContext, node: AstNode, name: string) => boolean = isLocallyBound
): ModuleSourceListeners {
  return {
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
        specifiers?: Array<{ exportKind?: string }>;
      };
      if (!exportNode.source) return;
      const specifiers = exportNode.specifiers ?? [];
      const allTypeOnly =
        specifiers.length > 0 && specifiers.every((specifier) => specifier.exportKind === 'type');
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
        !isBound(context, node, 'require')
      ) {
        check(node, call.arguments[0].value, false, 'require');
      }
    },
  };
}
