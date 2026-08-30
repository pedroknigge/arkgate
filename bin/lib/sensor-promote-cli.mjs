/**
 * Presentation and orchestration for `ark-check --sensors` and `--promote`.
 *
 * Extracted from the entry so the one-shot runtime stays orchestration-only
 * (arkCheckEntrySlim). The pure projection lives in `src/domain/sensorPromotion.ts`
 * (generated to `./sensor-promotion.mjs`) and the filesystem work in the
 * hand-written `./sensor-promote-io.mjs`; this file owns only what the terminal
 * and the exit code need.
 */
import path from 'node:path';

import { arkCommand } from '../ark-shared.mjs';
import { collectGovernedFiles, normalize } from './scan-files.mjs';

// Same shape and the same TTY test as the entry's own `color`: this module is
// the only other writer to that terminal, and a second copy is cheaper than
// exporting the entry's internals into a cycle.
const useColor = process.stderr.isTTY && !process.env.NO_COLOR;
const color = {
  red: (s) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
  green: (s) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  dim: (s) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
};

/**
 * A rule id or a source path comes out of the project's own ArkRules JSON and
 * is about to be printed to a terminal. A control character there can repaint
 * or erase the lines above it — on a fork PR, the branch under analysis would
 * then control what the promotability report appears to say.
 */
function renderPath(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]/g, (ch) =>
    `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

/**
 * Promotion preview — what enforcing a rule would actually cost.
 *
 * The old loop was: edit the ArkRules JSON, wait ~160s for a full run, read the
 * result, `git checkout` it back. One attempt, one run. This runs ONCE and
 * answers for every declared rule at the same time, because advisory rules are
 * already evaluated on every run: the findings are sitting in the analysis the
 * caller just paid for, stamped with the rule id that produced them. Nothing is
 * re-evaluated and no second opinion is invented, so the count cannot disagree
 * with the gate that would enforce it.
 *
 * Plan by default, `--apply` to write, per the house convention. There is no
 * `--dry-run`.
 */
export async function runPromote(root, config, args, run) {
  const { loadSensorMap, countFindingsByRule, writeRulePromotion } = await import(
    './sensor-promote-io.mjs'
  );
  const { buildPromotionPreview } = await import('./sensor-promotion.mjs');
  const loaded = loadSensorMap(root, config, {
    files: run.files.map((file) => ({ path: normalize(path.relative(root, file)) })),
  });
  if (!loaded.ok) {
    console.error(loaded.reason);
    for (const issue of loaded.issues ?? []) console.error(`  - ${issue.path}: ${issue.message}`);
    process.exitCode = 2;
    return;
  }
  const focus = typeof args.promote === 'string' ? args.promote : null;
  const preview = buildPromotionPreview({
    map: loaded.map,
    countsByRuleKey: countFindingsByRule(run.all),
    focus,
    // What the run could and could not see travels WITH the numbers. A price
    // computed from a partial analysis, or one the classification floor will
    // demote, is not a price — and printing it bare is ArkGate's own limitation
    // reported as a fact about the user's code.
    analysis: {
      completeness: run.completeness,
      completenessReasons: run.completenessReasons ?? [],
      teethDemotedByFloor: run.teethDemotedByFloor === true,
    },
  });

  if (preview.unknownFocus) {
    const message = `No declared rule with id ${JSON.stringify(focus)}.`;
    if (args.json) {
      console.log(JSON.stringify({ promote: preview, error: message }, null, 2));
    } else {
      console.error(message);
      if (preview.suggestions.length > 0) {
        console.error(`  Declared ids: ${preview.suggestions.join(', ')}`);
      }
      console.error(`  ${arkCommand(root, 'ark-check', '--sensors')} lists them all.`);
    }
    process.exitCode = 1;
    return;
  }

  let applied = null;
  if (args.apply) {
    applied = applyPromotion(root, preview, focus, writeRulePromotion);
  }

  if (args.json) {
    console.log(JSON.stringify({ promote: preview, ...(applied ? { applied } : {}) }, null, 2));
  } else {
    printPromote(root, preview, applied);
  }
  if (applied && !applied.ok) process.exitCode = 1;
  else process.exitCode = 0;
}

/**
 * A write needs one named rule. Applying "everything promotable" from a preview
 * would turn a report into a bulk contract rewrite behind a single flag, and
 * the whole point of the preview is that the cost per rule is now visible
 * before the decision.
 */
export function applyPromotion(root, preview, focus, writeRulePromotion) {
  if (!focus) {
    return {
      ok: false,
      reason:
        '--apply needs one rule id: `--promote <ruleId> --apply`. A bare --promote is the preview.',
    };
  }
  // Rule ids are unique per DOCUMENT, not across them, so a focus id can match
  // two declarations. Taking rows[0] wrote the alphabetically-first layer,
  // reported plain success, and left the other one advisory and unmentioned.
  // The in-file duplicate is already refused rather than guessed; this is the
  // same refusal at the altitude where the ambiguity actually lives.
  if (preview.rows.length > 1) {
    const where = preview.rows
      .map((row) => `${row.sourceFile ?? '?'} (${row.kind})`)
      .join(', ');
    return {
      ok: false,
      reason: `Rule ${JSON.stringify(focus)} is declared ${preview.rows.length} times, in ${where}. Rule ids are unique per ArkRules document, not across them — rename one, or promote it by editing that file directly.`,
    };
  }
  const row = preview.rows[0];
  if (!row) return { ok: false, reason: `No declared rule with id ${JSON.stringify(focus)}.` };
  if (row.mode === 'enforced') {
    return { ok: false, reason: `Rule ${JSON.stringify(focus)} is already enforced.` };
  }
  if (!row.promotable) return { ok: false, reason: row.reason };
  // Promotion is a contract change. Making one on evidence the run itself says
  // is incomplete is the false green this surface exists to remove, one level
  // down: the cost that justified it may simply not have been measured.
  if (!preview.countsTrustworthy) {
    return {
      ok: false,
      reason: `${analysisCaveat(preview.analysis) ?? 'This run could not price the promotion.'} A contract change on a cost this run did not measure is exactly the false green --promote exists to prevent; fix the run first, then --apply.`,
    };
  }
  // writeRulePromotion re-reads the file, so bind the write to the rule that
  // was priced: an edit landing in between could have made it Tier-2, and
  // "enforced" on that is a contract the loader then refuses.
  return writeRulePromotion(root, row.sourceFile, row.id, row.kind === 'structure' ? row.sensor : undefined);
}

/**
 * One line naming why the numbers above are not the whole answer, or null when
 * they are. Never silence: a qualified number the reader can see is honest, an
 * unqualified one is a claim we cannot support.
 */
export function analysisCaveat(analysis) {
  if (!analysis) return null;
  if (analysis.teethDemotedByFloor === true) {
    return 'The classification floor is demoting every enforced ArkRules finding to a warning on this repo, so promoting buys a label, not a tooth: the gate would still pass. Classify more of the tree first (ark-check --coverage).';
  }
  if (analysis.completeness !== undefined && analysis.completeness !== 'complete') {
    const reasons = (analysis.completenessReasons ?? []).slice(0, 3).join('; ');
    return `Analysis was ${analysis.completeness}${reasons ? ` (${reasons})` : ''}, so findings are missing and every count below is a FLOOR, not the price.`;
  }
  return null;
}

function printPromote(root, preview, applied) {
  console.log(color.bold('Promotion preview (one run, every declared rule)'));
  const caveat = analysisCaveat(preview.analysis);
  // Above the numbers, not below them: a reader who stops at the first green
  // line must not have already been misled.
  if (caveat) console.log(color.yellow(`  ${caveat}`));
  if (preview.rows.length === 0) {
    console.log(color.dim('  No ArkRules declared — intra-layer ArkRules are opt-in.'));
    return;
  }
  for (const row of preview.rows) {
    const head = `  ${renderPath(row.id)}  ${color.dim(
      `${row.kind === 'structure' ? `sensor=${renderPath(row.sensor)}` : 'invariant'} ${renderPath(row.sourceFile ?? '?')}`
    )}${row.ambiguousId ? color.yellow(`  [id declared ${row.declarationsWithThisId}x]`) : ''}`;
    if (row.mode === 'enforced') {
      const label =
        preview.analysis?.teethDemotedByFloor === true
          ? `${row.currentFindings} finding(s), demoted by the classification floor`
          : `${row.currentFindings} blocking finding(s)`;
      console.log(`${head}  ${color.green('enforced already')} — ${label}`);
      continue;
    }
    if (!row.promotable) {
      console.log(`${head}  ${color.dim('cannot be promoted')}`);
      console.log(color.dim(`      ${row.reason}`));
      continue;
    }
    // A zero that came out of a run which could not see everything is not
    // "costs nothing"; it is "we did not measure it".
    const cost =
      row.wouldBlock === 0 && row.countIsUnreliable
        ? color.yellow(`${row.currentFindings} finding(s) seen — not the price (see above)`)
        : row.wouldBlock === 0 && preview.analysis?.teethDemotedByFloor === true
          ? color.dim(`${row.currentFindings} finding(s), but the floor demotes them — no teeth yet`)
          : row.wouldBlock === 0
            ? color.green('0 findings — promoting costs nothing today')
            : color.yellow(`${row.wouldBlock} advisory finding(s) would start failing the gate`);
    console.log(`${head}  ${cost}`);
  }
  console.log('');
  console.log(
    `  ${preview.totals.rules} rule(s) · ${preview.totals.cleanPromotions} promotable with zero cost · ` +
      `${preview.totals.wouldBlock} finding(s) would become blocking in total`
  );
  if (applied) {
    if (applied.ok) {
      console.log(color.green(`  wrote ${applied.file} — ${applied.reason}`));
      console.log(color.dim('  Re-run the gate to see the rule bite.'));
    } else {
      console.log(color.red(`  not applied: ${applied.reason}`));
    }
  } else {
    console.log(
      color.dim(
        `  Preview only. ${arkCommand(root, 'ark-check', '--promote <ruleId> --apply')} writes mode "enforced" into the rule's own ArkRules file.`
      )
    );
  }
  console.log(
    color.dim(`  Which sensors can ever be enforced: ${arkCommand(root, 'ark-check', '--sensors')}`)
  );
}

/**
 * Sensor promotability, before you pay for a run.
 *
 * Field measurement: `ark-check` takes ~160s on a real repository, and the only
 * way to learn whether a rule could be enforced was to edit the ArkRules JSON,
 * wait, read the result and `git checkout` it back — four times before the map
 * was clear. Everything this prints is a declaration: the closed sensor
 * vocabulary, the project's own ArkRules, and the coverage evidence scan (a
 * filesystem walk plus a text match — ArkGate never executes a test). No
 * TypeScript resolver, so it answers in the time it takes to read the files.
 */
export async function runSensors(args, readConfig) {
  const root = args.root;
  const { loadSensorMap } = await import('./sensor-promote-io.mjs');
  let config;
  try {
    config = readConfig(root, args.config);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }
  let files;
  try {
    files = collectGovernedFiles(root, config).map((file) => ({
      path: normalize(path.relative(root, file)),
    }));
  } catch (error) {
    // Swallowing this and walking an EMPTY file set would report every
    // invariant as "no coverage evidence" — ArkGate's failure to collect the
    // inputs, printed as a fact about the user's tests, with exit 0 on top.
    const message = `Could not collect the governed files, so invariant coverage cannot be evaluated: ${
      error instanceof Error ? error.message : String(error)
    }`;
    if (args.json) {
      console.log(JSON.stringify({ sensors: { ok: false, reason: message } }, null, 2));
    } else {
      console.error(message);
    }
    process.exitCode = 2;
    return;
  }
  const loaded = loadSensorMap(root, config, { files });
  if (!loaded.ok) {
    if (args.json) {
      console.log(JSON.stringify({ sensors: { ok: false, reason: loaded.reason, issues: loaded.issues } }, null, 2));
    } else {
      console.error(loaded.reason);
      for (const issue of loaded.issues ?? []) console.error(`  - ${issue.path}: ${issue.message}`);
    }
    process.exitCode = 2;
    return;
  }
  if (args.json) {
    console.log(
      JSON.stringify(
        { sensors: { ...loaded.map, coverage: loaded.coverage, arkRulesActive: loaded.arkRulesActive } },
        null,
        2
      )
    );
  } else {
    printSensors(root, loaded);
  }
  // A map is a report, never a verdict: it exits 0 whatever it found, exactly
  // like --coverage and --rules-inventory.
  process.exitCode = 0;
}

function modeMark(mode) {
  return mode === 'enforced' ? color.green('enforced') : color.yellow('advisory');
}

function printSensors(root, loaded) {
  const map = loaded.map;
  console.log(color.bold('Sensor vocabulary (every sensor ArkGate ships)'));
  for (const entry of map.vocabulary) {
    const verdict = entry.promotable
      ? entry.plane === 'arkrules'
        ? color.green('promotable per rule')
        : color.green(`promotable via ${entry.plane}.mode`)
      : color.dim(`not promotable — ${entry.blocker}`);
    console.log(`  ${entry.sensor}  ${color.dim(`[${entry.plane} · tier ${entry.tier}]`)}  ${verdict}`);
  }
  const blocked = map.vocabulary.filter((entry) => !entry.promotable);
  for (const entry of blocked) console.log(color.dim(`  · ${entry.reason}`));

  console.log('');
  if (!loaded.arkRulesActive) {
    console.log(
      color.dim(
        'No arkRules map in the contract — intra-layer ArkRules are opt-in, so no rule is declared yet.'
      )
    );
    return;
  }
  console.log(color.bold('Declared rules'));
  if (map.structure.length === 0 && map.invariants.length === 0) {
    console.log(color.dim('  (none)'));
  }
  for (const row of map.structure) {
    console.log(
      `  ${renderPath(row.id)}  ${color.dim(`sensor=${renderPath(row.sensor)} layer=${renderPath(row.layer ?? '?')} ${renderPath(row.sourceFile ?? '?')}`)}  ${modeMark(row.mode)}${row.ambiguousId ? color.yellow(`  [id declared ${row.declarationsWithThisId}x]`) : ''}`
    );
    if (row.mode === 'advisory') console.log(color.dim(`      ${row.reason}`));
  }
  for (const row of map.invariants) {
    console.log(
      `  ${renderPath(row.id)}  ${color.dim(`invariant layer=${renderPath(row.layer ?? '?')} ${renderPath(row.sourceFile ?? '?')}`)}  ${modeMark(row.mode)}${row.ambiguousId ? color.yellow(`  [id declared ${row.declarationsWithThisId}x]`) : ''}`
    );
    if (row.mode === 'advisory') console.log(color.dim(`      ${row.reason}`));
  }
  console.log('');
  console.log(
    `  ${map.totals.declared} declared · ${map.totals.enforced} enforced · ` +
      `${map.totals.advisoryPromotable} advisory and promotable now · ` +
      `${map.totals.advisoryBlocked} advisory and blocked`
  );
  if (loaded.coverage.evaluated && loaded.coverage.partial) {
    console.log(
      color.yellow(
        '  Coverage evidence is partial, so no invariant can be promoted on it. Partial has more than one cause (no test files matched, or the scan budget was exhausted) — `ark-check --doctor` names which one.'
      )
    );
  }
  console.log(
    color.dim(
      `  What promoting would cost: ${arkCommand(root, 'ark-check', '--promote')} (one run, every rule).`
    )
  );
}

