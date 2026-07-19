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
  const loadedContract = loadContract(effectiveConfig, configPath);
  const analyzed = analyzeTrustedResolvedProject({ contract: loadedContract, facts });
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
