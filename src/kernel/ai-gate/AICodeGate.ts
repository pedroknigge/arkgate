/**
 * Basic AI Code Gate implementation.
 *
 * Uses simple string heuristics + registered intent names to detect obvious
 * architectural violations in generated code (e.g. direct infra imports from domain).
 * Not a full static analyzer — documented limitation.
 */

import type {
  AICodeGate,
  AICodeGateContext,
  AICodeGateResult,
  AICodeGateViolation,
  AIGateExtension,
} from './types';
import type { Policy } from '../policy';
import type { IntentCreator } from '../intent';
import type { IntentName } from '../../domain/types';
import type { ArchitectureProfile } from '../layers';
import {
  ambientCoveredByForbiddenGlobals,
  forbiddenGlobalForModuleSpecifier,
} from '../../domain/capabilities';
import {
  findDeniedEdgeDecision,
  findDeniedEdgeRule,
  peerIsolationDenyExplanation,
} from '../../domain/layerMatch';
import { collectCapabilityUses } from '../capabilityAnalysis';
import { classifyPublishFacts, looksLikeArkIntent } from '../../domain/sourcePolicy';
import {
  collectForbiddenCapabilityUses,
  extractSemanticDependencies,
} from '../semanticAnalysis';

export interface AICodeGatePolicyContext<Context = AICodeGateContext> {
  source: string;
  context?: Context;
}

type SemanticSourceFileLike = { fileName: string; text: string };
type SemanticNodeLike = { getStart(sourceFile: unknown): number };
type TypescriptSemanticHost = {
  ScriptTarget: { Latest: unknown };
  createSourceFile(
    fileName: string,
    source: string,
    target: unknown,
    setParentNodes: boolean
  ): SemanticSourceFileLike;
};

export interface AICodeGateOptions<Context = AICodeGateContext> {
  policies?: Policy<AICodeGatePolicyContext<Context>>[];
  intents?: Array<string | Pick<IntentCreator<IntentName, unknown>, 'name'>>;
  /**
   * Additional forbidden patterns (regex or strings).
   */
  forbiddenPatterns?: Array<string | RegExp>;
  /**
   * External analyzer extensions (type-only contract; plug in AST tools later).
   */
  extensions?: AIGateExtension<Context>[];
  /**
   * Optional architecture profile for layer-aware generated-code checks.
   * When context.layer is provided, intent references are checked against it.
   */
  architectureProfile?: ArchitectureProfile;
  /**
   * When true, flag string literals that look like intent names but are not registered.
   */
  enforceIntentAllowlist?: boolean;
  /**
   * Optional TypeScript module object. When provided, AICodeGate adds AST-backed checks
   * for publish misuse without taking a runtime dependency on TypeScript.
   */
  typescript?: unknown;
  /**
   * Ambient globals forbidden per layer (layer name → entries such as "fetch" or
   * "Date.now"). Checked only when `typescript` is provided and context.layer resolves
   * to a listed layer — mirrors ark-check's FORBIDDEN_GLOBAL rule.
   */
  forbiddenGlobals?: Record<string, string[]>;

  /**
   * Layer → effective capability deny set (U04 walls; ADR 0009). Enforced like
   * forbiddenGlobals when the target file's layer is known. An ambient use
   * already covered by the layer's forbiddenGlobals reports only
   * FORBIDDEN_GLOBAL (D7 — one violation, one voice).
   */
  capabilityWalls?: Record<string, string[]>;
  /**
   * Layer names whose role is infrastructure and may therefore import infrastructure
   * (a persistence adapter importing the DB is correct, not a violation). The built-in
   * infra-import heuristics are suppressed for these layers and for any layer whose
   * name matches the conventional infra tokens. Populate from ark.config.json layers
   * flagged `mayImportInfrastructure: true`, so unconventionally-named infra layers
   * opt in explicitly. User-supplied `forbiddenPatterns` still apply everywhere.
   */
  infrastructureLayers?: string[];
  /**
   * Preferred single resolve step: import specifier or absolute source file →
   * `{ layer, relPath }` for contract + peerIsolation. Prefer this over the
   * legacy layer-only callback.
   */
  resolveImportTarget?: (
    specifierOrFilePath: string,
    fromFilePath?: string
  ) => { layer?: string; relPath?: string } | undefined;
  /**
   * @deprecated Prefer resolveImportTarget. Layer-only resolve for governed imports.
   */
  resolveImportLayer?: (specifier: string, fromFilePath?: string) => string | undefined;
  /**
   * Layer configs (patterns) used to infer sliceFolders when a peerIsolation rule
   * omits an explicit list.
   */
  architectureLayers?: Array<{ name: string; patterns?: string[] }>;
  /** Explicit file-level escape hatch for reviewed non-literal import()/require() calls. */
  allowNonLiteralDynamicImport?: (filePath?: string) => boolean;
}

function violation(
  ruleId: string,
  message: string,
  extra?: Partial<AICodeGateViolation>
): AICodeGateViolation {
  return { ruleId, code: ruleId, message, ...extra };
}

interface StringMatch {
  value: string;
  index: number;
}

interface ModuleSpecifierMatch {
  value: string;
  index: number;
  kind: 'import' | 'export' | 'dynamic-import' | 'require';
  /** True for `import type` / `export type` — erased at runtime (W1 write-path). */
  typeOnly?: boolean;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

const INTENT_CALL_NAMES = new Set(['publish', 'subscribe', 'defineIntent', 'registerHandler']);

function captureIndex(match: RegExpExecArray, value: string): number {
  return match.index + match[0].indexOf(value);
}

/** Quoted strings at declared intent sites only (events, sagas, publish metadata). */
function extractQuotedStrings(source: string): StringMatch[] {
  const matches: StringMatch[] = [];
  const seen = new Set<number>();
  const push = (value: string, index: number) => {
    if (!value || seen.has(index)) return;
    seen.add(index);
    matches.push({ value, index });
  };
  const pushFrom = (re: RegExp) => {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
      const value = match[1];
      if (value) push(value, captureIndex(match, value));
    }
  };
  // Bound whitespace and type-arg spans: `\s*` on library input (file source)
  // is polynomial ReDoS (CodeQL js/polynomial-redos). Intent sites never need
  // more than a handful of spaces.
  pushFrom(
    /\b(?:publish|subscribe|defineIntent|registerHandler)\s{0,8}(?:<[^>]{0,120}>)?\s{0,8}\(\s{0,8}['"`]([A-Za-z][A-Za-z0-9_.]*)['"`]/g
  );
  pushFrom(/\b(?:intent|onEvent)\s{0,8}:\s{0,8}['"`]([A-Za-z][A-Za-z0-9_.]*)['"`]/g);
  const reactsRe = /\breactsTo\s{0,8}:\s{0,8}\[([^\]]{0,2000})\]/g;
  let reacts: RegExpExecArray | null;
  while ((reacts = reactsRe.exec(source)) !== null) {
    const inner = reacts[1] ?? '';
    const innerStart = reacts.index + reacts[0].indexOf(inner);
    const strRe = /['"`]([A-Za-z][A-Za-z0-9_.]*)['"`]/g;
    let nested: RegExpExecArray | null;
    while ((nested = strRe.exec(inner)) !== null) {
      const value = nested[1];
      if (value) push(value, innerStart + nested.index + nested[0].indexOf(value));
    }
  }
  pushFrom(
    /\bmetadata\s{0,8}:\s{0,8}\{[^}]{0,400}\bsource\s{0,8}:\s{0,8}['"`]([A-Za-z][A-Za-z0-9_.]*)['"`]/g
  );
  pushFrom(
    /\bpublish\s{0,8}(?:<[^>]{0,120}>)?\s{0,8}\([^;]{0,400}?\bsource\s{0,8}:\s{0,8}['"`]([A-Za-z][A-Za-z0-9_.]*)['"`]/g
  );
  return matches.sort((left, right) => left.index - right.index);
}

function extractModuleSpecifiers(source: string): ModuleSpecifierMatch[] {
  const matches: ModuleSpecifierMatch[] = [];
  const patterns: Array<{ kind: ModuleSpecifierMatch['kind']; re: RegExp }> = [
    {
      kind: 'import',
      re: /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s*)?['"]([^'"]+)['"]/g,
    },
    {
      kind: 'export',
      re: /\bexport\s+(?:type\s+)?[^'"]*?\s+from\s*['"]([^'"]+)['"]/g,
    },
    {
      kind: 'dynamic-import',
      re: /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    },
    {
      kind: 'require',
      re: /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    },
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.re.exec(source)) !== null) {
      const index = match.index + match[0].indexOf(match[1]);
      const raw = match[0];
      const typeOnly =
        (pattern.kind === 'import' && /\bimport\s+type\b/.test(raw)) ||
        (pattern.kind === 'export' && /\bexport\s+type\b/.test(raw));
      matches.push({ value: match[1], index, kind: pattern.kind, typeOnly });
    }
  }

  return matches.sort((a, b) => a.index - b.index);
}

function isSyntaxWrapper(ts: any, node: any): boolean {
  return Boolean(
    node &&
      (ts.isParenthesizedExpression(node) ||
        ts.isAsExpression(node) ||
        (typeof ts.isTypeAssertionExpression === 'function' &&
          ts.isTypeAssertionExpression(node)) ||
        (typeof ts.isSatisfiesExpression === 'function' && ts.isSatisfiesExpression(node)))
  );
}

function unwrapWrappers(ts: any, node: any): any {
  let current = node;
  while (current?.parent && isSyntaxWrapper(ts, current.parent)) {
    current = current.parent;
  }
  return current;
}

function callCalleeName(ts: any, node: any): string | undefined {
  if (!node || !ts.isCallExpression(node)) return undefined;
  const expression = node.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

function isPublishMetadataSource(ts: any, sourceProp: any): boolean {
  const object = sourceProp.parent;
  if (!object || !ts.isObjectLiteralExpression(object)) return false;
  const objectSite = unwrapWrappers(ts, object);
  const objectParent = objectSite.parent;
  if (!objectParent) return false;
  if (ts.isCallExpression(objectParent) && callCalleeName(ts, objectParent) === 'publish') {
    const args = objectParent.arguments;
    return args[1] === objectSite || args[2] === objectSite;
  }
  if (ts.isPropertyAssignment(objectParent) && tsPropertyName(ts, objectParent.name) === 'metadata') {
    const eventObject = objectParent.parent;
    if (!eventObject) return false;
    const eventSite = unwrapWrappers(ts, eventObject);
    const call = eventSite.parent;
    return Boolean(
      call && ts.isCallExpression(call) && callCalleeName(ts, call) === 'publish'
    );
  }
  return false;
}

function isDeclaredIntentSite(ts: any, node: any): boolean {
  const siteNode = unwrapWrappers(ts, node);
  const parent = siteNode.parent;
  if (!parent) return false;
  if (ts.isCallExpression(parent)) {
    const name = callCalleeName(ts, parent);
    if (name && INTENT_CALL_NAMES.has(name) && parent.arguments.some((arg: any) => arg === siteNode)) {
      return true;
    }
  }
  if (ts.isArrayLiteralExpression(parent)) {
    return isDeclaredIntentSite(ts, parent);
  }
  if (ts.isPropertyAssignment(parent)) {
    const name = tsPropertyName(ts, parent.name);
    if (name === 'intent' || name === 'onEvent' || name === 'reactsTo') return true;
    if (name === 'source' && isPublishMetadataSource(ts, parent)) return true;
  }
  return false;
}

function extractQuotedStringsAst(ts: any, source: string): StringMatch[] {
  const sourceFile = ts.createSourceFile('generated.ts', source, ts.ScriptTarget.Latest, true);
  const matches: StringMatch[] = [];
  const visit = (node: any) => {
    if (ts.isStringLiteralLike(node) && isDeclaredIntentSite(ts, node)) {
      matches.push({ value: node.text, index: node.getStart(sourceFile) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return matches;
}


function hasInfrastructureToken(specifier: string): boolean {
  const tokens = specifier
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return [
    'adapter',
    'adapters',
    'infra',
    'infrastructure',
    'persistence',
    'repository',
    'repositories',
    'integration',
    'database',
    'db',
  ].some((token) => tokens.includes(token));
}

function isKnownInfrastructurePackage(specifier: string): boolean {
  const normalized = specifier.toLowerCase();
  return ['sequelize', 'prisma', 'typeorm', 'mongoose', 'knex'].some(
    (name) => normalized === name || normalized.startsWith(`${name}/`)
  );
}

// A layer whose NAME declares an infrastructure role legitimately imports
// infrastructure — that's what the layer is for. The built-in infra-import
// heuristics exist to keep the pure core (domain/application) clean, so they
// must not fire against such a layer, otherwise the write-gate contradicts an
// ark.config.json that explicitly allows the edge (which ark-check passes).
// Substring match, not token-split, so camelCase names like "PersistenceAdapters"
// resolve. ponytail: name-based heuristic; add an explicit per-layer
// `mayImportInfrastructure` flag if a project needs finer control.
function layerHasInfrastructureRole(layerName: string): boolean {
  const normalized = layerName.toLowerCase();
  return [
    'adapter',
    'infra',
    'persistence',
    'repository',
    'repositories',
    'integration',
    'database',
  ].some((token) => normalized.includes(token));
}

function tsStringLiteralText(ts: any, node: unknown): string | undefined {
  return node && ts.isStringLiteralLike(node) ? (node as { text: string }).text : undefined;
}

function tsPropertyName(ts: any, node: any): string | undefined {
  if (!node) return undefined;
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return undefined;
}

function tsObjectProperty(ts: any, node: any, name: string): any | undefined {
  if (!node || !ts.isObjectLiteralExpression(node)) return undefined;
  return node.properties.find((property: any) => {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
      return false;
    }
    return tsPropertyName(ts, property.name) === name;
  });
}

function tsObjectHasProperty(ts: any, node: any, name: string): boolean {
  return tsObjectProperty(ts, node, name) !== undefined;
}

function tsObjectPropertyValue(ts: any, node: any, name: string): any | undefined {
  const property = tsObjectProperty(ts, node, name);
  return property && ts.isPropertyAssignment(property)
    ? property.initializer
    : undefined;
}

function tsObjectHasMetadataSource(ts: any, node: any): boolean {
  const metadata = tsObjectPropertyValue(ts, node, 'metadata');
  return tsObjectHasProperty(ts, metadata, 'source');
}

function tsLooksLikeIntentCreatorExpression(ts: any, node: any): boolean {
  if (!node) return false;
  if (ts.isIdentifier(node)) return /^[A-Z]/.test(node.text);
  if (ts.isPropertyAccessExpression(node)) {
    return tsLooksLikeIntentCreatorExpression(ts, node.name);
  }
  return false;
}

function tsIsPublishCall(ts: any, node: any): boolean {
  if (!ts.isCallExpression(node)) return false;
  const expression = node.expression;
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text === 'publish';
  }
  return ts.isIdentifier(expression) && expression.text === 'publish';
}

function tsIsArkPublishCandidate(ts: any, node: any): boolean {
  if (!ts.isCallExpression(node)) return false;
  const firstArg = node.arguments[0];
  const rawIntent = tsStringLiteralText(ts, firstArg);
  return (
    (rawIntent !== undefined && looksLikeArkIntent(rawIntent)) ||
    tsObjectHasProperty(ts, firstArg, 'intent') ||
    tsLooksLikeIntentCreatorExpression(ts, firstArg)
  );
}

function tsPublishHasSource(ts: any, node: any): boolean {
  if (!ts.isCallExpression(node)) return false;
  const [firstArg, secondArg, thirdArg] = node.arguments;
  return (
    tsObjectHasMetadataSource(ts, firstArg) ||
    tsObjectHasProperty(ts, secondArg, 'source') ||
    tsObjectHasProperty(ts, thirdArg, 'source')
  );
}

function tsPublishSourceLiteral(ts: any, node: any): string | undefined {
  if (!ts.isCallExpression(node)) return undefined;
  const [firstArg, secondArg, thirdArg] = node.arguments;
  const rawMetadata = tsObjectPropertyValue(ts, firstArg, 'metadata');
  return (
    tsStringLiteralText(ts, tsObjectPropertyValue(ts, rawMetadata, 'source')) ??
    tsStringLiteralText(ts, tsObjectPropertyValue(ts, secondArg, 'source')) ??
    tsStringLiteralText(ts, tsObjectPropertyValue(ts, thirdArg, 'source'))
  );
}

function analyzePublishAst<Context>(
  ts: any,
  source: string,
  context: Context | undefined,
  profile: ArchitectureProfile | undefined
): AICodeGateViolation[] {
  const sourceFile = ts.createSourceFile(
    'generated.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  );
  const gateContext = context as AICodeGateContext | undefined;
  const filePath = gateContext?.filePath;
  const contextLayer = gateContext?.layer;
  const violations: AICodeGateViolation[] = [];
  const lineForNode = (node: any) =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  const visit = (node: any) => {
    if (tsIsPublishCall(ts, node)) {
      const firstArg = node.arguments[0];
      const rawIntent = tsStringLiteralText(ts, firstArg);
      for (const finding of classifyPublishFacts({
        publishCall: true,
        rawIntentName: rawIntent,
        objectHasIntent: tsObjectHasProperty(ts, firstArg, 'intent'),
        arkPublishCandidate: tsIsArkPublishCandidate(ts, node),
        hasSource: tsPublishHasSource(ts, node),
      })) {
        violations.push(
          violation(finding.ruleId, finding.message, { line: lineForNode(node), filePath })
        );
      }

      const sourceIntent = tsPublishSourceLiteral(ts, node);
      if (profile && contextLayer && sourceIntent && looksLikeArkIntent(sourceIntent)) {
        const sourceLayer = profile.resolveLayer(sourceIntent);
        if (sourceLayer && sourceLayer !== contextLayer) {
          violations.push(
            violation(
              'PUBLISH_SOURCE_LAYER_MISMATCH',
              `Publish source "${sourceIntent}" resolves to ${sourceLayer}, but the target file is classified as ${contextLayer}.`,
              {
                line: lineForNode(node),
                filePath,
                target: sourceIntent,
                fromLayer: contextLayer,
                toLayer: sourceLayer,
              }
            )
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

export function createAICodeGate<Context = AICodeGateContext>(
  options: AICodeGateOptions<Context> = {}
): AICodeGate<Context> {
  const intentNames = new Set(
    (options.intents || []).map((i) => (typeof i === 'string' ? i : i.name))
  );

  const userForbidden = options.forbiddenPatterns || [];
  const explicitInfraLayers = new Set(options.infrastructureLayers ?? []);
  const enforceAllowlist = options.enforceIntentAllowlist ?? intentNames.size > 0;

  return {
    validate(source: string, context?: Context): AICodeGateResult {
      const violations: AICodeGateViolation[] = [];
      const gateContext = context as AICodeGateContext | undefined;
      const filePath = gateContext?.filePath;
      const contextLayer = gateContext?.layer;
      const semanticTypescript = options.typescript as TypescriptSemanticHost | undefined;
      const semanticSourceFile = semanticTypescript
        ? semanticTypescript.createSourceFile(
            filePath ?? 'generated.ts',
            source,
            semanticTypescript.ScriptTarget.Latest,
            true
          )
        : undefined;
      const semanticDependencies = semanticSourceFile
        ? extractSemanticDependencies(options.typescript, semanticSourceFile)
        : undefined;
      const moduleSpecifiers = semanticDependencies
        ? semanticDependencies
            .filter((dependency) => dependency.specifier !== undefined)
            .map((dependency) => ({
              value: dependency.specifier!,
              index: (dependency.node as SemanticNodeLike).getStart(semanticSourceFile),
              kind: dependency.kind,
              typeOnly: dependency.typeOnly,
            }))
        : extractModuleSpecifiers(source);
      const quotedStrings = options.typescript
        ? extractQuotedStringsAst(options.typescript, source)
        : extractQuotedStrings(source);

      if (
        options.typescript &&
        !options.allowNonLiteralDynamicImport?.(filePath)
      ) {
        for (const dependency of semanticDependencies?.filter(({ unresolved }) => unresolved) ?? []) {
          const isRequire = dependency.kind === 'require';
          violations.push(
            violation(
              isRequire
                ? 'DYNAMIC_REQUIRE_NOT_ALLOWLISTED'
                : 'DYNAMIC_IMPORT_NOT_ALLOWLISTED',
              `Non-literal ${isRequire ? 'require call' : 'dynamic import'} cannot be resolved statically; add the reviewed file to dynamicImportAllowlist.`,
              { line: dependency.line, filePath }
            )
          );
        }
      }

      // Infra-role layers may import infrastructure; built-in heuristics off there.
      // User-supplied forbiddenPatterns are an explicit opt-in and always apply.
      const exemptFromInfraHeuristics =
        contextLayer !== undefined &&
        (explicitInfraLayers.has(contextLayer) || layerHasInfrastructureRole(contextLayer));

      // When the file has a known layer, the fix might be "this layer IS infra" —
      // point at the exemption so an unconventionally-named infra layer self-serves
      // instead of looking like a hard block.
      const infraLayerEscapeHatch =
        contextLayer !== undefined
          ? ` If "${contextLayer}" is an infrastructure layer, mark it in ark.config.json with "mayImportInfrastructure": true (or name it with an infra token like Adapters/Persistence/Repository).`
          : '';
      for (const pat of userForbidden) {
        if (pat instanceof RegExp) {
          pat.lastIndex = 0;
          const match = pat.exec(source);
          pat.lastIndex = 0;
          if (match) {
            violations.push(
              violation('FORBIDDEN_PATTERN', `Forbidden pattern matched: ${pat}`, {
                line: match.index === undefined ? undefined : lineOf(source, match.index),
                filePath,
                suggestion:
                  'Remove infrastructure imports from domain/application layers.' +
                  infraLayerEscapeHatch,
              })
            );
          }
        } else if (source.includes(pat)) {
          violations.push(
            violation('FORBIDDEN_SUBSTRING', `Forbidden substring: ${pat}`, {
              line: lineOf(source, source.indexOf(pat)),
              filePath,
            })
          );
        }
      }

      for (const specifier of moduleSpecifiers) {
        // Contract first: if the import target resolves to a declared layer, the layer RULES
        // decide — not the path heuristic. This keeps the write gate consistent with ark-check
        // (`ark.config.json` is authoritative), so an edge the config allows — e.g. a route
        // calling a repository, or a repository importing the DB — is never blocked here just
        // because the specifier contains an "infra" token.
        // Contract + peerIsolation share one resolve step when resolveImportTarget is set.
        const targetHit =
          options.resolveImportTarget?.(specifier.value, filePath) ??
          (options.resolveImportLayer
            ? { layer: options.resolveImportLayer(specifier.value, filePath) }
            : undefined);
        const sourceHit =
          typeof filePath === 'string'
            ? options.resolveImportTarget?.(filePath) ??
              (options.resolveImportLayer
                ? { layer: contextLayer, relPath: undefined }
                : undefined)
            : undefined;
        const targetLayer = targetHit?.layer;
        if (targetLayer && contextLayer) {
          const blocked = findDeniedEdgeRule(
            options.architectureProfile?.rules,
            contextLayer,
            targetLayer,
            {
              fromPath: sourceHit?.relPath,
              toPath: targetHit?.relPath,
              layers: options.architectureLayers,
            }
          );
          if (blocked) {
            // W1: type-only static edges (`import type` / `export type`) are erased at
            // runtime — do not hard-block the write path. ark-check --plan still surfaces
            // them for type placement (mechanical-safe relocate). Value imports stay hard-block.
            if (specifier.typeOnly && !blocked.peerIsolation) {
              continue;
            }
            const peer = Boolean(blocked.peerIsolation);
            violations.push(
              violation(
                'LAYER_IMPORT_VIOLATION',
                blocked.message ??
                  (peer
                    ? `Layer "${contextLayer}" must not import across slices into "${targetLayer}".`
                    : `Layer "${contextLayer}" must not import "${targetLayer}".`),
                {
                  line: lineOf(source, specifier.index),
                  source: specifier.value,
                  target: specifier.value,
                  filePath,
                  fromLayer: contextLayer,
                  toLayer: targetLayer,
                  suggestion: peer
                    ? 'Extract shared code to a shared layer, or coordinate slices via events/ports — do not import across feature/context slices.'
                    : 'Depend on a port/interface owned by an inner layer instead, or move this ' +
                      'code to a layer allowed to make this import.',
                  details: {
                    importKind: specifier.kind,
                    peerIsolation: peer,
                    ...(specifier.typeOnly ? { typeOnly: true } : {}),
                  },
                }
              )
            );
            continue;
          }
          // Both endpoints are governed and the declared contract allowed the edge.
          // This includes same-layer edges: legacy path-token heuristics must not add
          // a second, undeclared blocker after ark.config.json made the decision.
          continue;
        }

        // Genuinely ungoverned target: fall back to the infra path-heuristic
        // unless this source layer is exempt from it. Type-only edges skip the heuristic (W1).
        if (exemptFromInfraHeuristics || specifier.typeOnly) continue;
        if (!hasInfrastructureToken(specifier.value) && !isKnownInfrastructurePackage(specifier.value)) {
          continue;
        }

        violations.push(
          violation(
            'FORBIDDEN_IMPORT',
            `Forbidden ${specifier.kind} target: "${specifier.value}".`,
            {
              line: lineOf(source, specifier.index),
              source: specifier.value,
              target: specifier.value,
              filePath,
              suggestion:
                'Route infrastructure access through an allowed adapter or port boundary.' +
                infraLayerEscapeHatch,
              details: { importKind: specifier.kind },
            }
          )
        );
      }

      if (options.policies) {
        for (const policy of options.policies) {
          const res = policy.check({ source, context });
          if (res !== true) {
            if (Array.isArray(res)) {
              for (const v of res) {
                violations.push(
                  violation('POLICY_VIOLATION', v.message, {
                    filePath,
                    suggestion: `Fix violation of policy "${policy.name}".`,
                  })
                );
              }
            } else if (res === false) {
              violations.push(
                violation('POLICY_VIOLATION', `Policy ${policy.name} failed on generated code`)
              );
            } else {
              violations.push(
                violation('POLICY_VIOLATION', res.message)
              );
            }
          }
        }
      }

      if (enforceAllowlist && intentNames.size > 0) {
        for (const literal of quotedStrings) {
          if (looksLikeArkIntent(literal.value) && !intentNames.has(literal.value)) {
            violations.push(
              violation(
                'UNKNOWN_INTENT',
                `Unknown intent reference: "${literal.value}"`,
                {
                  line: lineOf(source, literal.index),
                  filePath,
                  target: literal.value,
                  suggestion: `Register intent "${literal.value}" via defineIntent() or remove the reference.`,
                }
              )
            );
          }
        }
      }

      if (options.architectureProfile && contextLayer) {
        for (const literal of quotedStrings) {
          if (!looksLikeArkIntent(literal.value)) continue;

          const targetLayer = options.architectureProfile.resolveLayer(literal.value);
          if (!targetLayer) continue;

          // Intent names are not files — pass fromPath only. Shared-root files
          // use the same peerIsolation classifier as imports; do not invent a toPath.
          const blocked = findDeniedEdgeDecision(
            options.architectureProfile.rules,
            contextLayer,
            targetLayer,
            {
              fromPath: typeof filePath === 'string' ? filePath : undefined,
              layers: options.architectureLayers,
            }
          );

          if (blocked) {
            const peerReason = blocked.rule.peerIsolation
              ? peerIsolationDenyExplanation(blocked.peerIsolationReason ?? 'cross-slice', {
                  fromPath: typeof filePath === 'string' ? filePath : undefined,
                  fromSlice: blocked.fromSlice,
                  toSlice: blocked.toSlice,
                })
              : undefined;
            const defaultMessage = `Layer "${contextLayer}" must not reference "${targetLayer}" through "${literal.value}".`;
            const message =
              peerReason && blocked.peerIsolationReason !== 'cross-slice'
                ? `${defaultMessage} ${peerReason}`
                : blocked.rule.message
                  ? peerReason
                    ? `${blocked.rule.message} (${peerReason})`
                    : blocked.rule.message
                  : defaultMessage;
            violations.push(
              violation('LAYER_REFERENCE_VIOLATION', message, {
                line: lineOf(source, literal.index),
                filePath,
                target: literal.value,
                fromLayer: contextLayer,
                toLayer: targetLayer,
                suggestion: 'Route the dependency through an allowed intent, port, or event.',
                details: { rule: blocked.rule, peerIsolationReason: blocked.peerIsolationReason },
              })
            );
          }
        }
      }

      if (options.extensions) {
        for (const ext of options.extensions) {
          try {
            const extViolations = ext.analyze(source, context);
            violations.push(...extViolations);
          } catch (err) {
            violations.push(
              violation(
                'EXTENSION_ERROR',
                `Extension "${ext.name}" failed: ${err instanceof Error ? err.message : String(err)}`
              )
            );
          }
        }
      }

      if (
        options.typescript &&
        semanticSourceFile &&
        contextLayer &&
        options.forbiddenGlobals?.[contextLayer]?.length
      ) {
        try {
          const layerForbidden = options.forbiddenGlobals[contextLayer];
          violations.push(
            ...collectForbiddenCapabilityUses(
              options.typescript,
              semanticSourceFile,
              layerForbidden
            ).map((use) =>
              violation(
                'FORBIDDEN_GLOBAL',
                `${contextLayer} must not use the ambient global "${use.name}".`,
                {
                  line: use.line,
                  filePath,
                  target: use.name,
                  fromLayer: contextLayer,
                  suggestion:
                    'Inject the capability through a port (e.g. a Clock, IdGenerator, or HttpPort) instead of reaching for the ambient global.',
                }
              )
            )
          );
          for (const dependency of semanticDependencies ?? []) {
            if (dependency.typeOnly || !dependency.specifier) continue;
            const forbiddenGlobal = forbiddenGlobalForModuleSpecifier(
              dependency.specifier,
              layerForbidden
            );
            if (!forbiddenGlobal) continue;
            violations.push(
              violation(
                'FORBIDDEN_GLOBAL',
                `${contextLayer} must not use module "${dependency.specifier}" because it is the import form of forbidden global "${forbiddenGlobal}".`,
                {
                  line: dependency.line,
                  filePath,
                  source: dependency.specifier,
                  target: dependency.specifier,
                  fromLayer: contextLayer,
                  details: {
                    importKind: dependency.kind,
                    forbiddenGlobal,
                  },
                  suggestion:
                    'Inject the capability through a port instead of importing the ambient global module form.',
                }
              )
            );
          }
        } catch (err) {
          violations.push(
            violation(
              'AST_ANALYZER_ERROR',
              `TypeScript AST analyzer failed: ${err instanceof Error ? err.message : String(err)}`
            )
          );
        }
      }

      if (
        options.typescript &&
        semanticSourceFile &&
        contextLayer &&
        options.capabilityWalls?.[contextLayer]?.length
      ) {
        try {
          const denySet = new Set(options.capabilityWalls[contextLayer]);
          const layerForbidden = options.forbiddenGlobals?.[contextLayer] ?? [];
          for (const use of collectCapabilityUses(options.typescript, semanticSourceFile)) {
            if (!denySet.has(use.capability)) continue;
            if (
              (use.source === 'ambient-global' &&
                ambientCoveredByForbiddenGlobals(use.symbol, layerForbidden)) ||
              (use.source === 'import-based' &&
                forbiddenGlobalForModuleSpecifier(use.symbol, layerForbidden))
            ) {
              continue;
            }
            violations.push(
              violation(
                'CAPABILITY_VIOLATION',
                use.source === 'import-based'
                  ? `${contextLayer} denies the ${use.capability} capability; found import of "${use.symbol}".`
                  : `${contextLayer} denies the ${use.capability} capability; found ambient "${use.symbol}".`,
                {
                  line: use.line,
                  filePath,
                  target: use.symbol,
                  capability: use.capability,
                  fromLayer: contextLayer,
                  suggestion:
                    'Define a small port (ClockPort, HttpPort, StoragePort) and bind the implementation in an adapter layer.',
                } as Partial<AICodeGateViolation>
              )
            );
          }
        } catch (err) {
          violations.push(
            violation(
              'AST_ANALYZER_ERROR',
              `TypeScript AST analyzer failed: ${err instanceof Error ? err.message : String(err)}`
            )
          );
        }
      }

      if (options.typescript) {
        try {
          violations.push(
            ...analyzePublishAst(
              options.typescript,
              source,
              context,
              options.architectureProfile
            )
          );
        } catch (err) {
          violations.push(
            violation(
              'AST_ANALYZER_ERROR',
              `TypeScript AST analyzer failed: ${err instanceof Error ? err.message : String(err)}`
            )
          );
        }
      }

      return {
        mode: 'lexical-compatibility',
        completeness: 'partial',
        completenessReasons: ['LEXICAL_EVIDENCE_INCOMPLETE'],
        valid: false,
        lexicalValid: violations.length === 0,
        violations,
      };
    },
  };
}
