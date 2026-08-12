import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { agentInstructions } from '../../../bin/lib/ci-and-commands.mjs';
import { detectWritePathCapabilities } from '../../../bin/lib/write-path-detect.mjs';
import {
  doctorWritePathHonestyMessage,
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
    expect(HOST_SUPPORT_HOSTS).toEqual([
      'claude',
      'grok',
      'antigravity',
      'cursor',
      'codex',
      'opencode',
    ]);
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
        'repair-envelope-emitted': true,
        'repair-reinjection-guaranteed': true,
      },
      grok: {
        'hard-write': true,
        'advisory-write': true,
        'merge-gate': true,
        'repair-payload': true,
        'repair-envelope-emitted': true,
        'repair-reinjection-guaranteed': true,
      },
      antigravity: {
        'hard-write': true,
        'advisory-write': true,
        'merge-gate': true,
        'repair-payload': true,
        'repair-envelope-emitted': true,
        'repair-reinjection-guaranteed': true,
      },
      cursor: {
        'hard-write': true,
        'advisory-write': true,
        'merge-gate': true,
        'repair-payload': false,
        'repair-envelope-emitted': true,
        'repair-reinjection-guaranteed': false,
      },
      codex: {
        'hard-write': false,
        'advisory-write': true,
        'merge-gate': true,
        'repair-payload': false,
        'repair-envelope-emitted': true,
        'repair-reinjection-guaranteed': false,
      },
      opencode: {
        'hard-write': false,
        'advisory-write': true,
        'merge-gate': true,
        'repair-payload': false,
        'repair-envelope-emitted': false,
        'repair-reinjection-guaranteed': false,
      },
    });
    expect(getHostSupportProfile(' CODEX ')).toBe(HOST_SUPPORT_MATRIX.codex);
    expect(getHostSupportProfile('antigravity')).toBe(HOST_SUPPORT_MATRIX.antigravity);
    expect(getHostSupportProfile('unknown')).toBeNull();
    expect(getHostSupportProfile(undefined)).toBeNull();
    expect(formatHostSupportSummary(HOST_SUPPORT_MATRIX.claude)).toContain(
      'hard local write boundary'
    );
    expect(formatHostSupportSummary(HOST_SUPPORT_MATRIX.cursor)).toContain(
      'hard local write boundary'
    );
    expect(formatHostSupportSummary(HOST_SUPPORT_MATRIX.opencode)).toContain(
      'no hard local write boundary'
    );
    expect(formatHostSupportSummary(null)).toBe('unknown host; no local write guarantee');

    const doctorModel = detectWritePathCapabilities(REPO, 'cursor');
    expect(doctorModel.support).toBe(HOST_SUPPORT_MATRIX.cursor);
    expect(doctorModel.supportSummary).toContain('hard local write boundary');
  });

  it('renders README and generated AGENTS.md from the same matrix', () => {
    const rendered = renderHostSupportMatrixMarkdown();
    expect(readMatrixBlock(read('README.md'))).toBe(rendered);
    expect(agentInstructions(REPO)).toContain(rendered);
    // Hard hosts: no double "PreToolUse PreToolUse"
    expect(rendered).toMatch(/\*\*Hard\*\* block for listed ops \(PreToolUse/);
    expect(rendered).not.toMatch(/PreToolUse for listed ops \(PreToolUse/);
    expect(rendered).toMatch(/Advisory \/ best-effort/);
  });

  it('doctorWritePathHonestyMessage covers host × hardWrite combinations', () => {
    expect(doctorWritePathHonestyMessage('cursor', false)).toMatch(
      /Cursor:.*Write\/StrReplace|unverified/i
    );
    expect(doctorWritePathHonestyMessage('cursor', true)).toBeNull();
    expect(doctorWritePathHonestyMessage('codex', false)).toMatch(/Codex:.*best-effort/i);
    expect(doctorWritePathHonestyMessage('codex', false)).toMatch(/not Claude\/Grok\/Cursor hard/i);
    expect(doctorWritePathHonestyMessage('codex', false)).not.toEqual(
      doctorWritePathHonestyMessage('cursor', false)
    );
    expect(doctorWritePathHonestyMessage('opencode', false)).toMatch(/OpenCode:.*advisory/i);
    expect(doctorWritePathHonestyMessage('opencode', true)).toMatch(
      /not Claude\/Grok\/Antigravity\/Cursor hard/i
    );
    expect(doctorWritePathHonestyMessage('claude', true)).toBeNull();
    expect(doctorWritePathHonestyMessage('grok', true)).toBeNull();
    expect(doctorWritePathHonestyMessage('antigravity', true)).toBeNull();
    expect(doctorWritePathHonestyMessage('claude', false)).toMatch(/unverified/i);
    expect(doctorWritePathHonestyMessage('claude', false)).toMatch(/Required CI/i);
    expect(doctorWritePathHonestyMessage('grok', false)).toMatch(/Grok:.*unverified/i);
    expect(doctorWritePathHonestyMessage('antigravity', false)).toMatch(/Antigravity:.*unverified/i);
    expect(doctorWritePathHonestyMessage('unknown', false)).toBeNull();
    expect(doctorWritePathHonestyMessage(null, false)).toBeNull();
    expect(doctorWritePathHonestyMessage(' CLAUDE ', false)).toMatch(/Claude:/);
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

    // The rationale heading sits directly after the matrix block, not somewhere later.
    const heading = '#### Why the hard guarantee lives at the merge gate';
    const headingAt = readme.indexOf(heading, matrixEnd);
    expect(headingAt).toBeGreaterThanOrEqual(0);
    expect(headingAt - matrixEnd).toBeLessThanOrEqual(200);

    // The rationale section runs from the heading to the next horizontal rule.
    const sectionEnd = readme.indexOf('\n---', headingAt);
    const section = readme.slice(headingAt, sectionEnd === -1 ? undefined : sectionEnd);
    expect(section).toMatch(/deliberate trade-off, not a gap/i);
    expect(section).toMatch(/pressure sensor/i);
    // It must not strengthen any guarantee: pin the exact conditional phrase, not just a keyword.
    expect(section).toMatch(/only when\s+the repository\s+makes that status\s+required/i);

    // Detailed host docs carry the rationale next to their canonical-matrix links.
    for (const doc of ['docs/ai-gates.md', 'docs/agent-guide.md']) {
      const content = read(doc);
      const linkAt = content.indexOf('README.md#host-enforcement-support');
      expect(linkAt, doc).toBeGreaterThanOrEqual(0);
      expect(content.slice(linkAt, linkAt + 600), doc).toMatch(/deliberate trade-off/i);
    }
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
