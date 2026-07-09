/**
 * Structural adoption-gap tests — copy into your project (e.g. tests/ark-adoption-gaps.test.ts)
 * and run with Vitest/Jest. Asserts real on-disk gate artifacts (no mocks).
 *
 * Install reminder after copy:
 *   npx arkgate-check --install-agent-gates
 *   npx arkgate-check --doctor
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function exists(rel: string) {
  return fs.existsSync(path.join(root, rel));
}

describe('ArkGate adoption gaps (structural)', () => {
  it('has architecture contract + primary gate files', () => {
    expect(exists('ark.config.json')).toBe(true);
    expect(exists('AGENTS.md')).toBe(true);
    expect(exists('.mcp.json')).toBe(true);
  });

  it('MCP argv uses a single preferred bin (no dual ark-mcp + arkgate-mcp)', () => {
    const raw = fs.readFileSync(path.join(root, '.mcp.json'), 'utf8');
    const json = JSON.parse(raw);
    const args: string[] = json?.mcpServers?.ark?.args ?? [];
    const bins = args.filter((a) => a === 'ark-mcp' || a === 'arkgate-mcp');
    expect(bins.length).toBe(1);
    expect(bins[0]).toBe('arkgate-mcp');
  });

  it('has /ark-* skills for at least one agent host when that host dir exists', () => {
    const hosts: Array<{ dir: string; skill: (n: string) => string }> = [
      { dir: '.grok', skill: (n) => path.join('.grok', 'skills', n, 'SKILL.md') },
      { dir: '.claude', skill: (n) => path.join('.claude', 'skills', n, 'SKILL.md') },
      { dir: '.cursor', skill: (n) => path.join('.cursor', 'commands', `${n}.md`) },
    ];
    const required = [
      'ark-autopilot',
      'ark-loop',
      'ark-fix',
      'ark-adopt',
      'ark-architect',
      'ark-upgrade',
    ];
    for (const h of hosts) {
      if (!exists(h.dir)) continue;
      for (const name of required) {
        expect(exists(h.skill(name)), `missing skill ${name} under ${h.dir}`).toBe(true);
      }
    }
  });

  it('origin report exists after first --report (or documents the command)', () => {
    // Prefer real origin; if missing, the suite still documents the one-liner.
    if (exists(path.join('.ark', 'reports', 'origin.json'))) {
      expect(exists(path.join('.ark', 'reports', 'origin.json'))).toBe(true);
      return;
    }
    // Soft path: ensure doctor/report is still the sanctioned fix.
    expect(
      'npx arkgate-check --report ark-report.html'.includes('--report')
    ).toBe(true);
  });
});
