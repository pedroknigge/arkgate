#!/usr/bin/env node
/** T05 fixed no-context feature journey. Fixture-measured; no live LLM. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const FIXTURE = path.join(REPO, 'tests/fixtures/change-integrity-feature');
const ARK = path.join(REPO, 'bin/ark.mjs');
const ARK_CHECK = path.join(REPO, 'bin/ark-check.mjs');
const ARK_MCP = path.join(REPO, 'bin/ark-mcp.mjs');

function argument(name) {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

function run(file, args, root, input) {
  return spawnSync(process.execPath, [file, ...args], {
    cwd: root,
    encoding: 'utf8',
    input,
    env: { ...process.env, NO_COLOR: '1' },
  });
}

function applyChanges(root, changes) {
  for (const change of changes) {
    const target = path.join(root, change.path);
    if (change.delete) fs.rmSync(target, { force: true });
    else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, change.content);
    }
  }
}

function diagnosticIdentity(diagnostic) {
  return {
    ruleId: diagnostic.ruleId,
    severity: diagnostic.severity,
    location: diagnostic.location,
    evidence: diagnostic.evidence,
    nextAction: diagnostic.nextAction,
  };
}

function mcpPreflight(root, changes) {
  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'ark_prepare_change', arguments: { changes } },
  };
  const result = run(ARK_MCP, ['--root', root, '--config', 'ark.config.json'], root, `${JSON.stringify(request)}\n`);
  const response = result.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .find((item) => item.id === 1);
  if (!response?.result?.structuredContent) throw new Error(result.stderr || 'MCP preflight returned no structured content.');
  return response.result.structuredContent;
}

function hookPreflight(root, changes) {
  const patch = [
    '*** Begin Patch',
    ...changes.flatMap((change) => [
      `*** Add File: ${change.path}`,
      ...change.content.trimEnd().split('\n').map((line) => `+${line}`),
    ]),
    '*** End Patch',
  ].join('\n');
  const result = run(
    ARK_MCP,
    ['--hook', '--hook-repair', '--root', root, '--config', 'ark.config.json'],
    root,
    JSON.stringify({ tool_name: 'ApplyPatch', tool_input: { patch } })
  );
  const line = result.stderr.split('\n').find((entry) => entry.startsWith('ARK_REPAIR_JSON:'));
  if (!line) throw new Error(result.stderr || 'Hook returned no repair payload.');
  return { status: result.status, payload: JSON.parse(line.slice('ARK_REPAIR_JSON:'.length)) };
}

function main() {
  const output = path.resolve(argument('--out') ?? path.join(HERE, 'change-integrity-report.json'));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-change-integrity-eval-'));
  const noContext = path.join(scratch, 'no-context');
  const withContext = path.join(scratch, 'with-context');
  const finalRoot = path.join(scratch, 'accepted');
  const rejectedRoot = path.join(scratch, 'rejected-final');
  try {
    for (const root of [noContext, withContext, finalRoot, rejectedRoot]) {
      fs.cpSync(FIXTURE, root, { recursive: true });
    }
    fs.writeFileSync(path.join(withContext, 'AGENTS.md'), '# Optional prose only\n');
    fs.mkdirSync(path.join(withContext, '.agents/skills/demo'), { recursive: true });
    fs.writeFileSync(path.join(withContext, '.agents/skills/demo/SKILL.md'), '# Optional skill\n');
    fs.writeFileSync(path.join(withContext, '.session-context.txt'), 'Optional injected context\n');

    const rejected = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'rejected-changes.json'), 'utf8')).changes;
    const accepted = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'accepted-changes.json'), 'utf8')).changes;
    const cliArgs = ['preflight', '--root', noContext, '--changes', 'rejected-changes.json'];
    const casual = run(ARK, cliArgs, noContext);
    const noContextJson = run(ARK, [...cliArgs, '--json'], noContext);
    const withContextJson = run(
      ARK,
      ['preflight', '--root', withContext, '--changes', 'rejected-changes.json', '--json'],
      withContext
    );
    const cli = JSON.parse(noContextJson.stdout);
    const contextual = JSON.parse(withContextJson.stdout);
    const mcp = mcpPreflight(noContext, rejected);
    const hook = hookPreflight(noContext, rejected);

    applyChanges(rejectedRoot, rejected);
    const finalRejected = run(
      ARK_CHECK,
      ['--root', rejectedRoot, '--config', 'ark.config.json', '--json', '--no-cache'],
      rejectedRoot
    );
    const finalRejectedPayload = JSON.parse(finalRejected.stdout);

    applyChanges(finalRoot, accepted);
    const acceptance = run(path.join(finalRoot, 'acceptance.mjs'), [], finalRoot);
    const strict = run(
      ARK_CHECK,
      ['--root', finalRoot, '--config', 'ark.config.json', '--strict-config', '--json', '--no-cache'],
      finalRoot
    );
    const strictPayload = JSON.parse(strict.stdout);

    const cliDiagnostics = cli.diagnostics.map(diagnosticIdentity);
    const contextIndependent =
      JSON.stringify(cliDiagnostics) === JSON.stringify(contextual.diagnostics.map(diagnosticIdentity)) &&
      cli.policyHash === contextual.policyHash &&
      cli.baseTreeHash === contextual.baseTreeHash &&
      cli.candidateTreeHash === contextual.candidateTreeHash;
    const adapterParity =
      JSON.stringify(cliDiagnostics) === JSON.stringify(mcp.diagnostics.map(diagnosticIdentity)) &&
      JSON.stringify(cliDiagnostics) === JSON.stringify(hook.payload.diagnostics.map(diagnosticIdentity)) &&
      JSON.stringify(cliDiagnostics) ===
        JSON.stringify(finalRejectedPayload.diagnostics.map(diagnosticIdentity));
    const nextActions = casual.stderr.match(/Next action:/g) ?? [];
    const report = {
      schemaVersion: '1.0',
      id: 't05-change-integrity',
      mode: 'fixture-measured',
      liveLlmRequired: false,
      fixture: 'tests/fixtures/change-integrity-feature',
      scenario: 'Add a pure free-shipping rule without crossing DomainModel -> Kernel.',
      casualJourney: {
        contextFilesRequired: false,
        rejectedBeforeWrite: casual.status === 1,
        conciseDenials: nextActions.length,
        nextAction: cliDiagnostics[0]?.nextAction,
      },
      seniorJourney: {
        policyHash: cli.policyHash,
        baseTreeHash: cli.baseTreeHash,
        candidateTreeHash: cli.candidateTreeHash,
        ruleIds: cliDiagnostics.map(({ ruleId }) => ruleId),
        cliMcpHookFinalParity: adapterParity,
      },
      contextIndependent: {
        sameVerdictAndHashes: contextIndependent,
        comparedArtifacts: ['none', 'AGENTS.md', '.agents/skills/**', '.session-context.txt'],
      },
      enforcement: hook.payload.enforcement,
      completion: {
        acceptanceCommand: 'node acceptance.mjs',
        acceptancePassed: acceptance.status === 0,
        strictArkCommand: 'ark-check --strict-config --json --no-cache',
        strictArkPassed: strict.status === 0 && strictPayload.valid === true,
        behavioralCompletionClaimedByPreflight: false,
      },
    };
    report.ok =
      report.casualJourney.rejectedBeforeWrite &&
      report.casualJourney.conciseDenials === 1 &&
      report.seniorJourney.cliMcpHookFinalParity &&
      report.contextIndependent.sameVerdictAndHashes &&
      report.enforcement.localWrite.completePatch === true &&
      report.enforcement.localWrite.hard === false &&
      report.enforcement.localWrite.bypassable === true &&
      report.completion.acceptancePassed &&
      report.completion.strictArkPassed;
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`T05 change integrity: ${report.ok ? 'PASS' : 'FAIL'}`);
    console.log(`  context independent: ${report.contextIndependent.sameVerdictAndHashes}`);
    console.log(`  CLI/MCP/hook/final parity: ${report.seniorJourney.cliMcpHookFinalParity}`);
    console.log(`  acceptance + strict Ark: ${report.completion.acceptancePassed && report.completion.strictArkPassed}`);
    console.log(`  report: ${path.relative(REPO, output)}`);
    process.exitCode = report.ok ? 0 : 1;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main();
