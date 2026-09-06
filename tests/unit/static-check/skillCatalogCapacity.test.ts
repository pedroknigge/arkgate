/**
 * Issue #216 / ADR 0036 — standing check: the shipped skill *set* covers
 * 100% of product capacity and routes among itself.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ARK_FIRST_CLASS_SKILL_NAMES,
  ARK_SKILL_CAPACITY,
  ARK_SKILL_NAMES,
  ARK_SKILL_NORTH_STAR,
  ARK_SKILL_STUB_REDIRECTS,
  flatSkillTemplateFileRelativePath,
  isFirstClassArkSkillName,
} from '../../../src/domain/agentSkillsPackage.ts';

const ROOT = process.cwd();

function readSkill(name: string): string {
  return fs.readFileSync(path.join(ROOT, flatSkillTemplateFileRelativePath(name)), 'utf8');
}

describe('skill catalog product capacity (issue #216)', () => {
  it('ships a first-class /ark-order door and keeps leftover names as stubs', () => {
    expect(ARK_SKILL_NAMES).toContain('ark-order');
    expect(ARK_FIRST_CLASS_SKILL_NAMES).toContain('ark-order');
    expect(ARK_SKILL_STUB_REDIRECTS['ark-think']).toBe('ark-explore');
    expect(ARK_SKILL_STUB_REDIRECTS['ark-architect']).toBe('ark-adopt');
    expect(ARK_SKILL_STUB_REDIRECTS['ark-fix']).toBe('ark-autopilot');
  });

  it('capacity matrix covers Layers, ArkRules, ArkRun, ArkOrder, and the north star', () => {
    expect([...ARK_SKILL_NORTH_STAR]).toEqual(['Contener', 'Guiar', 'Ordenar']);
    const requiredSurfaces = [
      'Layers',
      'ArkRules',
      'ArkRun',
      'ArkOrder',
      'Contener',
      'Guiar',
      'Ordenar',
    ] as const;
    for (const surface of requiredSurfaces) {
      const doors = ARK_SKILL_CAPACITY[surface];
      expect(doors.length, `${surface} must have a first-class door`).toBeGreaterThan(0);
      for (const door of doors) {
        expect(isFirstClassArkSkillName(door), `${surface} → ${door}`).toBe(true);
      }
    }
    expect(ARK_SKILL_CAPACITY.ArkOrder).toContain('ark-order');
    expect(ARK_SKILL_CAPACITY.ArkRun).toContain('ark-runtime');
    expect(ARK_SKILL_CAPACITY.Ordenar).toEqual(['ark-order']);
  });

  it('routing table: each first-class skill has when / not when and north-star + sibling handoff', () => {
    for (const name of ARK_FIRST_CLASS_SKILL_NAMES) {
      const body = readSkill(name);
      expect(body, name).toContain('Contener · Guiar · Ordenar');
      expect(body, name).toMatch(/When \/ not when|\*\*When:\*\*/);
      expect(body, name).toMatch(/Not when|Do \*\*not\*\* use|Prefer instead/);
      expect(body, name).toMatch(/Handoff|hand off|`\/ark-/i);
      expect(body).not.toMatch(/Do not invent `\/ark-order`/);
    }
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
});
