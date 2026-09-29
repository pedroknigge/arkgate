/**
 * ArkRules ESLint envelope: file-local structure sensors on the resolved Effective Contract.
 *
 * Runs the same pure Domain evaluators as ark-check (`extractClassShapesFromSource`,
 * `deriveArkRuleFileHints`, `evaluateArkRuleSensors`) on the editor buffer of the linted
 * file. Cross-file ArkRules signals stay CLI / preflight / CI only: invariant coverage and
 * invariant catalogs, empty-appliesTo, the structural-hint budget, and persistence hints that
 * need resolved import layers.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  deriveArkRuleFileHints,
  evaluateArkRuleSensors,
  extractClassShapesFromSource,
  type ClassShapeFact,
} from '../domain/arkRuleSensors';
import { layerForRelativePath } from '../domain/layerMatch';
import type { ArkConfig } from '../domain/configTypes';
import { findConfigPath, loadArkContract } from './contractLoad';
import {
  editorSourceText,
  lintedFilename,
  reportAdapterDiagnostic,
  type ArkRule,
  type AstNode,
  type RuleListener,
} from './ruleSupport';

/** Same cap as the CLI structural-hint preload (bin/lib/arkrule-file-hints.mjs). */
const MAX_HINT_BYTES = 256 * 1024;

type ScopeCheck = (config: ArkConfig, relativePath: string) => boolean;

function readUtf8(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function classShapesFor(relFile: string, content: string): ClassShapeFact[] {
  if (!/\.(tsx?|mts|cts)$/i.test(relFile)) return [];
  try {
    return extractClassShapesFromSource(relFile, content);
  } catch {
    return [];
  }
}

function hintsFor(relFile: string, content: string) {
  if (!/\.(tsx?|mts|cts|jsx?|mjs|cjs)$/i.test(relFile) || relFile.endsWith('.d.ts')) return {};
  if (content.length > MAX_HINT_BYTES) return {};
  const hint = deriveArkRuleFileHints(relFile, content);
  return hint ? { [relFile]: hint } : {};
}

export function createArkRulesStructureRule(sourceIsInAnalysisScope: ScopeCheck): ArkRule {
  return {
    meta: {
      type: 'problem',
      docs: {
        description:
          'Report ArkRules structure-sensor findings for the linted file (same Effective Contract and evaluators as ark-check; file-local sensors only).',
      },
      messages: {
        structure: 'ArkRules {{arkruleId}} ({{sensor}}): {{message}}',
      },
      schema: [],
    },
    create(context): RuleListener {
      const filename = lintedFilename(context);
      const configPath = findConfigPath(filename);
      if (!configPath || !filename) return {};
      const contract = loadArkContract(configPath);
      const config = contract.config;
      if (!config || contract.arkRules.structure.length === 0) return {};
      const root = path.dirname(configPath);
      const absFile = path.resolve(filename);
      const relFile = path.relative(root, absFile).split(path.sep).join('/');
      if (!sourceIsInAnalysisScope(config, relFile)) return {};
      const fromLayer = layerForRelativePath(relFile, config.layers);

      return {
        Program(node: AstNode) {
          const content = editorSourceText(context) ?? readUtf8(absFile);
          const violations = evaluateArkRuleSensors({
            arkRules: contract.arkRules,
            classShapes: classShapesFor(relFile, content),
            files: [relFile],
            layerForFile: (candidate) =>
              candidate === relFile ? fromLayer : layerForRelativePath(candidate, config.layers),
            fileHints: hintsFor(relFile, content),
          }).filter((violation) => violation.file === relFile);
          for (const violation of violations) {
            reportAdapterDiagnostic(
              context,
              { loc: { start: { line: violation.line } }, parent: node },
              'structure',
              {
                ruleId: violation.ruleId,
                code: violation.code,
                file: relFile,
                line: violation.line,
                fromLayer: violation.fromLayer,
                arkruleId: violation.arkruleId,
                arkruleSource: violation.arkruleSource,
                severity: violation.severity,
                failsStrict: violation.failsStrict,
                message: violation.message,
              },
              {
                arkruleId: violation.arkruleId,
                sensor: violation.sensor,
                message: violation.message,
              }
            );
          }
        },
      };
    },
  };
}
