/**
 * Skill surface inventory + AGENTS routing / hard-STOP contracts.
 * Guards packaging regressions (missing templates) and instruction drift.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  agentInstructions,
  agentsMdSkillRefs,
  codexConcernIsActive,
  detectActiveAgentHost,
  skillTemplateNames,
  skillTemplates,
  SKILL_TOOL_TARGETS,
  verifyHostSkillCatalog,
} from '../../../bin/lib/agent-gates.mjs';
import { normalizeToolsList } from '../../../bin/lib/skill-install.mjs';

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
    expect(detectActiveAgentHost({ GROK_AGENT: '1' })).toBe('grok');
    expect(detectActiveAgentHost({ CLAUDE_PROJECT_DIR: '/tmp/proj' })).toBe('claude');
    expect(detectActiveAgentHost({ CURSOR_TRACE_ID: 'abc' })).toBe('cursor');
    expect(detectActiveAgentHost({ CODEX_THREAD_ID: 't1' })).toBe('codex');
    // Home dir exists for anyone who installed Codex — not a session signal
    expect(detectActiveAgentHost({ CODEX_HOME: '/Users/me/.codex' })).toBe(null);
    expect(detectActiveAgentHost({})).toBe(null);
  });

  it('detects Antigravity and OpenCode session signals', () => {
    expect(detectActiveAgentHost({ ANTIGRAVITY: '1' })).toBe('antigravity');
    expect(detectActiveAgentHost({ AGY: 'true' })).toBe('antigravity');
    expect(detectActiveAgentHost({ ANTIGRAVITY_WORKSPACE: '/tmp/ws' })).toBe('antigravity');
    expect(detectActiveAgentHost({ OPENCODE: '1' })).toBe('opencode');
    expect(detectActiveAgentHost({ OPENCODE_SESSION_ID: 's1' })).toBe('opencode');
    expect(detectActiveAgentHost({ OPENCODE_CONFIG: '/tmp/opencode.json' })).toBe('opencode');
  });

  it('maps agy alias and skill targets for antigravity / opencode', () => {
    expect(normalizeToolsList('agy')).toEqual(['antigravity']);
    expect(normalizeToolsList('agy,opencode')).toEqual(['antigravity', 'opencode']);
    expect(SKILL_TOOL_TARGETS.antigravity('ark-fix')).toBe('.agents/skills/ark-fix/SKILL.md');
    expect(SKILL_TOOL_TARGETS.opencode('ark-fix')).toBe('.opencode/skills/ark-fix/SKILL.md');
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

  it('ark-upgrade resolves project-local CLI and aborts on pre-managed PATH binary', () => {
    const body = fs.readFileSync(path.join(SKILLS_DIR, 'ark-upgrade.md'), 'utf8');
    expect(body).toMatch(/Resolve the project CLI/i);
    expect(body).toMatch(/node_modules\/arkgate\/bin\/ark\.mjs/);
    expect(body).not.toMatch(/arkgate\.mjs/);
    expect(body).toMatch(/npx arkgate/);
    expect(body).toMatch(/--plan-digest/);
    expect(body).toMatch(/Do not.*bare `ark`|never bare `ark`/i);
    expect(body).toMatch(/skill incomplete|stop/i);
    expect(body).toMatch(/Global\/stale arkgate 2\.x|global 2\.x/i);
    expect(body).toMatch(/exact.*nextCommand|Do \*\*not\*\* rewrite it to bare/i);
  });

  it('autopilot/explore rank ENFORCE · design-weak Shape door (no false-done)', () => {
    const autopilot = fs.readFileSync(path.join(SKILLS_DIR, 'ark-autopilot.md'), 'utf8');
    const explore = fs.readFileSync(path.join(SKILLS_DIR, 'ark-explore.md'), 'utf8');
    expect(autopilot).toMatch(/Enforce · design-weak/i);
    expect(autopilot).toMatch(/Primary Shape door|shape-focus/i);
    expect(autopilot).toMatch(/False-done forbidden|never claim healthy finished|Empty plan A/i);
    expect(autopilot).toMatch(/Never auto-apply B|never mechanical-safe/i);
    expect(explore).toMatch(/Enforce · design-weak/i);
    expect(explore).toMatch(/Primary post-green map door|shape-focus/i);
    expect(explore).toMatch(/False-done forbidden|never claim healthy/i);
    // Smell envelope honesty (absence ≠ full-tree proof)
    expect(explore).toMatch(/absence of smell|not full-tree proof|envelope/i);
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
    expect(text).toContain('## Skill routing (expert depth — triggers → skill)');
    expect(text).toContain('STOP — do not continue this skill as complete');
    expect(text).toContain('/ark-explore');
    expect(text).toContain('/ark-adopt');
    expect(text).toContain('/ark-place');
    expect(text).toContain('/ark-fix');
    expect(text).toContain('dual-engine');
    // when unsure → doctor #1 only (not a default hop to autopilot)
    expect(text).toMatch(/When unsure, do doctor top action #1 only/i);
    expect(text).toMatch(/Do \*\*not\*\* jump to `\/ark-autopilot` unless/i);
    expect(text).toMatch(/Unsure what to do next[\s\S]*Doctor top action #1/i);
    expect(text).toMatch(/Subagent fan-out/i);
    expect(text.toLowerCase()).toMatch(/fall back to sequential/);
    // Post-3.0: non-overlapping roles + Shape honesty
    expect(text).toMatch(/Do \*\*not\*\* run overlapping skills|Do not run overlapping skills/i);
    expect(text).toMatch(/Align.*Stabilize.*Shape/s);
    expect(text).toMatch(/design-weak|Shape work/i);
  });
});

describe('Codex skill catalog targets + AGENTS.md verification', () => {
  it('maps Codex to .agents/skills/<name>/SKILL.md (not flat .codex/prompts)', () => {
    expect(SKILL_TOOL_TARGETS.codex('ark-explore')).toBe('.agents/skills/ark-explore/SKILL.md');
    expect(SKILL_TOOL_TARGETS.grok('ark-explore')).toBe('.grok/skills/ark-explore/SKILL.md');
    expect(SKILL_TOOL_TARGETS.claude('ark-explore')).toBe('.claude/skills/ark-explore/SKILL.md');
  });

  it('agentsMdSkillRefs extracts /ark-* names', () => {
    expect(agentsMdSkillRefs('run /ark-explore then /ark-autopilot; ignore /other')).toEqual([
      'ark-autopilot',
      'ark-explore',
    ]);
  });

  it('verifyHostSkillCatalog fails when AGENTS refs are missing from Codex catalog', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-catalog-'));
    try {
      fs.writeFileSync(
        path.join(root, 'AGENTS.md'),
        '# Ark\n\nUse `/ark-explore` and `/ark-loop`.\n'
      );
      const missing = verifyHostSkillCatalog(root, ['codex'], {
        skillNames: ['ark-explore', 'ark-loop'],
      });
      expect(missing.ok).toBe(false);
      expect(missing.missing.map((m) => m.path).sort()).toEqual([
        '.agents/skills/ark-explore/SKILL.md',
        '.agents/skills/ark-loop/SKILL.md',
      ]);

      fs.mkdirSync(path.join(root, '.agents', 'skills', 'ark-explore'), { recursive: true });
      fs.mkdirSync(path.join(root, '.agents', 'skills', 'ark-loop'), { recursive: true });
      fs.writeFileSync(path.join(root, '.agents/skills/ark-explore/SKILL.md'), '---\nname: ark-explore\n---\n');
      fs.writeFileSync(path.join(root, '.agents/skills/ark-loop/SKILL.md'), '---\nname: ark-loop\n---\n');
      const ok = verifyHostSkillCatalog(root, ['codex'], {
        skillNames: ['ark-explore', 'ark-loop'],
      });
      expect(ok.ok).toBe(true);
      expect(ok.referenced).toEqual(['ark-explore', 'ark-loop']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
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

  it('keeps Y01 reshape decision memory explicit in ark-autopilot', () => {
    const autopilot = fs.readFileSync(path.join(SKILLS_DIR, 'ark-autopilot.md'), 'utf8');
    expect(autopilot).toContain('reshapeDecisions');
    expect(autopilot).toContain('decisionTarget');
    expect(autopilot).toMatch(/accepts,\s*defers, or rejects/);
    expect(autopilot).toMatch(/never reconstruct/);
  });
});
