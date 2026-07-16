/**
 * Atomic create/update/delete preflight over one in-memory candidate
 * (U02 pilot 2). Reached through the src/kernel/analysis.ts facade; consumer
 * import paths never change.
 */
import {
  deterministicHash,
  stableSerialize,
  type AnalysisFile,
  type AnalysisFileChange,
  type AnalysisImportEdge,
} from '../domain/analysis';
import { analyzeArchitectureConvergence } from '../domain/changeConvergence';
import { deterministicNextAction } from '../domain/remediation';
import { analyzeChange, analyzeProject } from './analysisCore';
import { evaluateArchitectureGraph } from './graphEvaluate';
import { normalizePath } from './moduleGraph';
import type {
  AnalyzeChangeInput,
  ArchitectureEngineViolation,
  ChangePreflightResult,
  PreparedChangeFile,
} from './analysisTypes';

function analysisTreeHash(files: readonly AnalysisFile[]): string {
  return deterministicHash(
    stableSerialize(files.map(({ path, contentHash }) => ({ path, contentHash })))
  );
}

/**
 * Evaluate one create/update/delete set as a single in-memory candidate.
 * The function never writes and returns hashes that bind a later host commit to
 * the exact base, policy, compiler options, and candidate contents it checked.
 */
export function preflightChange(input: AnalyzeChangeInput): ChangePreflightResult {
  const base = analyzeProject(input);
  const baseByPath = new Map(base.ir.files.map((file) => [file.path, file]));
  const uniqueChanges: AnalysisFileChange[] = [];
  const seen = new Set<string>();
  const inputViolations: ArchitectureEngineViolation[] = [];

  for (const change of input.changes) {
    const rawPath = change.path.replace(/\\/g, '/');
    const path = normalizePath(change.path);
    if (
      !path ||
      path === '..' ||
      path.startsWith('../') ||
      rawPath.startsWith('/') ||
      /^[A-Za-z]:\//.test(rawPath) ||
      rawPath.includes('\0')
    ) {
      inputViolations.push({
        ruleId: 'INVALID_CHANGE_PATH',
        file: '<change-set>',
        line: 1,
        message: 'Every change requires a safe, non-empty project-relative path.',
      });
      continue;
    }
    if (seen.has(path)) {
      inputViolations.push({
        ruleId: 'DUPLICATE_CHANGE_PATH',
        file: path,
        line: 1,
        message: `The atomic change set contains more than one operation for ${path}.`,
      });
      continue;
    }
    seen.add(path);
    if ('delete' in change && change.delete && !baseByPath.has(path)) {
      inputViolations.push({
        ruleId: 'DELETE_TARGET_MISSING',
        file: path,
        line: 1,
        message: `Cannot delete ${path} because it is not present in the supplied base tree.`,
      });
    }
    uniqueChanges.push(
      'delete' in change && change.delete
        ? { path, delete: true }
        : { path, content: 'content' in change ? change.content : '' }
    );
  }

  if (input.changes.length === 0) {
    inputViolations.push({
      ruleId: 'CHANGE_SET_EMPTY',
      file: '<change-set>',
      line: 1,
      message: 'Atomic preflight requires at least one create, update, or delete.',
    });
  }

  const candidate = analyzeChange({ ...input, changes: uniqueChanges });
  const candidateByPath = new Map(candidate.ir.files.map((file) => [file.path, file]));
  const graphResult = evaluateArchitectureGraph({
    config: input.contract.config,
    rules: input.contract.config.rules,
    files: candidate.ir.files.map((file) => file.path),
    contentViolations: [],
    edges: candidate.ir.edges
      .filter((edge): edge is AnalysisImportEdge & { fromLayer: string } => Boolean(edge.fromLayer))
      .map((edge) => ({
        from: edge.from,
        fromLayer: edge.fromLayer,
        ...(edge.to ? { to: edge.to } : {}),
        ...(edge.toLayer ? { toLayer: edge.toLayer } : {}),
        line: edge.evidence.line,
        kind: 'import',
      })),
  });

  const changes = uniqueChanges
    .map((change): PreparedChangeFile => {
      const path = normalizePath(change.path);
      const before = baseByPath.get(path);
      const after = candidateByPath.get(path);
      return {
        path,
        operation: 'delete' in change && change.delete ? 'delete' : before ? 'update' : 'create',
        ...(before ? { beforeContentHash: before.contentHash } : {}),
        ...(after ? { candidateContentHash: after.contentHash } : {}),
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  const violations = [...inputViolations, ...graphResult.violations].map((violation) => ({
    ...violation,
    nextAction: deterministicNextAction(violation),
  }));
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

  return {
    schemaVersion: '1.0',
    valid: violations.length === 0 && (convergence?.structurallyConverged ?? true),
    readOnly: true,
    policyHash: input.contract.policyHash,
    compilerOptionsHash: candidate.ir.compilerOptionsHash,
    baseTreeHash: analysisTreeHash(base.ir.files),
    candidateTreeHash: analysisTreeHash(candidate.ir.files),
    ...(input.changeMap ? { changeMapHash: input.changeMap.hash } : {}),
    ...(convergence ? { convergence } : {}),
    changes,
    violations,
    warnings: graphResult.warnings,
  };
}
