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

/** Public diagnostic id for a verdict asked to certify an empty file set. */
export const EMPTY_ANALYSIS_RULE_ID = 'ANALYSIS_COVERS_NO_FILES';

/**
 * Refuse a verdict over zero governed files when the tree has source to govern.
 *
 * Every rule is vacuously satisfied on an empty set, so a green here certifies
 * nothing while reading exactly like a green over a governed tree. That is a
 * false green — the one failure mode CI trusts.
 *
 * The refusal separates ArkGate's own limitation from a fact about the repo, the
 * same way the coverage budget does. Two states are a mismatch and refuse:
 *
 * - source exists under the analyzed root and the contract governs none of it —
 *   the contract does not describe this tree;
 * - the analyzed root is not the root the caller asked for, because the contract
 *   was found outside it and its directory was adopted — ArkGate checked a
 *   different tree and found nothing in it.
 *
 * No governable source anywhere under the root, on the root the caller asked
 * for, is a genuinely greenfield repo: `--init` is designed to land a contract
 * before the code arrives, that is not a mismatch to refuse, and `--plan` /
 * `--doctor` already carry the `empty-scope` adoption gap for it.
 *
 * Report modes (`--plan`, `--doctor`, `--coverage`, `--adopt-contract`,
 * `--suggest-include`) are how a user diagnoses and fixes an empty scope, so
 * callers must not apply this refusal to them. It belongs to the verdict path.
 *
 * @param {{
 *   governedFileCount?: number,
 *   ungovernedSourceCount?: number,
 *   root?: string,
 *   requestedRoot?: string,
 *   configPath?: string,
 *   configWalkedUp?: boolean,
 * }} [input]
 * @returns {{ ruleId: string, message: string, nextAction: string } | null}
 */
export function emptyAnalysisRefusal(input = {}) {
  const count = Number(input.governedFileCount);
  if (!Number.isFinite(count) || count !== 0) return null;

  const ungoverned = Math.max(0, Number(input.ungovernedSourceCount) || 0);
  const root = String(input.root ?? '');
  const configPath = String(input.configPath ?? '');
  const requestedRoot = String(input.requestedRoot ?? '');
  const movedRoot =
    input.configWalkedUp === true && requestedRoot.length > 0 && requestedRoot !== root;

  // Greenfield on the root the caller asked for: nothing to govern, nothing to mistake.
  if (ungoverned === 0 && !movedRoot) return null;

  const evidence = movedRoot
    ? `${ungoverned} source file(s) exist under ${root}, which is not the ${requestedRoot} this ` +
      `run was asked for — the contract at ${configPath} lives outside it`
    : `${ungoverned} source file(s) exist under ${root} and none of them matched the include and ` +
      `layer patterns in ${configPath}`;

  const message =
    `Analysis covered 0 files: ${evidence}. Every rule is vacuously satisfied on an empty set, ` +
    'so a pass here would certify nothing.';

  const scopeHint = movedRoot
    ? `This run analyzed ${root}, not the ${requestedRoot} you asked for: the contract at ` +
      `${configPath} lives outside ${requestedRoot}, and ark-check adopted the directory holding ` +
      'it as the project root. Pass a contract inside the tree you want checked.'
    : `Point --root at the tree the contract describes (this run analyzed ${root}), or fix the ` +
      `include / exclude / layer patterns in ${configPath} so they match real files.`;

  const nextAction =
    `${scopeHint} \`npx arkgate-check --root . --plan\` and \`--coverage\` report the empty scope ` +
    'without refusing, and `--adopt-contract --write` proposes an include that matches this tree.';

  return { ruleId: EMPTY_ANALYSIS_RULE_ID, message, nextAction };
}
