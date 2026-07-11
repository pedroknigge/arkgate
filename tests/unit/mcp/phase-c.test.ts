import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REPO_ROOT,
  captureMcpRecommendParity,
  capturePhaseCDocs,
  captureSessionContextHint,
  ensureMcpRuntime,
  listMcpToolNames,
} from '../../helpers/phase-c-evidence.mjs';

const scratchDir =
  process.env.PHASE_C_SCRATCH || fs.mkdtempSync(path.join(os.tmpdir(), 'structrail-phasec-test-scratch-'));

describe('Phase C — verification evidence helpers', () => {
  beforeAll(() => {
    ensureMcpRuntime();
    fs.mkdirSync(scratchDir, { recursive: true });
  }, 120000);

  it('lists structrail_recommend in MCP tools/list', async () => {
    const greenfield = fs.mkdtempSync(path.join(os.tmpdir(), 'structrail-phasec-tools-'));
    fs.writeFileSync(
      path.join(greenfield, 'package.json'),
      JSON.stringify({ name: 'greenfield', version: '0.0.0' })
    );
    const tools = await listMcpToolNames(greenfield);
    expect(tools).toContain('structrail_recommend');
  });

  it('captureMcpRecommendParity — MCP matches CLI and writes mcp-recommend-parity.json', async () => {
    const { matched } = await captureMcpRecommendParity(scratchDir);
    expect(matched).toBe(true);
    const artifact = JSON.parse(
      fs.readFileSync(path.join(scratchDir, 'mcp-recommend-parity.json'), 'utf8')
    );
    expect(artifact.matched).toBe(true);
    expect(artifact.mcp.archetype).toBe(artifact.cli.archetype);
  });

  it('captureSessionContextHint — low coverage shows hint, high omits it', () => {
    const { low, high } = captureSessionContextHint(scratchDir);
    expect(low).toContain('New to Structrail?');
    expect(low).toContain('/structrail-architect');
    expect(low).toContain('structrail-check --recommend');
    expect(high).not.toContain('New to Structrail?');
    expect(fs.existsSync(path.join(scratchDir, 'session-context-hint.txt'))).toBe(true);
  });

  it('capturePhaseCDocs — skill template and agent-guide references', () => {
    const output = capturePhaseCDocs(scratchDir);
    expect(output).toContain('structrail_recommend');
    expect(fs.existsSync(path.join(REPO_ROOT, 'templates/skills/structrail-architect.md'))).toBe(true);
  });
});
