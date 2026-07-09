/**
 * AST helpers for publish checks, type-only edges, and module specifiers.
 * Extracted from ark-check entry (R3).
 */
import { looksLikeIntent } from '../ark-shared.mjs';

export function lineOf(sourceFile, pos) {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

export function textOfModuleSpecifier(node) {
  return node.moduleSpecifier && typeof node.moduleSpecifier.text === 'string'
    ? node.moduleSpecifier.text
    : undefined;
}

// True when an import/export edge carries ONLY types (`import type …`, or a named import
// where every binding is `type`-qualified). Type-only edges are erased at compile time —
// they create no runtime coupling, only a design/type-placement dependency — so callers can
// rank them below real value imports in a burn-down. A side-effect import (`import "x"`) or
// any default/namespace/value binding is NOT type-only.
export function isTypeOnlyModuleReference(ts, node) {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (!clause) return false; // side-effect import — runtime edge
    if (clause.isTypeOnly) return true; // `import type …`
    const named = clause.namedBindings;
    if (named && ts.isNamedImports(named) && named.elements.length > 0) {
      return named.elements.every((element) => element.isTypeOnly);
    }
    return false; // default or namespace binding of a value
  }
  if (ts.isExportDeclaration(node)) {
    if (node.isTypeOnly) return true;
    const clause = node.exportClause;
    if (clause && ts.isNamedExports(clause) && clause.elements.length > 0) {
      return clause.elements.every((element) => element.isTypeOnly);
    }
    return false;
  }
  return false;
}

/**
 * True when a module is a pure type-surface file: only type/interface exports and
 * type-only imports. Conservative false (→ judgment) when:
 * - any top-level runtime statement (value decls, expression stmts, side-effect imports)
 * - ambiguous `export { X }` without type keyword, export *, default/export=
 * Used so static value-syntax `import { T }` of a pure-type module can be mechanical-safe
 * (convert to `import type`). Never trust this for require()/import() edges.
 */
function hasExportModifier(ts, node) {
  return (
    Array.isArray(node.modifiers) &&
    node.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}

export function sourceFileExportsOnlyTypes(ts, sourceFile) {
  let sawTypeExport = false;

  for (const stmt of sourceFile.statements) {
    // Type-only imports OK; value or side-effect imports mean runtime load of deps.
    if (ts.isImportDeclaration(stmt)) {
      if (!isTypeOnlyModuleReference(ts, stmt)) return false;
      continue;
    }
    if (typeof ts.isImportEqualsDeclaration === 'function' && ts.isImportEqualsDeclaration(stmt)) {
      return false;
    }
    if (ts.isExportDeclaration(stmt)) {
      if (stmt.isTypeOnly) {
        sawTypeExport = true;
        continue;
      }
      // export * from '…' can re-export values — not provably type-only.
      if (!stmt.exportClause) return false;
      if (ts.isNamespaceExport(stmt.exportClause)) return false;
      if (ts.isNamedExports(stmt.exportClause)) {
        if (stmt.exportClause.elements.length === 0) return false;
        for (const el of stmt.exportClause.elements) {
          if (!el.isTypeOnly) return false; // bare `export { X }` — ambiguous without checker
        }
        sawTypeExport = true;
        continue;
      }
      return false;
    }
    if (ts.isExportAssignment(stmt)) return false; // export = / export default expr
    if (ts.isTypeAliasDeclaration(stmt) || ts.isInterfaceDeclaration(stmt)) {
      if (hasExportModifier(ts, stmt)) sawTypeExport = true;
      continue;
    }
    // Any other top-level statement (const/fn/class/enum, console.log, if, …) is runtime.
    return false;
  }
  return sawTypeExport;
}

/**
 * Names that exist in the *value* export space of this module (runtime bindings).
 * Used to subtract dual-space names (e.g. `export type Foo` + `export const Foo`) from
 * type-only export sets so converting `import { Foo }` to `import type` never drops a
 * runtime binding.
 */
function collectBindingIdentifiers(ts, nameNode, into) {
  if (!nameNode) return;
  if (ts.isIdentifier(nameNode)) {
    into.add(nameNode.text);
    return;
  }
  if (ts.isObjectBindingPattern(nameNode) || ts.isArrayBindingPattern(nameNode)) {
    for (const el of nameNode.elements) {
      if (ts.isOmittedExpression(el)) continue;
      if (ts.isBindingElement(el)) collectBindingIdentifiers(ts, el.name, into);
    }
  }
}

export function valueExportNames(ts, sourceFile) {
  const names = new Set();
  const add = (n) => {
    if (n) names.add(n);
  };
  for (const stmt of sourceFile.statements) {
    // export const/let/var Foo = …
    if (ts.isVariableStatement(stmt) && hasExportModifier(ts, stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        collectBindingIdentifiers(ts, decl.name, names);
      }
      continue;
    }
    // export function Foo / export async function Foo
    if (ts.isFunctionDeclaration(stmt) && hasExportModifier(ts, stmt) && stmt.name) {
      add(stmt.name.text);
      continue;
    }
    // export class Foo — value + type space; treat as value so never auto import-type
    if (ts.isClassDeclaration(stmt) && hasExportModifier(ts, stmt) && stmt.name) {
      add(stmt.name.text);
      continue;
    }
    // export enum Foo — value + type
    if (ts.isEnumDeclaration(stmt) && hasExportModifier(ts, stmt) && stmt.name) {
      add(stmt.name.text);
      continue;
    }
    // export namespace Foo — value + type
    if (ts.isModuleDeclaration(stmt) && hasExportModifier(ts, stmt) && stmt.name && ts.isIdentifier(stmt.name)) {
      add(stmt.name.text);
      continue;
    }
    if (!ts.isExportDeclaration(stmt)) continue;
    // export * from '…' — unknown value surface; cannot prove type-only names alone
    if (!stmt.exportClause) {
      // star re-export can introduce values; flag as opaque by adding a sentinel? callers
      // only check named bindings against explicit type-only sets — leave empty for star.
      continue;
    }
    if (ts.isNamespaceExport(stmt.exportClause)) continue;
    if (!ts.isNamedExports(stmt.exportClause)) continue;
    // bare `export { Foo }` / `export { Foo } from '…'` without type keyword — value (or dual)
    if (!stmt.isTypeOnly) {
      for (const el of stmt.exportClause.elements) {
        if (el.isTypeOnly) continue;
        const local = el.propertyName && 'text' in el.propertyName ? el.propertyName.text : el.name?.text;
        add(local);
      }
    }
  }
  return names;
}

/**
 * True when an expression may run runtime work if the module is evaluated.
 * Conservative: any call/new/await/tagged-template (or nested) is impure.
 * Literals, identifiers, pure object/array/as/parenthesized trees are pure.
 */
export function expressionMayHaveSideEffects(ts, expr) {
  if (!expr) return false;
  if (
    ts.isCallExpression(expr) ||
    ts.isNewExpression(expr) ||
    ts.isAwaitExpression(expr) ||
    ts.isTaggedTemplateExpression(expr) ||
    ts.isYieldExpression?.(expr)
  ) {
    return true;
  }
  // Walk children; short-circuit on first impure.
  let impure = false;
  const visit = (node) => {
    if (impure) return;
    if (
      ts.isCallExpression(node) ||
      ts.isNewExpression(node) ||
      ts.isAwaitExpression(node) ||
      ts.isTaggedTemplateExpression(node) ||
      (typeof ts.isYieldExpression === 'function' && ts.isYieldExpression(node))
    ) {
      impure = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(expr, visit);
  return impure;
}

/**
 * True when evaluating this module may run non-trivial top-level work.
 * Covers: expression statements, bare side-effect imports, control-flow,
 * any top-level var initializer that call/new/await (exported or not),
 * export-default impure expr, and class static field calls (export-agnostic).
 * Converting `import { Type }` → `import type` would skip those effects — not auto-safe.
 */
export function sourceFileHasTopLevelSideEffects(ts, sourceFile) {
  for (const stmt of sourceFile.statements) {
    if (ts.isExpressionStatement(stmt)) return true;
    if (ts.isImportDeclaration(stmt) && !stmt.importClause) return true; // import './x'
    if (
      ts.isIfStatement(stmt) ||
      ts.isForStatement(stmt) ||
      ts.isForInStatement(stmt) ||
      ts.isForOfStatement(stmt) ||
      ts.isWhileStatement(stmt) ||
      ts.isDoStatement(stmt) ||
      ts.isSwitchStatement(stmt) ||
      ts.isTryStatement(stmt) ||
      ts.isThrowStatement(stmt) ||
      ts.isWithStatement?.(stmt)
    ) {
      return true;
    }
    // Top-level const/let/var x = <maybe impure> — including non-exported.
    // `const db = connect(); export type Row = …` still runs connect on module load;
    // converting `import { Row }` → `import type` would skip that work (R6 honesty).
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (decl.initializer && expressionMayHaveSideEffects(ts, decl.initializer)) return true;
      }
    }
    // export default <expr>
    if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) {
      if (stmt.expression && expressionMayHaveSideEffects(ts, stmt.expression)) return true;
    }
    // Class with static field initializers that call — class body evaluates at load
    // whether or not the class is exported.
    if (ts.isClassDeclaration(stmt)) {
      for (const member of stmt.members ?? []) {
        if (
          ts.isPropertyDeclaration(member) &&
          member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) &&
          member.initializer &&
          expressionMayHaveSideEffects(ts, member.initializer)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Names that are provably type-only exports of this module (erased at runtime).
 * Conservative: class/enum/namespace/const/function exports are excluded even when they
 * also introduce a type. Dual-space names (`export type Foo` + `export const Foo`) are
 * subtracted — converting those to `import type` would drop a runtime binding.
 * Used so `import { Row }` of a type alias from a mixed module can be mechanical-safe.
 */
export function typeOnlyExportNames(ts, sourceFile) {
  const names = new Set();
  for (const stmt of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(stmt) || ts.isInterfaceDeclaration(stmt)) {
      if (hasExportModifier(ts, stmt) && stmt.name) names.add(stmt.name.text);
      continue;
    }
    if (!ts.isExportDeclaration(stmt)) continue;
    const clause = stmt.exportClause;
    if (!clause || !ts.isNamedExports(clause)) continue;
    for (const el of clause.elements) {
      // `export type { X }` or `export { type X }` — type-only re-exports.
      if (stmt.isTypeOnly || el.isTypeOnly) {
        const local = el.propertyName && 'text' in el.propertyName ? el.propertyName.text : el.name?.text;
        if (local) names.add(local);
      }
    }
  }
  // Subtract any name that also has a value export (dual-space / value re-export).
  const values = valueExportNames(ts, sourceFile);
  for (const v of values) names.delete(v);
  return [...names];
}

/**
 * Local names of named import/export bindings on a module edge, or null when the edge
 * is not a pure named list (default import, namespace, side-effect, export *, export =).
 * PropertyName is preferred so `import { Row as R }` still checks target export `Row`.
 */
export function namedModuleBindings(ts, node) {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (!clause) return null; // side-effect
    if (clause.name) return null; // default import (possibly with named — still not pure-named-only)
    const named = clause.namedBindings;
    if (!named || !ts.isNamedImports(named) || named.elements.length === 0) return null;
    return named.elements.map((el) => {
      const prop = el.propertyName && 'text' in el.propertyName ? el.propertyName.text : null;
      return prop || el.name.text;
    });
  }
  if (ts.isExportDeclaration(node)) {
    const clause = node.exportClause;
    if (!clause || !ts.isNamedExports(clause) || clause.elements.length === 0) return null;
    return clause.elements.map((el) => {
      const prop = el.propertyName && 'text' in el.propertyName ? el.propertyName.text : null;
      return prop || el.name.text;
    });
  }
  return null;
}

export function propertyName(ts, node) {
  if (!node) return undefined;
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return undefined;
}

export function objectProperty(ts, node, name) {
  if (!node || !ts.isObjectLiteralExpression(node)) return undefined;
  return node.properties.find((property) => {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
      return false;
    }
    return propertyName(ts, property.name) === name;
  });
}

export function objectHasProperty(ts, node, name) {
  return objectProperty(ts, node, name) !== undefined;
}

export function objectPropertyValue(ts, node, name) {
  const property = objectProperty(ts, node, name);
  return property && ts.isPropertyAssignment(property)
    ? property.initializer
    : undefined;
}

export function objectHasMetadataSource(ts, node) {
  const metadata = objectPropertyValue(ts, node, 'metadata');
  return objectHasProperty(ts, metadata, 'source');
}

export function stringLiteralText(ts, node) {
  return node && ts.isStringLiteralLike(node) ? node.text : undefined;
}

export function isPublishCall(ts, node) {
  if (!ts.isCallExpression(node)) return false;
  const expression = node.expression;
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text === 'publish';
  }
  return ts.isIdentifier(expression) && expression.text === 'publish';
}

export function looksLikeIntentCreatorExpression(ts, node) {
  if (!node) return false;
  if (ts.isIdentifier(node)) {
    return /^[A-Z]/.test(node.text);
  }
  if (ts.isPropertyAccessExpression(node)) {
    return looksLikeIntentCreatorExpression(ts, node.name);
  }
  return false;
}

export function isArkPublishCandidate(ts, node) {
  if (!ts.isCallExpression(node)) return false;
  const firstArg = node.arguments[0];
  const rawIntent = stringLiteralText(ts, firstArg);
  return (
    (rawIntent !== undefined && looksLikeIntent(rawIntent)) ||
    objectHasProperty(ts, firstArg, 'intent') ||
    looksLikeIntentCreatorExpression(ts, firstArg)
  );
}

export function publishSourceLiteral(ts, node) {
  if (!ts.isCallExpression(node)) return undefined;
  const [firstArg, secondArg, thirdArg] = node.arguments;
  const rawMetadata = objectPropertyValue(ts, firstArg, 'metadata');
  return (
    stringLiteralText(ts, objectPropertyValue(ts, rawMetadata, 'source')) ??
    stringLiteralText(ts, objectPropertyValue(ts, secondArg, 'source')) ??
    stringLiteralText(ts, objectPropertyValue(ts, thirdArg, 'source'))
  );
}

export function publishHasSource(ts, node) {
  if (!ts.isCallExpression(node)) return false;
  const [firstArg, secondArg, thirdArg] = node.arguments;
  return (
    objectHasMetadataSource(ts, firstArg) ||
    objectHasProperty(ts, secondArg, 'source') ||
    objectHasProperty(ts, thirdArg, 'source')
  );
}
export function moduleSpecifierFromCall(ts, node) {
  if (!ts.isCallExpression(node)) return undefined;

  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const first = node.arguments[0];
    const value = stringLiteralText(ts, first);
    return value ? { value, kind: 'dynamic-import' } : undefined;
  }

  if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
    const first = node.arguments[0];
    const value = stringLiteralText(ts, first);
    return value ? { value, kind: 'require' } : undefined;
  }

  return undefined;
}
