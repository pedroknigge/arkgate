/**
 * Architecture check pipeline: content scan → import graph → layer edges → cycles.
 * Extracted from ark-check entry (R3). Entry remains orchestration + presentation.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  collectForbiddenGlobalUses,
  layerForFile,
  looksLikeIntent,
} from '../ark-shared.mjs';
import {
  isTypeOnlyModuleReference,
  isArkPublishCandidate,
  isPublishCall,
  lineOf,
  moduleSpecifierFromCall,
  namedModuleBindings,
  objectHasProperty,
  publishHasSource,
  publishSourceLiteral,
  sourceFileExportsOnlyTypes,
  sourceFileHasTopLevelSideEffects,
  stringLiteralText,
  textOfModuleSpecifier,
  typeOnlyExportNames,
} from './ast-scan.mjs';
import {
  intentLayersFromManifest,
  layerForIntent,
  isBlocked,
  collectConfigWarnings,
} from './config-warnings.mjs';
import { detectCycles } from './graph-cycles.mjs';
import { normalize } from './scan-files.mjs';
import {
  createCompilerOptionsLookup,
  createModuleResolutionHost,
  loadScanCache,
  resolveImport,
  saveScanCache,
  scanCacheKey,
} from './ts-resolve.mjs';

/**
 * Parse one governed source file into content violations + module edges.
 */
export function scanSourceFile(ts, root, config, rules, manifestIntentLayers, file, sourceLayer) {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const violations = [];
  const edges = [];

  const layerConfig = config.layers.find((layer) => layer.name === sourceLayer);
  const forbiddenGlobals = Array.isArray(layerConfig?.forbiddenGlobals)
    ? layerConfig.forbiddenGlobals.filter((entry) => typeof entry === 'string')
    : [];
  for (const use of collectForbiddenGlobalUses(ts, sourceFile, forbiddenGlobals)) {
    violations.push({
      ruleId: 'FORBIDDEN_GLOBAL',
      file: normalize(path.relative(root, file)),
      line: lineOf(sourceFile, use.node.getStart(sourceFile)),
      fromLayer: sourceLayer,
      target: use.name,
      message: `${sourceLayer} must not use the ambient global "${use.name}".`,
    });
  }

  const checkModuleEdge = (specifier, node, kind, typeOnly = false) => {
    const namedBindings = namedModuleBindings(ts, node);
    edges.push({
      specifier,
      line: lineOf(sourceFile, node.getStart(sourceFile)),
      kind,
      typeOnly,
      ...(namedBindings ? { namedBindings } : {}),
    });
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = textOfModuleSpecifier(node);
      if (specifier) {
        checkModuleEdge(
          specifier,
          node,
          ts.isImportDeclaration(node) ? 'import' : 'export',
          isTypeOnlyModuleReference(ts, node)
        );
      }
    }

    if (ts.isCallExpression(node)) {
      const moduleCall = moduleSpecifierFromCall(ts, node);
      if (moduleCall) {
        checkModuleEdge(moduleCall.value, node, moduleCall.kind);
      }

      if (isPublishCall(ts, node)) {
        const firstArg = node.arguments[0];
        const rawIntent = stringLiteralText(ts, firstArg);
        if (
          (rawIntent && looksLikeIntent(rawIntent)) ||
          objectHasProperty(ts, firstArg, 'intent')
        ) {
          violations.push({
            ruleId: 'RAW_EVENT_PUBLISH',
            file: normalize(path.relative(root, file)),
            line: lineOf(sourceFile, node.getStart(sourceFile)),
            message:
              'Publish through a registered intent creator; raw event objects or intent strings bypass Ark contracts and tooling.',
          });
        }

        if (isArkPublishCandidate(ts, node) && !publishHasSource(ts, node)) {
          violations.push({
            ruleId: 'PUBLISH_MISSING_SOURCE',
            file: normalize(path.relative(root, file)),
            line: lineOf(sourceFile, node.getStart(sourceFile)),
            fromLayer: sourceLayer,
            message: 'Strict Ark publish calls must include metadata.source.',
          });
        }

        const sourceIntent = publishSourceLiteral(ts, node);
        if (sourceIntent && looksLikeIntent(sourceIntent)) {
          const sourceIntentLayer = layerForIntent(
            sourceIntent,
            config.layers,
            manifestIntentLayers
          );
          if (sourceIntentLayer && sourceIntentLayer !== sourceLayer) {
            violations.push({
              ruleId: 'PUBLISH_SOURCE_LAYER_MISMATCH',
              file: normalize(path.relative(root, file)),
              line: lineOf(sourceFile, node.getStart(sourceFile)),
              fromLayer: sourceLayer,
              toLayer: sourceIntentLayer,
              target: sourceIntent,
              message:
                `Publish source "${sourceIntent}" resolves to ${sourceIntentLayer}, but the publishing file is classified as ${sourceLayer}.`,
            });
          }
        }
      }
    }

    if (ts.isStringLiteralLike(node) && looksLikeIntent(node.text)) {
      const targetLayer = layerForIntent(node.text, config.layers, manifestIntentLayers);
      const rule = targetLayer ? isBlocked(rules, sourceLayer, targetLayer) : undefined;
      if (rule) {
        violations.push({
          ruleId: 'LAYER_INTENT_REFERENCE_VIOLATION',
          file: normalize(path.relative(root, file)),
          line: lineOf(sourceFile, node.getStart(sourceFile)),
          fromLayer: sourceLayer,
          toLayer: targetLayer,
          target: node.text,
          message:
            rule.message ??
            `${sourceLayer} must not reference ${targetLayer} intent ${node.text}.`,
        });
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return {
    contentViolations: violations,
    edges,
    exportsOnlyTypes: sourceFileExportsOnlyTypes(ts, sourceFile),
    typeOnlyExportNames: typeOnlyExportNames(ts, sourceFile),
    hasTopLevelSideEffects: sourceFileHasTopLevelSideEffects(ts, sourceFile),
  };
}

/**
 * Full architecture scan for governed files.
 * @returns {{ violations: object[], warnings: object[] }}
 */
export function runArchitectureScan({ root, config, manifest, rules, files, ts, args }) {
  const manifestIntentLayers = intentLayersFromManifest(manifest);
  const compilerOptionsFor = createCompilerOptionsLookup(ts, root, args.tsconfig);
  const moduleHost = createModuleResolutionHost(ts);

  const violations = [];
  const warnings = collectConfigWarnings(root, config, files, rules, manifest);
  const cacheKey = args.noCache ? undefined : scanCacheKey(root, args);
  const cachedFiles = cacheKey ? loadScanCache(root, cacheKey) : undefined;
  const nextCacheFiles = {};

  const importGraph = new Map();
  const scanned = [];
  for (const file of files) {
    const sourceLayer = layerForFile(root, file, config.layers);
    if (!sourceLayer) continue;
    const relFile = normalize(path.relative(root, file));
    if (!importGraph.has(relFile)) importGraph.set(relFile, new Set());
    const stat = fs.statSync(file);
    const fileKey = `${stat.mtimeMs}:${stat.size}`;
    const cached = cachedFiles?.[relFile];
    const entry =
      cached && cached.fileKey === fileKey
        ? cached
        : {
            fileKey,
            ...scanSourceFile(
              ts,
              root,
              config,
              rules,
              manifestIntentLayers,
              file,
              sourceLayer
            ),
          };
    nextCacheFiles[relFile] = entry;
    scanned.push({ file, sourceLayer, relFile, entry });
  }

  for (const { file, sourceLayer, relFile, entry } of scanned) {
    violations.push(...entry.contentViolations);
    for (const edge of entry.edges) {
      const target = resolveImport(
        ts,
        edge.specifier,
        file,
        compilerOptionsFor(file),
        moduleHost,
        root
      );
      const targetLayer = target ? layerForFile(root, target, config.layers) : undefined;
      if (target && targetLayer) {
        const relTarget = normalize(path.relative(root, target));
        if (relTarget !== relFile && !edge.typeOnly) {
          importGraph.get(relFile).add(relTarget);
        }
      }
      const rule = targetLayer ? isBlocked(rules, sourceLayer, targetLayer) : undefined;
      if (rule) {
        const relTarget = normalize(path.relative(root, target));
        const targetCached = nextCacheFiles[relTarget];
        const staticEdge = edge.kind === 'import' || edge.kind === 'export';
        const targetTypeOnlyExports =
          staticEdge && Boolean(targetCached?.exportsOnlyTypes) && !edge.typeOnly;
        const sourcePureTypeModule = Boolean(entry.exportsOnlyTypes);
        // R6: every named binding is a type-only export of the target (mixed modules OK).
        // Conservative: no dual-space value names, no top-level side effects on target
        // (import type would skip evaluation), no default/namespace/side-effect/export*.
        const targetTypeNames = new Set(targetCached?.typeOnlyExportNames || []);
        const named = edge.namedBindings;
        const namedBindingsTypeOnly =
          staticEdge &&
          Array.isArray(named) &&
          named.length > 0 &&
          targetTypeNames.size > 0 &&
          !targetCached?.hasTopLevelSideEffects &&
          named.every((n) => targetTypeNames.has(n));
        violations.push({
          ruleId: 'LAYER_IMPORT_VIOLATION',
          file: relFile,
          line: edge.line,
          fromLayer: sourceLayer,
          toLayer: targetLayer,
          target: relTarget,
          ...(edge.typeOnly ? { typeOnly: true } : {}),
          ...(targetTypeOnlyExports ? { targetTypeOnlyExports: true } : {}),
          ...(sourcePureTypeModule ? { sourcePureTypeModule: true } : {}),
          ...(namedBindingsTypeOnly ? { namedBindingsTypeOnly: true } : {}),
          ...(edge.kind ? { edgeKind: edge.kind } : {}),
          message: rule.message ?? `${sourceLayer} must not ${edge.kind} ${targetLayer}.`,
        });
      }
    }
  }

  if (cacheKey) saveScanCache(root, cacheKey, nextCacheFiles);

  const cyclePolicy = String(config.cyclePolicy || 'strict').toLowerCase();
  if (cyclePolicy !== 'off') {
    const cycles = detectCycles(importGraph);
    if (cyclePolicy === 'soft' || cyclePolicy === 'framework-soft') {
      for (const c of cycles) {
        warnings.push({
          ruleId: 'CIRCULAR_DEPENDENCY',
          message: `${c.message} (soft cycle policy — advisory only; set cyclePolicy: "strict" to fail the check)`,
          file: c.file,
          target: c.target,
          failsStrict: false,
        });
      }
    } else {
      violations.push(...cycles);
    }
  }

  return { violations, warnings };
}
