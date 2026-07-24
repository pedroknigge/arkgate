import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHECK = path.resolve('bin/ark-check.mjs');
const MCP = path.resolve('bin/ark-mcp.mjs');

function projectFixture(): { root: string; file: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-adapter-parity-'));
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  const file = path.join(root, 'src/domain/clock.ts');
  fs.writeFileSync(file, 'export const now = () => Date.now();\n');
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    JSON.stringify({
      schemaVersion: '1.0',
      include: ['src'],
      layers: [
        {
          name: 'DomainModel',
          patterns: ['src/domain/**'],
          forbiddenGlobals: ['Date.now'],
        },
      ],
      rules: [],
    })
  );
  return { root, file };
}

function cliResult(root: string) {
  const run = spawnSync(
    process.execPath,
    [CHECK, '--root', root, '--config', 'ark.config.json', '--json', '--no-cache'],
    { encoding: 'utf8' }
  );
  return JSON.parse(run.stdout);
}

describe('versioned adapter parity contract', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
    roots.length = 0;
  });

  it('CLI and MCP ark_check expose the identical versioned result envelope', () => {
    const fixture = projectFixture();
    roots.push(fixture.root);
    const cli = cliResult(fixture.root);
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'ark_check', arguments: { strict: false, baseline: false } },
    };
    const run = spawnSync(
      process.execPath,
      [MCP, '--root', fixture.root, '--config', 'ark.config.json'],
      { encoding: 'utf8', input: `${JSON.stringify(request)}\n` }
    );
    const response = run.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .find((item) => item.id === 1);

    expect(response.result.structuredContent).toEqual({
      schemaVersion: cli.schemaVersion,
      mode: cli.mode,
      valid: cli.valid,
      completeness: cli.completeness,
      completenessReasons: cli.completenessReasons,
      diagnostics: cli.diagnostics,
      policyHash: cli.policyHash,
      resolverIdentity: cli.resolverIdentity,
      factsHash: cli.factsHash,
      candidateTreeHash: cli.candidateTreeHash,
    });
  });

  it('declares single-file hook evidence as lexical compatibility, outside full parity', () => {
    const fixture = projectFixture();
    roots.push(fixture.root);
    const cli = cliResult(fixture.root);
    const source = fs.readFileSync(fixture.file, 'utf8');
    // The hook ratchets pre-existing violations; model the same source as a proposed new file.
    fs.rmSync(fixture.file);
    const payload = {
      tool_name: 'Write',
      tool_input: {
        file_path: fixture.file,
        content: source,
      },
    };
    const run = spawnSync(
      process.execPath,
      [MCP, '--hook-repair', '--root', fixture.root, '--config', 'ark.config.json'],
      { encoding: 'utf8', input: JSON.stringify(payload) }
    );
    const repairLine = run.stderr
      .split('\n')
      .find((line) => line.startsWith('ARK_REPAIR_JSON:'));
    expect(repairLine).toBeTruthy();
    const repair = JSON.parse(repairLine!.slice('ARK_REPAIR_JSON:'.length));

    expect(cli).toMatchObject({
      schemaVersion: '1.4',
      mode: 'resolved-candidate-facts',
      completeness: 'complete',
    });
    expect(repair).toMatchObject({
      schemaVersion: '1.4',
      mode: 'lexical-compatibility',
      valid: false,
      completeness: 'partial',
      completenessReasons: [{ code: 'LEXICAL_EVIDENCE_INCOMPLETE' }],
      diagnostics: [{ ruleId: 'FORBIDDEN_GLOBAL' }],
    });
    expect(repair).not.toHaveProperty('factsHash');
  });

  it('GitHub Actions has a mandatory dedicated adapter-parity job', () => {
    const workflow = fs.readFileSync(path.resolve('.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain('adapter-parity:');
    expect(workflow).toContain('npm run test:adapter-parity');
  });
});
