#!/usr/bin/env node
/** Y04 deterministic skill-contract eval; no live agent and no product-engine changes. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const FIXTURE = path.join(HERE, 'mechanical-edit-hygiene', 'fixtures.v1.json');
const EXPECTED_SKILLS = Object.freeze([
  'templates/skills/ark-fix.md',
  'templates/skills/ark-autopilot.md',
  'templates/skills/ark-loop.md',
]);
const EXPECTED_OUTCOMES = Object.freeze([
  'merge into the existing doc comment',
  'preserve the original typed `defineRoute<…>(opts, handler)` call',
  'leave the placeholder file uncreated',
  'previously clean file stays typecheck-clean',
]);

function sourceDiagnostics(source, id) {
  if (source === null) return [];
  const fileName = path.join(HERE, 'mechanical-edit-hygiene', `${id}.ts`);
  const options = {
    noEmit: true,
    noImplicitAny: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  };
  const host = ts.createCompilerHost(options, true);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);
  host.fileExists = (candidate) => candidate === fileName || fileExists(candidate);
  host.readFile = (candidate) => candidate === fileName ? source : readFile(candidate);
  host.getSourceFile = (candidate, languageVersion, onError, shouldCreateNewSourceFile) =>
    candidate === fileName
      ? ts.createSourceFile(candidate, source, languageVersion, true)
      : getSourceFile(candidate, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram([fileName], options, host);
  return ts.getPreEmitDiagnostics(program).filter((diagnostic) => diagnostic.file?.fileName === fileName);
}

function requireOutcome(condition, message) {
  if (!condition) throw new Error(message);
}

function normalized(value) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function withoutLeadingDocComment(source) {
  return source.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*/, '');
}

function defineRouteShape(source, id) {
  const sourceFile = ts.createSourceFile(`${id}.ts`, source, ts.ScriptTarget.Latest, true);
  const calls = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineRoute'
    ) {
      calls.push({
        typeArguments: (node.typeArguments ?? []).map((argument) => argument.getText(sourceFile)),
        arguments: node.arguments.map((argument) => argument.getText(sourceFile)),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  requireOutcome(calls.length === 1, `${id}: fixture must contain exactly one defineRoute call`);
  return calls[0];
}

function validateCase(entry) {
  const beforeDiagnostics = sourceDiagnostics(entry.before, `${entry.id}-before`);
  const acceptedDiagnostics = sourceDiagnostics(entry.accepted, `${entry.id}-accepted`);
  requireOutcome(beforeDiagnostics.length === 0, `${entry.id}: before must be typecheck-clean`);
  requireOutcome(acceptedDiagnostics.length === 0, `${entry.id}: accepted edit must stay typecheck-clean`);

  if (entry.id === 'merge-existing-doc-comment') {
    requireOutcome((entry.rejected.match(/\/\*\*/g) ?? []).length === 2, `${entry.id}: rejected shape must stack doc comments`);
    requireOutcome((entry.accepted.match(/\/\*\*/g) ?? []).length === 1, `${entry.id}: accepted shape must contain one merged doc comment`);
    requireOutcome(entry.accepted.includes('Existing behavior contract.') && entry.accepted.includes('Ark boundary:'), `${entry.id}: merged comment lost content`);
    requireOutcome(withoutLeadingDocComment(entry.accepted) === withoutLeadingDocComment(entry.before), `${entry.id}: accepted edit changed code outside the merged comment`);
  } else if (entry.id === 'preserve-typed-define-route') {
    const rejectedDiagnostics = sourceDiagnostics(entry.rejected, `${entry.id}-rejected`);
    requireOutcome(rejectedDiagnostics.some((diagnostic) => diagnostic.code === 7006), `${entry.id}: rejected split must reproduce TS7006 implicit-any`);
    requireOutcome(/defineRoute<RouteContext<\{ id: string \}>>\s*\(/.test(entry.accepted), `${entry.id}: accepted edit dropped the typed call`);
    requireOutcome(!/ROUTE_(OPTS|HANDLER)/.test(entry.accepted), `${entry.id}: accepted edit kept untyped split constants`);
    requireOutcome(JSON.stringify(defineRouteShape(entry.accepted, `${entry.id}-accepted`)) === JSON.stringify(defineRouteShape(entry.before, `${entry.id}-before`)), `${entry.id}: accepted edit changed the typed call's type arguments, opts, or handler`);
  } else if (entry.id === 'no-empty-placeholder') {
    requireOutcome(/server-only/.test(entry.rejected) && /export\s*\{\s*\}/.test(entry.rejected), `${entry.id}: rejected fixture must reproduce the empty stub`);
    requireOutcome(entry.before === null && entry.accepted === null, `${entry.id}: placeholder file must remain uncreated`);
  } else {
    throw new Error(`unknown fixture case: ${entry.id}`);
  }
  return { id: entry.id, passed: true };
}

function main() {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  requireOutcome(fixture.schemaVersion === '1.0', 'unsupported fixture schema');
  requireOutcome(Array.isArray(fixture.cases) && fixture.cases.length === 3, 'fixture must retain exactly the three field defects');
  requireOutcome(JSON.stringify(fixture.skillPaths) === JSON.stringify(EXPECTED_SKILLS), 'fixture must retain the three mechanical-edit skills');
  requireOutcome(JSON.stringify(fixture.requiredSkillOutcomes) === JSON.stringify(EXPECTED_OUTCOMES), 'fixture must retain the four required outcomes');
  const cases = fixture.cases.map(validateCase);
  for (const relativePath of EXPECTED_SKILLS) {
    const body = normalized(fs.readFileSync(path.join(REPO, relativePath), 'utf8'));
    for (const outcome of EXPECTED_OUTCOMES) {
      requireOutcome(body.includes(normalized(outcome)), `${relativePath}: missing outcome ${JSON.stringify(outcome)}`);
    }
  }
  console.log(JSON.stringify({
    schemaVersion: '1.0',
    mode: 'fixture-measured',
    passed: true,
    skills: EXPECTED_SKILLS,
    requiredOutcomes: EXPECTED_OUTCOMES.length,
    cases,
  }));
}

try {
  main();
} catch (error) {
  console.error(`[mechanical-edit-hygiene] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
