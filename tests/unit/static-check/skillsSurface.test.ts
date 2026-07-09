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

describe('skill surface inventory', () => {
  it('skillTemplateNames lists every expected skill', () => {
    const names = skillTemplateNames().sort();
    expect(names).toEqual([...EXPECTED_SKILLS].sort());
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
  });
});
