/**
 * Human doctor screens (AL06): compact first screen vs Details encyclopedia.
 * Independently invocable. JSON / compass / coach stay in runDoctor.
 */
import path from 'node:path';
import { arkCommand } from '../ark-shared.mjs';
import { NORTH_STAR_ONE_LINE, operatingModeTitle } from './product-copy.mjs';
import { isDoctorHealthyNothingToDo } from './post-green-path.mjs';
import { printParseHealthSection } from './parse-health.mjs';
import { printDoctorAdvisories, printCompactExtraDoctorLines } from './doctor-advisories.mjs';
import { designDeltaDoctorLines } from './design-delta.mjs';
import { enforcementDoctorLines } from './enforcement-state.mjs';
import { analysisIncompleteStatement } from './analysis-completeness.mjs';
import { skillGapsForActiveHost, detectCodexHomeGap, codexConcernIsActive, skillGapToolLabel } from './agent-gates.mjs';
import { agentHomeConcernIsActive } from './agent-homes.mjs';
import { layerGuidanceLine } from './layer-description.mjs';
import { printSharedImportsSliceBridgeList } from './violations.mjs';
import {
  citedGreen,
  ciMergeGreenCites,
  ciNotFailClosedNotice,
  displayedMissingGates,
  foundGateCites,
  printHealthyHeadline,
  writePathGreenCites,
} from './doctor-green-cite.mjs';

function lineWith(ok, warn, bad, color) {
  return (mark, text) => console.log(`  ${mark} ${text}`);
}

function marks(color) {
  return {
    ok: color.green('✓'),
    warn: color.yellow('!'),
    bad: color.red('✗'),
  };
}

/**
 * Compact first doctor screen. Always ends with `More: --doctor --all`.
 * Includes thin-coverage and incomplete-analysis honesty. Never prints Details.
 */
export function printDoctorCompactHuman(view) {
  const color = view.color;
  const { ok, warn, bad } = marks(color);
  const line = lineWith(ok, warn, bad, color);
  const {
    root,
    analysisComplete,
    completeness,
    doctorAdvisories,
    operatingMode,
    designFitness,
    adopted,
    stewardUnfinished,
    emptyScope,
    uniqueActions,
    ciMergeBoundary,
    cov,
    writePath,
    writePathHonesty,
    gatesMissing,
    violations,
  } = view;
  const listedMissing = displayedMissingGates(gatesMissing, view);
  const skippableCi = ciNotFailClosedNotice(view);

  console.log(color.bold(`Ark doctor — ${path.basename(path.resolve(root)) || '.'}`));
  console.log(color.dim(NORTH_STAR_ONE_LINE));
  if (!analysisComplete) line(warn, analysisIncompleteStatement(completeness));
  printParseHealthSection(doctorAdvisories.parseHealth, { color, warn, line });

  const mode = operatingMode;
  console.log('');
  console.log(color.bold('Operating mode'));
  const modeMark =
    mode === 'enforce' &&
    !designFitness.designWeak &&
    adopted !== 'not-adopted' &&
    !stewardUnfinished
      ? ok
      : warn;
  const modeHelp = {
    suggest: 'thin or new tree. Next: ark start --apply, then doctor.',
    adapt: 'config and tree still disagree. Next: do #1.',
    enforce:
      adopted === 'not-adopted'
        ? 'import rules check out; merge boundary not adopted.'
        : 'import rules check out. Keep host + CI.',
  };
  const modeTitle = operatingModeTitle(mode, designFitness.designWeak, stewardUnfinished);
  const modeClaim = `${modeTitle} — ${
    designFitness.designWeak
      ? 'import rules check out; leftover design work remains.'
      : modeHelp[mode]
  }`;
  if (modeMark === ok) citedGreen(line, { ok, warn }, modeClaim, ['ark.config.json']);
  else line(modeMark, modeClaim);
  if (emptyScope) {
    line(
      bad,
      'Empty scope: include paths match 0 source files — a green check is meaningless until include/layers match the tree (monorepo → apps/packages, or /ark-adopt).'
    );
  }

  console.log('');
  if (ciMergeBoundary?.ci?.state) {
    const mergeClaim = `CI merge: ${ciMergeBoundary.ci.state}`;
    if (ciMergeBoundary.ci.state === 'required') {
      citedGreen(line, { ok, warn }, mergeClaim, ciMergeGreenCites(view));
    } else {
      line(warn, mergeClaim);
    }
  }
  if (adopted === 'advisory-only-acked') {
    line(warn, 'Adoption: advisory-only ack — not a required GitHub status.');
  }
  if (isDoctorHealthyNothingToDo(designFitness, uniqueActions, adopted)) {
    printHealthyHeadline(view, color);
  } else {
    console.log(color.bold('Primary next action'));
    console.log(`  1. ${uniqueActions[0]}`);
  }

  console.log('');
  console.log(color.bold('Coverage'));
  const govClaim = `Governed: ${cov.governed.percent}% (${cov.governed.classifiedFiles}/${cov.governed.totalFiles} files)`;
  if (emptyScope || cov.governed.percent < 50) line(bad, govClaim);
  else if (cov.governed.percent >= 80) citedGreen(line, { ok, warn }, govClaim, ['ark.config.json', 'include', 'layers']);
  else line(warn, govClaim);
  for (const row of cov.layers ?? []) {
    const guidance = layerGuidanceLine(row);
    if (guidance) line(' ', `${row.name} — ${guidance}`);
  }

  const hostRed =
    listedMissing.length > 0 ||
    Boolean(writePath.gap) ||
    writePathHonesty?.softWriteHost === true ||
    writePathHonesty?.nativeFailClosed === false ||
    Boolean(skippableCi);
  if (hostRed) {
    console.log('');
    console.log(color.bold('Host / CI'));
    if (writePath.activeHost) line(' ', `Active host: ${writePath.activeHost}`);
    if (listedMissing.length > 0) line(bad, `Missing gates: ${listedMissing.join(', ')}`);
    if (skippableCi) line(warn, skippableCi);
    else if (writePathHonesty?.nativeFailClosed === false) {
      line(warn, writePathHonesty.message || 'Write hook is fail-open — if the checker cannot run, the write still lands.');
    } else if (listedMissing.length === 0 && writePath.gap?.id === 'write-path-mcp-only') {
      line(warn, writePath.gap.message || 'Fell back to MCP prepare; required CI is the merge boundary.');
    } else if (listedMissing.length === 0 && (writePath.gap || writePathHonesty?.softWriteHost)) {
      line(warn, 'Local writes are advisory; required CI is the merge boundary.');
    }
  }

  const nudge = doctorAdvisories.stewardNudge;
  if ((nudge?.needsStewards || nudge?.drift || nudge?.emptyStewardsPastGrace) && nudge.ask) {
    console.log('');
    console.log(color.bold('Stewards'));
    line(warn, nudge.ask);
  }

  printCompactExtraDoctorLines(
    {
      ...doctorAdvisories,
      layerOwners: view.layerOwners,
      adrPresence: view.adrPresence,
      statesTransitions: view.statesTransitions, statusTransitionCatalog: view.statusTransitionCatalog, noDomainFrontend: view.noDomainFrontend, invariantTestsPath: view.invariantTestsPath, invariantCoverageRoots: view.invariantCoverageRoots,
    },
    { line, warn }
  );

  if (violations.length === 0) {
    if (!analysisComplete) {
      console.log('');
      line(
        warn,
        'No reported violations — contract compliance is not verified until analysis is complete'
      );
    } else if (emptyScope || cov.governed.percent < 50) {
      console.log('');
      line(
        warn,
        'No active violations — coverage is still thin, so green is not yet honest enforcement'
      );
    }
  }

  printSharedImportsSliceBridgeList(view.warnings);
  console.log('');
  console.log(color.dim('More: --doctor --all'));
}

/**
 * Details encyclopedia. Only invoked for `--doctor --all` / `all: true`.
 */
export function printDoctorDetailsHuman(view) {
  const color = view.color;
  const { ok, warn, bad } = marks(color);
  const line = lineWith(ok, warn, bad, color);
  const {
    root,
    analysisComplete,
    doctorAdvisories,
    operatingMode,
    designFitness,
    adopted,
    stewardUnfinished,
    emptyScope,
    options,
    cov,
    writePath,
    writePathHonesty,
    gatesMissing,
    violations,
    coverageHonesty,
    packageVersionTruth,
    designSmells,
    pilotLoop,
    goldenPattern,
    pureLayerOptIn,
    summary,
    suppressed,
    activeCount,
    skillGaps,
    agentHomeGaps,
    baseline,
    baselineHonesty,
    staleBaseline,
    staleRunners,
    adoption,
  } = view;
  const listedMissing = displayedMissingGates(gatesMissing, view);
  const skippableCi = ciNotFailClosedNotice(view);
  const modeTitle = operatingModeTitle(operatingMode, designFitness.designWeak, stewardUnfinished);

  console.log('');
  console.log(color.dim('---'));
  console.log(color.bold('Details'));

  if (coverageHonesty.greenIsNotEnforcement) {
    line(coverageHonesty.worseThanNoGate ? bad : warn, coverageHonesty.message);
  }
  if (cov.suggestions.length > 0) {
    line(warn, `${cov.suggestions.length} ungoverned director(y/ies) — proposals: ${arkCommand(root, 'ark-check', '--coverage')}`);
  }
  if (cov.emptyLayers.length > 0) line(warn, `Empty layers (pattern matches nothing): ${cov.emptyLayers.join(', ')}`);
  if (cov.layersWithoutRules.length > 0) line(warn, `Layers with no rule edge: ${cov.layersWithoutRules.join(', ')}`);
  if (cov.dualMembership?.count > 0) {
    line(
      warn,
      `Dual-match: ${cov.dualMembership.count} file(s) match multiple layers — ${cov.dualMembership.note ?? 'review overlapping globs'}`
    );
  }
  if (cov.suggestions.length === 0 && cov.emptyLayers.length === 0) {
    citedGreen(line, { ok, warn }, 'Every layer classifies files; no empty layers', [
      'ark.config.json',
      'layers',
    ]);
  }
  const captioned = (cov.layers ?? []).filter((row) => layerGuidanceLine(row));
  if (captioned.length > 0) {
    console.log('');
    console.log(color.bold('Layers'));
    for (const row of captioned) line(' ', `${row.name} — ${layerGuidanceLine(row)}`);
  }

  if (packageVersionTruth?.dualTruth) {
    console.log('');
    console.log(color.bold('Package pin (dual-truth)'));
    line(warn, packageVersionTruth.note);
  } else if (packageVersionTruth?.code === 'PACKAGE_PIN_ABSENT') {
    console.log('');
    console.log(color.bold('Package pin'));
    line(warn, packageVersionTruth.note);
  }
  if (options.configWalkedUp && options.configRoot) {
    line(
      ok,
      `Config walk-up: using monorepo root ${options.configRoot} (ark.config.json not in cwd package)`
    );
  }

  console.log('');
  console.log(color.bold('Design fitness'));
  if (designSmells.length === 0) {
    if (analysisComplete) citedGreen(line, { ok, warn }, designFitness.label, ['ark.config.json']);
    else line(warn, designFitness.label);
  } else {
    line(designFitness.designWeak ? warn : warn, designFitness.label);
    for (const smell of designSmells.slice(0, 5)) {
      const outcome = smell.outcome || smell.message;
      line(' ', `[${smell.id}] ${outcome}`);
      if (smell.outcome && smell.message && smell.message !== smell.outcome) {
        line(' ', color.dim(`detail: ${smell.message}`));
      }
      if (smell.evidence?.length) {
        line(' ', color.dim(`evidence: ${smell.evidence.slice(0, 4).join(', ')}`));
      }
    }
    if (pilotLoop?.active && pilotLoop.nextPilot) {
      const np = pilotLoop.nextPilot;
      line(
        warn,
        `Next pilot (one at a time): ${np.pilotTarget || np.pilot} [${np.smellId}] → re-doctor after change`
      );
      line(' ', color.dim(`success: ${np.successSignal}`));
      line(' ', color.dim('never multi-pilot batch; pattern bets are never auto-applied'));
    }
  }

  if (options.designDelta) {
    console.log('');
    console.log(color.bold('Design delta (opt-in)'));
    for (const row of designDeltaDoctorLines(options.designDelta))
      line(row.level === 'bad' ? bad : row.level === 'ok' ? ok : ' ', row.level === 'dim' ? color.dim(row.text) : row.text);
  }

  if (goldenPattern.present) {
    console.log('');
    console.log(color.bold('Golden pattern (new code)'));
    line(
      ok,
      `"${goldenPattern.name}" — ${goldenPattern.norm}` +
        (goldenPattern.newCodeHome ? ` Prefer: ${goldenPattern.newCodeHome}.` : '') +
        ' Advisory only — does not clear leftover design work or replace the gate.'
    );
  } else if (goldenPattern.invalid) {
    console.log('');
    console.log(color.bold('Golden pattern (new code)'));
    line(
      warn,
      `${goldenPattern.path} is present but invalid (${goldenPattern.error || 'invalid'}). ` +
        'Fix or remove it — absence is fine; a bad file is not guidance.'
    );
  }
  if (pureLayerOptIn) {
    line(' ', color.dim(pureLayerOptIn.message));
  }

  printDoctorAdvisories(doctorAdvisories, { line, warn, color });

  console.log('');
  console.log(color.bold('Violations'));
  if (violations.length === 0) {
    if (!analysisComplete) line(warn, 'No reported violations — contract compliance is not verified until analysis is complete');
    else if (emptyScope || cov.governed.percent < 50) {
      line(
        warn,
        'No active violations — coverage is still thin, so green is not yet honest enforcement'
      );
    } else if (designFitness.designWeak) {
      line(warn, `None on checked imports — import rules match the config; leftover design work remains (${modeTitle}). Not healthy finished.`);
    } else {
      citedGreen(line, { ok, warn }, 'None — the code matches the contract on checked edges', [
        'ark.config.json',
      ]);
    }
  } else {
    const typeNote = summary.typeOnlyCount > 0 ? ` (${summary.valueCount} value · ${summary.typeOnlyCount} type-only)` : '';
    const supNote = suppressed > 0 ? `, ${suppressed} frozen` : '';
    const violClaim = `${violations.length} total${typeNote}${supNote}${activeCount > 0 ? ` — ${activeCount} NOT baselined` : ''}`;
    if (activeCount > 0) line(warn, violClaim);
    else citedGreen(line, { ok, warn }, violClaim, ['.ark-baseline.json']);
    for (const edge of summary.edges.slice(0, 3)) line(' ', color.dim(`${edge.count}  ${edge.edge}`));
    if (summary.concentrated && typeof summary.dominant === 'string' && summary.dominant.includes(' → ')) {
      line(warn, color.dim(`${Math.round(summary.dominantShare * 100)}% on one edge (${summary.dominant}) — likely a contract fix, not debt`));
    }
  }

  console.log('');
  console.log(color.bold('Write path (agent)'));
  const capabilities = writePath.capabilities;
  const writePathLabels = {
    repair: 'repair-capable — hard block + machine-readable autoPatch / ARK_REPAIR_JSON',
    'reject-only': 'reject-only — hard block with prose; no repair payload',
    'mcp-only': 'MCP tools only — prepare-write/autoPatch available; no PreToolUse hook',
    none: 'no write gate hook and no Ark MCP',
  };
  const wpMark =
    capabilities['hard-write']
      ? ok
      : capabilities['advisory-write'] || capabilities['merge-gate']
        ? warn
        : bad;
  line(' ', `Active host: ${writePath.activeHost}`);
  line(' ', `Supported profile: ${writePath.supportSummary}`);
  const modeLine = `Mode: ${writePath.mode} — ${writePathLabels[writePath.mode] || writePath.mode}`;
  if (wpMark === ok) {
    citedGreen(
      line,
      { ok, warn },
      modeLine,
      writePathGreenCites(writePath)
    );
  } else {
    line(wpMark, modeLine);
  }
  if (writePathHonesty.message) line(warn, writePathHonesty.message);
  if (writePath.sessionNote) {
    line(warn, writePath.sessionNote);
  }
  const enforcement = writePath.enforcementState;
  for (const row of enforcementDoctorLines(enforcement)) line(row.level === 'ok' ? ok : row.level === 'bad' ? bad : warn, row.text);
  const supportCaps = writePath.support?.capabilities || {};
  const repairReinjection = supportCaps['repair-reinjection-guaranteed'] === true;
  const repairEnvelope = supportCaps['repair-envelope-emitted'] === true || supportCaps['repair-payload'] === true;
  if (repairReinjection) {
    citedGreen(
      line,
      { ok, warn },
      'Repair: envelope + reinjection guaranteed on hard path when installed + trusted',
      writePathGreenCites(writePath)
    );
  } else {
    line(
      warn,
      repairEnvelope
        ? 'Repair: envelope may emit (`--hook-repair`); reinjection not guaranteed (advisory host)'
        : 'Repair: no hard-boundary payload'
    );
  }
  if (writePath.gap) {
    line(writePath.gap.severity === 'warn' ? warn : warn, writePath.gap.message);
    if (writePath.gap.fix) {
      line(' ', color.dim(`Fix: ${writePath.gap.fix}`));
    }
  }

  console.log('');
  console.log(color.bold('Gates & skills'));
  if (listedMissing.length === 0 && !skippableCi) {
    citedGreen(
      line,
      { ok, warn },
      'Shared gate artifacts found on disk; runtime activation is reported separately',
      foundGateCites(view)
    );
  } else {
    if (listedMissing.length > 0) line(bad, `Missing gates: ${listedMissing.join(', ')}`);
    if (skippableCi) line(warn, skippableCi);
  }
  const humanSkillGaps = skillGapsForActiveHost(skillGaps);
  const legacyCodex = humanSkillGaps.some((g) => g.tool === 'codex' && g.legacyPromptsOnly);
  const codexLegacySafeDelete = humanSkillGaps.some(
    (g) => g.tool === 'codex' && g.legacyAdvisory && g.catalogComplete
  );
  const remainingGaps = humanSkillGaps.filter(
    (g) => !(g.tool === 'codex' && (g.legacyPromptsOnly || g.legacyAdvisory))
  );
  const remMiss = remainingGaps.reduce((s, g) => s + g.missing, 0);
  const remStale = remainingGaps.reduce((s, g) => s + g.stale, 0);
  if (remMiss + remStale === 0 && !legacyCodex) {
    citedGreen(line, { ok, warn }, '/ark-* skills current for detected tools', [
      '.agents/skills',
    ]);
  }
  if (legacyCodex) {
    line(warn, 'Codex: legacy flat .codex/prompts only (not a loadable skill catalog)');
  }
  if (codexLegacySafeDelete) {
    line(
      ' ',
      color.dim(
        'Codex catalog complete — leftover .codex/prompts/ark-*.md are safe to delete (not loadable; not required).'
      )
    );
  }
  if (remMiss + remStale > 0) {
    line(
      warn,
      `${remMiss} missing / ${remStale} content-behind-package /ark-* skill(s) for ${remainingGaps.map((g) => skillGapToolLabel(g.tool)).join(', ')}`
    );
  }
  const codexHomeGap = detectCodexHomeGap(root);
  if (codexHomeGap) {
    const parts = [
      codexHomeGap.legacyPromptsOnly ? 'legacy-prompts-only' : null,
      codexHomeGap.missing > 0 ? `${codexHomeGap.missing} missing` : null,
      codexHomeGap.stale > 0 ? `${codexHomeGap.stale} content-behind-package` : null, codexHomeGap.catalogStateReason,
    ].filter(Boolean);
    const deferred = !codexConcernIsActive();
    if (deferred) {
      line(color.dim('·'), color.dim(`Codex home skills ${parts.join(', ')} (deferred — not on Codex session)`));
    } else {
      line(warn, `Codex home skills ${parts.join(', ')}`);
    }
  }
  for (const gap of agentHomeGaps) {
    const parts = [
      gap.missing > 0 ? `${gap.missing} missing` : null,
      gap.stale > 0 ? `${gap.stale} content-behind-package` : null,
      gap.catalogStateReason,
    ].filter(Boolean);
    const deferred = !agentHomeConcernIsActive(gap.host);
    const gapSummary = `${gap.label} shared agent skills ${parts.join(', ')}`;
    if (deferred) {
      line(color.dim('·'), color.dim(`${gapSummary} (deferred — not this session)`));
    } else {
      line(warn, gapSummary);
    }
  }

  console.log('');
  console.log(color.bold('Baseline'));
  if (!baseline.exists) {
    const none = !analysisComplete
      ? 'No baseline — current violations were not fully evaluated'
      : violations.length > 0
        ? 'No baseline — adopting a dirty repo? freeze with --update-baseline --force --contract-session --author <steward>'
        : 'No baseline (nothing to freeze)';
    if (!analysisComplete || violations.length > 0) line(warn, none);
    else line(' ', none);
  } else {
    const baseClaim = `${baseline.keys.size} frozen key(s)${analysisComplete ? '' : ' — stale comparison not verified'}`;
    if (!analysisComplete || baselineHonesty.dirtyBaselineRisk) line(warn, baseClaim);
    else citedGreen(line, { ok, warn }, baseClaim, ['.ark-baseline.json']);
    if (analysisComplete && baselineHonesty.dirtyBaselineRisk) {
      line(warn, baselineHonesty.message);
    }
    if (analysisComplete && staleBaseline > 0) {
      line(warn, `${staleBaseline} stale entr(y/ies) no longer occur — tighten with --update-baseline --force --contract-session --author <steward>`);
    }
  }

  console.log('');
  console.log(color.bold('Command runners'));
  if (staleRunners.length === 0) {
    citedGreen(line, { ok, warn }, 'Emitted commands match the package manager', ['package.json']);
  }
  else {
    line(warn, `Stale runner in ${staleRunners.join(', ')}`);
  }

  console.log('');
  console.log(color.bold('Adoption (separate from fitness score)'));
  if (adoption.gaps.length === 0 && !adoption.layerBalance) {
    citedGreen(
      line,
      { ok, warn },
      'Hosts, MCP argv, core optionality, origin report, baseline policy, and deploy-path lint/types look complete',
      ['AGENTS.md', 'ark.config.json']
    );
  } else {
    for (const gap of adoption.gaps) {
      const mark = gap.deferred
        ? color.dim('·')
        : gap.severity === 'warn'
          ? warn
          : gap.severity === 'info'
            ? warn
            : bad;
      line(mark, gap.message);
      if (gap.fix) {
        line(' ', color.dim(gap.deferred ? `When using Codex: ${gap.fix}` : `Fix: ${gap.fix}`));
      }
    }
    if (adoption.layerBalance) {
      line(warn, color.dim(adoption.layerBalance.educational));
    }
  }
  if (adoption.baseline) {
    line(
      ' ',
      color.dim(
        `Baseline policy: ${adoption.baseline.signal}` +
          (adoption.baseline.primaryPathUsesBaseline
            ? ' · primary path uses --baseline'
            : ' · primary path does not use --baseline')
      )
    );
  }
  if (adoption.originReport.present) {
    line(ok, 'Origin architecture snapshot present (.ark/reports/origin.json)');
  }

  console.log('');
  console.log(color.bold('Safety / bypass resistance'));
  const safety = options.safety;
  if (!safety) {
    line(warn, 'Safety diagnostics unavailable');
  } else {
    const rows = [
      ['Non-literal dynamic dependencies', safety.nonLiteralDynamicImports],
      ['@ts-ignore / @ts-nocheck', safety.tsSuppressions],
      ['Explicit any casts', safety.anyCasts],
      ['InMemory stores in production source', safety.inMemoryProductionStores],
      ['Rules with peerIsolation: false', safety.disabledPeerIsolationRules],
    ];
    for (const [label, entries] of rows) {
      const claim = `${label}: ${entries.length}`;
      if (entries.length === 0) line(' ', claim);
      else line(warn, claim);
    }
  }
}
