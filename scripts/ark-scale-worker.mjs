#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  analyzeResolvedProject,
  analyzeTrustedResolvedProject,
  loadContract,
} from '../bin/lib/analysis-engine.mjs';
import { resolveCandidateFacts } from '../bin/lib/resolved-candidate-facts.mjs';
import { loadTypeScript } from '../bin/lib/typescript-host.mjs';

function parseArgs(argv) {
  const out = { root: null, change: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--root') out.root = argv[++index];
    if (argv[index] === '--change') out.change = argv[++index];
  }
  if (!out.root || !out.change) throw new Error('Usage: ark-scale-worker --root <fixture> --change <file>');
  return out;
}

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root);
const changePath = String(args.change).replace(/\\/g, '/');
const changedFile = path.resolve(root, ...changePath.split('/'));
if (path.relative(root, changedFile).startsWith('..')) {
  throw new Error(`Changed file is outside the fixture: ${args.change}`);
}
const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
const loaded = await loadTypeScript(root);
if (!loaded.ts) throw new Error(loaded.reason ?? 'TypeScript is unavailable.');
const content = `${fs.readFileSync(changedFile, 'utf8')}\nexport const canonicalCandidateMarker = true;\n`;
const contract = loadContract(config);

// Resolution and the validated oracle deliberately remain outside the timed analysis stage.
const resolutionStart = process.hrtime.bigint();
const baseFacts = resolveCandidateFacts({ root, config, ts: loaded.ts });
const candidateFacts = resolveCandidateFacts({
  root,
  config,
  ts: loaded.ts,
  changes: [{ path: changePath, content }],
});
const resolutionMs = Number(process.hrtime.bigint() - resolutionStart) / 1e6;
const oracle = analyzeResolvedProject({ contract, facts: candidateFacts });
const oracleBytes = JSON.stringify(oracle);

// Prime JIT only. The timed call recomputes the verdict from immutable canonical facts.
analyzeTrustedResolvedProject({ contract, facts: candidateFacts });
const start = process.hrtime.bigint();
const after = analyzeTrustedResolvedProject({ contract, facts: candidateFacts });
const ms = Number(process.hrtime.bigint() - start) / 1e6;
const maxRss = process.resourceUsage().maxRSS;
const outputParity = JSON.stringify(after) === oracleBytes;
const factsHashParity = after.factsHash === oracle.factsHash && after.factsHash === candidateFacts.factsHash;
const candidateTreeHashParity =
  after.candidateTreeHash === oracle.candidateTreeHash &&
  after.candidateTreeHash === candidateFacts.candidateTreeHash;
const verdictParity = after.valid === oracle.valid && after.strictValid === oracle.strictValid;
const candidateIdentityChanged =
  baseFacts.factsHash !== candidateFacts.factsHash &&
  baseFacts.candidateTreeHash !== candidateFacts.candidateTreeHash;

console.log(JSON.stringify({
  status:
    outputParity && factsHashParity && candidateTreeHashParity && verdictParity && candidateIdentityChanged
      ? 0
      : 1,
  ms,
  peakRssBytes: process.platform === 'darwin' ? maxRss : maxRss * 1024,
  scenario: 'canonical-resolved-analysis',
  timedStage: 'analysis-only',
  resolutionExcluded: true,
  resolutionMs,
  changedPath: changePath,
  outputParity,
  verdictParity,
  factsHashParity,
  candidateTreeHashParity,
  candidateIdentityChanged,
  factsHash: after.factsHash,
  candidateTreeHash: after.candidateTreeHash,
}));
