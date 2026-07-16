/**
 * Doctor's advisory sensors, aggregated (W01 contract health + U05 ambient
 * state). Advisory only: nothing here feeds a verdict, designFitness, or an
 * exit code. One seam keeps doctor-plan.mjs inside its module budget as new
 * advisory surfaces land.
 */
import { computeAmbientState, printAmbientStateSection } from './ambient-state.mjs';
import { computeContractHealth, printContractHealthSection } from './contract-smells.mjs';

export function computeDoctorAdvisories(root, config, cov, rules, files, ts) {
  return {
    contractHealth: computeContractHealth(root, config, cov, rules),
    ambientState: computeAmbientState(ts, root, config, files),
  };
}

export function printDoctorAdvisories(advisories, io) {
  printContractHealthSection(advisories.contractHealth, io);
  printAmbientStateSection(advisories.ambientState, io);
}
