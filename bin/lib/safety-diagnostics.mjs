import fs from 'node:fs';
import path from 'node:path';

import { globToRegExp } from '../ark-shared.mjs';
import { extractSemanticDependencies } from './analysis-engine.mjs';
import { lineOf } from './ast-scan.mjs';
import {
  arkInMemoryFactoryBindings,
  arkInMemoryStoreImports,
  inMemoryDefaultsFactoryCall,
  tsSuppressionPositions,
} from './resolved-candidate-facts.mjs';
import { normalize } from './scan-files.mjs';

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
    // Most source files cannot contain a safety finding. Avoid parsing a second AST when the
    // lexical markers for every supported diagnostic are absent; a match only opts into the
    // existing exact AST analysis, so this cannot suppress a finding.
    if (!/@ts-(?:ignore|nocheck)\b|\bany\b|\b(?:import|require)\s*\(|\barkgate(?:\/runtime)?\b/.test(source)) {
      continue;
    }
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const relFile = normalize(path.relative(root, file));

    if (!matchesAny(relFile, dynamicAllowlist)) {
      for (const dependency of extractSemanticDependencies(ts, sourceFile)) {
        if (!dependency.unresolved) continue;
        report.nonLiteralDynamicImports.push({
          file: relFile,
          line: dependency.line,
          kind: dependency.kind === 'require' ? 'require' : 'import',
        });
      }
    }

    for (const position of tsSuppressionPositions(sourceFile, source)) {
      report.tsSuppressions.push({
        file: relFile,
        line: lineOf(sourceFile, position),
      });
    }

    const factoryBindings =
      !allowInMemory && !isProvider
        ? arkInMemoryFactoryBindings(ts, sourceFile)
        : { importedFactories: new Map(), arkNamespaces: new Set() };

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

      if (!allowInMemory && !isProvider && ts.isImportDeclaration(node)) {
        for (const { element, imported } of arkInMemoryStoreImports(ts, node)) {
          report.inMemoryProductionStores.push({
            file: relFile,
            line: lineOf(sourceFile, element.getStart(sourceFile)),
            store: imported,
          });
        }
      }

      if (!allowInMemory && !isProvider && ts.isCallExpression(node)) {
        const factory = inMemoryDefaultsFactoryCall(ts, node, factoryBindings);
        if (factory) {
          report.inMemoryProductionStores.push({
            file: relFile,
            line: lineOf(sourceFile, node.getStart(sourceFile)),
            store: `${factory.imported} defaults`,
          });
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  const warnings = [];
  const nonLiteralImports = report.nonLiteralDynamicImports.filter(
    (entry) => entry.kind !== 'require'
  );
  if (nonLiteralImports.length > 0) {
    const first = nonLiteralImports[0];
    warnings.push({
      ruleId: 'DYNAMIC_IMPORT_NOT_ALLOWLISTED',
      file: first.file,
      line: first.line,
      message: `${nonLiteralImports.length} non-literal dynamic import(s) cannot be resolved statically. Add only reviewed files to dynamicImportAllowlist.`,
    });
  }
  const nonLiteralRequires = report.nonLiteralDynamicImports.filter(
    (entry) => entry.kind === 'require'
  );
  if (nonLiteralRequires.length > 0) {
    const first = nonLiteralRequires[0];
    warnings.push({
      ruleId: 'DYNAMIC_REQUIRE_NOT_ALLOWLISTED',
      file: first.file,
      line: first.line,
      message: `${nonLiteralRequires.length} non-literal require call(s) cannot be resolved statically. Add only reviewed files to dynamicImportAllowlist.`,
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
