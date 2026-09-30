/**
 * Doctor's advisory sensors, aggregated (W01 contract health, U05 ambient
 * state, X04 physical cohesion, Y03 parse health, graph-blind template edges).
 * These sensors do not create architecture violations or designFitness findings;
 * Z02 separately maps parse-health evidence to analysis completeness and
 * fail-closed exits. One seam keeps doctor-plan.mjs inside its module budget.
 */
import { computeAmbientState, printAmbientStateSection } from './ambient-state.mjs';
import { computeContractHealth, printContractHealthSection } from './contract-smells.mjs';
import {
  computePhysicalCohesion,
  printPhysicalCohesionSection,
} from './physical-cohesion.mjs';
import { collectFlatParentPilot, printFlatParentPilot } from './flat-parent-pilot.mjs';
import {
  computeDecisionAwareReshapePilot,
  computeReshapeDecisionMemory,
  printReshapeDecisionsSection,
} from './reshape-decisions.mjs';
import { printParseHealthSection, summarizeParseHealth } from './parse-health.mjs';
import { detectGraphBlindSpots, printGraphBlindSection } from './graph-blind.mjs';
import {
  computeOrphanModules,
  printOrphanModulesCompactLine,
  printOrphanModulesSection,
} from './orphan-modules-io.mjs';
import {
  formatArkRulesDoctorLines,
  summarizeRulesUnderContract,
} from './rules-under-contract.mjs';
import { collectStewardNudge } from './team-parliament-io.mjs';
import {
  ARKRUN_FIRST_CONTACT_NEXT,
  ARKRUN_ONE_BREATH,
  formatArkRunDoctorLines,
  summarizeArkRunSection,
} from './ark-run-doctor.mjs';
import {
  ARKORDER_FIRST_CONTACT_NEXT,
  ARKORDER_ONE_BREATH,
  formatArkOrderDoctorLines,
  summarizeArkOrderSection,
} from './ark-order-doctor.mjs';
import { composeMergePlanesHonesty } from './extra-merge-teeth.mjs';
import { collectPrototypeShortcutsResidual } from './prototype-shortcuts.mjs';
import {
  crossParentViaSharedHubs,
  sliceAliasReport,
  sliceCountReport,
  sliceIdentityCollisions,
} from '../ark-layer-match.mjs';

export function attachExtraDoctorSections(rulesUnderContract, config, classification, findings) {
  const arkRulesMerge = {
    active: rulesUnderContract?.active === true,
    structureEnforced: rulesUnderContract?.mergePlanes?.structureSensors?.enforced,
    structureTotal: rulesUnderContract?.mergePlanes?.structureSensors?.total,
    structureAdvisory: rulesUnderContract?.mergePlanes?.structureSensors?.advisory,
    invariantEnforced: rulesUnderContract?.mergePlanes?.invariants?.enforced,
    invariantTotal: rulesUnderContract?.mergePlanes?.invariants?.total,
    invariantAdvisory: rulesUnderContract?.mergePlanes?.invariants?.advisory,
    covered: rulesUnderContract?.mergePlanes?.invariants?.covered,
    uncovered: rulesUnderContract?.mergePlanes?.invariants?.uncovered,
  };
  const arkRun = summarizeArkRunSection({
    arkRun: config?.arkRun,
    findings,
    classification,
    arkRules: arkRulesMerge,
    layerFlow: { layers: config?.layers, rules: config?.rules },
  });
  const arkOrder = summarizeArkOrderSection({
    arkOrder: config?.arkOrder,
    findings,
    classification,
    arkRules: arkRulesMerge,
    arkRun: {
      present: arkRun.active === true,
      mode: arkRun.mode,
      residualCount: arkRun.residual?.count,
    },
  });
  const mergePlanes = composeMergePlanesHonesty({
    classification,
    arkRules: arkRulesMerge,
    arkRun: {
      present: arkRun.active === true,
      mode: arkRun.mode,
      residualCount: arkRun.residual?.count,
    },
    arkOrder: {
      present: arkOrder.active === true,
      mode: arkOrder.mode,
      residualCount: arkOrder.residual?.count,
    },
  });
  if (rulesUnderContract?.mergePlanes) rulesUnderContract.mergePlanes = mergePlanes;
  arkRun.mergePlanes = mergePlanes;
  arkRun.failMergeWhen = mergePlanes.failMergeWhen;
  arkOrder.mergePlanes = mergePlanes;
  arkOrder.failMergeWhen = mergePlanes.failMergeWhen;
  return { arkRun, arkOrder, mergePlanes };
}

function arkRulesDoctorMark(section, warn) {
  if (Array.isArray(section?.loadErrors) && section.loadErrors.length > 0) return warn;
  if (section?.emptyInvariantCatalog === true) return warn;
  if ((Number(section?.uncoveredInvariants) || 0) > 0) return warn;
  return ' ';
}

export function printCompactExtraDoctorLines(advisories, io) {
  const owners = advisories?.layerOwners;
  if (owners?.required && owners.ask) {
    console.log('');
    io.line(io.warn, owners.ask);
    if (owners.nextAction) io.line(' ', `Next: ${owners.nextAction}`);
  }
  const adr = advisories?.adrPresence;
  if (adr?.missing && adr.ask) {
    console.log('');
    io.line(io.warn, adr.ask);
    if (adr.nextAction) io.line(' ', `Next: ${adr.nextAction}`);
  }
  const catalog = advisories?.statusTransitionCatalog;
  if (catalog?.ask) {
    console.log('');
    io.line(io.warn, catalog.ask);
    if (catalog.nextAction) io.line(' ', `Next: ${catalog.nextAction}`);
  } else {
    const states = advisories?.statesTransitions;
    if (states?.ask) {
      console.log('');
      io.line(io.warn, states.ask);
      if (states.nextAction) io.line(' ', `Next: ${states.nextAction}`);
    }
  }
  const sliceIdentity = advisories?.sliceIdentity;
  if (Array.isArray(sliceIdentity?.collisions) && sliceIdentity.collisions.length > 0) {
    console.log('');
    for (const collision of sliceIdentity.collisions) {
      io.line(io.warn, collision.message);
    }
  }
  const flatMoves = advisories?.flatParentPilot?.moves;
  if (Array.isArray(flatMoves) && flatMoves.length > 0 && typeof flatMoves[0]?.evidence === 'string') {
    console.log('');
    io.line(io.warn, flatMoves[0].evidence);
    if (flatMoves.length > 1) io.line(' ', `${flatMoves.length - 1} more flat-parent suggestion(s) in --doctor --all`);
  }
  printOrphanModulesCompactLine(advisories?.orphanModules, io);
  const noDomain = advisories?.noDomainFrontend;
  if (noDomain?.ask) {
    console.log('');
    io.line(io.warn, noDomain.ask);
    if (noDomain.nextAction) io.line(' ', `Next: ${noDomain.nextAction}`);
  }
  const prototypeShortcuts = advisories?.prototypeShortcuts;
  if (prototypeShortcuts?.ask) {
    console.log('');
    io.line(io.warn, prototypeShortcuts.ask);
    if (prototypeShortcuts.nextAction) io.line(' ', `Next: ${prototypeShortcuts.nextAction}`);
  }
  const testsPath = advisories?.invariantTestsPath;
  if (testsPath?.missing && testsPath.ask) {
    console.log('');
    io.line(io.warn, testsPath.ask);
    if (testsPath.nextAction) io.line(' ', `Next: ${testsPath.nextAction}`);
  }
  const coverageRoots = advisories?.invariantCoverageRoots;
  if (coverageRoots?.missing && coverageRoots.ask) {
    console.log('');
    io.line(io.warn, coverageRoots.ask);
    if (coverageRoots.nextAction) io.line(' ', `Next: ${coverageRoots.nextAction}`);
  }
  const rulesUnderContract = advisories?.rulesUnderContract;
  const arkRulesLines = formatArkRulesDoctorLines(rulesUnderContract);
  if (arkRulesLines.length > 0) {
    console.log('');
    const mark = arkRulesDoctorMark(rulesUnderContract, io.warn);
    for (const text of arkRulesLines) io.line(mark, text);
  }
  const arkRun = advisories?.arkRun;
  if (arkRun?.active === true && arkRun.notAScore === true) {
    console.log('');
    const residual = Number(arkRun.residual?.count) || 0;
    const mark = residual > 0 ? io.warn : ' ';
    io.line(mark, ARKRUN_ONE_BREATH);
    io.line(mark, `ArkRun: ${arkRun.mode || 'on'} · residual=${residual} · not a score`);
    if (residual > 0) io.line(mark, ARKRUN_FIRST_CONTACT_NEXT);
  }
  const arkOrder = advisories?.arkOrder;
  if (arkOrder && arkOrder.notAScore === true) {
    console.log('');
    if (arkOrder.active === true) {
      const residual = Number(arkOrder.residual?.count) || 0;
      const keys =
        Array.isArray(arkOrder.xiKeys) && arkOrder.xiKeys.length > 0
          ? arkOrder.xiKeys.join(', ')
          : 'unnamed';
      const mark = residual > 0 ? io.warn : ' ';
      io.line(mark, ARKORDER_ONE_BREATH);
      io.line(mark, `ArkOrder: ${arkOrder.mode || 'on'} · xiKeys=${keys} · residual=${residual} · not a score`);
    } else {
      io.line(' ', ARKORDER_ONE_BREATH);
      io.line(' ', ARKORDER_FIRST_CONTACT_NEXT);
    }
  }
}

function stripEdgeSlashes(value, edge) {
  let start = 0;
  let end = value.length;
  if (edge !== 'end') {
    while (start < end && value[start] === '/') start += 1;
  }
  if (edge !== 'start') {
    while (end > start && value[end - 1] === '/') end -= 1;
  }
  return value.slice(start, end);
}

/** Governed file lists are absolute. Alias globs are project-relative. */
function aliasScanPath(root, entry) {
  const raw = typeof entry === 'string' ? entry : typeof entry?.path === 'string' ? entry.path : '';
  if (!raw) return null;
  const norm = raw.replace(/\\/g, '/');
  const base = stripEdgeSlashes(String(root ?? '').replace(/\\/g, '/'), 'end');
  const rel =
    base && (norm === base || norm.startsWith(`${base}/`))
      ? stripEdgeSlashes(norm.slice(base.length), 'start')
      : stripEdgeSlashes(norm, 'start');
  return rel.length > 0 ? rel : null;
}

function classificationFromCoverage(cov) {
  return {
    governedPercent: cov?.governed?.percent ?? null,
    populatedLayerCount: Array.isArray(cov?.layers)
      ? cov.layers.filter((row) => (row?.files ?? 0) > 0).length
      : null,
    classifiedFiles: cov?.governed?.classifiedFiles ?? null,
  };
}

/**
 * `activeViolations` must already exclude frozen baseline keys (report residual parity).
 * `facts.importGraph` is the scan's importer index; `view.details` (Details / report) adds
 * the unused-exports tier.
 */
export function computeDoctorAdvisories(root, config, cov, rules, files, ts, parseHealth, facts, activeViolations, view = {}) {
  const physicalCohesion = computePhysicalCohesion(root, files);
  const decisionMemory = computeReshapeDecisionMemory(root, files);
  physicalCohesion.reshapeDecisions = decisionMemory.summary;
  physicalCohesion.reshapePilot = computeDecisionAwareReshapePilot(
    physicalCohesion,
    files,
    root,
    decisionMemory,
    { layers: config?.layers, rules: rules ?? config?.rules }
  );
  // Prefer architecture facts paths when available; still union the doctor walk
  // so an empty-catalog residual can see Domain files the facts subset missed.
  const normalizeDoctorFile = (entry) => {
    const raw =
      typeof entry === 'string'
        ? entry
        : typeof entry?.path === 'string'
          ? entry.path
          : '';
    const path = raw.replace(/\\/g, '/').replace(/^\.\//, '');
    return path ? { path } : null;
  };
  const walkFiles = Array.isArray(files) ? files.map(normalizeDoctorFile).filter(Boolean) : [];
  const factFiles = Array.isArray(facts?.files)
    ? facts.files.map(normalizeDoctorFile).filter(Boolean)
    : [];
  const seen = new Set();
  const mergedFiles = [];
  for (const entry of [...factFiles, ...walkFiles]) {
    if (seen.has(entry.path)) continue;
    seen.add(entry.path);
    mergedFiles.push(entry);
  }
  const factPaths =
    facts || walkFiles.length > 0
      ? {
          ...(facts && typeof facts === 'object' ? facts : {}),
          files: mergedFiles,
        }
      : undefined;
  const classification = classificationFromCoverage(cov);
  const rulesUnderContract = summarizeRulesUnderContract(root, config, factPaths, classification);
  const { arkRun, arkOrder } = attachExtraDoctorSections(
    rulesUnderContract,
    config,
    classification,
    activeViolations
  );
  const prototypeShortcuts = collectPrototypeShortcutsResidual({
    root,
    config,
    coverage: cov,
    files,
  });
  const sliceIdentityHits = sliceIdentityCollisions(rules ?? config?.rules);
  const slices = sliceCountReport(activeViolations);
  const sharedWalkHubs = crossParentViaSharedHubs(activeViolations);
  const aliasFiles = [];
  for (const entry of Array.isArray(files) ? files : []) {
    const rel = aliasScanPath(root, entry);
    if (rel) aliasFiles.push(rel);
  }
  const sliceAliases = sliceAliasReport(rules ?? config?.rules, aliasFiles);
  const flatParentPilot = collectFlatParentPilot({
    root,
    files: aliasFiles,
    rules: rules ?? config?.rules,
    layers: config?.layers,
    facts,
    ts,
  });
  return {
    ...(slices ? { slices } : {}),
    ...(sharedWalkHubs ? { sharedWalkHubs } : {}),
    ...(sliceAliases ? { sliceAliases } : {}),
    ...(flatParentPilot ? { flatParentPilot } : {}),
    ...(prototypeShortcuts ? { prototypeShortcuts } : {}),
    ...(sliceIdentityHits.length > 0
      ? { sliceIdentity: { notAScore: true, collisions: sliceIdentityHits } }
      : {}),
    contractHealth: computeContractHealth(root, config, cov, rules),
    ambientState: computeAmbientState(ts, root, config, files),
    physicalCohesion,
    parseHealth: parseHealth ?? summarizeParseHealth(),
    // Y09 direction: advisory graph-blind spots (template-interpolation); never hard verdict.
    graphBlindSpots: detectGraphBlindSpots(ts, root, files),
    // ADR 0037: files nothing imports (projection of the resolved import edges; notAScore).
    orphanModules: computeOrphanModules({
      root,
      config: { ...config, rules: rules ?? config?.rules },
      ts,
      importGraph: facts?.importGraph,
      details: view.details === true,
    }),
    // AR12 — Rules under contract (honest counts; real test I/O, never empty-fileContents stub).
    // P1M: pass classification so extraMergeTeeth cannot arm at 0% governed.
    stewardNudge: collectStewardNudge(root, config),
    rulesUnderContract,
    // AR15: doctor.rulesMigration — inventoried / under contract / frozen (not a score).
    ...(rulesUnderContract?.rulesMigration
      ? { rulesMigration: rulesUnderContract.rulesMigration }
      : {}),
    arkRun,
    arkOrder,
  };
}

export function printDoctorAdvisories(advisories, io) {
  printFlatParentPilot(advisories?.flatParentPilot, io);
  const sliceAliases = advisories?.sliceAliases;
  if (sliceAliases && sliceAliases.notAScore === true && Array.isArray(sliceAliases.moves)) {
    if (sliceAliases.moves.length > 0) {
      console.log('');
      console.log(io.color.bold('Slice aliases (owed move)'));
      io.line(io.warn, sliceAliases.debt);
      for (const move of sliceAliases.moves) {
        io.line(io.warn, `${move.from} → ${move.to}. Move these files to ${move.destination}. They are not finished.`);
        if (move.advisory) io.line(io.warn, move.advisory);
        for (const file of move.files ?? []) io.line(' ', file);
      }
    }
    if (Array.isArray(sliceAliases.pinned) && sliceAliases.pinned.length > 0) {
      console.log('');
      console.log(io.color.bold('Pinned slice aliases'));
      for (const row of sliceAliases.pinned) {
        const label = typeof row.reason === 'string' && row.reason.length > 0 ? ` (${row.reason})` : '';
        io.line(' ', `${row.from} → ${row.to}${label} stays. It is not an owed move.`);
        for (const file of row.files ?? []) io.line(' ', file);
      }
    }
  }
  const hubs = advisories?.sharedWalkHubs;
  if (hubs && hubs.notAScore === true && Array.isArray(hubs.hubs) && hubs.hubs.length > 0) {
    console.log('');
    console.log(io.color.bold('Shared walk hubs (not a score)'));
    for (const hub of hubs.hubs) {
      io.line(io.warn, `${hub.file} sits on ${hub.count} of ${hubs.total} CROSS_PARENT_VIA_SHARED paths.`);
    }
    io.line(' ', io.color.dim(`Next: ${hubs.nextAction}`));
  }
  const sliceIdentity = advisories?.sliceIdentity;
  if (Array.isArray(sliceIdentity?.collisions) && sliceIdentity.collisions.length > 0) {
    console.log('');
    console.log(io.color.bold('Slice identity'));
    for (const collision of sliceIdentity.collisions) {
      io.line(io.warn, collision.message);
    }
  }
  printContractHealthSection(advisories.contractHealth, io);
  printAmbientStateSection(advisories.ambientState, io);
  printPhysicalCohesionSection(
    advisories.physicalCohesion,
    advisories.physicalCohesion?.reshapePilot,
    io
  );
  printReshapeDecisionsSection(advisories.physicalCohesion?.reshapeDecisions, io);
  printParseHealthSection(advisories.parseHealth, io);
  printGraphBlindSection(advisories.graphBlindSpots, io);
  printOrphanModulesSection(advisories.orphanModules, io);
  const nudge = advisories.stewardNudge;
  if ((nudge?.needsStewards || nudge?.drift || nudge?.emptyStewardsPastGrace) && nudge.ask) {
    console.log('');
    console.log(io.color.bold('Stewards'));
    io.line(io.warn, nudge.ask);
    if (nudge.nextAction) io.line(' ', io.color.dim(`Next: ${nudge.nextAction}`));
  }
  const rulesUnderContract = advisories.rulesUnderContract;
  const arkRulesLines = formatArkRulesDoctorLines(rulesUnderContract);
  if (arkRulesLines.length > 0) {
    console.log('');
    console.log(io.color.bold('ArkRules (not a score)'));
    const mark = arkRulesDoctorMark(rulesUnderContract, io.warn);
    for (const text of arkRulesLines) io.line(mark, text);
  }
  const arkRun = advisories.arkRun;
  if (arkRun && arkRun.notAScore === true) {
    console.log('');
    console.log(io.color.bold('ArkRun (not a score)'));
    const mark = arkRun.active && arkRun.residual?.count > 0 ? io.warn : ' ';
    for (const text of formatArkRunDoctorLines(arkRun)) {
      io.line(mark, text);
    }
  }
  const arkOrder = advisories.arkOrder;
  if (arkOrder && arkOrder.notAScore === true) {
    console.log('');
    console.log(io.color.bold('ArkOrder (not a score)'));
    const mark = arkOrder.active && arkOrder.residual?.count > 0 ? io.warn : ' ';
    for (const text of formatArkOrderDoctorLines(arkOrder)) {
      io.line(mark, text);
    }
  }
}
