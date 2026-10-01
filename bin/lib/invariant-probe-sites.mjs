/**
 * Where the invariant probe may change code — Tooling (ADR 0039).
 *
 * Parses the symbol file with the TypeScript the CLI already loaded, locates
 * the declaration `coverage.symbol` names (the same shapes coverage accepts:
 * function, `const x = () => {}` / function expression / literal, class or
 * object-literal method, `Class.member`), and emits the sites inside that
 * declaration only. Which sites become mutants is decided in Domain
 * (`planMutants` in invariant-probe.mjs).
 */

const COMPARISON_TOKENS = new Set(['<', '>', '<=', '>=', '===', '!==', '==', '!=']);
const DECLARATION_ONLY = new Map([
  ['ClassDeclaration', 'class'],
  ['InterfaceDeclaration', 'interface'],
  ['TypeAliasDeclaration', 'type'],
  ['EnumDeclaration', 'enum'],
]);

function nameOf(ts, node) {
  return node.name && (ts.isIdentifier(node.name) || ts.isPrivateIdentifier?.(node.name)) ? node.name.text : null;
}

function isFunctionLike(ts, node) {
  return Boolean(node) && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

/** Body shape of a function-like node: a block to insert into, or an arrow expression. */
function bodyOf(ts, sourceFile, fn) {
  if (!fn.body) return null;
  if (ts.isBlock(fn.body)) return { node: fn.body, body: { kind: 'block', insertAt: fn.body.getStart(sourceFile) + 1 } };
  return {
    node: fn.body,
    body: { kind: 'expression', start: fn.body.getStart(sourceFile), end: fn.body.end },
  };
}

/** Members of a class body or object literal named `member`. */
function memberTarget(ts, sourceFile, members, member) {
  for (const node of members) {
    if (nameOf(ts, node) !== member) continue;
    if ((ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node)) && node.body) {
      return { shape: 'method', ...bodyOf(ts, sourceFile, node) };
    }
    const init = node.initializer;
    if ((ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)) && isFunctionLike(ts, init)) {
      return { shape: 'method', ...bodyOf(ts, sourceFile, init) };
    }
  }
  return null;
}

/**
 * Find the declaration for `symbol` (`name` or `Container.member`).
 * @returns {{ found: true, shape: string, node: object, body: object } | { found: false, declarationOnly?: string }}
 */
function locate(ts, sourceFile, symbol) {
  const parts = String(symbol).split('.');
  const name = parts[parts.length - 1];
  const container = parts.length > 1 ? parts[parts.length - 2] : null;
  let found = null;
  let declarationOnly = null;
  const visit = (node) => {
    if (found) return;
    const kindName = ts.SyntaxKind[node.kind];
    if (container === null) {
      if (ts.isFunctionDeclaration(node) && nameOf(ts, node) === name && node.body) {
        found = { shape: 'function', ...bodyOf(ts, sourceFile, node) };
        return;
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
        const init = node.initializer;
        found = isFunctionLike(ts, init)
          ? { shape: 'const', ...bodyOf(ts, sourceFile, init) }
          : {
              shape: 'const',
              node: init,
              body: { kind: 'initializer', start: init.getStart(sourceFile), end: init.end },
            };
        return;
      }
      if (DECLARATION_ONLY.has(kindName) && nameOf(ts, node) === name) {
        declarationOnly ??= DECLARATION_ONLY.get(kindName);
      }
    } else {
      if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && nameOf(ts, node) === container) {
        found = memberTarget(ts, sourceFile, node.members, name);
      } else if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === container &&
        node.initializer
      ) {
        const init = node.initializer;
        if (ts.isObjectLiteralExpression(init)) found = memberTarget(ts, sourceFile, init.properties, name);
        else if (ts.isClassExpression(init)) found = memberTarget(ts, sourceFile, init.members, name);
      } else if (ts.isModuleDeclaration(node) && nameOf(ts, node) === container && node.body) {
        const fn = (node.body.statements ?? []).find(
          (statement) => ts.isFunctionDeclaration(statement) && nameOf(ts, statement) === name && statement.body
        );
        if (fn) found = { shape: 'function', ...bodyOf(ts, sourceFile, fn) };
      }
      if (found && !found.node) found = null;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (found) return { found: true, ...found };
  return { found: false, ...(declarationOnly ? { declarationOnly } : {}) };
}

function thenExits(ts, statement) {
  if (!statement) return false;
  if (ts.isThrowStatement(statement) || ts.isReturnStatement(statement)) return true;
  return ts.isBlock(statement) && statement.statements.some((s) => ts.isThrowStatement(s) || ts.isReturnStatement(s));
}

function siteAt(sourceFile, text, kind, start, end) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
  return { kind, start, end, line: line + 1, column: character + 1, text: text.slice(start, end) };
}

/**
 * Sites and body shape for the probe.
 * @param {object} ts the loaded TypeScript module
 * @param {string} fileName project-relative path (decides JS vs TS parsing)
 * @param {string} text file contents
 * @param {string} symbol `coverage.symbol`
 * @returns {{ ok: true, shape: string, body: object, line: number, sites: object[] }
 *          | { ok: false, reason: 'symbol-not-found' | 'declaration-only', shape?: string }}
 */
export function findProbeSites(ts, fileName, text, symbol) {
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const located = locate(ts, sourceFile, symbol);
  if (!located.found) {
    return located.declarationOnly
      ? { ok: false, reason: 'declaration-only', shape: located.declarationOnly }
      : { ok: false, reason: 'symbol-not-found' };
  }
  const sites = [];
  const walk = (node) => {
    if (ts.isIfStatement(node) && thenExits(ts, node.thenStatement)) {
      sites.push(siteAt(sourceFile, text, 'guard', node.expression.getStart(sourceFile), node.expression.end));
    } else if (ts.isThrowStatement(node)) {
      sites.push(siteAt(sourceFile, text, 'throw', node.getStart(sourceFile), node.end));
    } else if (ts.isBinaryExpression(node) && COMPARISON_TOKENS.has(node.operatorToken.getText(sourceFile))) {
      sites.push(
        siteAt(sourceFile, text, 'comparison', node.operatorToken.getStart(sourceFile), node.operatorToken.end)
      );
    } else if (ts.isNumericLiteral(node)) {
      sites.push(siteAt(sourceFile, text, 'numeric', node.getStart(sourceFile), node.end));
    } else if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
      sites.push(siteAt(sourceFile, text, 'boolean', node.getStart(sourceFile), node.end));
    }
    ts.forEachChild(node, walk);
  };
  walk(located.node);
  const { line } = sourceFile.getLineAndCharacterOfPosition(located.node.getStart(sourceFile));
  return { ok: true, shape: located.shape, body: located.body, line: line + 1, sites };
}

/** True when `text` has no syntax errors (a mutant that does not parse is `invalid`). */
export function parsesCleanly(ts, fileName, text) {
  try {
    const out = ts.transpileModule(text, {
      fileName,
      reportDiagnostics: true,
      compilerOptions: { allowJs: true, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.Latest },
    });
    return (out.diagnostics ?? []).length === 0;
  } catch {
    return false;
  }
}
