/**
 * W6 — Verified structural transform: port-proof inject binding (single narrow kind).
 *
 * Scope (intentionally tiny — false mechanical-safe is worse than extra judgment):
 *   - Exactly one static named value import (no default / namespace / side-effect / export-from)
 *   - Binding used ONLY as property-access call receiver: `binding.method(...)`
 *   - All uses inside `function` declarations (not module-level, not classes, not arrows)
 *   - No require / dynamic import
 *
 * Transform (single file):
 *   1. Remove the import
 *   2. Emit `export type <Port> = { method: (...args: unknown[]) => unknown; ... }`
 *   3. Add `binding: Port` as last parameter of each function that uses it
 *   4. Leave call expressions verbatim (`binding.method(...)`)
 *
 * Static proof of behavior preservation (module-local):
 *   If the injected parameter equals the value previously bound by the import, every
 *   statement in each rewritten function evaluates identically — call expressions are
 *   preserved character-for-character after rebinding. No adapter file is invented;
 *   the outer layer must pass the implementation (classic port inject).
 *
 * Fail closed: any unmatched use pattern → not eligible (judgment).
 */
import path from 'node:path';

/**
 * @param {object} ts typescript module
 * @param {string} source
 * @param {{ filePath?: string, importLocalName?: string, importSpecifier?: string, sourceFile?: object }} [opts]
 * @returns {{ eligible: boolean, reason?: string, bindingName?: string, methods?: string[], functionNames?: string[], specifier?: string }}
 */
export function provePortProofInject(ts, source, opts = {}) {
  if (!ts || typeof source !== 'string') {
    return { eligible: false, reason: 'missing-ts-or-source' };
  }
  const sf = opts.sourceFile ?? ts.createSourceFile(
    opts.filePath || 'file.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  /** @type {import('typescript').ImportDeclaration | null} */
  let targetImport = null;
  let bindingName = null;
  let specifier = null;
  let namedImportCount = 0;

  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (stmt.importClause?.isTypeOnly) continue;
    const clause = stmt.importClause;
    if (!clause) continue; // side-effect
    if (clause.name) {
      // default import — never port-proof
      return { eligible: false, reason: 'default-import' };
    }
    const named = clause.namedBindings;
    if (!named || !ts.isNamedImports(named)) {
      return { eligible: false, reason: 'namespace-or-missing-named' };
    }
    if (named.elements.some((el) => el.isTypeOnly)) {
      // partial type-only mixed — not this transform
      continue;
    }
    if (named.elements.length !== 1) {
      return { eligible: false, reason: 'multi-named-import' };
    }
    namedImportCount += 1;
    if (namedImportCount > 1) {
      return { eligible: false, reason: 'multiple-value-imports' };
    }
    const el = named.elements[0];
    bindingName = el.name.text;
    specifier = stmt.moduleSpecifier && ts.isStringLiteralLike(stmt.moduleSpecifier)
      ? stmt.moduleSpecifier.text
      : null;
    if (!specifier || (!specifier.startsWith('./') && !specifier.startsWith('../'))) {
      return { eligible: false, reason: 'non-relative-specifier' };
    }
    if (opts.importLocalName && opts.importLocalName !== bindingName) {
      return { eligible: false, reason: 'binding-mismatch' };
    }
    if (opts.importSpecifier && opts.importSpecifier !== specifier) {
      // soft: still allow if only one import
    }
    targetImport = stmt;
  }

  if (!targetImport || !bindingName) {
    return { eligible: false, reason: 'no-single-named-value-import' };
  }

  const methods = new Set();
  const functionNames = new Set();
  let freeBindingUse = false;

  // Walk top-level: only function declarations may use the binding (as method calls).
  function walkTop(node) {
    if (ts.isFunctionDeclaration(node)) {
      if (node.body) {
        visitBody(node.body, node.name?.text);
      }
      return;
    }
    // Any binding use outside function decls is invalid
    if (ts.isIdentifier(node) && node.text === bindingName) {
      if (node.parent && ts.isImportSpecifier(node.parent)) return;
      freeBindingUse = true;
      return;
    }
    ts.forEachChild(node, walkTop);
  }

  function visitBody(body, fnName) {
    function walk(node) {
      if (ts.isIdentifier(node) && node.text === bindingName) {
        const parent = node.parent;
        if (
          parent &&
          ts.isPropertyAccessExpression(parent) &&
          parent.expression === node &&
          parent.parent &&
          ts.isCallExpression(parent.parent) &&
          parent.parent.expression === parent
        ) {
          methods.add(parent.name.text);
          if (fnName) functionNames.add(fnName);
          return;
        }
        freeBindingUse = true;
        return;
      }
      // Nested functions: still require property-call form
      if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
        // Nested non-declarations: fail closed (narrow transform)
        if (!ts.isFunctionDeclaration(node)) {
          // Check if binding used inside — if yes, ineligible
          let nestedUse = false;
          const check = (n) => {
            if (ts.isIdentifier(n) && n.text === bindingName) nestedUse = true;
            else ts.forEachChild(n, check);
          };
          if (node.body) check(node.body);
          if (nestedUse) freeBindingUse = true;
          return;
        }
      }
      ts.forEachChild(node, walk);
    }
    walk(body);
  }

  for (const stmt of sf.statements) {
    walkTop(stmt);
  }

  if (freeBindingUse) {
    return { eligible: false, reason: 'free-or-non-call-use' };
  }
  if (methods.size === 0 || functionNames.size === 0) {
    return { eligible: false, reason: 'no-method-calls-in-functions' };
  }

  return {
    eligible: true,
    bindingName,
    methods: [...methods].sort(),
    functionNames: [...functionNames].sort(),
    specifier,
  };
}

/**
 * Apply port-proof inject when prove succeeds.
 * @returns {{ source: string, remediationKind: string, confidence: number, proof: object } | null}
 */
export function applyPortProofInject(ts, source, opts = {}) {
  const proof = provePortProofInject(ts, source, opts);
  if (!proof.eligible) return null;

  const sf = ts.createSourceFile(
    opts.filePath || 'file.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  const bindingName = proof.bindingName;
  const methods = proof.methods;
  const portTypeName = `${capitalize(bindingName)}Port`;

  // Find import to remove
  /** @type {{ start: number, end: number } | null} */
  let importSpan = null;
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const clause = stmt.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    if (clause.namedBindings.elements.length !== 1) continue;
    if (clause.namedBindings.elements[0].name.text !== bindingName) continue;
    // getStart skips leading trivia so we don't leave a stray indent before the port type.
    importSpan = { start: stmt.getStart(sf), end: stmt.getEnd() };
    if (source[importSpan.end] === '\r') importSpan.end += 1;
    if (source[importSpan.end] === '\n') importSpan.end += 1;
    break;
  }
  if (!importSpan) return null;

  // Functions that need the port param
  const fnEdits = [];
  for (const stmt of sf.statements) {
    if (!ts.isFunctionDeclaration(stmt) || !stmt.name || !stmt.body) continue;
    if (!proof.functionNames.includes(stmt.name.text)) continue;
    // Already has a param named bindingName?
    const params = stmt.parameters || [];
    if (params.some((p) => ts.isIdentifier(p.name) && p.name.text === bindingName)) {
      continue;
    }
    // Fail closed: rest params / non-identifier patterns would yield illegal TS
    // (e.g. function f(...args, db: Port)).
    if (
      params.some(
        (p) =>
          p.dotDotDotToken ||
          !ts.isIdentifier(p.name)
      )
    ) {
      return null;
    }
    if (params.length > 0) {
      const at = params[params.length - 1].getEnd();
      fnEdits.push({
        start: at,
        end: at,
        text: `, ${bindingName}: ${portTypeName}`,
      });
    } else {
      const open = source.indexOf('(', stmt.name.getEnd());
      if (open < 0) continue;
      const at = open + 1;
      fnEdits.push({
        start: at,
        end: at,
        text: `${bindingName}: ${portTypeName}`,
      });
    }
  }
  if (fnEdits.length === 0) return null;

  const portDecl =
    `export type ${portTypeName} = {\n` +
    methods.map((m) => `  ${m}: (...args: unknown[]) => unknown;`).join('\n') +
    `\n};\n\n`;

  // Apply edits from end to start
  const edits = [
    { start: importSpan.start, end: importSpan.end, text: portDecl },
    ...fnEdits,
  ].sort((a, b) => b.start - a.start);

  let out = source;
  for (const e of edits) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  if (out === source) return null;

  // Re-prove on result: binding should no longer need the import; methods still present
  // (as params). Eligibility after transform is "no value import" — proof may fail for
  // different reasons. Validate shape: no import of binding's original specifier as value.
  if (new RegExp(`import\\s*\\{[^}]*\\b${escapeRe(bindingName)}\\b`).test(out)) {
    return null;
  }
  if (!out.includes(`export type ${portTypeName}`)) return null;

  return {
    source: out,
    remediationKind: 'port-proof-inject-binding',
    confidence: 0.8,
    proof: {
      bindingName,
      methods,
      functionNames: proof.functionNames,
      specifier: proof.specifier,
      portTypeName,
    },
  };
}

function capitalize(s) {
  if (!s) return 'Port';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when relative path basename matches a common path segment of the import target.
 * Used only as a soft filter when wiring from ark-check violations.
 */
export function specifierLooksLikeTarget(specifier, violationTargetRel) {
  if (!specifier || !violationTargetRel) return true;
  const base = path.basename(violationTargetRel, path.extname(violationTargetRel));
  return specifier.includes(base) || violationTargetRel.includes(specifier.replace(/^\.\//, ''));
}
