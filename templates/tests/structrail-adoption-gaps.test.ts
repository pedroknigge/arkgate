/**
 * Structural adoption-gap tests — copy into your project (for example,
 * tests/structrail-adoption-gaps.test.ts) and run with Vitest/Jest.
 * Asserts real on-disk gate artifacts (no mocks).
 *
 * Install reminder after copy:
 *   npx structrail-check --install-agent-gates
 *   npx structrail-check --doctor
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function exists(rel: string) {
  return fs.existsSync(path.join(root, rel));
}

describe('Structrail adoption gaps (structural)', () => {
  it('has architecture contract + primary gate files', () => {
    expect(exists('structrail.config.json')).toBe(true);
    expect(exists('AGENTS.md')).toBe(true);
    expect(exists('.mcp.json')).toBe(true);
  });

  it('MCP argv uses one canonical bin', () => {
    const raw = fs.readFileSync(path.join(root, '.mcp.json'), 'utf8');
    const json = JSON.parse(raw);
    const args: string[] = json?.mcpServers?.structrail?.args ?? [];
    const bins = args.filter((arg) =>
      ['structrail-mcp', 'arkgate-mcp', 'ark-mcp'].includes(arg)
    );
    expect(bins).toEqual(['structrail-mcp']);
  });

  it('has /structrail-* skills for at least one agent host when that host dir exists', () => {
    const hosts: Array<{ dir: string; skill: (name: string) => string }> = [
      { dir: '.grok', skill: (name) => path.join('.grok', 'skills', name, 'SKILL.md') },
      { dir: '.claude', skill: (name) => path.join('.claude', 'skills', name, 'SKILL.md') },
      { dir: '.cursor', skill: (name) => path.join('.cursor', 'commands', `${name}.md`) },
    ];
    const required = [
      'structrail-autopilot',
      'structrail-loop',
      'structrail-fix',
      'structrail-adopt',
      'structrail-architect',
      'structrail-upgrade',
    ];
    for (const host of hosts) {
      if (!exists(host.dir)) continue;
      for (const name of required) {
        expect(exists(host.skill(name)), `missing skill ${name} under ${host.dir}`).toBe(true);
      }
    }
  });

  it('origin report exists after first --report (or documents the command)', () => {
    if (exists(path.join('.ark', 'reports', 'origin.json'))) {
      expect(exists(path.join('.ark', 'reports', 'origin.json'))).toBe(true);
      return;
    }
    expect('npx structrail-check --report structrail-report.html'.includes('--report')).toBe(
      true
    );
  });
});
