/**
 * Typed effect-capability collection (ADR 0009 D1/D3 — U03).
 *
 * Composes the two existing collectors — symbol-aware ambient globals and
 * semantic dependencies (src/kernel/semanticAnalysis.ts) — with the closed
 * Domain vocabulary. No second scanner: shadowing, aliasing, globalThis, and
 * type-only precision come from the same machinery the S05/C04 corpus proved.
 * Direct evidence only; transitive inference never happens here (D3).
 */
import {
  AMBIENT_CAPABILITY_ENTRIES,
  capabilityForAmbientName,
  capabilityForModuleSpecifier,
  type CapabilityId,
} from '../domain/capabilities';
import {
  collectForbiddenCapabilityUses,
  extractSemanticDependencies,
  type ForbiddenCapabilityUse,
  type SemanticDependency,
} from './semanticAnalysis';

export type CapabilityUse = {
  capability: CapabilityId;
  /** The matched ambient path (e.g. `Date.now`) or module specifier (e.g. `pg`). */
  symbol: string;
  line: number;
  source: 'ambient-global' | 'import-based';
};

/**
 * Collect every direct capability use in one source file, ordered by
 * (line, capability, symbol) so identical content reproduces identical output.
 *
 * @param ts injected TypeScript module (same convention as semanticAnalysis)
 * @param sourceFile a ts.SourceFile for the analyzed content
 */
export function collectCapabilityUses(
  ts: unknown,
  sourceFile: unknown,
  evidence?: {
    dependencies?: readonly SemanticDependency[];
    ambientUses?: readonly ForbiddenCapabilityUse[];
  }
): CapabilityUse[] {
  const uses: CapabilityUse[] = [];

  for (const dependency of evidence?.dependencies ?? extractSemanticDependencies(ts, sourceFile)) {
    if (dependency.typeOnly || !dependency.specifier) continue;
    const capability = capabilityForModuleSpecifier(dependency.specifier);
    if (!capability) continue;
    uses.push({
      capability,
      symbol: dependency.specifier,
      line: dependency.line,
      source: 'import-based',
    });
  }

  for (const use of
    evidence?.ambientUses ??
    collectForbiddenCapabilityUses(ts, sourceFile, AMBIENT_CAPABILITY_ENTRIES)) {
    const capability = capabilityForAmbientName(use.name);
    if (!capability) continue;
    uses.push({ capability, symbol: use.name, line: use.line, source: 'ambient-global' });
  }

  return uses.sort(
    (left, right) =>
      left.line - right.line ||
      left.capability.localeCompare(right.capability) ||
      left.symbol.localeCompare(right.symbol)
  );
}
