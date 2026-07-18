/**
 * Doctor's advisory sensors, aggregated (W01 contract health, U05 ambient
 * state, X04 physical cohesion, Y03 parse health). These sensors do not create
 * architecture violations or designFitness findings; Z02 separately maps
 * parse-health evidence to analysis completeness and fail-closed exits. One
 * seam keeps doctor-plan.mjs inside its module budget as new surfaces land.
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

export function computeDoctorAdvisories(root, config, cov, rules, files, ts, parseHealth) {
  const physicalCohesion = computePhysicalCohesion(root, files);
  const decisionMemory = computeReshapeDecisionMemory(root, files);
  physicalCohesion.reshapeDecisions = decisionMemory.summary;
  physicalCohesion.reshapePilot = computeDecisionAwareReshapePilot(
    physicalCohesion,
    files,
    root,
    decisionMemory
  );
  return {
    contractHealth: computeContractHealth(root, config, cov, rules),
    ambientState: computeAmbientState(ts, root, config, files),
    physicalCohesion,
    parseHealth: parseHealth ?? summarizeParseHealth(),
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
}
