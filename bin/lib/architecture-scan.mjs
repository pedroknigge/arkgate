/**
 * Architecture check pipeline: content scan → import graph → layer edges → cycles.
 * Extracted from ark-check entry (R3). Entry remains orchestration + presentation.
 */
import path from 'node:path';
import { summarizeParseHealth } from './parse-health.mjs';
import {
  analyzeTrustedResolvedProject,
  loadContract,
} from './analysis-engine.mjs';
import { effectiveAnalysisConfig } from './analysis-policy.mjs';
import { resolveCandidateFacts } from './resolved-candidate-facts.mjs';
import { loadEffectiveArkRulesFromDisk } from './effective-contract-load.mjs';
import {
  coverageOptionsFromConfig,
  invariantIdsFromCatalog,
  loadInvariantCoverageInputs,
} from './invariant-coverage-io.mjs';
import { loadArkRuleFileHints } from './arkrule-file-hints.mjs';

const HINT_CACHE_CAP = 16;
/** Process-local hint map keyed by scoped path + content hash. Not a second engine. */
const hintCache = new Map();

function normalizeScanRelPath(root, filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  const resolvedRoot = path.resolve(root);
  const absolute = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(resolvedRoot, filePath);
  const relative = path.relative(resolvedRoot, absolute).replace(/\\/g, '/');
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith('../') ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  return relative;
}

/** Empty / missing `files` stays unbounded (full governed set). */
function fileLocalScope(root, files) {
  if (!Array.isArray(files) || files.length === 0) return null;
  const scoped = new Set();
  for (const file of files) {
    const rel = normalizeScanRelPath(root, file);
    if (rel) scoped.add(rel);
  }
  return scoped.size > 0 ? scoped : null;
}

function filterHintPreload(fileContents, scoped) {
  if (!scoped || !fileContents) return fileContents;
  const out = {};
  for (const [rel, content] of Object.entries(fileContents)) {
    const key = String(rel || '')
      .replace(/\\/g, '/')
      .replace(/^\.\//, '');
    if (scoped.has(key)) out[rel] = content;
  }
  return out;
}

function hintCacheKey(root, scopedFiles, arkRules) {
  const filesPart = (scopedFiles ?? [])
    .map((file) => `${file.path}\0${file.contentHash ?? ''}`)
    .sort()
    .join('\n');
  const rulesPart = (arkRules?.structure ?? [])
    .map(
      (rule) =>
        `${rule.sensor ?? ''}\0${rule.mode ?? ''}\0${(rule.appliesTo ?? []).join(',')}`
    )
    .join('\n');
  return `${path.resolve(root)}\0${filesPart}\0${rulesPart}`;
}

function rememberHintCache(key, value) {
  if (hintCache.has(key)) hintCache.delete(key);
  hintCache.set(key, value);
  while (hintCache.size > HINT_CACHE_CAP) {
    const oldest = hintCache.keys().next().value;
    hintCache.delete(oldest);
  }
}

function loadHintsForScope(root, facts, arkRules, preloadedContents, scoped) {
  const hintFacts = scoped
    ? { files: (facts.files ?? []).filter((file) => scoped.has(file.path)) }
    : facts;
  const key = hintCacheKey(root, hintFacts.files, arkRules);
  if (hintCache.has(key)) return hintCache.get(key);
  const hints = loadArkRuleFileHints(root, hintFacts, arkRules, preloadedContents);
  rememberHintCache(key, hints);
  return hints;
}

/** Resolve canonical facts and optionally retain filesystem probes for resident invalidation. */
export function resolveArchitectureSnapshot({
  root,
  config,
  manifest,
  rules,
  files,
  ts,
  args,
  captureInputs = true,
}) {
  const observedInputs = captureInputs ? new Map() : undefined;
  const observeInput = observedInputs
    ? (inputPath, kind) => {
        const absolute = path.resolve(inputPath);
        const kinds = observedInputs.get(absolute) ?? new Set();
        kinds.add(kind);
        observedInputs.set(absolute, kinds);
      }
    : undefined;
  const configPath = args?.config
    ? path.resolve(root, args.config)
    : path.join(root, 'ark.config.json');
  observeInput?.(configPath, 'ark-config');
  if (args?.manifest) observeInput?.(path.resolve(root, args.manifest), 'manifest');
  const effectiveConfig = effectiveAnalysisConfig(
    { ...config, rules: rules ?? config.rules },
    manifest
  );
  const facts = resolveCandidateFacts({
    root,
    config: effectiveConfig,
    ts,
    ...(args?.tsconfig ? { tsconfig: args.tsconfig } : {}),
    observeInput,
  });
  const arkRulesLoad = loadEffectiveArkRulesFromDisk(root, effectiveConfig, {
    observeInput,
  });
  if (arkRulesLoad.errors.length > 0) {
    const message = arkRulesLoad.errors
      .map((issue) => `- ${issue.path}: ${issue.message}`)
      .join('\n');
    const err = new Error(`Invalid Effective Contract (${configPath}):\n${message}`);
    err.code = 'ARKRULES_LOAD_FAILED';
    err.issues = arkRulesLoad.errors;
    throw err;
  }
  const scoped = fileLocalScope(root, files);
  const loadedContract = loadContract(effectiveConfig, configPath, {
    arkRules: arkRulesLoad.arkRules,
  });
  const analysisContract = scoped
    ? {
        ...loadedContract,
        classShapes: (facts.classShapes ?? []).filter((shape) => scoped.has(shape.file)),
      }
    : loadedContract;
  const hasInvariants = (arkRulesLoad.arkRules?.invariants?.length ?? 0) > 0;
  const coverageInputs = hasInvariants
    ? loadInvariantCoverageInputs(root, facts, {
        invariantIds: invariantIdsFromCatalog(arkRulesLoad.arkRules),
        ...coverageOptionsFromConfig(effectiveConfig),
      })
    : undefined;
  // File-local structure sensors + hint load honor `files`; graph still uses full facts.
  const fileHints = loadHintsForScope(
    root,
    facts,
    arkRulesLoad.arkRules,
    filterHintPreload(coverageInputs?.fileContents, scoped),
    scoped
  );
  const analyzed = analyzeTrustedResolvedProject({
    contract: analysisContract,
    facts,
    ...(coverageInputs ? { coverageInputs } : {}),
    ...(fileHints ? { fileHints } : {}),
  });
  const parseHealth = summarizeParseHealth(
    facts.files.map((file) => ({
      relFile: file.path,
      entry: { parseDiagnosticCount: file.parseDiagnosticCount },
    }))
  );
  const result = {
    violations: analyzed.ir.violations,
    warnings: analyzed.ir.warnings,
    safety: analyzed.safety,
    parseHealth,
    completeness: analyzed.completeness,
    completenessReasons: analyzed.completenessReasons,
    valid: analyzed.valid,
    strictValid: analyzed.strictValid,
    mode: analyzed.mode,
    policyHash: analyzed.policyHash,
    resolverIdentity: analyzed.resolverIdentity,
    factsHash: analyzed.factsHash,
    candidateTreeHash: analyzed.candidateTreeHash,
  };
  const inputs = observedInputs
    ? [...observedInputs]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([inputPath, kinds]) => ({ path: inputPath, kinds: [...kinds].sort() }))
    : [];
  return { facts, result, inputs };
}

/**
 * Full architecture scan for governed files.
 * @returns {{ violations: object[], warnings: object[] }}
 */
export function runArchitectureScan(options) {
  return resolveArchitectureSnapshot({ ...options, captureInputs: false }).result;
}
