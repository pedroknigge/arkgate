import fs from 'node:fs';
import path from 'node:path';
import fc from 'fast-check';

type FuzzOptions = {
  numRuns?: number;
  timeLimitMs?: number;
};

const campaign = process.env.ARK_FUZZ_CAMPAIGN === 'extended' ? 'extended' : 'pr';
const defaults = campaign === 'extended'
  ? { seed: 2026071202, numRuns: 500, timeLimitMs: 30000 }
  : { seed: 2026071201, numRuns: 100, timeLimitMs: 8000 };

function serializableError(error: unknown) {
  return error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error;
}

export function runFuzz(name: string, property: fc.IProperty<unknown>, options: FuzzOptions = {}) {
  const seed = Number(process.env.ARK_FUZZ_SEED ?? defaults.seed);
  const numRuns = options.numRuns ?? defaults.numRuns;
  const timeLimitMs = options.timeLimitMs ?? defaults.timeLimitMs;
  const result = fc.check(property, {
    seed,
    numRuns,
    interruptAfterTimeLimit: timeLimitMs,
    verbose: true,
  });
  const report = {
    name,
    campaign,
    seed,
    numRuns,
    timeLimitMs,
    candidateSha: process.env.GITHUB_SHA ?? process.env.ARK_CANDIDATE_SHA ?? 'local',
    failed: result.failed,
    interrupted: result.interrupted,
    counterexample: result.counterexample,
    counterexamplePath: result.counterexamplePath,
    error: serializableError(result.error),
  };
  const reportDir = path.resolve(process.cwd(), 'reports/fuzz');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, `${name}.json`), `${JSON.stringify(report, null, 2)}\n`);
  if (result.failed || result.interrupted) {
    throw new Error(`${name} failed with seed ${seed}; see reports/fuzz/${name}.json`);
  }
}
