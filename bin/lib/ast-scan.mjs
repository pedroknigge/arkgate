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
export function sourceFileExportsOnlyTypes(ts, sourceFile) {
  let sawTypeExport = false;
  const hasExportModifier = (node) =>
    Array.isArray(node.modifiers) &&
    node.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

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
      if (hasExportModifier(stmt)) sawTypeExport = true;
      continue;
    }
    // Any other top-level statement (const/fn/class/enum, console.log, if, …) is runtime.
    return false;
  }
  return sawTypeExport;
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
