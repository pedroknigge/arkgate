/**
 * Issue #216 / ADR 0036 — standing check: the shipped skill *set* covers
 * 100% of product capacity. Fail-closed tooth lives on
 * `validateSkillProductCapacity` (also run by `npm run check:agent-skills`).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ARK_FIRST_CLASS_SKILL_NAMES,
  ARK_SKILL_NAMES,
  ARK_SKILL_STUB_REDIRECTS,
  flatSkillTemplateFileRelativePath,
  isFirstClassArkSkillName,
  validateSkillProductCapacity,
} from '../../../src/domain/agentSkillsPackage.ts';

const ROOT = process.cwd();

const CAPACITY_HUB_PATHS = [
  'AGENTS.md',
  'docs/agent-guide.md',
  'docs/audit/claims-matrix.md',
  'docs/product-voice.md',
] as const;

function readSkill(name: string): string {
  return fs.readFileSync(path.join(ROOT, flatSkillTemplateFileRelativePath(name)), 'utf8');
}

function loadShippedCapacityInput() {
  const skills: Record<string, string> = {};
  for (const name of ARK_SKILL_NAMES) {
    skills[name] = readSkill(name);
  }
  const hubs: Record<string, string> = {};
  for (const rel of CAPACITY_HUB_PATHS) {
    hubs[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  }
  return { skills, hubs };
}

describe('skill catalog product capacity (issue #216)', () => {
  it('ships a first-class /ark-order door and keeps leftover names as stubs', () => {
    expect(ARK_SKILL_NAMES).toContain('ark-order');
    expect(ARK_FIRST_CLASS_SKILL_NAMES).toContain('ark-order');
    expect(ARK_SKILL_STUB_REDIRECTS['ark-think']).toBe('ark-explore');
    expect(ARK_SKILL_STUB_REDIRECTS['ark-architect']).toBe('ark-adopt');
    expect(ARK_SKILL_STUB_REDIRECTS['ark-fix']).toBe('ark-autopilot');
  });

  it('observed skill bodies + living hubs cover 100% of the product', () => {
    const result = validateSkillProductCapacity(loadShippedCapacityInput());
    expect(result.issues, JSON.stringify(result.issues, null, 2)).toEqual([]);
    expect(result.ok).toBe(true);
    const hubs = loadShippedCapacityInput().hubs;
    expect(hubs['AGENTS.md']).not.toMatch(/freeze restated; no new skill names/);
    expect(hubs['docs/agent-guide.md']).toMatch(/one-release stubs/);
    expect(hubs['docs/agent-guide.md']).toContain('Layers + ArkRules + ArkRun + ArkOrder');
    expect(hubs['docs/audit/claims-matrix.md']).toMatch(/ACS05 freeze was opened/);
    expect(hubs['docs/product-voice.md']).toMatch(/ACS05 freeze was opened/);
  });

  it('/ark-order mirrors /ark-runtime depth for the order plane', () => {
    const order = readSkill('ark-order');
    expect(order).toContain('arkgate/order');
    expect(order).toContain('planeRoots');
    expect(order).toContain('proposeRelease');
    expect(order).toContain('apply');
    expect(order).toContain('xiKeys');
    expect(order).toContain('ARKORDER_');
    expect(order).toContain('examples/arkorder-billing');
    expect(order).toContain('Skills never enforce');
    expect(order).toContain('/ark-runtime');
    expect(order).toContain('/ark-adopt');
    expect(order).toContain('/ark-place');
    expect(order).toContain('/ark-autopilot');
  });

  it('stubs redirect to a first-class door and do not invent a third job', () => {
    for (const [stub, target] of Object.entries(ARK_SKILL_STUB_REDIRECTS)) {
      const body = readSkill(stub);
      expect(body).toMatch(/Shortcut|leftover|Not a first-class door/i);
      expect(body).toContain(`/${target}`);
      expect(isFirstClassArkSkillName(target)).toBe(true);
    }
  });

  it('leftover mechanical-edit names keep the Y04 hygiene outcomes', () => {
    const outcomes = [
      'merge into the existing doc comment',
      'preserve the original typed `defineRoute<…>(opts, handler)` call',
      'leave the placeholder file uncreated',
      'previously clean file stays typecheck-clean',
    ];
    for (const name of ['ark-fix', 'ark-loop'] as const) {
      const body = readSkill(name);
      for (const outcome of outcomes) {
        expect(body, `${name} missing ${outcome}`).toContain(outcome);
      }
    }
  });
});
