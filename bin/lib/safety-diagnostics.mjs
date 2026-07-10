import fs from 'node:fs';
import path from 'node:path';

import { globToRegExp } from '../ark-shared.mjs';
import { lineOf } from './ast-scan.mjs';
import { normalize } from './scan-files.mjs';

const IN_MEMORY_STORES = new Set([
  'InMemoryAuditStore',
  'InMemoryOutboxStore',
  'InMemoryReadModelStore',
  'InMemoryWorkflowStore',
]);

const IN_MEMORY_DEFAULT_FACTORIES = new Map([
  ['createArkKernel', ['outbox', 'auditTrail', 'projections']],
  ['createAuditTrail', ['store']],
  ['createProjectionRegistry', ['store']],
  ['createWorkflowEngine', ['store']],
]);

function matchesAny(relFile, patterns) {
  return patterns.some((pattern) => {
    try {
      return globToRegExp(pattern).test(relFile);
    } catch {
      return false;
    }
  });
}

function packageName(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name;
  } catch {
    return undefined;
  }
}

function propertyName(ts, node) {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return undefined;
}

function objectHasProperty(ts, object, name) {
  return object.properties.some((property) => {
    if (ts.isShorthandPropertyAssignment(property)) return property.name.text === name;
    return property.name ? propertyName(ts, property.name) === name : false;
  });
}

function tsSuppressionPositions(sourceFile, source) {
  const positions = new Set();
  for (const directive of sourceFile.commentDirectives ?? []) {
    const start = directive.range?.pos;
    const end = directive.range?.end;
    if (Number.isInteger(start) && Number.isInteger(end)) {
      const text = source.slice(start, end);
      if (/\@ts-ignore\b/.test(text)) positions.add(start);
    }
  }

  const noCheck = sourceFile.pragmas?.get?.('ts-nocheck');
  const entries = Array.isArray(noCheck) ? noCheck : noCheck ? [noCheck] : [];
  for (const entry of entries) {
    const start = entry.range?.pos;
    if (Number.isInteger(start)) positions.add(start);
  }
  return [...positions];
}

export function collectSafetyDiagnostics(ts, root, config, files) {
  const safety = config.safety ?? {};
  const dynamicAllowlist = Array.isArray(config.dynamicImportAllowlist)
    ? config.dynamicImportAllowlist
    : [];
  const maxTsSuppressions = Number.isInteger(safety.maxTsSuppressions)
    ? safety.maxTsSuppressions
    : 0;
  const maxAnyCasts = Number.isInteger(safety.maxAnyCasts) ? safety.maxAnyCasts : 0;
  const allowInMemory = safety.allowInMemory === true;
  const isProvider = packageName(root) === 'arkgate';
  const report = {
    tsSuppressions: [],
    anyCasts: [],
    nonLiteralDynamicImports: [],
    inMemoryProductionStores: [],
    disabledPeerIsolationRules: [],
    thresholds: { maxTsSuppressions, maxAnyCasts },
  };

  if (safety.allowDisabledPeerIsolation !== true) {
    report.disabledPeerIsolationRules = (config.rules ?? [])
      .filter(
        (rule) =>
          rule?.peerIsolation === false ||
          (rule?.allowed === false &&
            rule?.from &&
            rule.from === rule.to &&
            rule.peerIsolation !== true)
      )
      .map((rule) => ({ from: rule.from, to: rule.to }));
  }

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const relFile = normalize(path.relative(root, file));

    for (const position of tsSuppressionPositions(sourceFile, source)) {
      report.tsSuppressions.push({
        file: relFile,
        line: lineOf(sourceFile, position),
      });
    }

    const importedFactories = new Map();
    const arkNamespaces = new Set();
    if (!allowInMemory && !isProvider) {
      for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier)) {
          continue;
        }
        if (!/^arkgate(?:\/runtime)?$/.test(statement.moduleSpecifier.text)) continue;
        const bindings = statement.importClause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) arkNamespaces.add(bindings.name.text);
        if (!bindings || !ts.isNamedImports(bindings)) continue;
        for (const element of bindings.elements) {
          const imported = element.propertyName?.text ?? element.name.text;
          const requirements = IN_MEMORY_DEFAULT_FACTORIES.get(imported);
          if (requirements) {
            importedFactories.set(element.name.text, { imported, requirements });
          }
        }
      }
    }

    const visit = (node) => {
      if (
        (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
        node.type?.kind === ts.SyntaxKind.AnyKeyword
      ) {
        report.anyCasts.push({
          file: relFile,
          line: lineOf(sourceFile, node.getStart(sourceFile)),
        });
      }

      if (ts.isCallExpression(node) && node.expression?.kind === ts.SyntaxKind.ImportKeyword) {
        const argument = node.arguments[0];
        if (!argument || !ts.isStringLiteralLike(argument)) {
          if (!matchesAny(relFile, dynamicAllowlist)) {
            report.nonLiteralDynamicImports.push({
              file: relFile,
              line: lineOf(sourceFile, node.getStart(sourceFile)),
            });
          }
        }
      }

      if (!allowInMemory && !isProvider && ts.isImportDeclaration(node)) {
        const specifier = node.moduleSpecifier;
        const fromArk = ts.isStringLiteralLike(specifier) && /^arkgate(?:\/runtime)?$/.test(specifier.text);
        if (fromArk) {
          const elements = node.importClause?.namedBindings &&
            ts.isNamedImports(node.importClause.namedBindings)
            ? node.importClause.namedBindings.elements
            : [];
          for (const element of elements) {
            const imported = element.propertyName?.text ?? element.name.text;
            if (IN_MEMORY_STORES.has(imported)) {
              report.inMemoryProductionStores.push({
                file: relFile,
                line: lineOf(sourceFile, element.getStart(sourceFile)),
                store: imported,
              });
            }
          }
        }
      }

      if (!allowInMemory && !isProvider && ts.isCallExpression(node)) {
        let factory;
        if (ts.isIdentifier(node.expression)) {
          factory = importedFactories.get(node.expression.text);
        } else if (
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          arkNamespaces.has(node.expression.expression.text)
        ) {
          const imported = node.expression.name.text;
          const requirements = IN_MEMORY_DEFAULT_FACTORIES.get(imported);
          if (requirements) factory = { imported, requirements };
        }

        if (factory) {
          const options = node.arguments[0];
          const definitelyDefaults =
            !options ||
            (ts.isIdentifier(options) && options.text === 'undefined') ||
            (ts.isObjectLiteralExpression(options) &&
              factory.requirements.some((name) => !objectHasProperty(ts, options, name)));
          if (definitelyDefaults) {
            report.inMemoryProductionStores.push({
              file: relFile,
              line: lineOf(sourceFile, node.getStart(sourceFile)),
              store: `${factory.imported} defaults`,
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  const warnings = [];
  if (report.nonLiteralDynamicImports.length > 0) {
    const first = report.nonLiteralDynamicImports[0];
    warnings.push({
      ruleId: 'DYNAMIC_IMPORT_NOT_ALLOWLISTED',
      file: first.file,
      line: first.line,
      message: `${report.nonLiteralDynamicImports.length} non-literal dynamic import(s) cannot be resolved statically. Add only reviewed files to dynamicImportAllowlist.`,
    });
  }
  if (report.tsSuppressions.length > maxTsSuppressions) {
    const first = report.tsSuppressions[0];
    warnings.push({
      ruleId: 'TS_SUPPRESSION_THRESHOLD_EXCEEDED',
      file: first.file,
      line: first.line,
      message: `${report.tsSuppressions.length} @ts-ignore/@ts-nocheck directive(s) exceed safety.maxTsSuppressions (${maxTsSuppressions}).`,
    });
  }
  if (report.anyCasts.length > maxAnyCasts) {
    const first = report.anyCasts[0];
    warnings.push({
      ruleId: 'ANY_CAST_THRESHOLD_EXCEEDED',
      file: first.file,
      line: first.line,
      message: `${report.anyCasts.length} explicit any cast(s) exceed safety.maxAnyCasts (${maxAnyCasts}).`,
    });
  }
  if (report.inMemoryProductionStores.length > 0) {
    const first = report.inMemoryProductionStores[0];
    warnings.push({
      ruleId: 'IN_MEMORY_STORE_IN_PRODUCTION_SOURCE',
      file: first.file,
      line: first.line,
      message: `${report.inMemoryProductionStores.length} ArkGate InMemory store risk(s) appear in governed production source. Provide durable stores or set safety.allowInMemory only for an explicitly ephemeral service.`,
    });
  }
  if (report.disabledPeerIsolationRules.length > 0) {
    warnings.push({
      ruleId: 'PEER_ISOLATION_DISABLED',
      message: `${report.disabledPeerIsolationRules.length} rule(s) disable or omit required peerIsolation. Restore peerIsolation: true or set safety.allowDisabledPeerIsolation only with a documented production exception.`,
    });
  }

  return { report, warnings };
}
