/**
 * arkgate/eslint — editor-side architecture gate.
 *
 * Layer / import / forbidden-globals rules load `ark.config.json` from the linted
 * project (walk-up from the file) and use the same glob specificity + edge semantics
 * as ark-check. Matching primitives come from the canonical
 * `src/domain/layerMatch.ts` (CLI loads the generated `bin/ark-layer-match.mjs`) —
 * no Kernel imports.
 *
 * Severity: ESLint takes severity from the rule level, never from a report. Blocking rule
 * ids report findings that fail ark-check; non-blocking findings (type-only placement
 * debt, advisory slice walls, advisory arkRun / arkOrder / ArkRules) report on
 * `ark/architecture-advisory`, which `configs.recommended` sets to `warn`. When that rule
 * is not enabled, they fall back to the blocking rule id, tagged as advisory.
 */
import path from 'node:path';
import {
  globToRegExp,
  patternSpecificity,
  layerForRelativePath,
  isEdgeDenied,
  composeSliceDenialMessage,
  findDeniedEdgeDecision,
  sliceFindingExtras,
} from '../domain/layerMatch';
import {
  capabilityForModuleSpecifier,
  effectiveCapabilityDeny,
  forbiddenGlobalForModuleSpecifier,
} from '../domain/capabilities';
import { createArkRunEslintRules } from './arkRunRules';
import { createArkOrderEslintRules } from './arkOrderRules';
import { createArkRulesStructureRule } from './arkRulesRules';
import {
  declarationIsTypeOnly,
  isLocallyBound,
  moduleSourceListeners,
  stringValue,
} from './astHelpers';
import {
  configForRule,
  contractErrorForFile,
  contractFingerprint,
  findConfigPath,
  lintedFileInScope,
  loadArkConfig,
  sourceIsInAnalysisScope,
  withContractGuard,
} from './contractLoad';
import { noForbiddenGlobals as noForbiddenGlobalsRule } from './globalsRule';
import { noRawEventPublish as noRawEventPublishRule, requirePublishSource as requirePublishSourceRule } from './publishRules';
import { ADVISORY_MESSAGE, ADVISORY_MESSAGE_ID, createChannelListeners } from './reportChannels';
import {
  lintedFilename,
  mergeListeners,
  reportAdapterDiagnostic,
  type ArkRule,
  type AstNode,
  type RuleContext,
  type RuleListener,
} from './ruleSupport';
import {
  readTsconfigPathAliases,
  resolveImportSpecifier,
  resolveRelativeImport,
} from './tsconfigAliases';

export { globToRegExp, patternSpecificity, layerForRelativePath, isEdgeDenied };
export {
  findConfigPath,
  loadArkConfig,
  contractFingerprint,
  readTsconfigPathAliases,
  resolveImportSpecifier,
  resolveRelativeImport,
};

declare const __ARKGATE_VERSION__: string | undefined;
/** Package version, injected at build time (tsup `define`); `0.0.0-dev` from sources. */
const PLUGIN_VERSION =
  typeof __ARKGATE_VERSION__ === 'string' ? __ARKGATE_VERSION__ : '0.0.0-dev';

type ArkEslintPlugin = {
  meta: { name: string; version: string };
  rules: Record<string, ArkRule>;
  configs?: Record<string, unknown>;
};

function containingProgram(node: AstNode): AstNode | undefined {
  let current: AstNode | undefined = node;
  while (current?.parent) current = current.parent;
  return current?.type === 'Program' ? current : undefined;
}

/** Conservative ESTree counterpart of sourceFileExportsOnlyTypes for the ESLint envelope. */
function sourceProgramExportsOnlyTypes(node: AstNode): boolean {
  const statements = containingProgram(node)?.body;
  if (!statements) return false;
  let sawTypeExport = false;
  for (const statement of statements) {
    if (statement.type === 'ImportDeclaration') {
      if (!declarationIsTypeOnly(statement)) return false;
      continue;
    }
    if (statement.type === 'TSInterfaceDeclaration' || statement.type === 'TSTypeAliasDeclaration') {
      continue;
    }
    if (statement.type === 'ExportNamedDeclaration') {
      if (statement.declaration) {
        if (
          statement.declaration.type !== 'TSInterfaceDeclaration' &&
          statement.declaration.type !== 'TSTypeAliasDeclaration'
        ) {
          return false;
        }
      } else if (!declarationIsTypeOnly(statement)) {
        return false;
      }
      sawTypeExport = true;
      continue;
    }
    return false;
  }
  return sawTypeExport;
}

// ── Rules ──────────────────────────────────────────────────────────────────

/**
 * Config-driven layer import boundary (primary editor gate).
 * Replaces path-token domain/infra heuristics when ark.config.json is present.
 * Rule id kept as `no-domain-infra-imports` for recommended-config / upgrade stability.
 */
const layerImportRule: ArkRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow imports that violate ark.config.json layer rules (same contract as arkgate-check).',
    },
    messages: {
      forbiddenImport: 'Architecture: {{message}} Specifier: {{specifier}}',
      forbiddenImportHeuristic:
        'Domain code must not import infrastructure, adapters, repositories, or database modules.',
    },
    schema: [],
  },
  create(context) {
    const filename = lintedFilename(context);
    const configPath = findConfigPath(filename);
    const config = configForRule(configPath);
    const root = configPath ? path.dirname(configPath) : null;

    const check = (node: AstNode) => {
      const source = stringValue(node.source);
      if (!source) return;

      if (config && root && filename) {
        const absFile = path.isAbsolute(filename) ? filename : path.resolve(filename);
        const relFile = path.relative(root, absFile).split(path.sep).join('/');
        if (!sourceIsInAnalysisScope(config, relFile)) return;
        const fromLayer = layerForRelativePath(relFile, config.layers);
        if (!fromLayer) return;

        // P0-C: relative + tsconfig path aliases (`@/*`); bare packages still skip.
        const targetAbs = resolveImportSpecifier(absFile, source, root);
        if (!targetAbs) return; // package / unresolved alias — CI resolves via TS

        const relTarget = path.relative(root, targetAbs).split(path.sep).join('/');
        // Outside project or up-and-out: skip
        if (relTarget.startsWith('..')) return;

        const toLayer = layerForRelativePath(relTarget, config.layers);
        if (!toLayer) return;
        const edgeOpts = {
          fromPath: relFile,
          toPath: relTarget,
          layers: config.layers,
        };
        const decision = findDeniedEdgeDecision(config.rules, fromLayer, toLayer, edgeOpts);
        const deniedRule = decision?.rule;
        if (deniedRule) {
          const edgeKind = node.type?.startsWith('Export') ? 'export' : 'import';
          const typeOnlyEdge = declarationIsTypeOnly(node);
          const peerIsolation = Boolean(deniedRule?.peerIsolation);
          // Align with graphEvaluate: peerIsolation stays hard even for type-only;
          // pure type-only (non-peer) is placement debt (warning + SharedTypes hint).
          // sourcePureTypeModule alone never softens a value import.
          const typePlacementDebt = typeOnlyEdge && !peerIsolation;
          const verdict = decision?.sliceVerdict;
          const baseMsg = verdict
            ? composeSliceDenialMessage({
                surface: 'import',
                verdict,
                fromLayer,
                toLayer,
                kind: edgeKind,
                fromPath: relFile,
                toPath: relTarget,
                ruleMessage: deniedRule?.message,
                childMessage: deniedRule?.childSlices?.message,
              })
            : deniedRule?.message ?? `${fromLayer} must not ${edgeKind} ${toLayer}.`;
          const finalMsg = typePlacementDebt
            ? `${baseMsg} (type-only — type placement debt; prefer SharedTypes / owning layer; not runtime coupling)`
            : baseMsg;
          reportAdapterDiagnostic(
            context,
            node,
            'forbiddenImport',
            {
              ruleId: 'LAYER_IMPORT_VIOLATION',
              file: relFile,
              fromLayer,
              toLayer,
              target: relTarget,
              edgeKind,
              ...(peerIsolation ? { peerIsolation: true } : {}),
              ...(typeOnlyEdge ? { typeOnly: true } : {}),
              ...sliceFindingExtras(verdict),
              ...(typePlacementDebt ? { failsStrict: false, severity: 'warning' as const } : {}),
              ...(sourceProgramExportsOnlyTypes(node)
                ? { sourcePureTypeModule: true }
                : {}),
              message: finalMsg,
            },
            { fromLayer, toLayer, specifier: source, message: finalMsg }
          );
        }
        return;
      }

      // No contract means no architecture policy. CI and editor stay equally contract-driven.
    };

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    };
  },
};

const deniedCapabilitiesRule: ArkRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow importing modules whose effect capability the layer denies (ark.config.json capabilities.deny / pure — same wall surface as ark-check). Import dimension only: ambient globals stay with no-forbidden-globals and the CLI/hook symbol path.',
    },
    messages: {
      deniedCapability:
        '{{layer}} denies the {{capability}} capability (ark.config.json); "{{specifier}}" imports it. Define a port and bind the implementation in an adapter layer.',
    },
    schema: [],
  },
  create(context) {
    const filename = lintedFilename(context);
    const configPath = findConfigPath(filename);
    const config = configForRule(configPath);
    const root = configPath ? path.dirname(configPath) : null;
    if (!config || !root || !filename) return {} as RuleListener;
    const located = lintedFileInScope(config, root, filename);
    if (!located?.layer) return {} as RuleListener;
    const { relFile, layer } = located;
    const deny = new Set(effectiveCapabilityDeny(layer));
    if (deny.size === 0) return {} as RuleListener;

    const check = (
      node: AstNode,
      specifier: unknown,
      typeOnly: boolean,
      edgeKind: string
    ) => {
      if (typeOnly || typeof specifier !== 'string') return;
      if (forbiddenGlobalForModuleSpecifier(specifier, layer.forbiddenGlobals ?? [])) return;
      const capability = capabilityForModuleSpecifier(specifier);
      if (!capability || !deny.has(capability)) return;
      reportAdapterDiagnostic(
        context,
        node,
        'deniedCapability',
        {
          ruleId: 'CAPABILITY_VIOLATION',
          file: relFile,
          fromLayer: layer.name,
          target: specifier,
          capability,
          edgeKind,
          message: `${layer.name} denies the ${capability} capability; found import of "${specifier}".`,
        },
        { layer: layer.name, capability, specifier }
      );
    };

    return moduleSourceListeners(context, check);
  },
};

const arkRunRules = createArkRunEslintRules({
  findConfigPath,
  loadArkConfig: configForRule,
  resolveImportSpecifier,
  lintedFilename,
  sourceIsInAnalysisScope,
  isLocallyBound,
  reportAdapterDiagnostic,
});

function toProjectRelative(configPath: string, filename: string): string {
  const root = path.dirname(path.resolve(configPath));
  return path.relative(root, path.resolve(filename)).split(path.sep).join('/');
}

const arkOrderRules = createArkOrderEslintRules({
  findConfigPath,
  loadArkConfig: configForRule,
  lintedFilename,
  sourceIsInAnalysisScope,
  isLocallyBound,
  reportAdapterDiagnostic,
  toProjectRelative,
});

const arkRulesStructure = createArkRulesStructureRule(sourceIsInAnalysisScope);

/** Rules whose findings can be non-blocking; the advisory rule replays them. */
const softCapableRules: ArkRule[] = [
  layerImportRule,
  arkRunRules.noArkRunKernelInDomain,
  arkRunRules.noArkRunDirectNew,
  arkRunRules.noArkRunTransportBypass,
  arkOrderRules.noArkOrderKernelInDomain,
  arkOrderRules.noArkOrderGenericUpdate,
  arkRulesStructure,
];

/**
 * Warn-level channel for findings ark-check reports as warnings (`failsStrict: false`):
 * type-only placement debt, advisory sibling / slice walls, and advisory-mode arkRun,
 * arkOrder, and ArkRules findings. Runs the same evaluators as the blocking rules.
 */
const architectureAdvisoryRule: ArkRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report non-blocking Ark findings (type-only placement debt, advisory slice walls, advisory arkRun / arkOrder / ArkRules) as warnings — the same findings ark-check reports as warnings.',
    },
    messages: { [ADVISORY_MESSAGE_ID]: ADVISORY_MESSAGE },
    schema: [],
  },
  create(context: RuleContext): RuleListener {
    // An invalid contract is reported once by the blocking rules; stay silent here.
    if (contractErrorForFile(lintedFilename(context))) return {};
    // Shares one evaluation per file with the blocking rules (reportChannels.ts): no rule
    // resolves a file's imports twice.
    return mergeListeners(
      softCapableRules.map((rule) => createChannelListeners(rule, context, 'advisory'))
    );
  },
};

export const noDomainInfraImports = withContractGuard(layerImportRule);
export const noRawEventPublish = withContractGuard(noRawEventPublishRule);
export const requirePublishSource = withContractGuard(requirePublishSourceRule);
export const noForbiddenGlobals = withContractGuard(noForbiddenGlobalsRule);
export const noDeniedCapabilities = withContractGuard(deniedCapabilitiesRule);
export const noArkRunKernelInDomain = withContractGuard(arkRunRules.noArkRunKernelInDomain);
export const noArkRunDirectNew = withContractGuard(arkRunRules.noArkRunDirectNew);
export const noArkRunTransportBypass = withContractGuard(arkRunRules.noArkRunTransportBypass);
export const noArkOrderKernelInDomain = withContractGuard(arkOrderRules.noArkOrderKernelInDomain);
export const noArkOrderGenericUpdate = withContractGuard(arkOrderRules.noArkOrderGenericUpdate);
export const arkRulesStructureRule = withContractGuard(arkRulesStructure);
export const architectureAdvisory = architectureAdvisoryRule;

export const rules: Record<string, ArkRule> = {
  'no-domain-infra-imports': noDomainInfraImports,
  'no-raw-event-publish': noRawEventPublish,
  'require-publish-source': requirePublishSource,
  'no-forbidden-globals': noForbiddenGlobals,
  'no-denied-capabilities': noDeniedCapabilities,
  'no-arkrun-kernel-in-domain': noArkRunKernelInDomain,
  'no-arkrun-direct-new': noArkRunDirectNew,
  'no-arkrun-transport-bypass': noArkRunTransportBypass,
  'no-arkorder-kernel-in-domain': noArkOrderKernelInDomain,
  'no-arkorder-generic-update': noArkOrderGenericUpdate,
  'arkrules-structure': arkRulesStructureRule,
  'architecture-advisory': architectureAdvisory,
};

const RECOMMENDED_RULES = {
  'ark/no-domain-infra-imports': 'error',
  'ark/no-raw-event-publish': 'error',
  'ark/require-publish-source': 'error',
  'ark/no-forbidden-globals': 'error',
  'ark/no-denied-capabilities': 'error',
  'ark/no-arkrun-kernel-in-domain': 'error',
  'ark/no-arkrun-direct-new': 'error',
  'ark/no-arkrun-transport-bypass': 'error',
  'ark/no-arkorder-kernel-in-domain': 'error',
  'ark/no-arkorder-generic-update': 'error',
  'ark/arkrules-structure': 'error',
  'ark/architecture-advisory': 'warn',
} as const;

export const plugin: ArkEslintPlugin = {
  meta: { name: 'arkgate', version: PLUGIN_VERSION },
  rules,
};

/**
 * Flat config preset. Read lazily so `settings.ark.contractHash` fingerprints the Ark
 * contract under the current working directory: ESLint hashes settings into its
 * `--cache` key, so editing ark.config.json (or a referenced ArkRules file) invalidates
 * cached lint results. Plugin `meta` (name@version) covers arkgate upgrades.
 */
function recommendedConfig(): Record<string, unknown> {
  const contractHash = contractFingerprint();
  return {
    plugins: { ark: plugin },
    rules: { ...RECOMMENDED_RULES },
    ...(contractHash ? { settings: { ark: { contractHash } } } : {}),
  };
}

const configs: Record<string, unknown> = {};
Object.defineProperty(configs, 'recommended', {
  enumerable: true,
  configurable: true,
  get: recommendedConfig,
});
plugin.configs = configs;

export { configs };
/**
 * `plugin` and the default export are both public API of `arkgate/eslint`
 * (tests/unit/publish/eslint-cjs-shape.test.ts pins `require('arkgate/eslint').plugin`).
 * @alias
 */
export default plugin;
