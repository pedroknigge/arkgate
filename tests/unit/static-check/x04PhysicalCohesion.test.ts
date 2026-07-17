/**
 * X04 (R1/R2) — physicalCohesion sensor + proposed reshape pilot (ADR 0010).
 *
 * Fixture obligations from the ADR: a positive fixture reproducing the
 * amarilla shape (route tree mirrored by handler and repository trees),
 * negative fixtures (a healthy feature-foldered tree and this repository),
 * pinned advisory invariants (verdict/designFitness untouched), and the
 * report section (the X01 parity guard covers it automatically).
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyPhysical,
  computePhysicalCohesion,
  computeReshapePilot,
} from '../../../bin/lib/physical-cohesion.mjs';
import { runDoctor } from '../../../bin/lib/doctor-plan.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const temps: string[] = [];

function mk(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-physical-cohesion-'));
  temps.push(root);
  return root;
}

afterEach(() => {
  for (const root of temps.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function seed(root: string, rels: string[]): string[] {
  const out: string[] = [];
  for (const rel of rels) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, 'export const x = 1;\n');
    out.push(abs);
  }
  return out;
}

/** The amarilla shape: one concept mirrored across route/handler/repo trees. */
function amarillaShape(root: string): string[] {
  const rels: string[] = [];
  for (let i = 0; i < 45; i++) rels.push(`src/app/api/projects/p${i}/route.ts`);
  for (let i = 0; i < 25; i++) rels.push(`src/lib/api-handlers/projects-h${i}.ts`);
  for (let i = 0; i < 22; i++) rels.push(`src/lib/repositories/projects-r${i}.ts`);
  // Healthy background noise stays under every threshold.
  for (let i = 0; i < 8; i++) rels.push(`src/components/billing/billing-c${i}.tsx`);
  return seed(root, rels);
}

describe('X04 classifyPhysical — deterministic concept extraction (ADR 0010 D2)', () => {
  it('framework filenames take the topmost meaningful segment; the anchor is above it', () => {
    expect(classifyPhysical('src/app/api/projects/[id]/tasks/route.ts')).toEqual({
      concept: 'projects',
      anchor: 'src/app/api',
    });
    expect(classifyPhysical('src/app/(dashboard)/budget/page.tsx')).toEqual({
      concept: 'budget',
      anchor: 'src/app/(dashboard)',
    });
  });

  it('plain filenames take the first meaningful basename token', () => {
    expect(classifyPhysical('src/lib/api-handlers/projects-crud.ts')).toEqual({
      concept: 'projects',
      anchor: 'src/lib/api-handlers',
    });
    // Noise tokens (use/api/…) are skipped — hooks group by their real concept.
    expect(classifyPhysical('src/hooks/use-activity-suggestions.ts')).toEqual({
      concept: 'activity',
      anchor: 'src/hooks',
    });
  });

  it('returns null when nothing meaningful remains', () => {
    expect(classifyPhysical('src/app/api/route.ts')).toBeNull();
    expect(classifyPhysical('README.md')).toBeNull();
  });

  it('monorepo scaffold segments never become a concept (nest-shape regression)', () => {
    // Field harness caught: packages/<pkg>/index.ts grouped 91 files under a
    // garbage "packages" concept with a nonsense pilot. Scaffold segments are
    // skipped; the package name is the concept, anchored at packages/.
    expect(classifyPhysical('packages/websockets/index.ts')).toEqual({
      concept: 'websockets',
      anchor: 'packages',
    });
    const rels: string[] = [];
    for (let p = 0; p < 10; p++) {
      for (let i = 0; i < 10; i++) rels.push(`packages/pkg${p}/sub${i}/index.ts`);
    }
    const root = mk();
    const pc = computePhysicalCohesion(root, seed(root, rels));
    expect(pc.findings.map((f: { concept: string }) => f.concept)).not.toContain('packages');
    expect(pc.findingCount).toBe(0);
  });
});

describe('X04 physicalCohesion sensor (ADR 0010 D1/D3)', () => {
  it('flags the amarilla shape as one mirrored concept with convention-aware anchors', () => {
    const root = mk();
    const files = amarillaShape(root);
    const pc = computePhysicalCohesion(root, files);
    expect(pc.advisory).toBe(true);
    expect(pc.notAScore).toBe(true);
    expect(pc.findingCount).toBe(1);
    const f = pc.findings[0];
    expect(f.concept).toBe('projects');
    expect(f.mirrored).toBe(true);
    expect(f.files).toBe(92);
    const byPath = Object.fromEntries(f.anchors.map((a: { path: string }) => [a.path, a]));
    expect(byPath['src/app/api'].fixedByConvention).toBe(true);
    expect(byPath['src/lib/api-handlers'].fixedByConvention).toBe(false);
    expect(byPath['src/lib/repositories'].fixedByConvention).toBe(false);
  });

  it('a healthy feature-foldered tree yields zero findings', () => {
    const root = mk();
    const rels: string[] = [];
    for (const feature of ['billing', 'auth', 'reports']) {
      for (let i = 0; i < 12; i++) rels.push(`src/features/${feature}/${feature}-m${i}.ts`);
    }
    const pc = computePhysicalCohesion(root, seed(root, rels));
    expect(pc.findingCount).toBe(0);
    expect(pc.label).toContain('no mirrored concept explosion');
  });

  it('volume without concentration never fires (dispersed hooks are healthy)', () => {
    const root = mk();
    const rels: string[] = [];
    for (let i = 0; i < 60; i++) rels.push(`src/features/f${i}/use-thing-${i}.ts`);
    const pc = computePhysicalCohesion(root, seed(root, rels));
    expect(pc.findingCount).toBe(0);
  });

  it('is deterministic under file-order shuffling and caps findings honestly', () => {
    const root = mk();
    const rels: string[] = [];
    for (let c = 0; c < 7; c++) {
      for (let i = 0; i < 41; i++) rels.push(`src/mod${c}/concept${c}-f${i}.ts`);
    }
    const files = seed(root, rels);
    const a = computePhysicalCohesion(root, files);
    const b = computePhysicalCohesion(root, [...files].reverse());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.findingCount).toBe(7);
    expect(a.findings.length).toBe(5);
    expect(a.truncated).toBe(2);
  });

  it('self-hosting: this repository has no mirrored concept explosion', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|mjs)$/.test(e.name)) files.push(p);
      }
    };
    for (const dir of ['src', 'bin', 'scripts']) walk(path.join(REPO, dir));
    const pc = computePhysicalCohesion(REPO, files);
    expect(pc.findingCount).toBe(0);
  });
});

describe('X04 reshape pilot — proposed, never applied (ADR 0010 D4–D7)', () => {
  it('targets the smallest convention-free anchor with an honest move sample', () => {
    const root = mk();
    const files = amarillaShape(root);
    const pc = computePhysicalCohesion(root, files);
    const pilot = computeReshapePilot(pc, files, root);
    expect(pilot.proposed).toBe(true);
    expect(pilot.applied).toBe(false);
    expect(pilot.neverMechanicalSafe).toBe(true);
    const card = pilot.nextPilot;
    expect(card.pilotTarget).toContain('src/lib/repositories');
    expect(card.movesTotal).toBe(22);
    expect(card.moveSample.length).toBe(5);
    for (const m of card.moveSample) {
      expect(m.from).toMatch(/^src\/lib\/repositories\//);
      expect(m.to).toMatch(/^src\/features\/projects\//);
    }
    expect(card.doNot.join(' ')).toMatch(/never move files under app\//);
    expect(card.doNot.join(' ')).toMatch(/one pilot at a time/);
    expect(card.killSwitch).toBeTruthy();
    expect(card.successSignal).toContain('re-run doctor');
  });

  it('when every anchor is framework-owned, no move is proposed', () => {
    const root = mk();
    const rels: string[] = [];
    for (let i = 0; i < 45; i++) rels.push(`src/app/api/projects/p${i}/route.ts`);
    const files = seed(root, rels);
    const pc = computePhysicalCohesion(root, files);
    const pilot = computeReshapePilot(pc, files, root);
    expect(pilot.nextPilot).toBeNull();
    expect(pilot.note).toMatch(/fixed by framework convention/);
  });

  it('a movable anchor below the display floor still gets the pilot (cross-model finding)', () => {
    // 40 convention-fixed routes fire the sensor; the only movable anchor has
    // 19 files — under the display floor but absolutely worth piloting.
    const root = mk();
    const rels: string[] = [];
    for (let i = 0; i < 40; i++) rels.push(`src/app/api/projects/p${i}/route.ts`);
    for (let i = 0; i < 19; i++) rels.push(`src/lib/repositories/projects-r${i}.ts`);
    const files = seed(root, rels);
    const pc = computePhysicalCohesion(root, files);
    const pilot = computeReshapePilot(pc, files, root);
    expect(pilot.nextPilot).not.toBeNull();
    expect(pilot.nextPilot.pilotTarget).toContain('src/lib/repositories');
    expect(pilot.nextPilot.movesTotal).toBe(19);
  });

  it('no findings means no pilot at all', () => {
    expect(computeReshapePilot({ findings: [] }, [], '/tmp')).toBeNull();
    expect(computeReshapePilot(null, [], '/tmp')).toBeNull();
  });
});

describe('X04 doctor surface stays advisory (pinned invariants)', () => {
  function doctorJson(root: string, config: object, files: string[]) {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    try {
      runDoctor(root, config, files, (config as { rules: object[] }).rules ?? [], [], true, {});
    } finally {
      console.log = orig;
    }
    return JSON.parse(logs.join('\n'));
  }

  it('doctor JSON exposes physicalCohesion without touching the verdict or designFitness', () => {
    const root = mk();
    const files = amarillaShape(root);
    const config = {
      include: ['src'],
      layers: [{ name: 'Tooling', patterns: ['src/**'] }],
      rules: [],
    };
    const payload = doctorJson(root, config, files);
    const pc = payload.doctor.physicalCohesion;
    expect(pc).toBeDefined();
    expect(pc.findingCount).toBe(1);
    expect(pc.findings[0].concept).toBe('projects');
    expect(pc.reshapePilot.nextPilot.movesTotal).toBe(22);
    // Advisory invariants: the explosion feeds NOTHING else. (The fixture is
    // design-weak on its own — one layer, zero rules — so the pin is that no
    // fitness/smell surface ever mentions the cohesion sensor.)
    expect(payload.ok).toBe(true);
    expect(JSON.stringify(payload.doctor.designFitness).toLowerCase()).not.toContain('cohesion');
    expect(JSON.stringify(payload.doctor.designSmells).toLowerCase()).not.toContain('cohesion');
    expect(JSON.stringify(payload.doctor.patternBets ?? null).toLowerCase()).not.toContain(
      'cohesion'
    );
  });
});
