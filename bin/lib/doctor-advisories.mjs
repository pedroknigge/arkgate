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
import {
  computeDecisionAwareReshapePilot,
  computeReshapeDecisionMemory,
  printReshapeDecisionsSection,
} from './reshape-decisions.mjs';
import { printParseHealthSection, summarizeParseHealth } from './parse-health.mjs';
import { detectGraphBlindSpots, printGraphBlindSection } from './graph-blind.mjs';
import { summarizeRulesUnderContract } from './rules-under-contract.mjs';
import { collectStewardNudge } from './team-parliament-io.mjs';
import { formatArkRunDoctorLines, summarizeArkRunSection } from './ark-run-doctor.mjs';
import {
  ARKORDER_ONE_BREATH,
  formatArkOrderDoctorLines,
  summarizeArkOrderSection,
} from './ark-order-doctor.mjs';
import { composeMergePlanesHonesty } from './extra-merge-teeth.mjs';

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

export function printCompactExtraDoctorLines(advisories, io) {
  const arkRun = advisories?.arkRun;
  if (arkRun?.active === true && arkRun.notAScore === true) {
    console.log('');
    const residual = Number(arkRun.residual?.count) || 0;
    io.line(residual > 0 ? io.warn : ' ', `ArkRun: ${arkRun.mode || 'on'} · residual=${residual} · not a score`);
  }
  const arkOrder = advisories?.arkOrder;
  if (arkOrder?.active === true && arkOrder.notAScore === true) {
    console.log('');
    const residual = Number(arkOrder.residual?.count) || 0;
    const keys =
      Array.isArray(arkOrder.xiKeys) && arkOrder.xiKeys.length > 0 ? arkOrder.xiKeys.join(', ') : 'unnamed';
    const mark = residual > 0 ? io.warn : ' ';
    io.line(mark, ARKORDER_ONE_BREATH);
    io.line(mark, `ArkOrder: ${arkOrder.mode || 'on'} · xiKeys=${keys} · residual=${residual} · not a score`);
  }
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

/** `activeViolations` must already exclude frozen baseline keys (report residual parity). */
export function computeDoctorAdvisories(root, config, cov, rules, files, ts, parseHealth, facts, activeViolations) {
  const physicalCohesion = computePhysicalCohesion(root, files);
  const decisionMemory = computeReshapeDecisionMemory(root, files);
  physicalCohesion.reshapeDecisions = decisionMemory.summary;
  physicalCohesion.reshapePilot = computeDecisionAwareReshapePilot(
    physicalCohesion,
    files,
    root,
    decisionMemory
  );
  // Prefer architecture facts paths when available; coverage I/O still walks test roots.
  const factPaths =
    facts ??
    (Array.isArray(files)
      ? {
          files: files.map((f) => ({
            path: typeof f === 'string' ? f.replace(/\\/g, '/').replace(/^\.\//, '') : f?.path,
          })).filter((f) => f.path),
        }
      : undefined);
  const classification = classificationFromCoverage(cov);
  const rulesUnderContract = summarizeRulesUnderContract(root, config, factPaths, classification);
  const { arkRun, arkOrder } = attachExtraDoctorSections(
    rulesUnderContract,
    config,
    classification,
    activeViolations
  );
  return {
    contractHealth: computeContractHealth(root, config, cov, rules),
    ambientState: computeAmbientState(ts, root, config, files),
    physicalCohesion,
    parseHealth: parseHealth ?? summarizeParseHealth(),
    // Y09 direction: advisory graph-blind spots (template-interpolation); never hard verdict.
    graphBlindSpots: detectGraphBlindSpots(ts, root, files),
    // AR12 — Rules under contract (honest counts; real test I/O, never empty-fileContents stub).
    // P1M: pass classification so extraMergeTeeth cannot arm at 0% governed.
    stewardNudge: collectStewardNudge(root, config),
    rulesUnderContract,
    arkRun,
    arkOrder,
  };
}

export function printDoctorAdvisories(advisories, io) {
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
  const nudge = advisories.stewardNudge;
  if ((nudge?.needsStewards || nudge?.drift || nudge?.emptyStewardsPastGrace) && nudge.ask) {
    console.log('');
    console.log(io.color.bold('Stewards'));
    io.line(io.warn, nudge.ask);
    if (nudge.nextAction) io.line(' ', io.color.dim(`Next: ${nudge.nextAction}`));
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
