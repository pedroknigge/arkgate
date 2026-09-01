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
    },
    url: {
      type: 'string',
      short: 'u',
      default: 'http://127.0.0.1:3000/snapshot'
    }
  },
  allowPositionals: true
});

const interval = parseInt(args.values.interval, 10) || 2000;
const targetUrl = args.values.url || 'http://127.0.0.1:3000/snapshot';

async function fetchSnapshot() {
  try {
    const res = await fetch(targetUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return null;
  }
}

async function render() {
  process.stdout.write('\x1b[2J\x1b[H');
  console.log(`ArkGate Observability Dashboard`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Endpoint: ${targetUrl}\n`);
  
  const snapshot = await fetchSnapshot();
  
  console.log(`--- Hardening Status ---`);
  if (!snapshot) {
    console.log(`\x1b[33mWaiting for kernel...\x1b[0m`);
  } else {
    const components = snapshot.package?.components || [];
    const memoryStores = components.filter(c => 
      c.id && (c.id.includes('InMemoryEventBuffer') || c.id.includes('InMemoryAuditStore') || c.id.includes('InMemoryWorkflowStore'))
    );
    
    if (memoryStores.length > 0) {
      console.log(`\x1b[31m[WARNING] Memory defaults in use!\x1b[0m`);
      memoryStores.forEach(c => console.log(`  - \x1b[33m${c.id}\x1b[0m`));
    } else {
      console.log(`\x1b[32m[OK] Durable Stores Configured\x1b[0m`);
    }
  }
}

async function startDashboard() {
  console.log(`Starting ArkGate Observability Dashboard (polling every ${interval}ms)`);
  
  while (true) {
    await render();
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

startDashboard().catch(err => {
  console.error(err);
  process.exit(1);
});
