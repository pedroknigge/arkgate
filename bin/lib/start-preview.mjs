import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { arkCommand, buildArchitectureRecommendation } from '../ark-shared.mjs';
import { compactAgentInstructions, instructionRule, mcpJson } from './ci-and-commands.mjs';
import { claudeSettings, codexHooks, grokHooks, grokProjectConfig } from './hook-templates.mjs';

const COMPACT_HOST_TEMPLATES = {
  claude: (root) => [
    ['.claude/settings.json', claudeSettings(root)],
    ['.mcp.json', mcpJson(root)],
  ],
  grok: (root) => [
    ['.grok/config.toml', grokProjectConfig(root)],
    ['.grok/hooks/ark-write-gate.json', grokHooks(root)],
  ],
  cursor: (root) => [['.cursor/mcp.json', mcpJson(root)]],
  codex: (root) => [['.codex/hooks.json', codexHooks(root)]],
  windsurf: (root) => [['.windsurf/rules/ark.md', instructionRule(root)]],
  cline: (root) => [['.clinerules/ark.md', instructionRule(root)]],
  copilot: (root) => [['.github/copilot-instructions.md', instructionRule(root)]],
  kiro: (root) => [['.kiro/steering/ark.md', instructionRule(root)]],
  roo: (root) => [['.roo/rules/ark.md', instructionRule(root)]],
  continue: (root) => [['.continue/rules/ark.md', instructionRule(root)]],
  gemini: (root) => [['GEMINI.md', instructionRule(root)]],
};

function treeFiles(root) {
  const files = new Map();
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'dist', 'coverage'].includes(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        files.set(path.relative(root, absolute).split(path.sep).join('/'), fs.readFileSync(absolute));
      }
    }
  };
  visit(root);
  return files;
}

function normalizedContent(content, shadowRoot, root) {
  if (!content) return content;
  const text = content.toString('utf8');
  return text.includes('\u0000') ? content : Buffer.from(text.split(shadowRoot).join(root));
}

function digest(content) {
  return `sha256:${crypto.createHash('sha256').update(content ?? Buffer.alloc(0)).digest('hex')}`;
}

function change(pathname, before, after) {
  return {
    path: pathname,
    action: !before ? 'create' : !after ? 'delete' : 'edit',
    beforeHash: before ? digest(before) : null,
    afterHash: after ? digest(after) : null,
    beforeBase64: before ? before.toString('base64') : null,
    afterBase64: after ? after.toString('base64') : null,
  };
}

function setupBudget(changes) {
  const generatedChanges = changes.filter((item) => item.path !== 'package.json');
  const bytes = generatedChanges.reduce(
    (total, item) => total + (item.afterBase64 ? Buffer.from(item.afterBase64, 'base64').length : 0),
    0
  );
  // Compact start includes shared MCP + one host registration + CI + AGENTS + config.
  // Budget raised from 5→8 so .mcp.json always fits (field: grok compact hit the old ceiling).
  return {
    files: generatedChanges.length,
    bytes,
    maxFiles: 8,
    maxBytes: 32 * 1024,
    ok: generatedChanges.length <= 8 && bytes < 32 * 1024,
  };
}

function commands(root, args, helpers) {
  if (args.removeHost) {
    return [`ark start --root ${root} --tools ${args.removeHost} --apply`];
  }
  const result = [];
  // Default install=true: surface the package pin/install command unless --no-install.
  if (args.install !== false && fs.existsSync(path.join(root, 'package.json'))) {
    const [command, commandArgs] = helpers.packageInstallArgv(root, `^${helpers.cliVersion()}`);
    result.push(`${command} ${commandArgs.join(' ')}`);
  }
  result.push(arkCommand(root, 'ark-check', '--init'));
  const host = args.tools ? ` --tools ${args.tools}` : '';
  result.push(arkCommand(root, 'ark-check', `--install-agent-gates --compact${host}`));
  result.push(arkCommand(root, 'ark-check', '--plan --json'));
  result.push(arkCommand(root, 'ark-check', '--coverage --json'));
  return result;
}

export function renderStartPreview(preview) {
  console.log('Ark start preview — no files were changed.');
  if (preview.analysis) {
    console.log(`Your project looks like: ${preview.analysis.label} (${preview.analysis.archetype}, confidence ${preview.analysis.confidence}).`);
  }
  console.log(`Projected governed coverage: ${preview.projectedCoverage.percent ?? 'unknown'}% (${preview.projectedCoverage.classifiedFiles}/${preview.projectedCoverage.totalFiles} files)`);
  console.log(`Compact setup budget: ${preview.setupBudget.files}/${preview.setupBudget.maxFiles} files, ${preview.setupBudget.bytes}/${preview.setupBudget.maxBytes} bytes${preview.setupBudget.ok ? '' : ' (exceeded)'}.`);
  console.log('Files to create/edit/delete:');
  if (preview.changes.length === 0) console.log('  (none)');
  for (const change of preview.changes) {
    console.log(`  ${change.action.padEnd(6)} ${change.path}  ${change.afterHash ?? '(deleted)'}`);
  }
  console.log('Commands in the approved setup plan:');
  for (const command of preview.commands) console.log(`  ${command}`);
  console.log('Host guarantees:');
  for (const guarantee of preview.hostGuarantees) console.log(`  ${guarantee}`);
  if (preview.unresolvedDecisions.length > 0) {
    console.log('Unresolved decisions:');
    for (const decision of preview.unresolvedDecisions) console.log(`  ${decision}`);
  }
  console.log('Review complete file contents with --json. Apply this plan with: ark start --apply');
}

export function applyStartPreview(root, preview) {
  if (!preview.setupBudget?.ok) {
    throw new Error('Refusing to apply a start plan that exceeds the compact setup budget.');
  }
  for (const change of preview.changes) {
    const target = path.join(root, change.path);
    const current = fs.existsSync(target) ? fs.readFileSync(target) : null;
    const currentHash = current ? digest(current) : null;
    if (currentHash !== change.beforeHash) {
      throw new Error(`Refusing to apply stale preview: ${change.path} changed after planning.`);
    }
    if (change.action === 'delete') {
      fs.rmSync(target, { force: true });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(change.afterBase64, 'base64'));
  }
}

function planHostRemoval(args, helpers) {
  const host = args.removeHost;
  const templateFactory = COMPACT_HOST_TEMPLATES[host];
  if (!templateFactory) throw new Error(`Unknown compact host: ${host}.`);
  const changes = [];
  const unresolvedDecisions = [];
  for (const [relativePath, expected] of templateFactory(args.root)) {
    const target = path.join(args.root, relativePath);
    if (!fs.existsSync(target)) continue;
    const before = fs.readFileSync(target);
    if (before.toString('utf8') !== expected) {
      unresolvedDecisions.push(`${relativePath} was customized and was left untouched.`);
      continue;
    }
    changes.push(change(relativePath, before, null));
  }

  const agentsPath = path.join(args.root, 'AGENTS.md');
  if (fs.existsSync(agentsPath)) {
    const before = fs.readFileSync(agentsPath);
    if (before.toString('utf8') === compactAgentInstructions(args.root, host)) {
      changes.push(change('AGENTS.md', before, Buffer.from(compactAgentInstructions(args.root))));
    } else {
      unresolvedDecisions.push('AGENTS.md is not the expected compact router and was left untouched.');
    }
  }

  const genericMcp = path.join(args.root, '.mcp.json');
  if (!fs.existsSync(genericMcp)) {
    changes.push(change('.mcp.json', null, Buffer.from(mcpJson(args.root))));
  }

  return {
    version: 1,
    root: args.root,
    readOnly: true,
    mode: 'remove-host',
    host,
    analysis: null,
    projectedCoverage: { percent: null, classifiedFiles: 0, totalFiles: 0 },
    changes,
    setupBudget: setupBudget(changes),
    commands: commands(args.root, args, helpers),
    hostGuarantees: ['host removal is limited to Ark-owned compact artifacts', 'restore with the displayed --tools command'],
    unresolvedDecisions,
  };
}

export async function planStart(args, helpers) {
  if (args.removeHost) return planHostRemoval(args, helpers);
  const root = args.root;
  const before = treeFiles(root);
  let recommendation = null;
  try {
    const rec = buildArchitectureRecommendation(root);
    recommendation = {
      archetype: rec.archetype,
      label: rec.label,
      confidence: rec.confidence,
      mature: rec.mature,
    };
  } catch {
    recommendation = null;
  }
  const shadowRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-start-preview-'));
  try {
    fs.cpSync(root, shadowRoot, {
      recursive: true,
      filter: (source) => {
        const relative = path.relative(root, source).split(path.sep).join('/');
        return !relative.split('/').some((part) => ['.git', 'node_modules', 'dist', 'coverage'].includes(part));
      },
    });
    const childArgs = ['start', '--root', shadowRoot, '--internal-apply', '--skip-package-manager'];
    if (args.yes) childArgs.push('--yes');
    if (args.force) childArgs.push('--force');
    if (!args.strict) childArgs.push('--no-strict');
    // Propagate install intent into the shadow plan so package.json pin is in the diff by default.
    if (args.install === false) childArgs.push('--no-install');
    else childArgs.push('--install');
    if (args.tools) childArgs.push('--tools', args.tools);
    if (args.requireWriteHook) childArgs.push('--require-write-hook', args.requireWriteHook);
    const planned = spawnSync(process.execPath, [helpers.cliPath, ...childArgs], {
      cwd: shadowRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if ((planned.status ?? 1) !== 0) {
      throw new Error(`Unable to produce a safe start plan (exit ${planned.status ?? 1}): ${planned.stderr || planned.stdout}`.trim());
    }
    const coverageRun = spawnSync(process.execPath, [helpers.arkCheck, '--root', shadowRoot, '--config', 'ark.config.json', '--coverage', '--json'], { cwd: shadowRoot, encoding: 'utf8' });
    let coverage = {};
    try {
      coverage = JSON.parse(coverageRun.stdout || '{}').coverage || {};
    } catch {
      coverage = {};
    }
    const afterRaw = treeFiles(shadowRoot);
    const after = new Map([...afterRaw].map(([file, content]) => [file, normalizedContent(content, shadowRoot, root)]));
    const changes = [];
    for (const file of [...new Set([...before.keys(), ...after.keys()])].sort()) {
      const oldContent = before.get(file);
      const newContent = after.get(file);
      if ((oldContent && newContent && oldContent.equals(newContent)) || (!oldContent && !newContent)) continue;
      changes.push(change(file, oldContent, newContent));
    }
    const percent = coverage.governed?.percent ?? null;
    return {
      version: 1,
      root,
      readOnly: true,
      analysis: recommendation,
      projectedCoverage: {
        percent,
        classifiedFiles: coverage.governed?.classifiedFiles ?? 0,
        totalFiles: coverage.governed?.totalFiles ?? coverage.totalFiles ?? 0,
      },
      changes,
      setupBudget: setupBudget(changes),
      commands: commands(root, args, helpers),
      hostGuarantees: [
        args.requireWriteHook ? `Hard-write hook verified for ${args.requireWriteHook}` : 'shared CI merge gate will be installed',
        'preview phase performs no writes in the target project',
        'apply writes the exact bytes identified by each afterHash',
      ],
      unresolvedDecisions: percent !== null && percent < 90 ? [`Projected governed coverage is ${percent}%; review unclassified files before treating the contract as complete.`] : [],
    };
  } finally {
    fs.rmSync(shadowRoot, { recursive: true, force: true });
  }
}
