/**
 * Fixture name → CLI steps. Data only.
 *
 * `--json` reads coverage from `bin/lib/analysis-engine.mjs`.
 * `--doctor` reads it from `bin/lib/invariant-coverage.mjs`.
 * One step per generated copy, so a half-regenerated fix stays red.
 */
export const JOURNEYS = Object.freeze({
  ledgerline: Object.freeze([
    Object.freeze(['ark-check', '--json', '--no-cache']),
    Object.freeze(['ark-check', '--doctor', '--json', '--no-cache']),
  ]),
});
