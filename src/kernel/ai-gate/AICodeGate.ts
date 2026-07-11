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
import { findDeniedEdgeRule } from '../../domain/layerMatch';

export interface AICodeGatePolicyContext<Context = AICodeGateContext> {
  source: string;
  context?: Context;
}

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
   * to a listed layer — mirrors structrail-check's FORBIDDEN_GLOBAL rule.
   */
  forbiddenGlobals?: Record<string, string[]>;
  /**
   * Layer names whose role is infrastructure and may therefore import infrastructure
   * (a persistence adapter importing the DB is correct, not a violation). The built-in
   * infra-import heuristics are suppressed for these layers and for any layer whose
   * name matches the conventional infra tokens. Populate from structrail.config.json layers
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

/** Extract quoted string literals from source (naive scan). */
function extractQuotedStrings(source: string): StringMatch[] {
  const matches: StringMatch[] = [];
  const re = /['"`]([A-Za-z][A-Za-z0-9_.]*)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    matches.push({ value: m[1], index: m.index });
  }
  return matches;
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

function extractModuleSpecifiersAst(ts: any, source: string): ModuleSpecifierMatch[] {
  const sourceFile = ts.createSourceFile('generated.ts', source, ts.ScriptTarget.Latest, true);
  const matches: ModuleSpecifierMatch[] = [];
  const push = (
    node: any,
    value: string,
    kind: ModuleSpecifierMatch['kind'],
    typeOnly = false
  ) => {
    matches.push({
      value,
      index: node.getStart(sourceFile),
      kind,
      typeOnly,
    });
  };

  const visit = (node: any) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const clause = node.importClause;
      const namedBindings = clause?.namedBindings;
      const specifiersOnly =
        clause &&
        !clause.name &&
        namedBindings &&
        ts.isNamedImports(namedBindings) &&
        namedBindings.elements.length > 0 &&
        namedBindings.elements.every((element: any) => element.isTypeOnly === true);
      push(
        node.moduleSpecifier,
        node.moduleSpecifier.text,
        'import',
        Boolean(clause?.isTypeOnly || specifiersOnly)
      );
    } else if (ts.isExportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const clause = node.exportClause;
      const specifiersOnly =
        clause &&
        ts.isNamedExports(clause) &&
        clause.elements.length > 0 &&
        clause.elements.every((element: any) => element.isTypeOnly === true);
      push(
        node.moduleSpecifier,
        node.moduleSpecifier.text,
        'export',
        Boolean(node.isTypeOnly || specifiersOnly)
      );
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      const argument = node.moduleReference.expression;
      const value = tsStringLiteralText(ts, argument);
      if (value !== undefined) push(argument, value, 'require');
    } else if (ts.isCallExpression(node)) {
      const argument = node.arguments[0];
      const value = tsStringLiteralText(ts, argument);
      if (value !== undefined && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        push(argument, value, 'dynamic-import');
      } else if (
        value !== undefined &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require'
      ) {
        push(argument, value, 'require');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return matches.sort((a, b) => a.index - b.index);
}

function nonLiteralDynamicDependencies(
  ts: any,
  source: string
): Array<{ line: number; kind: 'import' | 'require' }> {
  const sourceFile = ts.createSourceFile('generated.ts', source, ts.ScriptTarget.Latest, true);
  const uses: Array<{ line: number; kind: 'import' | 'require' }> = [];
  const visit = (node: any) => {
    if (ts.isCallExpression(node)) {
      const dynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const directRequire =
        ts.isIdentifier(node.expression) && node.expression.text === 'require';
      const argument = node.arguments[0];
      if (
        (dynamicImport || directRequire) &&
        (!argument || !ts.isStringLiteralLike(argument))
      ) {
        uses.push({
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
          kind: directRequire ? 'require' : 'import',
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return uses;
}

function extractQuotedStringsAst(ts: any, source: string): StringMatch[] {
  const sourceFile = ts.createSourceFile('generated.ts', source, ts.ScriptTarget.Latest, true);
  const matches: StringMatch[] = [];
  const visit = (node: any) => {
    if (ts.isStringLiteralLike(node)) {
      matches.push({ value: node.text, index: node.getStart(sourceFile) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return matches;
}

function looksLikeIntentName(s: string): boolean {
  return /^(Domain|Application|Adapter|Workflow|Job|Presentation|Reporting|Metadata|Security|Audit|Observability|Kernel)\.[A-Za-z0-9_.]+$/.test(s);
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
// structrail.config.json that explicitly allows the edge (which structrail-check passes).
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
    (rawIntent !== undefined && looksLikeIntentName(rawIntent)) ||
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

function singleFileTypeChecker(ts: any, sourceFile: any): any {
  const options = {
    noLib: true,
    noResolve: true,
    target: ts.ScriptTarget.Latest,
  };
  const host = ts.createCompilerHost(options, true);
  host.getSourceFile = (fileName: string) =>
    fileName === sourceFile.fileName ? sourceFile : undefined;
  host.fileExists = (fileName: string) => fileName === sourceFile.fileName;
  host.readFile = (fileName: string) =>
    fileName === sourceFile.fileName ? sourceFile.text : undefined;
  return ts.createProgram([sourceFile.fileName], options, host).getTypeChecker();
}

function propertyAccessPath(ts: any, node: any): { root: any; segments: string[] } | undefined {
  const segments: string[] = [];
  let current = node;
  while (ts.isPropertyAccessExpression(current)) {
    segments.unshift(current.name.text);
    current = current.expression;
  }
  if (!ts.isIdentifier(current)) return undefined;
  segments.unshift(current.text);
  return { root: current, segments };
}

function isRuntimeIdentifierReference(ts: any, node: any): boolean {
  if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) return false;
  return (
    (ts.isExpressionNode(node) && !ts.isInTypeQuery(node)) ||
    (ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node)
  );
}

function hasLocalDeclaration(ts: any, checker: any, sourceFile: any, node: any): boolean {
  const shorthand =
    ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node;
  const symbol = shorthand
    ? checker.getShorthandAssignmentValueSymbol(node.parent)
    : checker.getSymbolAtLocation(node);
  return Boolean(
    symbol?.declarations?.some((declaration: any) => declaration.getSourceFile() === sourceFile)
  );
}

/**
 * Find uses of forbidden ambient globals with single-file TypeScript binding. Kept in sync
 * with `collectForbiddenGlobalUses` in bin/ark-shared.mjs (the standalone CLIs cannot import
 * from dist). Local parameters/variables/imports have symbols; unbound runtime identifiers
 * and explicit `globalThis` property chains are ambient.
 */
function analyzeForbiddenGlobals(
  ts: any,
  source: string,
  filePath: string | undefined,
  layer: string,
  forbidden: string[]
): AICodeGateViolation[] {
  const entries = new Set(forbidden);
  if (entries.size === 0) return [];
  const sourceFile = ts.createSourceFile('generated.ts', source, ts.ScriptTarget.Latest, true);
  const checker = singleFileTypeChecker(ts, sourceFile);
  const violations: AICodeGateViolation[] = [];
  const flag = (name: string, node: any) =>
    violations.push(
      violation('FORBIDDEN_GLOBAL', `${layer} must not use the ambient global "${name}".`, {
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
        filePath,
        target: name,
        fromLayer: layer,
        suggestion:
          'Inject the capability through a port (e.g. a Clock, IdGenerator, or HttpPort) instead of reaching for the ambient global.',
      })
    );

  const visit = (node: any) => {
    const nestedPropertyAccess =
      ts.isPropertyAccessExpression(node) &&
      ts.isPropertyAccessExpression(node.parent) &&
      node.parent.expression === node;
    if (ts.isPropertyAccessExpression(node) && !nestedPropertyAccess) {
      const path = propertyAccessPath(ts, node);
      if (path && !hasLocalDeclaration(ts, checker, sourceFile, path.root)) {
        const explicitGlobalThis = path.segments[0] === 'globalThis';
        const normalized = explicitGlobalThis ? path.segments.slice(1) : path.segments;
        let match: string | undefined;
        for (let length = normalized.length; length >= (explicitGlobalThis ? 1 : 2); length -= 1) {
          const candidate = normalized.slice(0, length).join('.');
          if (entries.has(candidate)) {
            match = candidate;
            break;
          }
        }
        if (match) flag(match, node);
      }
    } else if (
      ts.isIdentifier(node) &&
      entries.has(node.text) &&
      isRuntimeIdentifierReference(ts, node) &&
      !hasLocalDeclaration(ts, checker, sourceFile, node)
    ) {
      flag(node.text, node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
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
      if (
        (rawIntent && looksLikeIntentName(rawIntent)) ||
        tsObjectHasProperty(ts, firstArg, 'intent')
      ) {
        violations.push(
          violation('RAW_EVENT_PUBLISH', 'Publish through a registered intent creator; raw event objects or intent strings bypass Structrail contracts and tooling.', {
            line: lineForNode(node),
            filePath,
          })
        );
      }

      if (tsIsArkPublishCandidate(ts, node) && !tsPublishHasSource(ts, node)) {
        violations.push(
          violation('PUBLISH_MISSING_SOURCE', 'Strict Structrail publish calls must include metadata.source.', {
            line: lineForNode(node),
            filePath,
          })
        );
      }

      const sourceIntent = tsPublishSourceLiteral(ts, node);
      if (profile && contextLayer && sourceIntent && looksLikeIntentName(sourceIntent)) {
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
      const moduleSpecifiers = options.typescript
        ? extractModuleSpecifiersAst(options.typescript, source)
        : extractModuleSpecifiers(source);
      const quotedStrings = options.typescript
        ? extractQuotedStringsAst(options.typescript, source)
        : extractQuotedStrings(source);

      if (
        options.typescript &&
        !options.allowNonLiteralDynamicImport?.(filePath)
      ) {
        for (const dependency of nonLiteralDynamicDependencies(options.typescript, source)) {
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
          ? ` If "${contextLayer}" is an infrastructure layer, mark it in structrail.config.json with "mayImportInfrastructure": true (or name it with an infra token like Adapters/Persistence/Repository).`
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
        // decide — not the path heuristic. This keeps the write gate consistent with structrail-check
        // (`structrail.config.json` is authoritative), so an edge the config allows — e.g. a route
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
            // runtime — do not hard-block the write path. structrail-check --plan still surfaces
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
          if (targetLayer !== contextLayer) {
            // Allowed cross-layer edge — skip infra heuristic.
            continue;
          }
        }

        // Ungoverned / same-layer (no peerIsolation hit): fall back to the infra path-heuristic
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
          if (looksLikeIntentName(literal.value) && !intentNames.has(literal.value)) {
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
          if (!looksLikeIntentName(literal.value)) continue;

          const targetLayer = options.architectureProfile.resolveLayer(literal.value);
          if (!targetLayer) continue;

          // Intent names are not files — peerIsolation cannot classify slices; classic deny only.
          const blocked = findDeniedEdgeRule(
            options.architectureProfile.rules,
            contextLayer,
            targetLayer
          );

          if (blocked) {
            violations.push(
              violation(
                'LAYER_REFERENCE_VIOLATION',
                blocked.message ??
                  `Layer "${contextLayer}" must not reference "${targetLayer}" through "${literal.value}".`,
                {
                  line: lineOf(source, literal.index),
                  filePath,
                  target: literal.value,
                  fromLayer: contextLayer,
                  toLayer: targetLayer,
                  suggestion: 'Route the dependency through an allowed intent, port, or event.',
                  details: { rule: blocked },
                }
              )
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

      if (options.typescript && contextLayer && options.forbiddenGlobals?.[contextLayer]?.length) {
        try {
          violations.push(
            ...analyzeForbiddenGlobals(
              options.typescript,
              source,
              filePath,
              contextLayer,
              options.forbiddenGlobals[contextLayer]
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
        valid: violations.length === 0,
        violations,
      };
    },
  };
}
