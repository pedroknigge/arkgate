/**
 * ArkOrder ESLint envelope: Domain import of the plane + generic ξ update.
 */
import { isArkOrderModuleSpecifier } from '../domain/arkOrderFacts';
import { evaluateArkOrderEditorSensors } from '../domain/arkOrderSensors';
import type { AdapterViolationInput } from '../domain/adapterContract';
import type { ArkConfig } from '../domain/configTypes';
import { layerForRelativePath } from '../domain/layerMatch';
import type { AstNode, RuleContext } from './arkRunRules';

type EslintSourceHost = RuleContext & {
  sourceCode?: { getText?: () => string };
  getSourceCode?: () => { getText?: () => string };
};

function eslintSourceText(context: RuleContext): string {
  const host = context as EslintSourceHost;
  return host.sourceCode?.getText?.() ?? host.getSourceCode?.()?.getText?.() ?? '';
}

type RuleListener = Record<string, (node: AstNode) => void>;

type ArkOrderEslintHelpers = {
  findConfigPath: (startFile: string) => string | null;
  loadArkConfig: (configPath: string) => ArkConfig | null;
  lintedFilename: (context: RuleContext) => string;
  sourceIsInAnalysisScope: (config: ArkConfig, relativePath: string) => boolean;
  reportAdapterDiagnostic: (
    context: RuleContext,
    node: AstNode,
    messageId: string,
    violation: AdapterViolationInput,
    extra?: Record<string, unknown>
  ) => void;
  toProjectRelative: (configPath: string, filename: string) => string;
};

export function createArkOrderEslintRules(helpers: ArkOrderEslintHelpers) {
  function createImportRule(ruleId: 'ARKORDER_KERNEL_IN_DOMAIN' | 'ARKORDER_GENERIC_UPDATE') {
    return {
      meta: {
        type: 'problem' as const,
        docs: { description: ruleId },
        messages: { denied: '{{message}}' },
        schema: [],
      },
      create(context: RuleContext): RuleListener {
        const filename = helpers.lintedFilename(context);
        const configPath = helpers.findConfigPath(filename);
        const config = configPath ? helpers.loadArkConfig(configPath) : null;
        if (!config?.arkOrder) return {} as RuleListener;
        const relative = helpers.toProjectRelative(configPath!, filename);
        if (!helpers.sourceIsInAnalysisScope(config, relative)) return {} as RuleListener;
        const fromLayer = layerForRelativePath(relative, config.layers);
        return {
          ImportDeclaration(node: AstNode) {
            const specifier =
              typeof node.source?.value === 'string' ? node.source.value : '';
            if (ruleId === 'ARKORDER_KERNEL_IN_DOMAIN') {
              if (!isArkOrderModuleSpecifier(specifier)) return;
              if (fromLayer !== 'DomainModel' && !/^domain/i.test(fromLayer ?? '')) return;
              helpers.reportAdapterDiagnostic(context, node, 'denied', {
                ruleId,
                file: relative,
                line: node.loc?.start?.line ?? 1,
                message: 'Domain-role layer imports arkgate/order; Domain stays plane-free.',
              });
            }
          },
          Program() {
            if (ruleId !== 'ARKORDER_GENERIC_UPDATE') return;
            const source = eslintSourceText(context);
            const findings = evaluateArkOrderEditorSensors({
              arkOrder: config.arkOrder,
              file: relative,
              source,
              fromLayer,
            }).filter((item) => item.ruleId === 'ARKORDER_GENERIC_UPDATE');
            for (const finding of findings) {
              helpers.reportAdapterDiagnostic(context, { loc: { start: { line: finding.line } } }, 'denied', {
                ruleId: finding.ruleId,
                file: finding.file,
                line: finding.line,
                message: finding.message,
              });
            }
          },
        };
      },
    };
  }

  return {
    noArkOrderKernelInDomain: createImportRule('ARKORDER_KERNEL_IN_DOMAIN'),
    noArkOrderGenericUpdate: createImportRule('ARKORDER_GENERIC_UPDATE'),
  };
}
