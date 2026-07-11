/**
 * Skill surface inventory + AGENTS routing / hard-STOP contracts.
 * Guards packaging regressions (missing templates) and instruction drift.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  agentInstructions,
  codexConcernIsActive,
  detectActiveAgentHost,
  skillTemplateNames,
  skillTemplates,
} from '../../../bin/lib/agent-gates.mjs';
import {
  ARK_GENERATION_IDENTITY,
  STRUCTRAIL_GENERATION_IDENTITY,
} from '../../../bin/lib/product-identity.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SKILLS_DIR = path.join(REPO, 'templates/skills');

/** Canonical shipped skill basenames (must match templates/skills/*.md). */
const EXPECTED_SKILLS = [
  'ark-adopt',
  'ark-architect',
  'ark-autopilot',
  'ark-contract',
  'ark-coverage',
  'ark-explain',
  'ark-explore',
  'ark-fix',
  'ark-loop',
  'ark-place',
  'ark-runtime',
  'ark-think',
  'ark-upgrade',
] as const;
const CANONICAL_SKILLS = EXPECTED_SKILLS.map((name) =>
  name.replace(/^ark-/, 'structrail-')
);

describe('active agent host detection', () => {
  it('detects Grok / Claude / Cursor / Codex without treating CODEX_HOME alone as Codex', () => {
    expect(detectActiveAgentHost({ ARK_ACTIVE_HOST: 'cursor' })).toBe('cursor');
    expect(detectActiveAgentHost({ GROK_BUILD: '1' })).toBe('grok');
    expect(detectActiveAgentHost({ CLAUDE_PROJECT_DIR: '/tmp/proj' })).toBe('claude');
    expect(detectActiveAgentHost({ CURSOR_TRACE_ID: 'abc' })).toBe('cursor');
    expect(detectActiveAgentHost({ CODEX_THREAD_ID: 't1' })).toBe('codex');
    // Home dir exists for anyone who installed Codex — not a session signal
    expect(detectActiveAgentHost({ CODEX_HOME: '/Users/me/.codex' })).toBe(null);
    expect(detectActiveAgentHost({})).toBe(null);
  });

  it('prefers STRUCTRAIL_ACTIVE_HOST over the v3 ARK_ACTIVE_HOST alias', () => {
    expect(detectActiveAgentHost({ STRUCTRAIL_ACTIVE_HOST: 'grok' })).toBe('grok');
    expect(
      detectActiveAgentHost({ STRUCTRAIL_ACTIVE_HOST: 'claude', ARK_ACTIVE_HOST: 'cursor' })
    ).toBe('claude');
  });

  it('codexConcernIsActive only when session host is Codex', () => {
    expect(codexConcernIsActive({ CODEX_THREAD_ID: 't1' })).toBe(true);
    expect(codexConcernIsActive({ GROK_BUILD: '1' })).toBe(false);
    expect(codexConcernIsActive({ CODEX_HOME: '/Users/me/.codex' })).toBe(false);
    expect(codexConcernIsActive({})).toBe(false);
  });
});

describe('skill surface inventory', () => {
  it('skillTemplateNames lists every expected skill', () => {
    const names = skillTemplateNames().sort();
    expect(names).toEqual([...EXPECTED_SKILLS].sort());
  });

  it('structrail-upgrade documents active vs deferred hosts (Codex not Incomplete)', () => {
    const body = fs.readFileSync(path.join(SKILLS_DIR, 'structrail-upgrade.md'), 'utf8');
    expect(body).toMatch(/Active host vs deferred/i);
    expect(body).toContain('**Active host:**');
    expect(body).toContain('**Deferred hosts:**');
    expect(body).toMatch(/Deferred hosts.*never make Incomplete/i);
  });

  it('skillTemplates returns non-empty body for each expected skill', () => {
    const map = new Map(skillTemplates(ARK_GENERATION_IDENTITY));
    for (const name of EXPECTED_SKILLS) {
      const body = map.get(name);
      expect(body, name).toBeTruthy();
      expect(String(body).length).toBeGreaterThan(200);
      expect(String(body)).toMatch(/^---\s*\nname:\s*/m);
    }
  });

  it('every template file on disk matches skillTemplateNames (no orphans)', () => {
    const onDisk = fs
      .readdirSync(SKILLS_DIR)
      .filter((n) => /^[a-z0-9-]+\.md$/.test(n))
      .map((n) => path.basename(n, '.md'))
      .sort();
    expect(onDisk).toEqual([...CANONICAL_SKILLS].sort());
    expect(skillTemplateNames(STRUCTRAIL_GENERATION_IDENTITY).sort()).toEqual(
      [...CANONICAL_SKILLS].sort()
    );
    expect(skillTemplateNames(ARK_GENERATION_IDENTITY).sort()).toEqual(
      [...EXPECTED_SKILLS].sort()
    );
  });
});

describe('skill dual-engine + completion contract', () => {
  it('every skill template includes dual-engine and completion contract', () => {
    for (const name of CANONICAL_SKILLS) {
      const body = fs.readFileSync(path.join(SKILLS_DIR, `${name}.md`), 'utf8');
      expect(body, name).toContain('## Dual engine (mandatory)');
      expect(body, name).toContain('## Completion contract (skill incomplete if missing)');
      expect(body, name).toMatch(/Skill incomplete if missing/i);
      expect(body, name).toContain('### Completion');
      expect(body, name).toContain('**Sensor:**');
      expect(body, name).toContain('**Opened:**');
      expect(body, name).toContain('**Handoff:**');
      expect(body, name).toContain('**Incomplete?**');
    }
  });

  it('critical skills include hard STOP handoff phrases', () => {
    const needStop = [
      'structrail-autopilot',
      'structrail-adopt',
      'structrail-loop',
      'structrail-fix',
      'structrail-coverage',
      'structrail-explore',
    ];
    for (const name of needStop) {
      const body = fs.readFileSync(path.join(SKILLS_DIR, `${name}.md`), 'utf8');
      expect(body, name).toContain('STOP — do not continue this skill as complete');
      expect(body, name).toMatch(/STOP — false-green:|STOP — concentrated edge:/);
    }
  });

  it('every skill documents subagent fan-out with sequential fallback', () => {
    for (const name of CANONICAL_SKILLS) {
      const body = fs.readFileSync(path.join(SKILLS_DIR, `${name}.md`), 'utf8');
      expect(body, name).toContain('## Subagent fan-out (optional, host-dependent)');
      expect(body.toLowerCase(), name).toMatch(/fall back to sequential/);
    }
  });
});

describe('agentInstructions routing table', () => {
  it('emits default autopilot + skill routing table + STOP guidance', () => {
    const text = agentInstructions(REPO);
    expect(text).toContain('/ark-autopilot');
    expect(text).toContain('## Skill routing (triggers → skill)');
    expect(text).toContain('STOP — do not continue this skill as complete');
    expect(text).toContain('/ark-explore');
    expect(text).toContain('/ark-adopt');
    expect(text).toContain('/ark-place');
    expect(text).toContain('/ark-fix');
    expect(text).toContain('dual-engine');
    // default when unsure stays autopilot
    expect(text).toMatch(/if unsure[\s\S]*\/ark-autopilot/i);
    expect(text).toMatch(/Subagent fan-out/i);
    expect(text.toLowerCase()).toMatch(/fall back to sequential/);
  });
});
