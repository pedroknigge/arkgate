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
 * Report modes (`--plan`, `--doctor`, `--coverage`) are how a user diagnoses and
 * fixes an empty scope, so callers must not apply this refusal to them. It
 * belongs to the verdict path. (`--adopt-contract` and `--suggest-include` never
 * reach it: their handlers return earlier.)
 *
 * `ungovernedSourceCount` must come from a probe the contract cannot steer — see
 * `countUngovernedSourceFiles` in scan-files.mjs. Feeding it a count that honours
 * `config.exclude` reopens the false green through `exclude: ["**"]`.
 *
 * `classifiedFileCount` is optional. When omitted, included files are treated as
 * classified (the historical meaning of `governedFileCount`). When provided and
 * zero while include still matched files, this is the same vacuous green: import
 * rules cannot run on unclassified source. Omit the count when `layers` is empty
 * so `CONFIG_NO_LAYERS` stays the next step. Partial unclassified stays a warning.
 *
 * @param {{
 *   governedFileCount?: number,
 *   classifiedFileCount?: number,
 *   ungovernedSourceCount?: number,
 *   ungovernedSourceCap?: number,
 *   root?: string,
 *   requestedRoot?: string,
 *   configPath?: string,
 *   configWalkedUp?: boolean,
 * }} [input]
 * @returns {{ ruleId: string, message: string, nextAction: string } | null}
 */
export function emptyAnalysisRefusal(input = {}) {
  const included = Number(input.governedFileCount);
  if (!Number.isFinite(included)) return null;

  const classifiedRaw = input.classifiedFileCount;
  const classifiedProvided =
    classifiedRaw !== undefined && classifiedRaw !== null && Number.isFinite(Number(classifiedRaw));
  const classified = classifiedProvided ? Number(classifiedRaw) : included;

  if (included > 0 && classified === 0) {
    const root = String(input.root ?? '');
    const configPath = String(input.configPath ?? '');
    const message =
      `Analysis covered 0 files: ${included} included file(s) exist under ${root} but none ` +
      `matched a layer pattern in ${configPath}. Every rule is vacuously satisfied on an empty ` +
      'set, so a pass here would certify nothing.';
    const nextAction =
      `Extend layer patterns or narrow include in ${configPath} so every included file has a ` +
      'layer. `npx arkgate-check --root . --coverage` lists unclassified files, and `/ark-place` ' +
      'picks a folder. `--plan` and `--doctor` report this without refusing.';
    return { ruleId: EMPTY_ANALYSIS_RULE_ID, message, nextAction };
  }

  if (included !== 0) return null;

  const ungoverned = Math.max(0, Number(input.ungovernedSourceCount) || 0);
  const cap = Math.max(0, Number(input.ungovernedSourceCap) || 0);
  const root = String(input.root ?? '');
  const configPath = String(input.configPath ?? '');
  const requestedRoot = String(input.requestedRoot ?? '');
  const movedRoot =
    input.configWalkedUp === true && requestedRoot.length > 0 && requestedRoot !== root;

  // Greenfield on the root the caller asked for: nothing to govern, nothing to mistake.
  if (ungoverned === 0 && !movedRoot) return null;

  // The probe stops at a cap, so say "at least N" rather than claim a census it never took.
  const counted = cap > 0 && ungoverned >= cap ? `at least ${ungoverned}` : `${ungoverned}`;

  const evidence = movedRoot
    ? `${counted} source file(s) exist under ${root}, which is not the ${requestedRoot} this ` +
      `run was asked for — the contract at ${configPath} lives outside it`
    : `${counted} source file(s) exist under ${root} and none of them matched the include and ` +
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

/** Path-only classified count. `undefined` when no layers — caller keeps the include-only meaning. */
export function classifiedCountFromFiles(files, layers, layerForFile, root) {
  if (!Array.isArray(layers) || layers.length === 0 || typeof layerForFile !== 'function') {
    return undefined;
  }
  return files.filter((abs) => layerForFile(root, abs, layers)).length;
}
