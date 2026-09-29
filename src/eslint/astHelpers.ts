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
