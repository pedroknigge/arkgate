/**
 * Z10 — deterministic, opt-in new/worsened design-smell ratchet.
 *
 * The first supported smell is the field-proven `domain-logic-in-ui` case. The
 * result names that bounded support explicitly; adding another detector is an
 * additive contract change, never an implication that every doctor advisory is
 * already merge-blocking.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { layerForFile } from '../ark-shared.mjs';
import { loadGoldenPattern } from './golden-pattern.mjs';
import { collectGovernedFiles } from './scan-files.mjs';

export const DESIGN_DELTA_SCHEMA_VERSION = '1.0';
export const DESIGN_DELTA_SUPPORTED_SMELLS = Object.freeze(['domain-logic-in-ui']);

const SOURCE_FILE = /\.[cm]?[jt]sx?$/i;
const UI_PATH_RE =
  /(?:^|\/)(?:components?|pages|hooks|ui|views|screens)(?:\/|$)|(?:^|\/)app\/(?!api\/)/i;
const RULE_NAME_RE = /^(can|should|calculate|compute)[A-Z_]|policy/i;
const BOOLEAN_RULE_RE = /^(can|should)[A-Z_]|policy/i;
const CALCULATION_RULE_RE = /^(calculate|compute)[A-Z_]/i;
const PRESENTATION_NAME_RE =
  /(?:route|routing|path|label|className|style|render|display|view|modal|dialog|tooltip|navigate|navigation|href|tab|menu|component|toast|breadcrumb|sidebar|drawer|popover|layout|theme|icon)/i;
const PRESENTATION_CALL_RE =
  /^(?:use[A-Z_]|render|navigate|redirect|push|replace|open|close|show|hide|setState|set[A-Z_]|toast|alert|confirm)/;
const PREDICATE_CALLS = new Set(['includes', 'some', 'every', 'has']);

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function hash(value) {
  return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function stableTreeHash(config, records) {
  const rows = [...records]
    .map((record) => [normalizePath(record.path), hash(record.content)])
    .sort(([a], [b]) => a.localeCompare(b));
  return hash(JSON.stringify({ config, files: rows }));
}

function scriptKind(ts, relativePath) {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (lower.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function isUiFile(root, config, relativePath) {
  const layer = layerForFile(root, relativePath, config?.layers ?? []);
  return UI_PATH_RE.test(relativePath) || /presentation|ui|view/i.test(layer ?? '');
}

function functionCandidates(ts, sourceFile) {
  const candidates = [];
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      candidates.push({ name: node.name.text, body: node.body, node });
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const initializer = node.initializer;
      if (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
        candidates.push({ name: node.name.text, body: initializer.body, node });
      }
    } else if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.body) {
      candidates.push({ name: node.name.text, body: node.body, node });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return candidates;
}

function semanticRuleEvidence(ts, candidate) {
  if (!RULE_NAME_RE.test(candidate.name) || PRESENTATION_NAME_RE.test(candidate.name)) return null;
  let comparisons = 0;
  let logical = 0;
  let arithmetic = 0;
  let predicates = 0;
  let presentationEffect = false;
  let jsx = false;

  const comparisonKinds = new Set([
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.LessThanToken,
    ts.SyntaxKind.LessThanEqualsToken,
    ts.SyntaxKind.GreaterThanToken,
    ts.SyntaxKind.GreaterThanEqualsToken,
    ts.SyntaxKind.InKeyword,
    ts.SyntaxKind.InstanceOfKeyword,
  ]);
  const logicalKinds = new Set([
    ts.SyntaxKind.AmpersandAmpersandToken,
    ts.SyntaxKind.BarBarToken,
    ts.SyntaxKind.QuestionQuestionToken,
  ]);
  const arithmeticKinds = new Set([
    ts.SyntaxKind.PlusToken,
    ts.SyntaxKind.MinusToken,
    ts.SyntaxKind.AsteriskToken,
    ts.SyntaxKind.SlashToken,
    ts.SyntaxKind.PercentToken,
    ts.SyntaxKind.AsteriskAsteriskToken,
  ]);

  const visit = (node) => {
    if (
      ts.isJsxElement(node) ||
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxFragment(node)
    ) {
      jsx = true;
      return;
    }
    if (ts.isBinaryExpression(node)) {
      if (comparisonKinds.has(node.operatorToken.kind)) comparisons += 1;
      if (logicalKinds.has(node.operatorToken.kind)) logical += 1;
      if (arithmeticKinds.has(node.operatorToken.kind)) arithmetic += 1;
    }
    if (ts.isCallExpression(node)) {
      let callName = '';
      if (ts.isIdentifier(node.expression)) callName = node.expression.text;
      else if (ts.isPropertyAccessExpression(node.expression)) callName = node.expression.name.text;
      if (PREDICATE_CALLS.has(callName)) predicates += 1;
      if (PRESENTATION_CALL_RE.test(callName) || PRESENTATION_NAME_RE.test(callName)) {
        presentationEffect = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(candidate.body);

  if (jsx || presentationEffect) return null;
  const booleanMagnitude = comparisons + logical + predicates;
  const calculationMagnitude = arithmetic;
  let kind;
  let magnitude;
  if (CALCULATION_RULE_RE.test(candidate.name) && calculationMagnitude > 0) {
    kind = 'calculation-rule';
    magnitude = calculationMagnitude;
  } else if (BOOLEAN_RULE_RE.test(candidate.name) && booleanMagnitude > 0) {
    kind = 'authorization-policy-rule';
    magnitude = booleanMagnitude;
  } else {
    return null;
  }
  return {
    kind,
    magnitude,
    detail: `comparisons:${comparisons};logical:${logical};predicates:${predicates};arithmetic:${arithmetic}`,
  };
}

function repairHint(golden, symbol) {
  if (golden?.present && golden.golden?.newCodeHome) {
    return `Move ${symbol} to ${golden.golden.newCodeHome} following golden pattern "${golden.golden.name}", then import the pure rule from the UI.`;
  }
  return `Move ${symbol} into the project's Domain/shared pure-rules home and import it from the UI; do not weaken ark.config.json.`;
}

/** Analyze the bounded set of design smells from deterministic source records. */
export function analyzeDesignFindings({ root, config, records, ts, goldenPattern }) {
  if (!ts?.createSourceFile) throw new Error('TypeScript parser is required for design-delta analysis.');
  const findings = [];
  for (const record of [...records].sort((a, b) => normalizePath(a.path).localeCompare(normalizePath(b.path)))) {
    const relativePath = normalizePath(record.path);
    if (!SOURCE_FILE.test(relativePath) || relativePath.endsWith('.d.ts')) continue;
    if (!isUiFile(root, config, relativePath)) continue;
    const sourceFile = ts.createSourceFile(
      relativePath,
      String(record.content),
      ts.ScriptTarget.Latest,
      true,
      scriptKind(ts, relativePath)
    );
    for (const candidate of functionCandidates(ts, sourceFile)) {
      const semantic = semanticRuleEvidence(ts, candidate);
      if (!semantic) continue;
      const identity = `domain-logic-in-ui|${relativePath}|${candidate.name}|${semantic.kind}`;
      const line = sourceFile.getLineAndCharacterOfPosition(candidate.node.getStart(sourceFile)).line + 1;
      findings.push({
        smellId: 'domain-logic-in-ui',
        fingerprint: hash(identity),
        identity,
        evidence: {
          kind: semantic.kind,
          path: relativePath,
          line,
          symbol: candidate.name,
          detail: semantic.detail,
          magnitude: semantic.magnitude,
        },
        repairHint: repairHint(goldenPattern, candidate.name),
      });
    }
  }
  return findings.sort((a, b) => a.identity.localeCompare(b.identity));
}

function compareFindings({ mode, baseIdentity, candidateIdentity, touchedPaths, baseFindings, candidateFindings }) {
  const touched = new Set([...touchedPaths].map(normalizePath));
  const baseByIdentity = new Map(baseFindings.map((finding) => [finding.identity, finding]));
  const remainingBase = new Set(baseFindings);
  const changes = [];
  let historicalResidualCount = 0;
  for (const finding of candidateFindings) {
    let base = baseByIdentity.get(finding.identity);
    if (!base) {
      const semanticMatches = [...remainingBase].filter(
        (candidate) =>
          candidate.smellId === finding.smellId &&
          candidate.evidence.symbol === finding.evidence.symbol &&
          candidate.evidence.kind === finding.evidence.kind
      );
      if (semanticMatches.length === 1) [base] = semanticMatches;
    }
    if (base) remainingBase.delete(base);
    const baseMagnitude = base?.evidence?.magnitude ?? 0;
    const candidateMagnitude = finding.evidence.magnitude;
    if (!touched.has(finding.evidence.path)) {
      if (base) historicalResidualCount += 1;
      continue;
    }
    if (!base) {
      changes.push({
        ...finding,
        classification: 'new',
        baseMagnitude: 0,
        candidateMagnitude,
      });
    } else if (candidateMagnitude > baseMagnitude) {
      changes.push({
        ...finding,
        classification: 'worsened',
        baseMagnitude,
        candidateMagnitude,
      });
    } else {
      historicalResidualCount += 1;
    }
  }
  return {
    schemaVersion: DESIGN_DELTA_SCHEMA_VERSION,
    mode,
    complete: true,
    valid: changes.length === 0,
    base: baseIdentity,
    candidate: candidateIdentity,
    supportedSmellIds: [...DESIGN_DELTA_SUPPORTED_SMELLS],
    touchedPaths: [...touched].sort(),
    changes,
    baseFindingCount: baseFindings.length,
    candidateFindingCount: candidateFindings.length,
    historicalResidualCount,
  };
}

function currentRecords(root, config) {
  const records = [];
  for (const absolutePath of collectGovernedFiles(root, config)) {
    const relativePath = normalizePath(path.relative(root, absolutePath));
    if (!SOURCE_FILE.test(relativePath) || relativePath.endsWith('.d.ts')) continue;
    records.push({ path: relativePath, content: fs.readFileSync(absolutePath, 'utf8') });
  }
  return records;
}

function applyChanges(root, config, baseRecords, changes) {
  const records = new Map(baseRecords.map((record) => [normalizePath(record.path), record.content]));
  for (const change of changes) {
    const relativePath = normalizePath(change.path);
    if (!SOURCE_FILE.test(relativePath) || relativePath.endsWith('.d.ts')) continue;
    const layer = layerForFile(root, relativePath, config?.layers ?? []);
    if (!layer) continue;
    if (change.delete === true) records.delete(relativePath);
    else if (typeof change.content === 'string') records.set(relativePath, change.content);
  }
  return [...records].map(([recordPath, content]) => ({ path: recordPath, content }));
}

/** Compare a complete in-memory write candidate with the current on-disk tree. */
export function evaluateWriteDesignDelta({ root, config, changes, ts }) {
  const baseRecords = currentRecords(root, config);
  const candidateRecords = applyChanges(root, config, baseRecords, changes ?? []);
  const golden = loadGoldenPattern(root);
  const baseFindings = analyzeDesignFindings({ root, config, records: baseRecords, ts, goldenPattern: golden });
  const candidateFindings = analyzeDesignFindings({ root, config, records: candidateRecords, ts, goldenPattern: golden });
  return compareFindings({
    mode: 'write-candidate',
    baseIdentity: { kind: 'candidate-tree', value: stableTreeHash(config, baseRecords) },
    candidateIdentity: { kind: 'candidate-tree', value: stableTreeHash(config, candidateRecords) },
    touchedPaths: (changes ?? []).map((change) => change.path),
    baseFindings,
    candidateFindings,
  });
}

function git(root, args, options = {}) {
  return spawnSync('git', args, {
    cwd: root,
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    input: options.input,
  });
}

function gitText(root, args, label) {
  const result = git(root, args);
  if (result.status !== 0) {
    throw new Error(`${label}: ${(result.stderr || result.stdout || 'git command failed').trim()}`);
  }
  return result.stdout.trim();
}

function gitPaths(root, args, label) {
  const result = git(root, args, { encoding: 'buffer' });
  if (result.status !== 0) {
    throw new Error(`${label}: ${String(result.stderr || result.stdout || 'git command failed').trim()}`);
  }
  return result.stdout
    .toString('utf8')
    .split('\0')
    .map(normalizePath)
    .filter(Boolean);
}

function gitBlob(root, commit, relativePath) {
  const result = git(root, ['show', `${commit}:${relativePath}`]);
  if (result.status !== 0) {
    throw new Error(`base file unavailable (${relativePath}): ${(result.stderr || '').trim()}`);
  }
  return result.stdout;
}

function incompleteGitResult(baseRef, error) {
  return {
    schemaVersion: DESIGN_DELTA_SCHEMA_VERSION,
    mode: 'git-base',
    complete: false,
    valid: false,
    base: { kind: 'git-tree', value: String(baseRef || '<missing>') },
    candidate: { kind: 'candidate-tree', value: '<unavailable>' },
    supportedSmellIds: [...DESIGN_DELTA_SUPPORTED_SMELLS],
    touchedPaths: [],
    changes: [],
    baseFindingCount: 0,
    candidateFindingCount: 0,
    historicalResidualCount: 0,
    error,
  };
}

/** Compare the working candidate with an explicit, resolvable Git base commit. */
export function evaluateGitDesignDelta({ root, config, configPath = 'ark.config.json', baseRef, ts }) {
  if (typeof baseRef !== 'string' || !baseRef.trim()) {
    return incompleteGitResult(baseRef, '--fail-on-new-smells requires --base-ref <git-ref>.');
  }
  try {
    if (baseRef.startsWith('-')) throw new Error('base ref must not start with "-".');
    const commit = gitText(root, ['rev-parse', '--verify', `${baseRef}^{commit}`], 'base ref is unresolvable');
    const tree = gitText(root, ['rev-parse', '--verify', `${commit}^{tree}`], 'base tree is unresolvable');
    const normalizedConfigPath = normalizePath(
      path.isAbsolute(configPath) ? path.relative(root, configPath) : configPath
    );
    if (!normalizedConfigPath || normalizedConfigPath.startsWith('../')) {
      throw new Error('base config path must be inside the project root.');
    }
    const baseConfig = JSON.parse(gitBlob(root, commit, normalizedConfigPath));
    const basePaths = gitPaths(root, ['ls-tree', '-r', '--name-only', '-z', commit], 'base tree listing failed')
      .filter((relativePath) => SOURCE_FILE.test(relativePath) && !relativePath.endsWith('.d.ts'));
    const baseRecords = basePaths
      .filter((relativePath) => layerForFile(root, relativePath, baseConfig?.layers ?? []))
      .map((relativePath) => ({ path: relativePath, content: gitBlob(root, commit, relativePath) }));
    const candidateRecords = currentRecords(root, config);
    const touchedPaths = [
      ...gitPaths(root, ['diff', '--name-only', '-z', commit, '--'], 'candidate diff failed'),
      ...gitPaths(root, ['ls-files', '--others', '--exclude-standard', '-z'], 'untracked-file scan failed'),
    ];
    const golden = loadGoldenPattern(root);
    const baseFindings = analyzeDesignFindings({ root, config: baseConfig, records: baseRecords, ts, goldenPattern: golden });
    const candidateFindings = analyzeDesignFindings({ root, config, records: candidateRecords, ts, goldenPattern: golden });
    return compareFindings({
      mode: 'git-base',
      baseIdentity: { kind: 'git-tree', value: tree, commit },
      candidateIdentity: { kind: 'candidate-tree', value: stableTreeHash(config, candidateRecords) },
      touchedPaths,
      baseFindings,
      candidateFindings,
    });
  } catch (error) {
    return incompleteGitResult(baseRef, error instanceof Error ? error.message : String(error));
  }
}

export function formatDesignDeltaBlock(delta) {
  if (!delta?.complete) return `Design delta unavailable: ${delta?.error || 'unknown error'}`;
  if (delta.valid) {
    return `Design delta passed: 0 new/worsened supported smells across ${delta.touchedPaths.length} touched path(s).`;
  }
  return [
    `Design delta blocked ${delta.changes.length} new/worsened supported smell(s):`,
    ...delta.changes.map(
      (change) =>
        `- [${change.smellId}] ${change.evidence.path}:${change.evidence.line ?? 1} ${change.evidence.symbol ?? ''} (${change.classification})\n  Next action: ${change.repairHint}`
    ),
  ].join('\n');
}

/** Keep CLI orchestration additive without growing the already-bounded main checker. */
export function createDesignDeltaCheck({ enabled, ...input }) {
  const result = enabled ? evaluateGitDesignDelta(input) : null;
  return {
    result,
    combineEdges: ({ activeViolationCount, strictConfig, strictWarningCount, policyValid }) => {
      const edgeValid = activeViolationCount === 0 && (!strictConfig || strictWarningCount === 0) && policyValid;
      return { edgeValid, observedOk: edgeValid && (result?.valid ?? true) };
    },
    exitCode: (fallback) => result && !result.complete ? 2 : fallback,
    failureText: () => result && !result.valid ? formatDesignDeltaBlock(result) : null,
  };
}

export function designDeltaDoctorLines(delta) {
  if (!delta) return [];
  if (!delta.complete) return [{ level: 'bad', text: `Unavailable — ${delta.error || 'base/candidate evidence incomplete'}` }];
  if (delta.valid) return [{ level: 'ok', text: `0 new/worsened supported smells across ${delta.touchedPaths.length} touched path(s)` }];
  return [
    { level: 'bad', text: `${delta.changes.length} new/worsened supported smell(s) block this candidate` },
    ...delta.changes.slice(0, 5).flatMap((change) => [
      { level: 'plain', text: `[${change.smellId}] ${change.evidence.path}:${change.evidence.line ?? 1} ${change.evidence.symbol ?? ''}` },
      { level: 'dim', text: `fix: ${change.repairHint}` },
    ]),
  ];
}
