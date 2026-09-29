/**
 * ArkOrder ESLint envelope: Domain import of the plane + file-local ξ sensors.
 *
 * Both rules run the ark-check sensors (`evaluateArkOrderSensors` /
 * `evaluateArkOrderEditorSensors`), so Domain-role detection (layer name or `Domain.`
 * intentPrefixes), message text, and `arkOrder.mode` severity match the CLI. Advisory-mode
 * findings are non-blocking and surface on `ark/architecture-advisory` instead.
 */
import { isArkOrderModuleSpecifier } from '../domain/arkOrderFacts';
import {
  evaluateArkOrderEditorSensors,
  evaluateArkOrderSensors,
  type ArkOrderSensorFinding,
} from '../domain/arkOrderSensors';
import type { AdapterViolationInput } from '../domain/adapterContract';
import type { ArkConfig } from '../domain/configTypes';
import { layerForRelativePath } from '../domain/layerMatch';
import type { ResolvedDependencyKind } from '../domain/resolvedCandidateFactsTypes';
import { editorSourceText, type AstNode, type RuleContext, type RuleListener } from './ruleSupport';

type ArkOrderEslintHelpers = {
  findConfigPath: (startFile: string) => string | null;
  loadArkConfig: (configPath: string) => ArkConfig | null;
  lintedFilename: (context: RuleContext) => string;
  sourceIsInAnalysisScope: (config: ArkConfig, relativePath: string) => boolean;
  isLocallyBound: (context: RuleContext, node: AstNode, name: string) => boolean;
  reportAdapterDiagnostic: (
    context: RuleContext,
    node: AstNode,
    messageId: string,
    violation: AdapterViolationInput,
    data?: Record<string, unknown>
  ) => unknown;
  toProjectRelative: (configPath: string, filename: string) => string;
};

type OrderFile = { config: ArkConfig; relative: string; fromLayer: string | null };

function violationFor(finding: ArkOrderSensorFinding): AdapterViolationInput {
  return {
    ruleId: finding.ruleId,
    file: finding.file,
    line: finding.line,
    fromLayer: finding.fromLayer,
    target: finding.target,
    message: finding.message,
    severity: finding.severity,
    failsStrict: finding.failsStrict,
    nextAction: finding.nextAction,
  };
}

/** Whole-line location for a line-only sensor finding (ESLint columns are 0-based). */
function lineNode(source: string, line: number): AstNode {
  const text = source.split(/\r?\n/)[line - 1] ?? '';
  const indent = text.length - text.trimStart().length;
  return {
    loc: {
      start: { line, column: indent },
      end: { line, column: Math.max(indent, text.length) },
    },
  };
}

function isTypeOnlyDeclaration(node: AstNode): boolean {
  if (node.importKind === 'type' || node.exportKind === 'type') return true;
  const specifiers = node.specifiers ?? [];
  return (
    specifiers.length > 0 &&
    specifiers.every(
      (specifier) => specifier.importKind === 'type' || specifier.exportKind === 'type'
    )
  );
}

export function createArkOrderEslintRules(helpers: ArkOrderEslintHelpers) {
  function loadOrderFile(context: RuleContext): OrderFile | null {
    const filename = helpers.lintedFilename(context);
    const configPath = helpers.findConfigPath(filename);
    const config = configPath ? helpers.loadArkConfig(configPath) : null;
    if (!config?.arkOrder || !configPath) return null;
    const relative = helpers.toProjectRelative(configPath, filename);
    if (!helpers.sourceIsInAnalysisScope(config, relative)) return null;
    return { config, relative, fromLayer: layerForRelativePath(relative, config.layers) ?? null };
  }

  const kernelInDomain = {
    meta: {
      type: 'problem' as const,
      docs: {
        description:
          'Disallow Domain-role imports of arkgate/order when arkOrder is on (same ARKORDER_KERNEL_IN_DOMAIN sensor as ark-check).',
      },
      messages: { denied: '{{message}}' },
      schema: [],
    },
    create(context: RuleContext): RuleListener {
      const file = loadOrderFile(context);
      if (!file?.fromLayer) return {};
      const { config, relative } = file;
      const check = (node: AstNode, specifier: unknown, typeOnly: boolean, kind: ResolvedDependencyKind) => {
        if (typeof specifier !== 'string' || !isArkOrderModuleSpecifier(specifier)) return;
        const line = node.loc?.start?.line ?? 1;
        const { findings } = evaluateArkOrderSensors({
          arkOrder: config.arkOrder,
          layers: config.layers,
          planeCalls: [],
          genericUpdates: [],
          planeRootHits: [],
          dependencies: [
            { from: relative, specifier, kind, typeOnly, line, resolution: 'resolved-external' },
          ],
          layerForFile: (candidate) =>
            candidate === relative ? file.fromLayer : layerForRelativePath(candidate, config.layers),
        });
        for (const finding of findings) {
          if (finding.sensor !== 'arkorder-kernel-in-domain') continue;
          helpers.reportAdapterDiagnostic(context, node, 'denied', violationFor(finding), {
            message: finding.message,
          });
        }
      };
      return {
        ImportDeclaration(node) {
          check(node, node.source?.value, isTypeOnlyDeclaration(node), 'import');
        },
        ExportNamedDeclaration(node) {
          if (node.source) check(node, node.source.value, isTypeOnlyDeclaration(node), 'export');
        },
        ExportAllDeclaration(node) {
          check(node, node.source?.value, node.exportKind === 'type', 'export');
        },
        ImportExpression(node) {
          if (node.source?.type === 'Literal') check(node, node.source.value, false, 'dynamic-import');
        },
        CallExpression(node) {
          const first = node.arguments?.[0];
          if (
            node.callee?.type === 'Identifier' &&
            node.callee.name === 'require' &&
            first?.type === 'Literal' &&
            !helpers.isLocallyBound(context, node, 'require')
          ) {
            check(node, first.value, false, 'require');
          }
        },
      };
    },
  };

  const genericUpdate = {
    meta: {
      type: 'problem' as const,
      docs: {
        description:
          'Disallow file-local ξ rewrites on the order plane: generic update(), ξ field writes, ingest→ξ, and oversized release() (same ARKORDER_* sensors as ark-check).',
      },
      messages: { denied: '{{message}}' },
      schema: [],
    },
    create(context: RuleContext): RuleListener {
      const file = loadOrderFile(context);
      if (!file) return {};
      return {
        Program() {
          const source = editorSourceText(context) ?? '';
          const findings = evaluateArkOrderEditorSensors({
            arkOrder: file.config.arkOrder,
            file: file.relative,
            source,
            fromLayer: file.fromLayer,
          }).filter((item) => item.ruleId !== 'ARKORDER_KERNEL_IN_DOMAIN');
          for (const finding of findings) {
            helpers.reportAdapterDiagnostic(
              context,
              lineNode(source, finding.line),
              'denied',
              violationFor(finding),
              { message: finding.message }
            );
          }
        },
      };
    },
  };

  return {
    noArkOrderKernelInDomain: kernelInDomain,
    noArkOrderGenericUpdate: genericUpdate,
  };
}
