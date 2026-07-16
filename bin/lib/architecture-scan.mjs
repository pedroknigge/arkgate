/**
 * Architecture check pipeline: content scan → import graph → layer edges → cycles.
 * Extracted from ark-check entry (R3). Entry remains orchestration + presentation.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  layerForFile,
  looksLikeIntent,
} from '../ark-shared.mjs';
import {
  isArkPublishCandidate,
  isPublishCall,
  lineOf,
  namedModuleBindings,
  objectHasProperty,
  publishHasSource,
  publishSourceLiteral,
  sourceFileExportsOnlyTypes,
  sourceFileHasTopLevelSideEffects,
  stringLiteralText,
  typeOnlyExportNames,
} from './ast-scan.mjs';
import { provePortProofInject } from './port-proof.mjs';
import {
  intentLayersFromManifest,
  layerForIntent,
  isBlocked,
  collectConfigWarnings,
} from './config-warnings.mjs';
import {
  ambientCoveredByForbiddenGlobals,
  collectCapabilityUses,
  collectForbiddenCapabilityUses,
  effectiveCapabilityDeny,
  evaluateArchitectureGraph,
  extractSemanticDependencies,
} from './analysis-engine.mjs';
import { normalize } from './scan-files.mjs';
import { collectSafetyDiagnostics } from './safety-diagnostics.mjs';
import { classifyPublishFacts } from './source-policy.mjs';
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
  for (const use of collectForbiddenCapabilityUses(ts, sourceFile, forbiddenGlobals)) {
    violations.push({
      ruleId: 'FORBIDDEN_GLOBAL',
      file: normalize(path.relative(root, file)),
      line: use.line,
      fromLayer: sourceLayer,
      target: use.name,
      message: `${sourceLayer} must not use the ambient global "${use.name}".`,
    });
  }

  // U04 — opted-in capability walls (ADR 0009). One violation, one voice: an
  // ambient use already covered by this layer's forbiddenGlobals reports only
  // FORBIDDEN_GLOBAL (D7 dedup); absence of the surface adds nothing.
  const capabilityDeny = new Set(effectiveCapabilityDeny(layerConfig ?? {}));
  if (capabilityDeny.size > 0) {
    for (const use of collectCapabilityUses(ts, sourceFile)) {
      if (!capabilityDeny.has(use.capability)) continue;
      if (
        use.source === 'ambient-global' &&
        ambientCoveredByForbiddenGlobals(use.symbol, forbiddenGlobals)
      ) {
        continue;
      }
      violations.push({
        ruleId: 'CAPABILITY_VIOLATION',
        file: normalize(path.relative(root, file)),
        line: use.line,
        fromLayer: sourceLayer,
        target: use.symbol,
        capability: use.capability,
        message:
          use.source === 'import-based'
            ? `${sourceLayer} denies the ${use.capability} capability; found import of "${use.symbol}".`
            : `${sourceLayer} denies the ${use.capability} capability; found ambient "${use.symbol}".`,
      });
    }
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

  for (const dependency of extractSemanticDependencies(ts, sourceFile)) {
    if (!dependency.specifier) continue;
    checkModuleEdge(
      dependency.specifier,
      dependency.node,
      dependency.kind,
      dependency.typeOnly
    );
  }

  const needsPolicyWalk =
    /\bpublish\s*\(|\bintent\b/.test(source) ||
    /['"`]\s*[A-Z][A-Za-z0-9_]*\./.test(source);
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      if (isPublishCall(ts, node)) {
        const firstArg = node.arguments[0];
        const rawIntent = stringLiteralText(ts, firstArg);
        for (const finding of classifyPublishFacts({
          publishCall: true,
          rawIntentName: rawIntent,
          objectHasIntent: objectHasProperty(ts, firstArg, 'intent'),
          arkPublishCandidate: isArkPublishCandidate(ts, node),
          hasSource: publishHasSource(ts, node),
        })) {
          violations.push({
            ruleId: finding.ruleId,
            file: normalize(path.relative(root, file)),
            line: lineOf(sourceFile, node.getStart(sourceFile)),
            ...(finding.ruleId === 'PUBLISH_MISSING_SOURCE' ? { fromLayer: sourceLayer } : {}),
            message: finding.message,
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
  if (needsPolicyWalk) visit(sourceFile);
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

  const warnings = collectConfigWarnings(root, config, files, rules, manifest);
  const safety = collectSafetyDiagnostics(ts, root, config, files);
  warnings.push(...safety.warnings);
  const cacheKey = args.noCache ? undefined : scanCacheKey(root, args);
  const cachedFiles = cacheKey ? loadScanCache(root, cacheKey) : undefined;
  const nextCacheFiles = {};

  const scanned = [];
  for (const file of files) {
    const sourceLayer = layerForFile(root, file, config.layers);
    if (!sourceLayer) continue;
    const relFile = normalize(path.relative(root, file));
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

  const engineEdges = [];
  for (const { file, sourceLayer, relFile, entry } of scanned) {
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
      const relTarget = target ? normalize(path.relative(root, target)) : undefined;
      const targetCached = relTarget ? nextCacheFiles[relTarget] : undefined;
      const staticEdge = edge.kind === 'import' || edge.kind === 'export';
      const targetTypeOnlyExports =
        staticEdge && Boolean(targetCached?.exportsOnlyTypes) && !edge.typeOnly;
      const sourcePureTypeModule = Boolean(entry.exportsOnlyTypes);
      const targetTypeNames = new Set(targetCached?.typeOnlyExportNames || []);
      const named = edge.namedBindings;
      const namedBindingsTypeOnly =
        staticEdge &&
        Array.isArray(named) &&
        named.length > 0 &&
        targetTypeNames.size > 0 &&
        !targetCached?.hasTopLevelSideEffects &&
        named.every((name) => targetTypeNames.has(name));
      const deniedRule = targetLayer
        ? isBlocked(rules, sourceLayer, targetLayer, {
            fromPath: relFile,
            toPath: relTarget,
            layers: config.layers,
          })
        : undefined;
      let portProofEligible = false;
      if (
        deniedRule &&
        !deniedRule.peerIsolation &&
        !edge.typeOnly &&
        edge.kind === 'import' &&
        !targetTypeOnlyExports &&
        !namedBindingsTypeOnly
      ) {
        try {
          const source = fs.readFileSync(file, 'utf8');
          portProofEligible = Boolean(provePortProofInject(ts, source, { filePath: file }).eligible);
        } catch {
          portProofEligible = false;
        }
      }
      engineEdges.push({
        from: relFile,
        fromLayer: sourceLayer,
        to: relTarget,
        toLayer: targetLayer,
        line: edge.line,
        kind: edge.kind,
        typeOnly: edge.typeOnly,
        targetTypeOnlyExports,
        sourcePureTypeModule,
        namedBindingsTypeOnly,
        portProofEligible,
      });
    }
  }

  if (cacheKey) saveScanCache(root, cacheKey, nextCacheFiles);

  return evaluateArchitectureGraph({
    config,
    rules,
    files: scanned.map(({ relFile }) => relFile),
    contentViolations: scanned.flatMap(({ entry }) => entry.contentViolations),
    edges: engineEdges,
    warnings,
    safety: safety.report,
  });
}
