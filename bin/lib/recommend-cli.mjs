/**
 * `--recommend` presentation. Lives here so ark-check-runtime stays under the
 * orchestration LOC budget and doctor does not parse this path.
 */
import path from 'node:path';
import {
  ADOPTION_PLAN_FILENAME,
  buildArchitectureRecommendation,
  formatArchitectureRecommendationHuman,
  writeAdoptionPlan,
} from '../ark-shared.mjs';
import { withProjectedGovernedCoverage } from './projected-governed-coverage.mjs';

export function runRecommend(args) {
  try {
    const recommendation = withProjectedGovernedCoverage(
      buildArchitectureRecommendation(args.root),
      args.root
    );
    let planWritten;
    if (args.writePlan) {
      const result = writeAdoptionPlan(args.root, recommendation);
      planWritten = result.path;
    }
    if (args.json) {
      console.log(
        JSON.stringify(
          {
            ...recommendation,
            ...(planWritten
              ? { adoptionPlanPath: path.relative(args.root, planWritten) || ADOPTION_PLAN_FILENAME }
              : {}),
          },
          null,
          2
        )
      );
    } else {
      console.log(formatArchitectureRecommendationHuman(recommendation));
      if (planWritten) {
        console.log('');
        console.log(`Wrote ${path.relative(args.root, planWritten) || ADOPTION_PLAN_FILENAME}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (args.json) {
      console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    } else {
      console.error(`ark-check --recommend failed: ${message}`);
    }
    process.exitCode = 2;
  }
}
