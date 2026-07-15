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

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MATRIX_START = '<!-- arkgate-host-support:start -->';
const MATRIX_END = '<!-- arkgate-host-support:end -->';

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
    const rendered = renderHostSupportMatrixMarkdown();
    expect(readMatrixBlock(read('README.md'))).toBe(rendered);
    expect(agentInstructions(REPO)).toContain(rendered);
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

  it('names the enforcement-boundary trade-off next to the canonical matrix (W03)', () => {
    const readme = read('README.md');
    const matrixEnd = readme.indexOf(MATRIX_END);
    expect(matrixEnd).toBeGreaterThanOrEqual(0);
    const afterMatrix = readme.slice(matrixEnd, matrixEnd + 3500);

    // The rationale lives directly after the matrix and names the split as deliberate.
    expect(afterMatrix).toContain('#### Why the hard guarantee lives at the merge gate');
    expect(afterMatrix).toMatch(/deliberate trade-off, not a gap/i);
    expect(afterMatrix).toMatch(/pressure sensor/i);
    // It must not strengthen any guarantee: the merge gate stays conditional on a required status.
    expect(afterMatrix).toMatch(/required/i);

    // Detailed host docs point to the rationale, not only to the table.
    expect(read('docs/ai-gates.md')).toMatch(/deliberate trade-off/i);
    expect(read('docs/agent-guide.md')).toMatch(/deliberate trade-off/i);
  });

  it('marks every promoted runtime surface experimental', () => {
    for (const file of [
      'README.md',
      'docs/agent-guide.md',
      'docs/package-surface.md',
      'docs/production-hardening.md',
      'templates/skills/ark-runtime.md',
    ]) {
      expect(read(file), file).toMatch(/runtime[\s\S]{0,240}experimental|experimental[\s\S]{0,240}runtime/i);
    }
  });
});
