/** Private entry for the committed zero-build CLI bundle. */
import {
  createResolvedCandidateFacts,
  type ResolvedCandidateFacts,
  type ResolvedCandidateFactsInput,
} from '../domain/analysis';
import type { AnalysisContract, ResolvedAnalysisResult } from './analysisTypes';
import { analyzeCanonicalResolvedProject } from './resolvedAnalysis';

const trustedResolvedFacts = new WeakSet<ResolvedCandidateFacts>();

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

/** Validate once, then retain an immutable identity inside this bundle instance. */
export function createTrustedResolvedCandidateFacts(
  input: ResolvedCandidateFactsInput
): ResolvedCandidateFacts {
  const facts = deepFreeze(createResolvedCandidateFacts(input));
  trustedResolvedFacts.add(facts);
  return facts;
}

/** Only immutable canonical facts created by this bundle instance may skip validation. */
export function analyzeTrustedResolvedProject(input: {
  contract: AnalysisContract;
  facts: ResolvedCandidateFacts;
  coverageInputs?: {
    fileContents: Readonly<Record<string, string>>;
    testFiles?: readonly string[];
    testGlobsMissing?: boolean;
  };
  fileHints?: Readonly<
    Record<
      string,
      {
        orchestrationHeavy?: boolean;
        adapterThick?: boolean;
      }
    >
  >;
}): ResolvedAnalysisResult {
  if (!trustedResolvedFacts.has(input.facts)) {
    throw new Error('Trusted resolved analysis requires immutable in-process canonical facts.');
  }
  return analyzeCanonicalResolvedProject(input);
}

export * from './analysis';
