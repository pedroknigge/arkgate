import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { agentInstructions } from '../../../bin/lib/ci-and-commands.mjs';
import { detectWritePathCapabilities } from '../../../bin/lib/write-path-detect.mjs';
import {
  formatHostSupportSummary,
  getHostSupportProfile,
  HOST_SUPPORT_HOSTS,
  HOST_SUPPORT_MATRIX,
  renderHostSupportMatrixMarkdown,
} from '../../../bin/lib/host-support-matrix.mjs';
import { STRUCTRAIL_GENERATION_IDENTITY } from '../../../bin/lib/product-identity.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MATRIX_START = '<!-- structrail-host-support:start -->';
const MATRIX_END = '<!-- structrail-host-support:end -->';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(REPO, relativePath), 'utf8');
}

function readMatrixBlock(markdown: string): string {
  const start = markdown.indexOf(MATRIX_START);
  const end = markdown.indexOf(MATRIX_END);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return markdown.slice(start + MATRIX_START.length, end).trim();
}

describe('canonical public host support matrix', () => {
  it('declares exact hard, advisory, CI, and repair support per host', () => {
    expect(HOST_SUPPORT_HOSTS).toEqual(['claude', 'grok', 'cursor', 'codex']);
    expect(
      Object.fromEntries(
        HOST_SUPPORT_HOSTS.map((host) => [host, HOST_SUPPORT_MATRIX[host].capabilities])
      )
    ).toEqual({
      claude: {
        'hard-write': true,
        'advisory-write': true,
        'merge-gate': true,
        'repair-payload': true,
      },
      grok: {
        'hard-write': true,
        'advisory-write': true,
        'merge-gate': true,
        'repair-payload': true,
      },
      cursor: {
        'hard-write': false,
        'advisory-write': true,
        'merge-gate': true,
        'repair-payload': false,
      },
      codex: {
        'hard-write': false,
        'advisory-write': true,
        'merge-gate': true,
        'repair-payload': false,
      },
    });
    expect(getHostSupportProfile(' CODEX ')).toBe(HOST_SUPPORT_MATRIX.codex);
    expect(getHostSupportProfile('unknown')).toBeNull();
    expect(getHostSupportProfile(undefined)).toBeNull();
    expect(formatHostSupportSummary(HOST_SUPPORT_MATRIX.claude)).toContain(
      'hard local write boundary'
    );
    expect(formatHostSupportSummary(HOST_SUPPORT_MATRIX.cursor)).toContain(
      'no hard local write boundary'
    );
    expect(formatHostSupportSummary(null)).toBe('unknown host; no local write guarantee');

    const doctorModel = detectWritePathCapabilities(REPO, 'cursor');
    expect(doctorModel.support).toBe(HOST_SUPPORT_MATRIX.cursor);
    expect(doctorModel.supportSummary).toContain('no hard local write boundary');
  });

  it('renders README and generated AGENTS.md from the same matrix', () => {
    const rendered = renderHostSupportMatrixMarkdown(STRUCTRAIL_GENERATION_IDENTITY);
    expect(readMatrixBlock(read('README.md'))).toBe(rendered);
    expect(agentInstructions(REPO, STRUCTRAIL_GENERATION_IDENTITY)).toContain(rendered);
  });

  it('keeps detailed host docs linked to the canonical matrix without universal claims', () => {
    const aiGates = read('docs/ai-gates.md');
    const agentGuide = read('docs/agent-guide.md');
    const enthusiastGuide = read('docs/enthusiast/how-to-agent-gates.md');
    const publicClaims = `${read('README.md')}\n${aiGates}\n${agentGuide}\n${read('docs/threat-model.md')}`;

    expect(aiGates).toContain('../README.md#host-enforcement-support');
    expect(agentGuide).toContain('../README.md#host-enforcement-support');
    expect(enthusiastGuide).toContain('../../README.md#host-enforcement-support');
    expect(publicClaims).not.toMatch(/full MCP\/hooks/i);
    expect(publicClaims).not.toMatch(
      /generated code is validated against your architecture \*\*before it lands on disk\*\*/i
    );
  });

  it('marks every promoted runtime surface experimental', () => {
    for (const file of [
      'README.md',
      'docs/agent-guide.md',
      'docs/package-surface.md',
      'docs/production-hardening.md',
      'templates/skills/structrail-runtime.md',
    ]) {
      expect(read(file), file).toMatch(/runtime[\s\S]{0,240}experimental|experimental[\s\S]{0,240}runtime/i);
    }
  });
});
