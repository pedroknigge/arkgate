/**
 * Advisory graph-blind spots (Y09 direction — still parked as blocker work).
 *
 * Template-interpolation dynamic imports (`import(\`./x/${name}\`)`) never
 * enter the static edge graph. Surface them as an advisory count + capped list
 * so governed trees know where analysis is incomplete — never a hard verdict
 * change, never false green from silence.
 *
 * Performance: lightweight AST walk only (no extractSemanticDependencies /
 * full semantic binding). Doctor resident warm must stay under the 500 ms UX
 * ceiling at the 10k fixture.
 */
import fs from 'node:fs';
import path from 'node:path';
import { normalize } from './scan-files.mjs';

const MAX_LIST = 8;
const MAX_FILE_BYTES = 256 * 1024;
const LEXICAL_GATE = /\b(?:import|require)\s*\(|\bimport\s+\w+\s*=\s*require\s*\(/;

/**
 * Classify an unresolved dynamic dependency argument.
 * @returns {'template-interpolation'|'non-literal'|null}
 */
export function classifyUnresolvedDependencyArg(ts, arg) {
  if (!ts || !arg) return null;
  if (ts.isTemplateExpression(arg)) return 'template-interpolation';
  // NoSubstitutionTemplateLiteral is string-literal-like and already resolved.
  if (ts.isStringLiteralLike(arg)) return null;
  return 'non-literal';
}

/**
 * Specifier expression for a dependency node (CallExpression or ImportEquals).
 */
export function unresolvedDependencyArg(ts, node) {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node.arguments)) return node.arguments[0];
  // import x = require(expr) — ExternalModuleReference.expression
  const modRef = node.moduleReference;
  if (modRef && typeof modRef === 'object' && modRef.expression) return modRef.expression;
  if (ts?.isExternalModuleReference?.(modRef) && modRef.expression) return modRef.expression;
  return undefined;
}

/**
 * Collect unresolvable dynamic import/require call sites with a shallow walk.
 * Avoids extractSemanticDependencies (full binding / export walk) on every file.
 */
function collectDynamicBlindEdges(ts, sourceFile, rel, edges) {
  const visit = (node) => {
    // import('x') / require('x') / import(`./${x}`)
    if (ts.isCallExpression(node) && node.expression) {
      const expr = node.expression;
      const isImport =
        expr.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(expr) && expr.text === 'import');
      const isRequire = ts.isIdentifier(expr) && expr.text === 'require';
      if (isImport || isRequire) {
        const arg = node.arguments?.[0];
        const reason = classifyUnresolvedDependencyArg(ts, arg);
        if (reason) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          edges.push({
            file: rel,
            line: line + 1,
            kind: isRequire ? 'require' : 'import',
            reason,
          });
        }
      }
    }

    // import x = require(expr)
    if (ts.isImportEqualsDeclaration?.(node) && node.moduleReference) {
      const arg = unresolvedDependencyArg(ts, node);
      const reason = classifyUnresolvedDependencyArg(ts, arg);
      if (reason) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        edges.push({
          file: rel,
          line: line + 1,
          kind: 'require',
          reason,
        });
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

/**
 * Detect unresolvable import edges that leave the architecture graph incomplete.
 *
 * @returns {{
 *   available: boolean,
 *   advisory: true,
 *   blockerGrade: false,
 *   count: number,
 *   templateInterpolationCount: number,
 *   otherNonLiteralCount: number,
 *   truncated: number,
 *   edges: Array<{file:string,line:number,kind:string,reason:string}>,
 *   note: string,
 * }}
 */
export function detectGraphBlindSpots(ts, root, files = []) {
  if (!ts) {
    return {
      available: false,
      advisory: true,
      blockerGrade: false,
      count: 0,
      templateInterpolationCount: 0,
      otherNonLiteralCount: 0,
      truncated: 0,
      edges: [],
      note: 'TypeScript was not available; graph-blind template-interpolation edges were not scanned.',
    };
  }

  const resolvedRoot = path.resolve(root);
  const edges = [];
  for (const file of files) {
    let source;
    try {
      const stats = fs.statSync(file);
      if (!stats.isFile() || stats.size === 0 || stats.size > MAX_FILE_BYTES) continue;
      source = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    // Cheap lexical gate — dynamic import/require and import-equals require forms.
    if (!LEXICAL_GATE.test(source)) continue;
    // setParentNodes=false: we only need positions + node kinds.
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, false);
    const rel = normalize(path.relative(resolvedRoot, path.resolve(file)));
    collectDynamicBlindEdges(ts, sourceFile, rel, edges);
  }

  edges.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.reason.localeCompare(b.reason)
  );

  const templateInterpolationCount = edges.filter(
    (e) => e.reason === 'template-interpolation'
  ).length;
  const otherNonLiteralCount = edges.length - templateInterpolationCount;
  const truncated = Math.max(0, edges.length - MAX_LIST);
  const listed = edges.slice(0, MAX_LIST);

  return {
    available: true,
    advisory: true,
    blockerGrade: false,
    count: edges.length,
    templateInterpolationCount,
    otherNonLiteralCount,
    truncated,
    edges: listed,
    note:
      edges.length === 0
        ? 'No unresolvable dynamic import/require edges detected in governed files (advisory scan).'
        : `${edges.length} unresolvable dynamic edge(s) leave the architecture graph incomplete (${templateInterpolationCount} template-interpolation). Advisory only — never a hard architecture verdict; review or allowlist reviewed call sites.`,
  };
}

/**
 * Human doctor section. Unavailable prints a dim honesty line (not silence-as-done).
 * Clean available scans stay silent.
 */
export function printGraphBlindSection(state, io) {
  if (!state) return;
  if (!state.available) {
    console.log('');
    console.log(io.color.bold('Graph blind spots (advisory)'));
    io.line(
      ' ',
      io.color.dim(state.note || 'Graph-blind scan unavailable — incomplete-graph honesty not verified.')
    );
    return;
  }
  if (!state.count) return;
  console.log('');
  console.log(io.color.bold('Graph blind spots (advisory)'));
  io.line(
    io.warn,
    `${state.count} unresolvable dynamic edge(s) (${state.templateInterpolationCount} template-interpolation) — graph incomplete`
  );
  for (const edge of state.edges.slice(0, 5)) {
    io.line(
      ' ',
      io.color.dim(`[${edge.reason}] ${edge.file}:${edge.line} (${edge.kind})`)
    );
  }
  if (state.count > 5) {
    io.line(' ', io.color.dim(`…(+${state.count - 5} more in doctor JSON)`));
  }
  io.line(
    ' ',
    io.color.dim('advisory only — does not change the architecture verdict; edges are blind, not clean')
  );
}

/**
 * HTML report body for graphBlindSpots (X01 parity). `esc` is the report escaper.
 * Kept here so html-report-advisories stays under budget.
 */
export function graphBlindSpotsHtml(state, esc = (v) => String(v)) {
  if (!state) return '';
  const edges = Array.isArray(state.edges) ? state.edges : [];
  let body;
  if (state.available === false) {
    body = `<p class="muted">${esc(state.note ?? 'Graph-blind scan unavailable.')}</p>`;
  } else if ((state.count ?? 0) === 0) {
    body = '<p class="muted">No unresolvable dynamic import/require edges detected (advisory scan).</p>';
  } else {
    const list = edges
      .slice(0, 8)
      .map((e) => `<li><span class="tag warn">${esc(e.reason)}</span> <code>${esc(e.file)}:${e.line}</code> (${esc(e.kind)})</li>`)
      .join('');
    const more = state.truncated > 0 ? `<p class="muted">…(+${state.truncated} more in doctor JSON)</p>` : '';
    body = `<p><span class="tag warn">${state.count} unresolvable</span> dynamic edge(s) — graph incomplete (${state.templateInterpolationCount ?? 0} template-interpolation).</p><ul>${list}</ul>${more}<p class="muted">Advisory only — does not change the architecture verdict; edges are blind, not clean.</p>`;
  }
  return `
  <section data-advisory="graphBlindSpots">
    <h2>Graph blind spots <span class="muted">(advisory — incomplete graph honesty; never a hard verdict)</span></h2>
    ${body}
  </section>`;
}
