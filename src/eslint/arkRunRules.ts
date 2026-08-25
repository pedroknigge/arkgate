/**
 * ArkRun ESLint envelope: import + `new` of the same sensors as ark-check.
 * Missing-root and undeclared-* need project-wide / declaration facts — CLI/MCP only.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  extractArkRunKernelCallsFromSource,
  extractArkRunManagedNewsFromSource,
  forEachArkRunValueImportClause,
  isArkRunKernelModuleSpecifier,
} from '../domain/arkRunFacts';
import { extractClassShapesFromSource } from '../domain/arkRuleSensors';
import {
  ARKRUN_EDITOR_SENSOR_IDS,
  evaluateArkRunEditorSensors,
  type ArkRunEditorSensorId,
  type ArkRunSensorFinding,
} from '../domain/arkRunSensors';
import type { AdapterViolationInput } from '../domain/adapterContract';
import type { ArkConfig, ArkConfigArkRun } from '../domain/configTypes';
import { globToRegExp, layerForRelativePath } from '../domain/layerMatch';
import type {
  ResolvedArkRunCompositionRootHitFact,
  ResolvedDependencyFact,
  ResolvedDependencyKind,
} from '../domain/resolvedCandidateFactsTypes';

export type RuleContext = {
  report(descriptor: Record<string, unknown>): void;
  filename?: string;
  physicalFilename?: string;
  getFilename?: () => string;
  options?: unknown[];
};

export type AstNode = {
  type?: string;
  name?: string;
  value?: unknown;
  source?: AstNode;
  callee?: AstNode;
  object?: AstNode;
  property?: AstNode;
  arguments?: AstNode[];
  importKind?: string;
  exportKind?: string;
  specifiers?: AstNode[];
  loc?: { start?: { line?: number; column?: number } };
  computed?: boolean;
};

type RuleListener = Record<string, (node: AstNode) => void>;

type ArkRule = {
  meta: {
    type: 'problem';
    docs: { description: string };
    messages: Record<string, string>;
    schema: unknown[];
  };
  create(context: RuleContext): RuleListener;
};

export type ArkRunEslintHelpers = {
  findConfigPath: (startFile: string) => string | null;
  loadArkConfig: (configPath: string) => ArkConfig | null;
  resolveImportSpecifier: (
    fromFile: string,
    specifier: string,
    projectRoot?: string | null
  ) => string | null;
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
};

type EditorFile = {
  extra: ArkConfigArkRun;
  config: ArkConfig;
  root: string;
  absFile: string;
  relFile: string;
  fromLayer: string;
};

function declarationIsTypeOnly(node: AstNode): boolean {
  if (node.importKind === 'type' || node.exportKind === 'type') return true;
  const specifiers = (node.specifiers ?? []) as Array<{
    type?: string;
    importKind?: string;
    exportKind?: string;
  }>;
  if (specifiers.length === 0) return false;
  if (specifiers.every((specifier) => specifier.type === 'ImportSpecifier')) {
    return specifiers.every((specifier) => specifier.importKind === 'type');
  }
  return specifiers.every((specifier) => specifier.exportKind === 'type');
}

function readUtf8(file: string): string | null {
  try {
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function loadEditorFile(helpers: ArkRunEslintHelpers, context: RuleContext): EditorFile | null {
  const filename = helpers.lintedFilename(context);
  const configPath = helpers.findConfigPath(filename);
  const config = configPath ? helpers.loadArkConfig(configPath) : null;
  if (!config?.arkRun || !configPath || !filename) return null;
  const root = path.dirname(configPath);
  const absFile = path.isAbsolute(filename) ? filename : path.resolve(filename);
  const relFile = path.relative(root, absFile).split(path.sep).join('/');
  if (!helpers.sourceIsInAnalysisScope(config, relFile)) return null;
  const fromLayer = layerForRelativePath(relFile, config.layers);
  if (!fromLayer) return null;
  return { extra: config.arkRun, config, root, absFile, relFile, fromLayer };
}

function compositionRootHitsForFile(
  extra: ArkConfigArkRun,
  relFile: string,
  content: string
): ResolvedArkRunCompositionRootHitFact[] {
  const hasFactory = extractArkRunKernelCallsFromSource(relFile, content).some(
    (call) => call.kind === 'factory'
  );
  const hits: ResolvedArkRunCompositionRootHitFact[] = [];
  for (const pattern of extra.compositionRoots) {
    try {
      if (!globToRegExp(pattern).test(relFile)) continue;
    } catch {
      continue;
    }
    hits.push({ file: relFile, matchedRoot: pattern, hasKernelFactory: hasFactory });
  }
  return hits;
}

function admittedTypeNamesForEditor(
  helpers: ArkRunEslintHelpers,
  file: EditorFile,
  content: string
): Set<string> {
  const admitted = new Set(
    extractClassShapesFromSource(file.relFile, content).map((shape) => shape.className)
  );
  forEachArkRunValueImportClause(content, (_clause, specifier) => {
    if (isArkRunKernelModuleSpecifier(specifier)) return;
    const targetAbs = helpers.resolveImportSpecifier(file.absFile, specifier, file.root);
    if (!targetAbs) return;
    const relTarget = path.relative(file.root, targetAbs).split(path.sep).join('/');
    if (relTarget.startsWith('..')) return;
    const targetContent = readUtf8(targetAbs);
    if (targetContent === null) return;
    for (const shape of extractClassShapesFromSource(relTarget, targetContent)) {
      admitted.add(shape.className);
    }
  });
  return admitted;
}

function reportFinding(
  helpers: ArkRunEslintHelpers,
  context: RuleContext,
  node: AstNode,
  messageId: string,
  finding: ArkRunSensorFinding,
  data: Record<string, unknown>
): void {
  helpers.reportAdapterDiagnostic(
    context,
    node,
    messageId,
    {
      ruleId: finding.ruleId,
      file: finding.file,
      fromLayer: finding.fromLayer,
      target: finding.target,
      message: finding.message,
      line: finding.line,
      severity: finding.severity,
      failsStrict: finding.failsStrict,
      nextAction: finding.nextAction,
    },
    data
  );
}

function constructedTypeName(node: AstNode): string | undefined {
  const callee = node.callee;
  if (callee?.type === 'Identifier' && callee.name && /^[A-Z]/.test(callee.name)) {
    return callee.name;
  }
  const property = callee?.property?.name;
  if (property && /^[A-Z]/.test(property) && callee?.computed !== true) return property;
  return undefined;
}

function specifierEdgeKind(node: AstNode, fallback: ResolvedDependencyKind): ResolvedDependencyKind {
  if (node.type?.startsWith('Export')) return 'export';
  return fallback;
}

function importListeners(
  helpers: ArkRunEslintHelpers,
  context: RuleContext,
  file: EditorFile,
  sensor: ArkRunEditorSensorId,
  messageId: string
): RuleListener {
  const check = (
    node: AstNode,
    specifier: unknown,
    typeOnly: boolean,
    kind: ResolvedDependencyKind
  ) => {
    if (typeof specifier !== 'string' || specifier.length === 0) return;
    const line = node.loc?.start?.line ?? 1;
    const dependency: ResolvedDependencyFact = {
      from: file.relFile,
      specifier,
      kind,
      typeOnly,
      line,
      resolution: 'resolved-external',
    };
    const { findings } = evaluateArkRunEditorSensors({
      arkRun: file.extra,
      layers: file.config.layers,
      kernelCalls: [],
      managedNews: [],
      compositionRootHits: [],
      declarations: [],
      dependencies: [dependency],
      layerForFile: (pathValue) =>
        pathValue === file.relFile
          ? file.fromLayer
          : layerForRelativePath(pathValue, file.config.layers),
    });
    for (const finding of findings) {
      if (finding.sensor !== sensor) continue;
      reportFinding(helpers, context, node, messageId, finding, {
        fromLayer: finding.fromLayer ?? file.fromLayer,
        specifier,
        target: finding.target ?? specifier,
      });
    }
  };

  return {
    ImportDeclaration(node) {
      const importNode = node as AstNode & {
        source?: { value?: unknown };
        importKind?: string;
        specifiers?: Array<{ importKind?: string; type?: string }>;
      };
      const named = (importNode.specifiers ?? []).filter(
        (specifier) => specifier.type === 'ImportSpecifier'
      );
      const allNamedTypeOnly =
        named.length > 0 &&
        named.length === (importNode.specifiers ?? []).length &&
        named.every((specifier) => specifier.importKind === 'type');
      check(
        node,
        importNode.source?.value,
        importNode.importKind === 'type' || allNamedTypeOnly || declarationIsTypeOnly(node),
        'import'
      );
    },
    ImportExpression(node) {
      const importNode = node as AstNode & { source?: { type?: string; value?: unknown } };
      if (importNode.source?.type === 'Literal') {
        check(node, importNode.source.value, false, 'dynamic-import');
      }
    },
    TSImportEqualsDeclaration(node) {
      const importNode = node as AstNode & {
        importKind?: string;
        isTypeOnly?: boolean;
        moduleReference?: { expression?: { value?: unknown } };
      };
      check(
        node,
        importNode.moduleReference?.expression?.value,
        importNode.importKind === 'type' || importNode.isTypeOnly === true,
        'require'
      );
    },
    ExportNamedDeclaration(node) {
      const exportNode = node as AstNode & {
        source?: { value?: unknown };
        exportKind?: string;
        specifiers?: Array<{ exportKind?: string }>;
      };
      if (!exportNode.source) return;
      const specifiers = (exportNode.specifiers ?? []) as Array<{ exportKind?: string }>;
      const allTypeOnly =
        specifiers.length > 0 && specifiers.every((specifier) => specifier.exportKind === 'type');
      check(
        node,
        exportNode.source.value,
        exportNode.exportKind === 'type' || allTypeOnly,
        specifierEdgeKind(node, 'export')
      );
    },
    ExportAllDeclaration(node) {
      const exportNode = node as AstNode & { source?: { value?: unknown }; exportKind?: string };
      check(
        node,
        exportNode.source?.value,
        exportNode.exportKind === 'type',
        'export'
      );
    },
    CallExpression(node) {
      const call = node as AstNode & {
        callee?: { type?: string; name?: string };
        arguments?: Array<{ type?: string; value?: unknown }>;
      };
      if (
        call.callee?.type === 'Identifier' &&
        call.callee.name === 'require' &&
        call.arguments?.[0]?.type === 'Literal' &&
        !helpers.isLocallyBound(context, node, 'require')
      ) {
        check(node, call.arguments[0].value, false, 'require');
      }
    },
  };
}

function directNewListener(
  helpers: ArkRunEslintHelpers,
  context: RuleContext,
  file: EditorFile
): RuleListener {
  const content = readUtf8(file.absFile) ?? '';
  const admitted = admittedTypeNamesForEditor(helpers, file, content);
  const managedNews = extractArkRunManagedNewsFromSource(file.relFile, content, admitted);
  const { findings } = evaluateArkRunEditorSensors({
    arkRun: file.extra,
    layers: file.config.layers,
    kernelCalls: extractArkRunKernelCallsFromSource(file.relFile, content),
    managedNews,
    compositionRootHits: compositionRootHitsForFile(file.extra, file.relFile, content),
    declarations: [],
    dependencies: [],
    layerForFile: (pathValue) =>
      pathValue === file.relFile
        ? file.fromLayer
        : layerForRelativePath(pathValue, file.config.layers),
  });
  const newsFindings = findings.filter((item) => item.sensor === 'arkrun-direct-new');

  return {
    NewExpression(node) {
      const typeName = constructedTypeName(node);
      if (!typeName) return;
      const line = node.loc?.start?.line;
      const finding =
        newsFindings.find(
          (item) => item.target === typeName && (line === undefined || item.line === line)
        ) ?? newsFindings.find((item) => item.target === typeName);
      if (!finding) return;
      reportFinding(helpers, context, node, 'directNew', finding, {
        fromLayer: finding.fromLayer ?? file.fromLayer,
        typeName,
        target: finding.target ?? typeName,
      });
    },
  };
}

export function createArkRunEslintRules(helpers: ArkRunEslintHelpers): {
  noArkRunKernelInDomain: ArkRule;
  noArkRunDirectNew: ArkRule;
  noArkRunTransportBypass: ArkRule;
} {
  const createImportRule = (
    sensor: (typeof ARKRUN_EDITOR_SENSOR_IDS)[number],
    description: string,
    messageId: string,
    message: string
  ): ArkRule => ({
    meta: {
      type: 'problem',
      docs: { description },
      messages: { [messageId]: message },
      schema: [],
    },
    create(context) {
      const file = loadEditorFile(helpers, context);
      if (!file) return {} as RuleListener;
      return importListeners(helpers, context, file, sensor, messageId);
    },
  });

  return {
    noArkRunKernelInDomain: createImportRule(
      'arkrun-kernel-in-domain',
      'Disallow Domain-role imports of @arkgate/runtime when arkRun is on (same sensor as ark-check).',
      'kernelInDomain',
      '{{fromLayer}} must not import kernel module "{{specifier}}".'
    ),
    noArkRunTransportBypass: createImportRule(
      'arkrun-transport-bypass',
      'Disallow homemade broker/queue/emitter imports in arkRun managed layers (same sensor as ark-check).',
      'transportBypass',
      '{{fromLayer}} must not import broker/queue/emitter "{{specifier}}"; use the ArkRun kernel transport.'
    ),
    noArkRunDirectNew: {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Disallow `new` of ArkRun-admitted types outside a composition-root factory (on-disk import/`new` envelope).',
        },
        messages: {
          directNew:
            '{{fromLayer}} must not construct {{typeName}} with new outside an ArkRun composition-root factory.',
        },
        schema: [],
      },
      create(context) {
        const file = loadEditorFile(helpers, context);
        if (!file) return {} as RuleListener;
        return directNewListener(helpers, context, file);
      },
    },
  };
}
