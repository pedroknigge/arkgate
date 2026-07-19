#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { runTaskAcceptance } from './task-materialize.mjs';

function value(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

const taskPath = value(process.argv, '--task');
const compiledRoot = value(process.argv, '--compiled-root');
if (!taskPath || !compiledRoot) {
  console.error('Usage: accept-task --task <task.json> --compiled-root <directory>');
  process.exit(2);
}

try {
  const task = JSON.parse(fs.readFileSync(path.resolve(taskPath), 'utf8'));
  await runTaskAcceptance(task, path.resolve(compiledRoot));
  console.log(JSON.stringify({ ok: true, taskId: task.id }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
