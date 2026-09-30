/** Private entry for the committed zero-build CLI bundle. */
import {
  createResolvedCandidateFacts,
  type ResolvedCandidateFacts,
  type ResolvedCandidateFactsInput,
} from '../domain/analysis';
import type {
  AnalyzeResolvedProjectInput,
  PreflightResolvedChangeInput,
  ResolvedAnalysisResult,
  ResolvedChangePreflightResult,
} from './analysisTypes';
import { analyzeCanonicalResolvedProject } from './resolvedAnalysis';
import { preflightCanonicalChange, preflightResolvedChange } from './resolvedChangePreflight';

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
export function analyzeTrustedResolvedProject(
  input: Omit<AnalyzeResolvedProjectInput, 'facts'> & { facts: ResolvedCandidateFacts }
): ResolvedAnalysisResult {
  if (!trustedResolvedFacts.has(input.facts)) {
    throw new Error('Trusted resolved analysis requires immutable in-process canonical facts.');
  }
  return analyzeCanonicalResolvedProject(input);
}

/**
 * Atomic preflight for facts this bundle instance created (immutable, already
 * canonical): no second validation copy of either whole-project fact set.
 * Any other input takes the validating path.
 */
export function preflightTrustedResolvedChange(
  input: PreflightResolvedChangeInput
): ResolvedChangePreflightResult {
  const base = input.baseFacts as ResolvedCandidateFacts;
  const candidate = input.candidateFacts as ResolvedCandidateFacts;
  if (!trustedResolvedFacts.has(base) || !trustedResolvedFacts.has(candidate)) {
    return preflightResolvedChange(input);
  }
  return preflightCanonicalChange(input, base, candidate);
}

export * from './analysis';
// Tooling reads pin files; the pure parser and floor table stay in Domain.
export { configVersionFloors, parseArkgatePins } from '../domain/configVersionFloor';
