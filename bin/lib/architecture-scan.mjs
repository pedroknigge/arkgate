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
import { loadInvariantCoverageInputs } from './invariant-coverage-io.mjs';
import { loadArkRuleFileHints } from './arkrule-file-hints.mjs';

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
  const loadedContract = loadContract(effectiveConfig, configPath, {
    arkRules: arkRulesLoad.arkRules,
  });
  const hasInvariants = (arkRulesLoad.arkRules?.invariants?.length ?? 0) > 0;
  const coverageInputs = hasInvariants
    ? loadInvariantCoverageInputs(root, facts)
    : undefined;
  // AR07: Tooling fileHints for orchestration-only / thin-adapter (reuse coverage contents when present).
  const fileHints = loadArkRuleFileHints(
    root,
    facts,
    arkRulesLoad.arkRules,
    coverageInputs?.fileContents
  );
  const analyzed = analyzeTrustedResolvedProject({
    contract: loadedContract,
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
