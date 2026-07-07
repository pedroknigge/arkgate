#!/usr/bin/env node
/**
 * Run the Phase C verification plan and write all seven named artifacts to SCRATCH.
 * Usage: node scripts/capture-phase-c-evidence.mjs <scratchDir>
 */
import path from 'node:path';
import { EVIDENCE_FILES, runAllPhaseCEvidence } from '../tests/helpers/phase-c-evidence.mjs';

const scratchDir = path.resolve(process.argv[2] || '');
if (!scratchDir || process.argv.length < 3) {
  console.error('Usage: node scripts/capture-phase-c-evidence.mjs <scratchDir>');
  process.exit(2);
}

try {
  const files = await runAllPhaseCEvidence(scratchDir);
  console.log(`Phase C evidence captured (${files.length} files):`);
  for (const name of EVIDENCE_FILES) {
    console.log(`  ${path.join(scratchDir, name)}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}