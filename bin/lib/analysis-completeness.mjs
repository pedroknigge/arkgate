/** Shared fail-closed completeness semantics for CLI/MCP Tooling surfaces. */
import fs from 'node:fs';
import path from 'node:path';
import { detectPackageManager } from './package-manager.mjs';

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

function packageManagerOption(root) {
  const packageManager =
    typeof root === 'string' && root.length > 0 ? detectPackageManager(root) : 'npm';
  return { packageManager };
}

/**
 * Plain cause for a partial verdict, or null when the reasons do not name one.
 * A tsconfig that extends a package which is not installed is the field case:
 * the code is TSCONFIG_PARSE_FAILURE and the message says the package is not installed.
 */
export function partialAnalysisCause(reasons, options = {}) {
  const list = Array.isArray(reasons) ? reasons.filter((reason) => reason && typeof reason === 'object') : [];
  const extendsMissing = list.filter(
    (reason) =>
      reason.code === 'TSCONFIG_PARSE_FAILURE' && /not installed/i.test(String(reason.message ?? ''))
  );
  if (extendsMissing.length > 0) {
    const count = extendsMissing.length;
    const packageManager = options.packageManager || 'npm';
    const fact =
      count === 1
        ? "1 tsconfig file extends a package that isn't installed"
        : `${count} tsconfig files extend packages that aren't installed`;
    return `${fact}; run \`${packageManager} install\` first`;
  }
  if (list.length === 0) return null;
  const first = list[0];
  const code = typeof first.code === 'string' && first.code.length > 0 ? first.code : 'parse';
  const message = typeof first.message === 'string' ? first.message : '';
  return message ? `${code}: ${message}` : code;
}

/** Next action while analysis cannot support a merge verdict. */
export function incompleteAnalysisNextAction(reasons, root) {
  return (
    partialAnalysisCause(reasons, packageManagerOption(root)) ??
    'Analysis is incomplete — install dependencies and re-run arkgate-check before a merge check'
  );
}

export function analysisIncompleteStatement(completeness, reasons, root, qualifyCount = false) {
  if (completeness !== ANALYSIS_COMPLETENESS.partial) {
    return 'Analysis unavailable: no API-compatible TypeScript host could produce architecture evidence.';
  }
  const cause = partialAnalysisCause(reasons, packageManagerOption(root));
  const qualifier = qualifyCount ? 'the violation count is partial, not the full tree. ' : '';
  if (cause) return `Analysis incomplete: ${qualifier}${cause}.`;
  return `Analysis incomplete: ${qualifier}governed parse diagnostics prevent a complete architecture verdict.`;
}

const EXTEND_SKIP = new Set(['node_modules', 'dist', 'build', 'coverage']);

function extendPackageName(spec) {
  if (!spec || spec[0] === '.' || spec[0] === '/' || /^[A-Za-z]:[\\/]/.test(spec)) return '';
  const parts = spec.split('/');
  if (spec[0] === '@') return parts[1] ? `${parts[0]}/${parts[1]}` : '';
  return parts[0] || '';
}

function packageOnDisk(fromDir, name) {
  const segments = name.split('/');
  let dir = fromDir;
  for (let hop = 0; hop < 12; hop += 1) {
    if (fs.existsSync(path.join(dir, 'node_modules', ...segments))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
  return false;
}

function unlinkedExtendCount(root) {
  if (!root || !fs.existsSync(root)) return 0;
  let files = 0;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || entry.name[0] === '.' || EXTEND_SKIP.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (!/^tsconfig.*\.json$/i.test(entry.name)) continue;
      let text = '';
      try {
        text = fs.readFileSync(abs, 'utf8');
      } catch {
        continue;
      }
      const specs = [];
      for (const match of text.matchAll(/"extends"\s*:\s*(\[[\s\S]*?\]|"[^"]+")/g)) {
        const raw = match[1];
        if (raw[0] === '[') specs.push(...[...raw.matchAll(/"([^"]+)"/g)].map((hit) => hit[1]));
        else specs.push(raw.slice(1, -1));
      }
      if (specs.some((spec) => {
        const name = extendPackageName(spec);
        return name && !packageOnDisk(dir, name);
      })) files += 1;
    }
  }
  return files;
}

/** Next line after start --apply. A check before a full install is a partial count (#383). */
export function startApplyNextLine(root, doctorCommand) {
  const count = unlinkedExtendCount(root);
  if (!count) return `Start apply complete. Next: ${doctorCommand}`;
  const pm = detectPackageManager(root);
  const fact =
    count === 1
      ? "1 tsconfig file extends a package that isn't installed"
      : `${count} tsconfig files extend packages that aren't installed`;
  return `Start apply complete. Next: \`${pm} install\`, then ${doctorCommand}. ${fact}, so a check before that install is a partial count.`;
}

/** Public diagnostic id for a verdict asked to certify an empty file set. */
export const EMPTY_ANALYSIS_RULE_ID = 'ANALYSIS_COVERS_NO_FILES';

/**
 * Refuse a vacuous green over zero governed files when the tree has source.
 * Mismatch: source exists and the contract governs none of it, or the contract
 * was adopted from outside the requested root. A greenfield root with no source
 * stays green. Callers must not apply this on report modes. `ungovernedSourceCount`
 * must ignore `config.exclude`. Omit `classifiedFileCount` when `layers` is empty.
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
