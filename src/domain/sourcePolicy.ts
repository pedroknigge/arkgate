/** Pure source-policy decisions. Adapters extract syntax facts; this module owns rule outcomes. */

export const SOURCE_POLICY_MESSAGES = {
  RAW_EVENT_PUBLISH:
    'Publish through a registered intent creator; raw event objects or intent strings bypass Ark contracts and tooling.',
  PUBLISH_MISSING_SOURCE: 'Strict Ark publish calls must include metadata.source.',
} as const;

export const DEFAULT_INTENT_PREFIXES = Object.freeze([
  { layer: 'DomainModel', prefixes: ['Domain.'] },
  { layer: 'ApplicationOrchestration', prefixes: ['Application.'] },
  { layer: 'PersistenceAdapters', prefixes: ['Adapter.Persistence.', 'Adapter.Repository.'] },
  { layer: 'IntegrationAdapters', prefixes: ['Adapter.Integration.', 'Adapter.External.'] },
  { layer: 'WorkflowSagaEngine', prefixes: ['Workflow.'] },
  { layer: 'BackgroundJobsScheduling', prefixes: ['Job.'] },
  { layer: 'PresentationAdapters', prefixes: ['Presentation.', 'Adapter.Presentation.', 'Adapter.Api.'] },
  { layer: 'ReportingReadModels', prefixes: ['Reporting.'] },
  { layer: 'ExtensibilityMetadata', prefixes: ['Metadata.'] },
  { layer: 'SecurityAuditObservability', prefixes: ['Security.', 'Audit.', 'Observability.'] },
  { layer: 'Kernel', prefixes: ['Kernel.'] },
]);

export type IntentLayerPrefixes = {
  name: string;
  prefixes?: readonly string[];
  intentPrefixes?: readonly string[];
};

/**
 * Runtime intent prefixes for one config layer: its declared `intentPrefixes`,
 * else the built-in prefixes when the layer uses a canonical 11-layer name
 * (`DomainModel` → `Domain.`, …; the same table the static gate falls back to),
 * else none. Keeps `ark init` configs, which name canonical layers without
 * declaring prefixes, resolvable by the ArkRun kernel.
 */
export function effectiveIntentPrefixes(layer: {
  name: string;
  intentPrefixes?: readonly string[];
}): readonly string[] {
  const declared = (layer.intentPrefixes ?? []).filter((prefix) => prefix.trim().length > 0);
  if (declared.length > 0) return declared;
  return DEFAULT_INTENT_PREFIXES.find((entry) => entry.layer === layer.name)?.prefixes ?? [];
}

export type LayerFlowConfigShape = {
  layers: readonly { name: string; intentPrefixes?: readonly string[] }[];
  rules?: readonly { from: string; to: string; allowed?: boolean; peerIsolation?: boolean }[];
};

/**
 * Layers named by an `allowed: false` (non-peerIsolation) rule that no intent can map to at runtime
 * (no declared `intentPrefixes` and not a canonical layer name). Hard observed
 * layer flow can never fire for such a rule. Sorted, unique.
 */
export function unresolvableLayerFlowLayers(config: LayerFlowConfigShape): string[] {
  const resolvable = new Set(
    config.layers
      .filter((layer) => effectiveIntentPrefixes(layer).length > 0)
      .map((layer) => layer.name)
  );
  const missing = new Set<string>();
  for (const rule of config.rules ?? []) {
    // peerIsolation walls are file-path slice rules; runtime flow never evaluates them.
    if (rule.allowed !== false || rule.peerIsolation === true) continue;
    for (const name of [rule.from, rule.to]) {
      if (!resolvable.has(name)) missing.add(name);
    }
  }
  return [...missing].sort();
}

/** Longest matching prefix wins; declaration order resolves an identical-prefix tie. */
export function resolveIntentLayer(
  intent: string,
  layers: readonly IntentLayerPrefixes[]
): string | undefined {
  const candidates = layers.flatMap((layer, layerIndex) =>
    (layer.prefixes ?? layer.intentPrefixes ?? []).map((prefix) => ({
      layer: layer.name,
      layerIndex,
      prefix: prefix.endsWith('.') ? prefix : `${prefix}.`,
    }))
  );
  return candidates
    .filter(({ prefix }) => intent.startsWith(prefix))
    .sort(
      (left, right) =>
        right.prefix.length - left.prefix.length || left.layerIndex - right.layerIndex
    )[0]?.layer;
}

export type PublishSyntaxFacts = {
  publishCall: boolean;
  rawIntentName?: string;
  objectHasIntent: boolean;
  arkPublishCandidate: boolean;
  hasSource: boolean;
};

export type SourcePolicyFinding = {
  ruleId: keyof typeof SOURCE_POLICY_MESSAGES;
  message: string;
};

export function looksLikeArkIntent(value: string): boolean {
  return /^(Domain|Application|Adapter|Workflow|Job|Presentation|Reporting|Metadata|Security|Audit|Observability|Kernel)\.[A-Za-z0-9_.]+$/.test(
    value
  );
}

export function classifyPublishFacts(facts: PublishSyntaxFacts): SourcePolicyFinding[] {
  if (!facts.publishCall) return [];
  const findings: SourcePolicyFinding[] = [];
  if (
    (facts.rawIntentName !== undefined && looksLikeArkIntent(facts.rawIntentName)) ||
    facts.objectHasIntent
  ) {
    findings.push({
      ruleId: 'RAW_EVENT_PUBLISH',
      message: SOURCE_POLICY_MESSAGES.RAW_EVENT_PUBLISH,
    });
  }
  if (facts.arkPublishCandidate && !facts.hasSource) {
    findings.push({
      ruleId: 'PUBLISH_MISSING_SOURCE',
      message: SOURCE_POLICY_MESSAGES.PUBLISH_MISSING_SOURCE,
    });
  }
  return findings;
}

/** Intent prefixes are short tokens (`Domain.`, `Application.`). Bound the scan. */
const INTENT_PREFIX_SCAN_LIMIT = 64;

/**
 * Strip trailing `.` without a regex. `\.+$` on config strings is CodeQL
 * js/polynomial-redos (backtracking on long runs of `.`). Linear walk is enough.
 */
function stripTrailingDots(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 46) {
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
}

function normalizeIntentPrefix(prefix: string): string {
  const trimmed = prefix.trim();
  const bounded =
    trimmed.length > INTENT_PREFIX_SCAN_LIMIT
      ? trimmed.slice(0, INTENT_PREFIX_SCAN_LIMIT)
      : trimmed;
  return stripTrailingDots(bounded);
}

/**
 * Canonical Domain-role layer predicate shared by ArkRun, ArkOrder, and ArkRules.
 * Start-anchored domain/entity/aggregate (unanchored "model" would misclassify
 * ReportingReadModels), or a `Domain.` intentPrefix.
 */
export function isDomainRoleLayer(
  layer: string,
  intentPrefixes: readonly string[] = []
): boolean {
  const name = layer.trim();
  if (/^domain(?:model)?$/i.test(name) || /^domain(?=[A-Z_\-\s])/i.test(name)) return true;
  if (/^(?:entit(?:y|ies)|aggregates?)(?:$|(?=[A-Z_\-\s]))/i.test(name)) return true;
  return intentPrefixes.some((prefix) => {
    const normalized = normalizeIntentPrefix(prefix);
    return normalized === 'Domain' || normalized.startsWith('Domain.');
  });
}

/** Structural TypeScript AST surface injected by Tooling callers (zero runtime dependency). */
export interface TsAstNode {
  readonly kind: number;
  readonly pos?: number;
  readonly end?: number;
  readonly flags?: number;
  readonly parent?: TsAstNode;
  getStart?(sourceFile?: TsAstSourceFile, includeJsDocComment?: boolean): number;
  getText?(sourceFile?: TsAstSourceFile): string;
}

export interface TsAstSourceFile extends TsAstNode {
  readonly text: string;
  readonly statements: readonly TsAstNode[];
  readonly parseDiagnostics?: readonly unknown[];
  getLineAndCharacterOfPosition(position: number): {
    readonly line: number;
    readonly character: number;
  };
}

interface TsAstIdentifier extends TsAstNode {
  readonly text: string;
}

interface TsAstLiteralLike extends TsAstNode {
  readonly text: string;
}

interface TsAstPropertyAccessExpression extends TsAstNode {
  readonly expression: TsAstNode;
  readonly name: TsAstIdentifier;
}

interface TsAstCallExpression extends TsAstNode {
  readonly expression: TsAstNode;
  readonly arguments: readonly TsAstNode[];
}

export interface TsAstObjectLiteralExpression extends TsAstNode {
  readonly properties: readonly TsAstNode[];
}

interface TsAstPropertyAssignment extends TsAstNode {
  readonly name: TsAstNode;
  readonly initializer: TsAstNode;
}

interface TsAstShorthandPropertyAssignment extends TsAstNode {
  readonly name: TsAstIdentifier;
}

interface TsAstSpreadAssignment extends TsAstNode {
  readonly expression: TsAstNode;
}

interface TsAstComputedPropertyName extends TsAstNode {
  readonly expression: TsAstNode;
}

export interface TsAstArrayLiteralExpression extends TsAstNode {
  readonly elements: readonly TsAstNode[];
}

interface TsAstSpreadElement extends TsAstNode {
  readonly expression: TsAstNode;
}

interface TsAstVariableDeclaration extends TsAstNode {
  readonly name: TsAstNode;
  readonly initializer?: TsAstNode;
}

interface TsAstVariableDeclarationList extends TsAstNode {
  readonly flags: number;
  readonly declarations: readonly TsAstVariableDeclaration[];
}

interface TsAstVariableStatement extends TsAstNode {
  readonly declarationList: TsAstVariableDeclarationList;
}

interface TsAstFunctionDeclaration extends TsAstNode {
  readonly name?: TsAstIdentifier;
  readonly body?: TsAstNode;
}

interface TsAstWrappedExpression extends TsAstNode {
  readonly expression: TsAstNode;
}

interface TsAstBinaryExpression extends TsAstNode {
  readonly left: TsAstNode;
  readonly operatorToken: TsAstNode;
  readonly right: TsAstNode;
}

interface TsAstClassDeclaration extends TsAstNode {
  readonly name?: TsAstIdentifier;
  readonly modifiers?: readonly TsAstNode[];
  readonly members: readonly TsAstNode[];
}

interface TsAstMethodDeclaration extends TsAstNode {
  readonly name: TsAstNode;
  readonly modifiers?: readonly TsAstNode[];
  readonly type?: TsAstNode;
  readonly body?: TsAstNode;
}

interface TsAstPropertyDeclaration extends TsAstNode {
  readonly name: TsAstNode;
  readonly modifiers?: readonly TsAstNode[];
}

interface TsAstConstructorDeclaration extends TsAstNode {
  readonly modifiers?: readonly TsAstNode[];
}

interface TsAstSetAccessorDeclaration extends TsAstNode {
  readonly modifiers?: readonly TsAstNode[];
}

export interface TsAstLike {
  readonly ScriptTarget: { readonly Latest: number };
  readonly NodeFlags: { readonly Const: number };
  readonly SyntaxKind: {
    readonly ExportKeyword: number;
    readonly DefaultKeyword: number;
    readonly PrivateKeyword: number;
    readonly ProtectedKeyword: number;
    readonly ReadonlyKeyword: number;
    readonly StaticKeyword: number;
    readonly EqualsToken: number;
    readonly FirstCompoundAssignment: number;
    readonly LastCompoundAssignment: number;
    readonly ThisKeyword: number;
    readonly ThrowStatement: number;
    readonly FunctionDeclaration: number;
    readonly FunctionExpression: number;
    readonly ArrowFunction: number;
    readonly ClassDeclaration: number;
    readonly MethodDeclaration: number;
    readonly GetAccessor: number;
    readonly SetAccessor: number;
    readonly Block: number;
  };
  createSourceFile(
    fileName: string,
    sourceText: string,
    languageVersion: number,
    setParentNodes?: boolean
  ): TsAstSourceFile;
  forEachChild<T>(node: TsAstNode, cbNode: (node: TsAstNode) => T | undefined): T | undefined;
  isCallExpression(node: TsAstNode): node is TsAstCallExpression;
  isPropertyAccessExpression(node: TsAstNode): node is TsAstPropertyAccessExpression;
  isIdentifier(node: TsAstNode): node is TsAstIdentifier;
  isStringLiteral(node: TsAstNode): node is TsAstLiteralLike;
  isNoSubstitutionTemplateLiteral(node: TsAstNode): node is TsAstLiteralLike;
  isNumericLiteral(node: TsAstNode): node is TsAstLiteralLike;
  isComputedPropertyName(node: TsAstNode): node is TsAstComputedPropertyName;
  isObjectLiteralExpression(node: TsAstNode): node is TsAstObjectLiteralExpression;
  isPropertyAssignment(node: TsAstNode): node is TsAstPropertyAssignment;
  isShorthandPropertyAssignment(node: TsAstNode): node is TsAstShorthandPropertyAssignment;
  isSpreadAssignment(node: TsAstNode): node is TsAstSpreadAssignment;
  isArrayLiteralExpression(node: TsAstNode): node is TsAstArrayLiteralExpression;
  isSpreadElement(node: TsAstNode): node is TsAstSpreadElement;
  isVariableStatement(node: TsAstNode): node is TsAstVariableStatement;
  isFunctionDeclaration(node: TsAstNode): node is TsAstFunctionDeclaration;
  isParenthesizedExpression(node: TsAstNode): node is TsAstWrappedExpression;
  isAsExpression(node: TsAstNode): node is TsAstWrappedExpression;
  isSatisfiesExpression?(node: TsAstNode): node is TsAstWrappedExpression;
  isNonNullExpression(node: TsAstNode): node is TsAstWrappedExpression;
  isTypeAssertionExpression(node: TsAstNode): node is TsAstWrappedExpression;
  isThrowStatement(node: TsAstNode): boolean;
  isClassDeclaration(node: TsAstNode): node is TsAstClassDeclaration;
  isMethodDeclaration(node: TsAstNode): node is TsAstMethodDeclaration;
  isPropertyDeclaration(node: TsAstNode): node is TsAstPropertyDeclaration;
  isConstructorDeclaration(node: TsAstNode): node is TsAstConstructorDeclaration;
  isSetAccessorDeclaration(node: TsAstNode): node is TsAstSetAccessorDeclaration;
  isBinaryExpression(node: TsAstNode): node is TsAstBinaryExpression;
}

/** 1-based line number of an AST node inside `sourceFile`. */
export function tsAstNodeLine(sourceFile: TsAstSourceFile, node: TsAstNode): number {
  const pos = typeof node.getStart === 'function' ? node.getStart(sourceFile) : node.pos ?? 0;
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

/** Unwrap parens, `as`, `satisfies`, `!`, `<T>x`, and `Object.freeze(x)`. */
export function unwrapTsAstExpression(ts: TsAstLike, node: TsAstNode): TsAstNode {
  let current = node;
  for (let depth = 0; depth < 16; depth += 1) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      (typeof ts.isSatisfiesExpression === 'function' && ts.isSatisfiesExpression(current))
    ) {
      current = current.expression;
      continue;
    }
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      ts.isIdentifier(current.expression.expression) &&
      current.expression.expression.text === 'Object' &&
      current.expression.name.text === 'freeze' &&
      current.arguments.length >= 1
    ) {
      current = current.arguments[0]!;
      continue;
    }
    break;
  }
  return current;
}

/** Property key name for an identifier, string/template/numeric literal, or static computed key. */
export function tsAstPropertyKeyName(ts: TsAstLike, nameNode: TsAstNode): string | null {
  if (
    ts.isIdentifier(nameNode) ||
    ts.isStringLiteral(nameNode) ||
    ts.isNoSubstitutionTemplateLiteral(nameNode) ||
    ts.isNumericLiteral(nameNode)
  ) {
    return nameNode.text;
  }
  if (ts.isComputedPropertyName(nameNode)) {
    const inner = unwrapTsAstExpression(ts, nameNode.expression);
    if (
      ts.isStringLiteral(inner) ||
      ts.isNoSubstitutionTemplateLiteral(inner) ||
      ts.isNumericLiteral(inner)
    ) {
      return inner.text;
    }
  }
  return null;
}
