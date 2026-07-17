/**
 * Doctor's advisory sensors, aggregated (W01 contract health + U05 ambient
 * state + X04 physical cohesion). Advisory only: nothing here feeds a
 * verdict, designFitness, or an exit code. One seam keeps doctor-plan.mjs
 * inside its module budget as new advisory surfaces land.
 */
import { computeAmbientState, printAmbientStateSection } from './ambient-state.mjs';
import { computeContractHealth, printContractHealthSection } from './contract-smells.mjs';
import {
  computePhysicalCohesion,
  computeReshapePilot,
  printPhysicalCohesionSection,
} from './physical-cohesion.mjs';

export function computeDoctorAdvisories(root, config, cov, rules, files, ts) {
  const physicalCohesion = computePhysicalCohesion(root, files);
  physicalCohesion.reshapePilot = computeReshapePilot(physicalCohesion, files, root);
  return {
    contractHealth: computeContractHealth(root, config, cov, rules),
    ambientState: computeAmbientState(ts, root, config, files),
    physicalCohesion,
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
}
