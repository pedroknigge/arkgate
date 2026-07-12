#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeChange, analyzeProject, loadContract } from '../dist/index.js';

function parseArgs(argv) {
  const out = { root: null, change: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--root') out.root = argv[++index];
    if (argv[index] === '--change') out.change = argv[++index];
  }
  if (!out.root || !out.change) throw new Error('Usage: ark-scale-worker --root <fixture> --change <file>');
  return out;
}

function sourceFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'core-link') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.(?:[cm]?[jt]s|tsx|jsx)$/.test(entry.name)) {
        files.push({ path: path.relative(root, absolute).split(path.sep).join('/'), content: fs.readFileSync(absolute, 'utf8') });
      }
    }
  };
  visit(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root);
const files = sourceFiles(root);
const contract = loadContract(JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8')));
const before = analyzeProject({ contract, files });
const changed = files.find((file) => file.path === args.change);
if (!changed) throw new Error(`Changed file not found: ${args.change}`);
const start = process.hrtime.bigint();
const after = analyzeChange({
  contract,
  files,
  changes: [{ path: changed.path, content: `${changed.content}\nexport const incrementalMarker = true;\n` }],
});
const ms = Number(process.hrtime.bigint() - start) / 1e6;
const unchanged = files.find((file) => file.path !== changed.path)?.path;
const beforeHash = before.ir.files.find((file) => file.path === unchanged)?.contentHash;
const afterHash = after.ir.files.find((file) => file.path === unchanged)?.contentHash;
const maxRss = process.resourceUsage().maxRSS;

console.log(JSON.stringify({
  status: 0,
  ms,
  peakRssBytes: process.platform === 'darwin' ? maxRss : maxRss * 1024,
  policyHashPreserved: before.ir.policyHash === after.ir.policyHash,
  contentHashPreserved: Boolean(beforeHash && beforeHash === afterHash),
}));
