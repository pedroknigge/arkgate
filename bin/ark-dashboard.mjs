#!/usr/bin/env node
import { parseArgs } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimePath = path.join(here, '..', 'dist', 'runtime', 'index.js');
let ArkRun = null;
if (fs.existsSync(runtimePath)) {
  const runtime = await import(runtimePath);
  ArkRun = runtime.ArkRun;
}


const args = parseArgs({
  options: {
    interval: {
      type: 'string',
      short: 'i',
      default: '2000'
    }
  },
  allowPositionals: true
});

const interval = parseInt(args.values.interval, 10) || 2000;

async function startDashboard() {
  console.log(`Starting ArkGate Observability Dashboard (polling every ${interval}ms)`);
  
  // Basic ANSI clearing loop
  setInterval(() => {
    // Clear screen and move cursor to top left
    process.stdout.write('\x1b[2J\x1b[H');
    console.log(`ArkGate Observability Dashboard`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Status: Running (Waiting for OD02/OD03 modules)`);
  }, interval);
}

startDashboard().catch(err => {
  console.error(err);
  process.exit(1);
});
