/** Shared fail-closed completeness semantics for CLI/MCP Tooling surfaces. */

export const ANALYSIS_COMPLETENESS = Object.freeze({
  complete: 'complete',
  partial: 'partial',
  unavailable: 'unavailable',
});

export function normalizeAnalysisCompleteness(value) {
  return value === ANALYSIS_COMPLETENESS.complete ||
    value === ANALYSIS_COMPLETENESS.partial ||
    value === ANALYSIS_COMPLETENESS.unavailable
    ? value
    : ANALYSIS_COMPLETENESS.unavailable;
}

export function completenessFromParseHealth(parseHealth) {
  if (parseHealth?.available !== true) return ANALYSIS_COMPLETENESS.unavailable;
  return parseHealth.affectedFiles > 0
    ? ANALYSIS_COMPLETENESS.partial
    : ANALYSIS_COMPLETENESS.complete;
}

export function analysisIncompleteStatement(completeness) {
  return completeness === ANALYSIS_COMPLETENESS.partial
    ? 'Analysis incomplete: governed parse diagnostics prevent a complete architecture verdict.'
    : 'Analysis unavailable: no API-compatible TypeScript host could produce architecture evidence.';
}
