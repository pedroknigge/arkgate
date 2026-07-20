#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendJsonLineDurable, sha256 } from './fs-evidence.mjs';

function value(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function normalizedHook(input) {
  let payload;
  try { payload = JSON.parse(input.toString('utf8')); } catch { return null; }
  const rawName = payload?.tool_name ?? payload?.toolName ?? '';
  const names = { Write: 'Write', write: 'Write', Edit: 'Edit', search_replace: 'Edit', MultiEdit: 'MultiEdit' };
  const toolInput = payload?.tool_input ?? payload?.toolInput ?? {};
  const filePath = toolInput.file_path ?? toolInput.filePath ?? toolInput.path ?? toolInput.target_file;
  return { toolName: names[rawName] ?? rawName, toolInput: { ...toolInput, file_path: filePath } };
}

function proposedSource(toolName, toolInput, filePath) {
  if (toolName === 'Write') return toolInput.content;
  let source = '';
  try { source = fs.readFileSync(filePath, 'utf8'); } catch {}
  const edits = toolName === 'MultiEdit' ? toolInput.edits ?? [] : [toolInput];
  for (const edit of edits) {
    const from = edit.old_string ?? '';
    const to = edit.new_string ?? '';
    if (from === '') source = to;
    else if (edit.replace_all) source = source.split(from).join(to);
    else source = source.replace(from, () => to);
  }
  return source;
}

function canonicalPath(target) {
  let current = target;
  const suffix = [];
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(target);
    suffix.unshift(path.basename(current));
    current = parent;
  }
  return path.join(fs.realpathSync(current), ...suffix);
}

export function replayBlockedCandidate({ input, workspace, checkPath, configPath }) {
  const unclassified = (reason) => ({ classified: false, falseBlock: null, reason });
  const hook = normalizedHook(input);
  if (!hook || !['Write', 'Edit', 'MultiEdit'].includes(hook.toolName)) return unclassified('unsupported hook payload');
  if (typeof hook.toolInput.file_path !== 'string') return unclassified('hook payload has no file path');
  const canonicalWorkspace = fs.realpathSync(workspace);
  const absoluteFile = canonicalPath(path.resolve(workspace, hook.toolInput.file_path));
  const relativeFile = path.relative(canonicalWorkspace, absoluteFile);
  if (relativeFile.startsWith('..') || path.isAbsolute(relativeFile) || !relativeFile.startsWith(`z08-task${path.sep}`)) {
    return unclassified(`hook file is outside the held-out task: ${relativeFile}`);
  }
  const source = proposedSource(hook.toolName, hook.toolInput, absoluteFile);
  if (typeof source !== 'string') return unclassified('hook proposal has no reconstructable source');

  const replayRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z08-hook-replay-'));
  try {
    const taskSource = path.join(canonicalWorkspace, 'z08-task');
    if (!fs.existsSync(taskSource)) return unclassified('held-out task tree is missing');
    fs.cpSync(taskSource, path.join(replayRoot, 'z08-task'), { recursive: true, dereference: false });
    fs.copyFileSync(path.resolve(canonicalWorkspace, configPath), path.join(replayRoot, 'ark.config.json'));
    const replayFile = path.join(replayRoot, relativeFile);
    fs.mkdirSync(path.dirname(replayFile), { recursive: true });
    fs.writeFileSync(replayFile, source);
    const result = spawnSync(process.execPath, [
      path.resolve(canonicalWorkspace, checkPath),
      '--root', replayRoot,
      '--config', 'ark.config.json',
      '--strict-config',
      '--json',
      '--no-cache',
    ], {
      cwd: replayRoot,
      env: process.env,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    let report;
    try { report = JSON.parse(result.stdout ?? ''); } catch {}
    const classified = result.status !== null && !result.error && typeof report?.completeness === 'string';
    return {
      classified,
      falseBlock: classified ? result.status === 0 && report.completeness === 'complete' : null,
      status: result.status,
      signal: result.signal,
      stdoutSha256: sha256(result.stdout ?? ''),
      stderrSha256: sha256(result.stderr ?? ''),
      error: result.error ? String(result.error.message ?? result.error) : null,
    };
  } finally {
    fs.rmSync(replayRoot, { recursive: true, force: true });
  }
}

export function classifyHookAudit(auditPath) {
  if (!fs.existsSync(auditPath)) return Object.freeze({ blocks: 0, trueBlocks: 0, falseBlocks: 0, unclassifiedBlocks: 0 });
  const source = fs.readFileSync(auditPath, 'utf8').trim();
  const entries = source ? source.split(/\r?\n/).map((line) => JSON.parse(line)) : [];
  const blocked = entries.filter((entry) => entry.status === 2);
  return Object.freeze({
    blocks: blocked.length,
    trueBlocks: blocked.filter((entry) => entry.replay?.classified === true && entry.replay.falseBlock === false).length,
    falseBlocks: blocked.filter((entry) => entry.replay?.classified === true && entry.replay.falseBlock === true).length,
    unclassifiedBlocks: blocked.filter((entry) => entry.replay?.classified !== true).length,
  });
}

function main(argv = process.argv.slice(2)) {
  const log = value(argv, '--log');
  const checkPath = value(argv, '--replay-check');
  const configPath = value(argv, '--replay-config') ?? 'ark.config.json';
  const separator = argv.indexOf('--');
  if (!log || !checkPath || separator === -1 || separator === argv.length - 1) {
    throw new Error('Usage: hook-audit --log <jsonl> --replay-check <path> [--replay-config <path>] -- <command> [args...]');
  }

  const command = argv[separator + 1];
  const commandArgs = argv.slice(separator + 2);
  const input = fs.readFileSync(0);
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env: process.env,
    input,
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
  });
  const stdout = result.stdout ?? Buffer.alloc(0);
  const stderr = result.stderr ?? Buffer.alloc(0);
  const replay = result.status === 2
    ? replayBlockedCandidate({ input, workspace: process.cwd(), checkPath, configPath })
    : null;
  appendJsonLineDurable(path.resolve(log), {
    schemaVersion: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    command: [command, ...commandArgs],
    inputBase64: input.toString('base64'),
    inputSha256: sha256(input),
    status: result.status,
    signal: result.signal,
    stdoutBase64: stdout.toString('base64'),
    stderrBase64: stderr.toString('base64'),
    replay,
    error: result.error ? String(result.error.message ?? result.error) : null,
  });
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
}
