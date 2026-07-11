import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'structrail-generation-'));

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function read(relativePath: string) {
  return fs.readFileSync(path.join(tmp, relativePath), 'utf8');
}

describe('Structrail agent-gate generation', () => {
  it('uses the canonical identity on every newly generated surface', () => {
    const result = spawnSync(
      process.execPath,
      [
        path.join(repo, 'bin', 'structrail-check.mjs'),
        '--root',
        tmp,
        '--install-agent-gates',
        '--tools',
        'claude,cursor,codex,grok,windsurf,cline,copilot,kiro,roo,continue,gemini',
        '--force',
      ],
      {
        cwd: repo,
        encoding: 'utf8',
        env: { ...process.env, CODEX_HOME: path.join(tmp, 'codex-home') },
      }
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Structrail agent gate templates:');

    const agents = read('AGENTS.md');
    expect(agents).toContain('# Structrail Enforcement');
    expect(agents).toContain('structrail://manifest');
    expect(agents).toContain('structrail.config.json');
    expect(agents).toContain('structrail-check');
    expect(agents).toContain('/structrail-autopilot');
    expect(agents).not.toContain('ark.config.json');
    expect(agents).not.toContain('ark://manifest');

    const mcp = JSON.parse(read('.mcp.json'));
    expect(Object.keys(mcp.mcpServers)).toEqual(['structrail']);
    expect(mcp.mcpServers.structrail.args).toContain('structrail-mcp');
    expect(mcp.mcpServers.structrail.args).toContain('structrail.config.json');

    expect(read('.claude/settings.json')).toContain('structrail-mcp');
    expect(read('.claude/settings.json')).toContain('structrail.config.json');
    expect(read('.grok/config.toml')).toContain('[mcp_servers.structrail]');
    expect(read('.grok/hooks/structrail-write-gate.json')).toContain('structrail-mcp');
    expect(read('.cursor/rules/structrail.mdc')).toContain('structrail://manifest');
    expect(read('docs/structrail-codex-config.toml')).toContain('[mcp_servers.structrail]');

    const workflow = read('.github/workflows/structrail-check.yml');
    expect(workflow).toContain('name: Structrail architecture gate');
    expect(workflow).toContain('structrail-check');
    expect(workflow).toContain('structrail.config.json');

    for (const relativePath of [
      '.windsurf/rules/structrail.md',
      '.clinerules/structrail.md',
      '.kiro/steering/structrail.md',
      '.roo/rules/structrail.md',
      '.continue/rules/structrail.md',
    ]) {
      expect(read(relativePath)).toContain('# Structrail architecture contract');
    }

    const skill = read('.claude/skills/structrail-coverage/SKILL.md');
    expect(skill).toContain('name: structrail-coverage');
    expect(skill).toContain('structrailVersion: 3.0.0');
    expect(read('.cursor/commands/structrail-coverage.md')).toBe(skill);
    expect(read('.grok/skills/structrail-coverage/SKILL.md')).toBe(skill);
    expect(read('.windsurf/workflows/structrail-coverage.md')).toBe(skill);
    expect(read('.clinerules/workflows/structrail-coverage.md')).toBe(skill);
    expect(read('.github/prompts/structrail-coverage.prompt.md')).toBe(skill);
    expect(fs.existsSync(path.join(tmp, '.claude/skills/ark-coverage/SKILL.md'))).toBe(false);
  });
});
