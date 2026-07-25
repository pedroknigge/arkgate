/** Atomic preflight over one validated base/candidate facts pair (ADR 0011). */
import {
  deterministicHash,
  loadResolvedCandidateFacts,
  stableSerialize,
  type AnalysisFileChange,
  type ResolvedCandidateFacts,
} from '../domain/analysis';
import { analyzeArchitectureConvergence } from '../domain/changeConvergence';
import { deterministicNextAction } from '../domain/remediation';
import type {
  ArchitectureEngineViolation,
  PreflightResolvedChangeInput,
  PreparedChangeFile,
  ResolvedChangePreflightResult,
} from './analysisTypes';
import { analyzeResolvedProject } from './resolvedAnalysis';

function canonicalChangePath(value: string): string | undefined {
  const portable = value.replace(/\\/g, '/');
  if (
    !portable ||
    portable.startsWith('/') ||
    /^[A-Za-z]:\//.test(portable) ||
    portable.includes('\0')
  ) {
    return undefined;
  }
  const segments: string[] = [];
  for (const segment of portable.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return undefined;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  const normalized = segments.join('/');
  return normalized && normalized === portable ? normalized : undefined;
}

function identityViolations(
  base: ResolvedCandidateFacts,
  candidate: ResolvedCandidateFacts
): ArchitectureEngineViolation[] {
  const fields = [
    ['resolverIdentity', base.resolverIdentity, candidate.resolverIdentity],
    ['compilerIdentity', base.compilerIdentity, candidate.compilerIdentity],
    ['evidenceRequirementsHash', base.evidenceRequirementsHash, candidate.evidenceRequirementsHash],
    ['projectPackageName', base.projectPackageName ?? '', candidate.projectPackageName ?? ''],
  ] as const;
  return fields
    .filter(([, before, after]) => before !== after)
    .map(([field, before, after]) => ({
      ruleId: 'FACTS_IDENTITY_MISMATCH',
      file: '<change-set>',
      line: 1,
      field,
      before,
      candidate: after,
      message: `Base and candidate facts must use the same ${field}.`,
    }));
}

function preparedChange(
  change: AnalysisFileChange,
  path: string,
  baseByPath: ReadonlyMap<string, ResolvedCandidateFacts['files'][number]>,
  candidateByPath: ReadonlyMap<string, ResolvedCandidateFacts['files'][number]>
): PreparedChangeFile {
  const before = baseByPath.get(path);
  const candidate = candidateByPath.get(path);
  return {
    path,
    operation: 'delete' in change && change.delete ? 'delete' : before ? 'update' : 'create',
    ...(before ? { beforeContentHash: before.contentHash } : {}),
    ...(candidate ? { candidateContentHash: candidate.contentHash } : {}),
  };
}

/**
 * Validate that the supplied candidate is exactly the declared in-memory
 * overlay, then return its canonical resolved verdict. No project file is read
 * or written here.
 */
export function preflightResolvedChange(
  input: PreflightResolvedChangeInput
): ResolvedChangePreflightResult {
  const baseFacts = loadResolvedCandidateFacts(input.baseFacts);
  const candidateFacts = loadResolvedCandidateFacts(input.candidateFacts);
  const base = analyzeResolvedProject({ contract: input.contract, facts: baseFacts });
  const candidate = analyzeResolvedProject({ contract: input.contract, facts: candidateFacts });
  const baseByPath = new Map(baseFacts.files.map((file) => [file.path, file] as const));
  const candidateByPath = new Map(
    candidateFacts.files.map((file) => [file.path, file] as const)
  );
  const inputViolations = identityViolations(baseFacts, candidateFacts);
  const declared = new Map<string, AnalysisFileChange>();
  const changes: PreparedChangeFile[] = [];

  for (const change of input.changes) {
    const path = canonicalChangePath(change.path);
    if (!path) {
      inputViolations.push({
        ruleId: 'INVALID_CHANGE_PATH',
        file: '<change-set>',
        line: 1,
        message: 'Every change requires a canonical project-relative path.',
      });
      continue;
    }
    if (declared.has(path)) {
      inputViolations.push({
        ruleId: 'DUPLICATE_CHANGE_PATH',
        file: path,
        line: 1,
        message: `The atomic change set contains more than one operation for ${path}.`,
      });
      continue;
    }
    declared.set(path, change);
    const before = baseByPath.get(path);
    const after = candidateByPath.get(path);
    if ('delete' in change && change.delete) {
      if (!before) {
        inputViolations.push({
          ruleId: 'DELETE_TARGET_MISSING',
          file: path,
          line: 1,
          message: `Cannot delete ${path} because it is not present in the supplied base facts.`,
        });
      }
      if (after) {
        inputViolations.push({
          ruleId: 'CANDIDATE_DELETE_NOT_APPLIED',
          file: path,
          line: 1,
          message: `Candidate facts still contain deleted file ${path}.`,
        });
      }
    } else {
      const content = 'content' in change ? change.content : '';
      const expectedHash = deterministicHash(content);
      if (!after) {
        inputViolations.push({
          ruleId: 'CANDIDATE_CHANGE_MISSING',
          file: path,
          line: 1,
          message: `Candidate facts do not contain changed file ${path}.`,
        });
      } else if (after.contentHash !== expectedHash) {
        inputViolations.push({
          ruleId: 'CANDIDATE_CONTENT_HASH_MISMATCH',
          file: path,
          line: 1,
          expectedContentHash: expectedHash,
          candidateContentHash: after.contentHash,
          message: `Candidate facts for ${path} do not match the declared content.`,
        });
      }
    }
    changes.push(preparedChange(change, path, baseByPath, candidateByPath));
  }

  if (input.changes.length === 0) {
    inputViolations.push({
      ruleId: 'CHANGE_SET_EMPTY',
      file: '<change-set>',
      line: 1,
      message: 'Atomic preflight requires at least one create, update, or delete.',
    });
  }

  for (const path of new Set([...baseByPath.keys(), ...candidateByPath.keys()])) {
    if (declared.has(path)) continue;
    const before = baseByPath.get(path);
    const after = candidateByPath.get(path);
    if (before && after && stableSerialize(before) === stableSerialize(after)) continue;
    inputViolations.push({
      ruleId: 'UNDECLARED_CANDIDATE_CHANGE',
      file: path,
      line: 1,
      message: `Candidate facts change ${path}, but the atomic change set does not declare it.`,
    });
  }

  const convergence = input.changeMap
    ? analyzeArchitectureConvergence({
        changeMap: input.changeMap,
        changes,
        baseDependencies: base.ir.edges.flatMap((edge) =>
          edge.to ? [{ from: edge.from, to: edge.to }] : []
        ),
        candidateDependencies: candidate.ir.edges.flatMap((edge) =>
          edge.to ? [{ from: edge.from, to: edge.to }] : []
        ),
      })
    : undefined;
  const violations = [...inputViolations, ...candidate.ir.violations].map((violation) => ({
    ...violation,
    nextAction: deterministicNextAction(violation),
  }));
  // Match CLI/library merge: failsStrict:false type-only placement debt does not block.
  const blockingViolations = violations.filter(
    (violation) => (violation as { failsStrict?: boolean }).failsStrict !== false
  );

  return {
    schemaVersion: '1.0',
    mode: 'resolved-candidate-facts',
    valid:
      base.completeness === 'complete' &&
      candidate.strictValid &&
      blockingViolations.length === 0 &&
      (convergence?.structurallyConverged ?? true),
    readOnly: true,
    policyHash: input.contract.policyHash,
    resolverIdentity: candidateFacts.resolverIdentity,
    compilerIdentity: candidateFacts.compilerIdentity,
    compilerOptionsHash: candidateFacts.compilerOptionsHash,
    tsconfigHash: candidateFacts.tsconfigHash,
    baseCompilerOptionsHash: baseFacts.compilerOptionsHash,
    candidateCompilerOptionsHash: candidateFacts.compilerOptionsHash,
    baseTsconfigHash: baseFacts.tsconfigHash,
    candidateTsconfigHash: candidateFacts.tsconfigHash,
    evidenceRequirementsHash: candidateFacts.evidenceRequirementsHash,
    baseFactsHash: baseFacts.factsHash,
    candidateFactsHash: candidateFacts.factsHash,
    baseTreeHash: baseFacts.candidateTreeHash,
    candidateTreeHash: candidateFacts.candidateTreeHash,
    baseCompleteness: base.completeness,
    candidateCompleteness: candidate.completeness,
    baseCompletenessReasons: base.completenessReasons,
    candidateCompletenessReasons: candidate.completenessReasons,
    ...(input.changeMap ? { changeMapHash: input.changeMap.hash } : {}),
    ...(convergence ? { convergence } : {}),
    changes: changes.sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0
    ),
    violations,
    warnings: candidate.ir.warnings,
  };
}
