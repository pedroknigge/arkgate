export type SemanticDependencyKind = 'import' | 'export' | 'dynamic-import' | 'require';

export type SemanticDependency = {
  specifier?: string;
  kind: SemanticDependencyKind;
  line: number;
  typeOnly: boolean;
  unresolved: boolean;
  node: unknown;
};

export type ForbiddenCapabilityUse = {
  name: string;
  line: number;
  node: unknown;
};

function literalText(ts: any, node: any): string | undefined {
  return node && ts.isStringLiteralLike(node) ? node.text : undefined;
}

function lineOf(sourceFile: any, node: any): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function isTypeOnlyReference(ts: any, node: any): boolean {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (!clause) return false;
    if (clause.isTypeOnly) return true;
    const named = clause.namedBindings;
    return Boolean(
      named &&
        ts.isNamedImports(named) &&
        named.elements.length > 0 &&
        named.elements.every((element: any) => element.isTypeOnly)
    );
  }
  if (ts.isExportDeclaration(node)) {
    if (node.isTypeOnly) return true;
    const clause = node.exportClause;
    return Boolean(
      clause &&
        ts.isNamedExports(clause) &&
        clause.elements.length > 0 &&
        clause.elements.every((element: any) => element.isTypeOnly)
    );
  }
  return false;
}

function singleFileChecker(ts: any, sourceFile: any): any {
  const options = { noLib: true, noResolve: true, target: ts.ScriptTarget.Latest };
  const host = ts.createCompilerHost(options, true);
  host.getSourceFile = (fileName: string) =>
    fileName === sourceFile.fileName ? sourceFile : undefined;
  host.fileExists = (fileName: string) => fileName === sourceFile.fileName;
  host.readFile = (fileName: string) =>
    fileName === sourceFile.fileName ? sourceFile.text : undefined;
  return ts.createProgram([sourceFile.fileName], options, host).getTypeChecker();
}

function symbolAt(checker: any, node: any): any {
  try {
    return checker.getSymbolAtLocation(node);
  } catch {
    return undefined;
  }
}

function localDeclaration(ts: any, checker: any, sourceFile: any, node: any): boolean {
  const shorthand =
    node.parent &&
    ts.isShorthandPropertyAssignment(node.parent) &&
    node.parent.name === node;
  let symbol;
  try {
    symbol = shorthand
      ? checker.getShorthandAssignmentValueSymbol(node.parent)
      : symbolAt(checker, node);
  } catch {
    symbol = undefined;
  }
  return Boolean(
    symbol?.declarations?.some(
      (declaration: any) => declaration.getSourceFile().fileName === sourceFile.fileName
    )
  );
}

/** Extract every dependency form whose specifier is statically knowable, plus unresolved calls. */
export function extractSemanticDependencies(
  ts: any,
  sourceFile: any
): SemanticDependency[] {
  let checker: any;
  const dependencies: SemanticDependency[] = [];
  const add = (
    node: any,
    kind: SemanticDependencyKind,
    specifier: string | undefined,
    typeOnly = false
  ) =>
    dependencies.push({
      specifier,
      kind,
      line: lineOf(sourceFile, node),
      typeOnly,
      unresolved: specifier === undefined,
      node,
    });

  const visit = (node: any): void => {
    if (ts.isImportDeclaration(node)) {
      add(node, 'import', literalText(ts, node.moduleSpecifier), isTypeOnlyReference(ts, node));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      add(node, 'export', literalText(ts, node.moduleSpecifier), isTypeOnlyReference(ts, node));
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node, 'require', literalText(ts, node.moduleReference.expression));
    } else if (ts.isCallExpression(node)) {
      const dynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const requireCall =
        ts.isIdentifier(node.expression) && node.expression.text === 'require';
      const directRequire =
        requireCall &&
        !localDeclaration(
          ts,
          checker ?? (checker = singleFileChecker(ts, sourceFile)),
          sourceFile,
          node.expression
        );
      if (dynamicImport || directRequire) {
        add(node, directRequire ? 'require' : 'dynamic-import', literalText(ts, node.arguments[0]));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return dependencies;
}

function staticAccessPath(ts: any, node: any): { root: any; segments: string[] } | undefined {
  const segments: string[] = [];
  let current = node;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    if (ts.isPropertyAccessExpression(current)) segments.unshift(current.name.text);
    else {
      const property = literalText(ts, current.argumentExpression);
      if (property === undefined) return undefined;
      segments.unshift(property);
    }
    current = current.expression;
  }
  if (!ts.isIdentifier(current)) return undefined;
  segments.unshift(current.text);
  return { root: current, segments };
}

function runtimeIdentifierReference(ts: any, node: any): boolean {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) return false;
  return (
    (ts.isExpressionNode(node) && !ts.isInTypeQuery(node)) ||
    (ts.isShorthandPropertyAssignment(parent) && parent.name === node)
  );
}

function bestForbiddenMatch(entries: ReadonlySet<string>, segments: readonly string[]): string | undefined {
  const normalized = segments[0] === 'globalThis' ? segments.slice(1) : segments;
  for (let length = normalized.length; length >= 1; length -= 1) {
    const candidate = normalized.slice(0, length).join('.');
    if (entries.has(candidate)) return candidate;
  }
  return undefined;
}

/** Resolve forbidden ambient capabilities through symbols, aliases, globalThis, and static keys. */
export function collectForbiddenCapabilityUses(
  ts: any,
  sourceFile: any,
  forbidden: readonly string[]
): ForbiddenCapabilityUse[] {
  if (forbidden.length === 0) return [];
  const entries = new Set(forbidden);
  const checker = singleFileChecker(ts, sourceFile);
  const aliases = new Map<unknown, string[]>();
  const topLevelNames = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) topLevelNames.add(declaration.name.text);
      }
    }
  }

  const resolvePath = (node: any): string[] | undefined => {
    const path = staticAccessPath(ts, node);
    if (!path) return undefined;
    const symbol = symbolAt(checker, path.root);
    const alias = symbol ? aliases.get(symbol) : undefined;
    if (alias) return [...alias, ...path.segments.slice(1)];
    return localDeclaration(ts, checker, sourceFile, path.root) || topLevelNames.has(path.root.text)
      ? undefined
      : path.segments;
  };

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!declaration.initializer || !ts.isIdentifier(declaration.name)) continue;
      const path = resolvePath(declaration.initializer);
      const symbol = symbolAt(checker, declaration.name);
      if (!path || !symbol) continue;
      aliases.set(symbol, path);
    }
  }

  const uses: ForbiddenCapabilityUse[] = [];
  const seen = new Set<string>();
  const flag = (name: string, node: any): void => {
    const line = lineOf(sourceFile, node);
    const key = `${name}:${node.getStart(sourceFile)}`;
    if (seen.has(key)) return;
    seen.add(key);
    uses.push({ name, line, node });
  };

  const visit = (node: any): void => {
    const parentContinuesPath =
      node.parent &&
      (ts.isPropertyAccessExpression(node.parent) || ts.isElementAccessExpression(node.parent)) &&
      node.parent.expression === node;
    if (
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      !parentContinuesPath
    ) {
      const path = resolvePath(node);
      const match = path ? bestForbiddenMatch(entries, path) : undefined;
      if (match) flag(match, node);
    } else if (
      ts.isIdentifier(node) &&
      entries.has(node.text) &&
      runtimeIdentifierReference(ts, node) &&
      !localDeclaration(ts, checker, sourceFile, node)
    ) {
      flag(node.text, node);
    }

    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer) {
      const base = resolvePath(node.initializer);
      if (base) {
        for (const element of node.name.elements) {
          if (!ts.isIdentifier(element.name)) continue;
          const property = element.propertyName
            ? literalText(ts, element.propertyName) ?? element.propertyName.text
            : element.name.text;
          const match = bestForbiddenMatch(entries, [...base, property]);
          if (match) flag(match, node.initializer);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return uses;
}
