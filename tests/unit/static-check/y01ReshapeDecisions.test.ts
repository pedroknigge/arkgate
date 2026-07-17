/**
 * Y01 — explicit physical-cohesion verdict memory.
 *
 * A decision changes pilot pressure only. The sensor facts stay byte-stable,
 * accepted pilots keep the X04 path, and stale/expired/broken records never
 * suppress anything.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  computePhysicalCohesion,
} from '../../../bin/lib/physical-cohesion.mjs';
import {
  RESHAPE_DECISIONS_PATH,
  analyzeReshapeDecisions,
  computeDecisionAwareReshapePilot,
  computeReshapeDecisionMemory,
  loadReshapeDecisions,
  printReshapeDecisionsSection,
} from '../../../bin/lib/reshape-decisions.mjs';
import {
  computeDoctorAdvisories,
  printDoctorAdvisories,
} from '../../../bin/lib/doctor-advisories.mjs';
import { renderAdvisorySections } from '../../../bin/lib/html-report-advisories.mjs';

const TODAY = '2026-07-17';
const PROJECT_ANCHORS = ['src/app/api', 'src/lib/repositories'];
const temps: string[] = [];

function mk(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-y01-decisions-'));
  temps.push(root);
  return root;
}

afterEach(() => {
  for (const root of temps.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function seed(root: string, rels: string[]): string[] {
  return rels.map((rel) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, 'export const x = 1;\n');
    return abs;
  });
}

function projects(root: string, routeCount = 45, repositoryCount = 22): string[] {
  const rels: string[] = [];
  for (let index = 0; index < routeCount; index += 1) {
    rels.push(`src/app/api/projects/p${index}/route.ts`);
  }
  for (let index = 0; index < repositoryCount; index += 1) {
    rels.push(`src/lib/repositories/projects-r${index}.ts`);
  }
  return seed(root, rels);
}

function writeDecisions(root: string, decisions: unknown[], extra: object = {}): void {
  const abs = path.join(root, RESHAPE_DECISIONS_PATH);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify({ schemaVersion: '1', decisions, ...extra }));
}

function decision(
  verdict: 'accepted' | 'deferred' | 'rejected',
  overrides: Record<string, unknown> = {}
) {
  return {
    concept: 'projects',
    anchors: PROJECT_ANCHORS,
    verdict,
    reason: 'the mirrored anchors are our deliberate role layout',
    ...overrides,
  };
}

function resolve(root: string, files: string[]) {
  return analyzeReshapeDecisions(root, files, loadReshapeDecisions(root), TODAY);
}

describe('Y01 sidecar validation and lifecycle', () => {
  it('is absent by default and normalizes/sorts a valid explicit target', () => {
    const root = mk();
    expect(loadReshapeDecisions(root)).toEqual({
      path: RESHAPE_DECISIONS_PATH,
      exists: false,
      decisions: [],
    });
    writeDecisions(root, [
      decision('rejected', { anchors: [...PROJECT_ANCHORS].reverse() }),
    ]);
    const state = loadReshapeDecisions(root);
    expect(state.invalid).not.toBe(true);
    expect(state.decisions[0].anchors).toEqual(PROJECT_ANCHORS);
    expect(state.decisions[0].reason).toMatch(/deliberate role layout/);
  });

  it('applies undated/current decisions; same-day is current and expired stops applying', () => {
    const root = mk();
    const files = projects(root);
    writeDecisions(root, [decision('rejected')]);
    expect(resolve(root, files).summary.lifecycle.undated).toBe(1);
    expect(resolve(root, files).current[0].suppressesPilot).toBe(true);

    writeDecisions(root, [decision('deferred', { reviewBy: TODAY })]);
    expect(resolve(root, files).current[0].lifecycle).toBe('current');

    writeDecisions(root, [decision('rejected', { reviewBy: '2026-01-01' })]);
    const expired = resolve(root, files);
    expect(expired.current).toEqual([]);
    expect(expired.summary.lifecycle.expiredCount).toBe(1);
  });

  it('ignores malformed calendar dates and invalidates a non-string reviewBy', () => {
    const root = mk();
    const files = projects(root);
    writeDecisions(root, [decision('rejected', { reviewBy: '2026-02-30' })]);
    const malformed = resolve(root, files);
    expect(malformed.current).toEqual([]);
    expect(malformed.summary.lifecycle.malformedCount).toBe(1);

    writeDecisions(root, [decision('rejected', { reviewBy: 20260717 })]);
    expect(loadReshapeDecisions(root).invalid).toBe(true);
  });

  it('fails loud on malformed shape, duplicates, oversized files, and entry bounds', () => {
    const roots = [mk(), mk(), mk(), mk()];
    const malformedPath = path.join(roots[0], RESHAPE_DECISIONS_PATH);
    fs.mkdirSync(path.dirname(malformedPath), { recursive: true });
    fs.writeFileSync(malformedPath, '{ broken');
    expect(loadReshapeDecisions(roots[0]).invalid).toBe(true);

    writeDecisions(roots[1], [decision('rejected'), decision('accepted')]);
    expect(loadReshapeDecisions(roots[1]).error).toMatch(/duplicate/);

    writeDecisions(roots[2], [decision('rejected', { reason: 'x'.repeat(70 * 1024) })]);
    expect(loadReshapeDecisions(roots[2]).error).toMatch(/larger/);

    writeDecisions(
      roots[3],
      Array.from({ length: 201 }, (_, index) =>
        decision('rejected', { concept: `concept${index}` })
      )
    );
    expect(loadReshapeDecisions(roots[3]).error).toMatch(/more than 200/);
  });

  it('requires canonical unique anchors, known verdicts, and a non-empty reason', () => {
    for (const bad of [
      decision('rejected', { anchors: ['../src'] }),
      decision('rejected', { anchors: ['src/a', 'src/a'] }),
      decision('rejected', { anchors: [123] }),
      decision('rejected', { verdict: 'ignored' }),
      decision('rejected', { reason: ' ' }),
      decision('rejected', { surprise: true }),
    ]) {
      const root = mk();
      writeDecisions(root, [bad]);
      expect(loadReshapeDecisions(root).invalid, JSON.stringify(bad)).toBe(true);
    }
  });

  it('is stable under sidecar ordering and caps lifecycle lists honestly', () => {
    const rootA = mk();
    const rootB = mk();
    const filesA = projects(rootA);
    const filesB = projects(rootB);
    const records = Array.from({ length: 15 }, (_, index) =>
      decision('rejected', {
        concept: `gone${index}`,
        anchors: [`src/gone${index}`],
        reason: `gone ${index}`,
      })
    );
    writeDecisions(rootA, records);
    writeDecisions(rootB, [...records].reverse());
    const a = resolve(rootA, filesA).summary.lifecycle;
    const b = resolve(rootB, filesB).summary.lifecycle;
    expect(a.staleCount).toBe(15);
    expect(a.stale).toHaveLength(12);
    expect(a.stale).toEqual(b.stale);
  });

  it('caps current decision details while human overflow stays neutral', () => {
    const root = mk();
    const concepts = [
      'alpha',
      'bravo',
      'charlie',
      'delta',
      'echo',
      'foxtrot',
      'golf',
      'hotel',
      'india',
      'juliet',
      'kilo',
      'lima',
      'mango',
      'november',
      'oscar',
    ];
    const files = seed(
      root,
      concepts.map((concept, index) => `src/anchor-${index}/${concept}-file.ts`)
    );
    writeDecisions(
      root,
      concepts.map((concept, index) => ({
        concept,
        anchors: [`src/anchor-${index}`],
        verdict: 'accepted',
        reason: `keep ${concept} here`,
      }))
    );
    const memory = resolve(root, files).summary;
    expect(memory.currentCount).toBe(15);
    expect(memory.current).toHaveLength(12);

    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    try {
      printReshapeDecisionsSection(memory, {
        line: (_mark: string, text: string) => logs.push(text),
        warn: '!',
        color: { bold: String, dim: String },
      });
    } finally {
      console.log = original;
    }
    const human = logs.join('\n');
    expect(human).toContain('…(+10 more current decision(s))');
    expect(human).not.toContain('doctor JSON');
  });

  it('caps a changed anchor-set evidence list without losing its true count', () => {
    const root = mk();
    const files = seed(
      root,
      Array.from({ length: 25 }, (_, index) => `src/anchor${index}/projects-${index}.ts`)
    );
    writeDecisions(root, [decision('rejected', { anchors: ['src/old-home'] })]);
    const stale = resolve(root, files).summary.lifecycle.stale[0];
    expect(stale.currentAnchorCount).toBe(25);
    expect(stale.currentAnchors).toHaveLength(20);
  });
});

describe('Y01 verdict semantics — facts stay, pressure changes', () => {
  it('absence preserves the X04 pilot and exposes the complete decision target', () => {
    const root = mk();
    const files = projects(root);
    const cohesion = computePhysicalCohesion(root, files);
    const memory = computeReshapeDecisionMemory(root, files, TODAY);
    const pilot = computeDecisionAwareReshapePilot(cohesion, files, root, memory);
    expect(pilot.nextPilot.movesTotal).toBe(22);
    expect(pilot.nextPilot.decisionTarget).toEqual({
      concept: 'projects',
      anchors: PROJECT_ANCHORS,
    });
    expect(pilot.nextPilot.decisionFile).toBe(RESHAPE_DECISIONS_PATH);
  });

  it('accepted keeps the existing pilot; rejected and deferred suppress only its pressure', () => {
    for (const verdict of ['accepted', 'rejected', 'deferred'] as const) {
      const root = mk();
      const files = projects(root);
      const facts = computePhysicalCohesion(root, files);
      writeDecisions(root, [decision(verdict)]);
      const memory = resolve(root, files);
      const pilot = computeDecisionAwareReshapePilot(facts, files, root, memory);
      expect(facts.findings[0].concept).toBe('projects');
      expect(facts.findings[0].files).toBe(67);
      if (verdict === 'accepted') {
        expect(pilot.nextPilot).not.toBeNull();
        expect(pilot.decision.verdict).toBe('accepted');
      } else {
        expect(pilot.nextPilot).toBeNull();
        expect(pilot.suppressedByDecision).toBe(true);
      }
    }
  });

  it('count drift under the same anchors keeps the verdict current', () => {
    const root = mk();
    const files = projects(root);
    writeDecisions(root, [decision('rejected')]);
    expect(resolve(root, files).current).toHaveLength(1);
    const more = seed(root, [
      'src/app/api/projects/more/route.ts',
      'src/lib/repositories/projects-more.ts',
    ]);
    const after = resolve(root, [...files, ...more]);
    expect(after.current).toHaveLength(1);
    expect(after.summary.lifecycle.staleCount).toBe(0);
  });

  it('anchor drift makes the record stale and reactivates the proposal', () => {
    const root = mk();
    const files = projects(root);
    writeDecisions(root, [decision('rejected')]);
    const extra = seed(root, ['src/lib/api-handlers/projects-new.ts']);
    const all = [...files, ...extra];
    const memory = resolve(root, all);
    expect(memory.current).toEqual([]);
    expect(memory.summary.lifecycle.staleCount).toBe(1);
    expect(memory.summary.lifecycle.stale[0].currentAnchors).toEqual([
      'src/app/api',
      'src/lib/api-handlers',
      'src/lib/repositories',
    ]);
    const pilot = computeDecisionAwareReshapePilot(
      computePhysicalCohesion(root, all),
      all,
      root,
      memory
    );
    expect(pilot.nextPilot).not.toBeNull();
  });

  it('a rejected top finding advances to the next finding, still one pilot at a time', () => {
    const root = mk();
    const projectFiles = projects(root);
    const billingFiles = seed(
      root,
      Array.from({ length: 42 }, (_, index) => `src/lib/billing/billing-${index}.ts`)
    );
    const files = [...projectFiles, ...billingFiles];
    writeDecisions(root, [decision('rejected')]);
    const cohesion = computePhysicalCohesion(root, files);
    expect(cohesion.findings.map((finding) => finding.concept)).toEqual(['projects', 'billing']);
    const pilot = computeDecisionAwareReshapePilot(cohesion, files, root, resolve(root, files));
    expect(pilot.concept).toBe('billing');
    expect(pilot.nextPilot.pilotTarget).toMatch(/^billing @/);
  });

  it('an expired decision reactivates the proposal while preserving its lifecycle evidence', () => {
    const root = mk();
    const files = projects(root);
    writeDecisions(root, [decision('rejected', { reviewBy: '2026-01-01' })]);
    const memory = resolve(root, files);
    const pilot = computeDecisionAwareReshapePilot(
      computePhysicalCohesion(root, files),
      files,
      root,
      memory
    );
    expect(memory.summary.lifecycle.expiredCount).toBe(1);
    expect(pilot.nextPilot).not.toBeNull();
  });
});

describe('Y01 doctor/report/golden integration', () => {
  const config = {
    include: ['src'],
    layers: [{ name: 'Tooling', patterns: ['src/**'] }],
    rules: [],
  };
  const coverage = {
    governed: { classifiedFiles: 67, totalFiles: 67, percent: 100 },
    layers: [{ name: 'Tooling', files: 67 }],
  };

  it('doctor JSON keeps physical facts byte-identical and renders the explicit decision', () => {
    const root = mk();
    const files = projects(root);
    const rawFacts = computePhysicalCohesion(root, files).findings;
    writeDecisions(root, [decision('rejected')]);
    const advisories = computeDoctorAdvisories(root, config, coverage, [], files, undefined);
    expect(advisories.physicalCohesion.findings).toEqual(rawFacts);
    expect(advisories.physicalCohesion.reshapeDecisions.current[0].verdict).toBe('rejected');
    expect(advisories.physicalCohesion.reshapePilot.nextPilot).toBeNull();
  });

  it('human doctor and HTML report show the verdict instead of a dead proposal', () => {
    const root = mk();
    const files = projects(root);
    writeDecisions(root, [decision('rejected')]);
    const advisories = computeDoctorAdvisories(root, config, coverage, [], files, undefined);
    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    try {
      printDoctorAdvisories(advisories, {
        line: (_mark: string, text: string) => console.log(text),
        warn: '!',
        color: { bold: String, dim: String },
      });
    } finally {
      console.log = original;
    }
    const human = logs.join('\n');
    expect(human).toContain('Reshape decisions');
    expect(human).toContain('[projects] rejected');
    expect(human).not.toContain('next pilot: projects');

    const html = renderAdvisorySections(advisories, String);
    expect(html).toContain('data-advisory="physicalCohesion"');
    expect(html).toContain('data-advisory="reshapeDecisions"');
    expect(html).toContain('rejected');
    expect(html).toContain('Pilot pressure suppressed');
    expect(html).not.toContain('next pilot (proposed, never applied): projects');
  });

  it('a golden pattern never silently infers or suppresses a reshape decision', () => {
    const root = mk();
    const files = projects(root);
    const golden = path.join(root, '.ark/golden-pattern.json');
    fs.mkdirSync(path.dirname(golden), { recursive: true });
    fs.writeFileSync(
      golden,
      JSON.stringify({
        name: 'thin-shell-handlers-data',
        norm: 'Routes, handlers, and repositories remain separate role directories.',
        newCodeHome: 'src/lib/repositories/',
      })
    );
    const advisories = computeDoctorAdvisories(root, config, coverage, [], files, undefined);
    expect(advisories.physicalCohesion.reshapeDecisions.currentCount).toBe(0);
    expect(advisories.physicalCohesion.reshapePilot.nextPilot).not.toBeNull();
  });

  it('an invalid sidecar is visible and suppresses nothing', () => {
    const root = mk();
    const files = projects(root);
    const abs = path.join(root, RESHAPE_DECISIONS_PATH);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '{ nope');
    const advisories = computeDoctorAdvisories(root, config, coverage, [], files, undefined);
    expect(advisories.physicalCohesion.reshapeDecisions.decisionFile.invalid).toBe(true);
    expect(advisories.physicalCohesion.reshapePilot.nextPilot).not.toBeNull();
    expect(renderAdvisorySections(advisories, String)).toContain('is ignored');
  });
});
