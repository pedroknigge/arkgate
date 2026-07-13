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

  it('ark-upgrade documents active vs deferred hosts (Codex not Incomplete)', () => {
    const body = fs.readFileSync(path.join(SKILLS_DIR, 'ark-upgrade.md'), 'utf8');
    expect(body).toMatch(/Active host vs deferred/i);
    expect(body).toContain('**Active host:**');
    expect(body).toContain('**Deferred hosts:**');
    expect(body).toMatch(/Deferred hosts.*never make Incomplete/i);
  });

  it('skillTemplates returns non-empty body for each expected skill', () => {
    const map = new Map(skillTemplates());
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
    expect(onDisk).toEqual([...EXPECTED_SKILLS].sort());
  });
});

describe('skill dual-engine + completion contract', () => {
  it('every skill template includes dual-engine and completion contract', () => {
    for (const name of EXPECTED_SKILLS) {
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
      'ark-autopilot',
      'ark-adopt',
      'ark-loop',
      'ark-fix',
      'ark-coverage',
      'ark-explore',
    ];
    for (const name of needStop) {
      const body = fs.readFileSync(path.join(SKILLS_DIR, `${name}.md`), 'utf8');
      expect(body, name).toContain('STOP — do not continue this skill as complete');
      expect(body, name).toMatch(/STOP — false-green:|STOP — concentrated edge:/);
    }
  });

  it('every skill documents subagent fan-out with sequential fallback', () => {
    for (const name of EXPECTED_SKILLS) {
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
    // Post-3.0: non-overlapping roles + Shape honesty
    expect(text).toMatch(/Do \*\*not\*\* run overlapping skills|Do not run overlapping skills/i);
    expect(text).toMatch(/Align.*Stabilize.*Shape/s);
    expect(text).toMatch(/design-weak|Shape work/i);
  });
});

describe('skill role clarity + exploratory depth (P01)', () => {
  it('critical recon skills define When/not when and design-depth / Shape vocabulary', () => {
    const explore = fs.readFileSync(path.join(SKILLS_DIR, 'ark-explore.md'), 'utf8');
    expect(explore).toContain('## When / not when');
    expect(explore).toMatch(/shape-focus|Dual-plan seed/i);
    expect(explore).toMatch(/Spaghetti \/ design-depth|design-depth ladder/i);
    expect(explore).toMatch(/ENFORCE · design-weak|ENFORCE·design-weak|design-weak/);
    expect(explore).toContain('Extraction card');
    expect(explore).toMatch(/Align|Stabilize|Shape/);

    const coverage = fs.readFileSync(path.join(SKILLS_DIR, 'ark-coverage.md'), 'utf8');
    expect(coverage).toContain('## When / not when');
    expect(coverage).toMatch(/not `?\/ark-explore`|not \/ark-explore|This is not `/i);
    expect(coverage).toMatch(/handoff.*\/ark-explore|\/ark-explore.*shape/i);

    const think = fs.readFileSync(path.join(SKILLS_DIR, 'ark-think.md'), 'utf8');
    expect(think).toContain('## When / not when');
    expect(think).toMatch(/ONE decision|One decision|one decision/i);

    const adopt = fs.readFileSync(path.join(SKILLS_DIR, 'ark-adopt.md'), 'utf8');
    expect(adopt).toContain('## When / not when');
    expect(adopt).toMatch(/Shape seed|dual-plan B|design-weak/i);

    const autopilot = fs.readFileSync(path.join(SKILLS_DIR, 'ark-autopilot.md'), 'utf8');
    expect(autopilot).toContain('## When / not when');
    expect(autopilot).toMatch(/Pattern \/ Shape|Shape bets|design-weak/i);
  });
});
