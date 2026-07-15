/**
 * W02 — governance-weight descriptive evidence.
 *
 * Raw counts and ratios with FIXED comparative wording — explicitly not a
 * composite score, not a ranking, and never a gate input. The field-observed
 * failure modes: a small project copying a heavyweight contract (heavy), and a
 * large tree with almost no boundaries (light).
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  computeGovernanceWeight,
  formatContractHealthLines,
  summarizeContractHealth,
  GOVERNANCE_WEIGHT_NOTES,
} from '../../../bin/lib/contract-smells.mjs';
import { runDoctor } from '../../../bin/lib/doctor-plan.mjs';

const temps: string[] = [];

function mk(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-governance-weight-'));
  temps.push(root);
  return root;
}

afterEach(() => {
  for (const root of temps.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function write(root: string, rel: string, body: string) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
  return abs;
}

/** Hand-built coverage: computeGovernanceWeight only reads governed counts and layer rows. */
function coverageOf(classifiedFiles: number, layerFiles: number[]) {
  return {
    governed: { classifiedFiles, totalFiles: classifiedFiles, percent: 100 },
    layers: layerFiles.map((files, i) => ({ name: `L${i}`, patterns: [], files })),
  };
}

function layersNamed(n: number) {
  return Array.from({ length: n }, (_, i) => ({ name: `L${i}`, patterns: [`src/l${i}/**`] }));
}

function denyRules(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    from: `L${i % 10}`,
    to: `L${(i + 1) % 10}`,
    allowed: false,
  }));
}

describe('W02 governance weight — descriptive bands', () => {
  it('a heavyweight contract on a small tree reads heavy (field case: 10 layers / 90 rules / 228 files)', () => {
    const config = { layers: layersNamed(10), rules: denyRules(90) };
    const weight = computeGovernanceWeight(config, coverageOf(228, Array(10).fill(22)));
    expect(weight.weight).toBe('heavy');
    expect(weight.declaredLayers).toBe(10);
    expect(weight.rules).toBe(90);
    expect(weight.governedFiles).toBe(228);
    expect(weight.filesPerLayer).toBeCloseTo(22.8, 1);
    expect(weight.notAScore).toBe(true);
    // The wording never tells a user to delete layers, only to justify new ones.
    expect(weight.note).toContain('Do not delete');
    expect(weight.note.toLowerCase()).not.toContain('score:');
  });

  it('a large tree with almost no boundaries reads light', () => {
    const config = { layers: layersNamed(2), rules: [{ from: 'L0', to: 'L1', allowed: false }] };
    const weight = computeGovernanceWeight(config, coverageOf(300, [200, 100]));
    expect(weight.weight).toBe('light');
    expect(weight.note).toBe(GOVERNANCE_WEIGHT_NOTES.light);
  });

  it('a proportionate contract reads typical (this repo shape: 4 layers / 10 rules / ~125 files)', () => {
    const config = { layers: layersNamed(4), rules: denyRules(10) };
    const weight = computeGovernanceWeight(config, coverageOf(125, [40, 40, 30, 15]));
    expect(weight.weight).toBe('typical');
    expect(weight.note).toBe(GOVERNANCE_WEIGHT_NOTES.typical);
  });

  it('no governed files or no layers reads unknown, never a band', () => {
    expect(computeGovernanceWeight({ layers: [], rules: [] }, coverageOf(10, [])).weight).toBe(
      'unknown'
    );
    const empty = computeGovernanceWeight(
      { layers: layersNamed(3), rules: [] },
      coverageOf(0, [0, 0, 0])
    );
    expect(empty.weight).toBe('unknown');
    expect(empty.note).toBe(GOVERNANCE_WEIGHT_NOTES.unknown);
    expect(computeGovernanceWeight({ layers: layersNamed(3), rules: [] }, null).weight).toBe(
      'unknown'
    );
    // Coverage object without governed counts, and hostile counts, also read unknown.
    expect(computeGovernanceWeight({ layers: layersNamed(3), rules: [] }, {} as never).weight).toBe(
      'unknown'
    );
    expect(
      computeGovernanceWeight({ layers: layersNamed(3), rules: [] }, coverageOf(NaN, [])).weight
    ).toBe('unknown');
    expect(
      computeGovernanceWeight({ layers: layersNamed(6), rules: [] }, coverageOf(-5, [])).weight
    ).toBe('unknown');
  });

  it('bands at the exact documented thresholds, on raw ratios', () => {
    const sparse = (n: number) => [{ from: 'L0', to: 'L1', allowed: false }].slice(0, n);
    // 6 layers: 149 files → 24.83 files/layer → heavy; 150 files → 25.0 → typical.
    expect(
      computeGovernanceWeight({ layers: layersNamed(6), rules: sparse(1) }, coverageOf(149, [])).weight
    ).toBe('heavy');
    expect(
      computeGovernanceWeight({ layers: layersNamed(6), rules: sparse(1) }, coverageOf(150, [])).weight
    ).toBe('typical');
    // Rules disjunct alone (5 layers < 6): 20 rules = 4/layer over a small tree → heavy; 19 → typical.
    const denseRules = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ from: `L${i}`, to: `L${i + 1}`, allowed: false }));
    expect(
      computeGovernanceWeight({ layers: layersNamed(5), rules: denseRules(20) }, coverageOf(100, [])).weight
    ).toBe('heavy');
    expect(
      computeGovernanceWeight({ layers: layersNamed(5), rules: denseRules(19) }, coverageOf(100, [])).weight
    ).toBe('typical');
    // Dense rules on a LARGE tree never read heavy — heaviness is size-relative.
    expect(
      computeGovernanceWeight({ layers: layersNamed(3), rules: denseRules(12) }, coverageOf(100000, [])).weight
    ).toBe('typical');
    // Light boundary: 2 layers, 150 files → light; 149 → typical; 3 layers never light.
    expect(
      computeGovernanceWeight({ layers: layersNamed(2), rules: sparse(1) }, coverageOf(150, [])).weight
    ).toBe('light');
    expect(
      computeGovernanceWeight({ layers: layersNamed(2), rules: sparse(1) }, coverageOf(149, [])).weight
    ).toBe('typical');
    expect(
      computeGovernanceWeight({ layers: layersNamed(3), rules: sparse(1) }, coverageOf(300, [])).weight
    ).toBe('typical');
  });

  it('counts only well-formed rules and tolerates malformed shapes', () => {
    const weight = computeGovernanceWeight(
      {
        layers: layersNamed(3),
        rules: [null, 'x', 7, { allowed: false }, { from: 'A', to: 'B' }, { from: 'A', to: 'B', allowed: false }],
      } as never,
      coverageOf(120, [null as never, { name: 'L0', patterns: [], files: 120 }] as never)
    );
    expect(weight.rules).toBe(1);
    expect(weight.deniedEdges + weight.allowedEdges).toBe(weight.rules);
  });

  it('is facts plus a fixed note — no composite score field exists', () => {
    const config = { layers: layersNamed(10), rules: denyRules(90) };
    const weight = computeGovernanceWeight(config, coverageOf(228, Array(10).fill(22)));
    const keys = Object.keys(weight).filter((k) => k !== 'notAScore');
    expect(keys.some((k) => /score|rank|grade/i.test(k))).toBe(false);
    expect(typeof weight.deniedEdges).toBe('number');
    expect(typeof weight.allowedEdges).toBe('number');
    expect(typeof weight.rulesPerLayer).toBe('number');
    expect(Object.keys(GOVERNANCE_WEIGHT_NOTES).sort()).toEqual([
      'heavy',
      'light',
      'typical',
      'unknown',
    ]);
  });
});

describe('W02 governance weight — human lines', () => {
  it('a light band alone (zero smells, valid acks) unlocks the advisory section', () => {
    const weight = computeGovernanceWeight(
      { layers: layersNamed(2), rules: [{ from: 'L0', to: 'L1', allowed: false }] },
      coverageOf(300, [200, 100])
    );
    const health = {
      ...summarizeContractHealth([], { exists: false, acks: [] }, 0),
      governanceWeight: weight,
    };
    const rows = formatContractHealthLines([], health);
    expect(rows.length).toBeGreaterThan(0);
    const line = rows.find((r) => r.text.startsWith('governance weight: light'));
    expect(line).toBeDefined();
    expect(line!.mark).toBe('warn');
    expect(rows.some((r) => r.text === GOVERNANCE_WEIGHT_NOTES.light)).toBe(true);
  });
});

describe('W02 governance weight — doctor surface stays advisory', () => {
  function runDoctorCapture(root: string, config: object, relFiles: string[], asJson: boolean) {
    const files = relFiles.map((rel) => path.join(root, rel));
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    try {
      runDoctor(root, config, files, (config as { rules: object[] }).rules ?? [], [], asJson, {});
    } finally {
      console.log = orig;
    }
    return logs.join('\n');
  }

  it('doctor JSON exposes contractHealth.governanceWeight without touching the verdict', () => {
    const root = mk();
    // Heavy shape: 6 tiny layers over 12 files, dense rules.
    const layers = Array.from({ length: 6 }, (_, i) => ({
      name: `Layer${i}`,
      patterns: [`src/l${i}/**`],
    }));
    const rules = Array.from({ length: 24 }, (_, i) => ({
      from: `Layer${i % 6}`,
      to: `Layer${(i + 1) % 6}`,
      allowed: false,
    }));
    const relFiles: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      for (let j = 0; j < 2; j += 1) {
        relFiles.push(`src/l${i}/f${j}.ts`);
        write(root, `src/l${i}/f${j}.ts`, 'export const x = 1;\n');
      }
    }
    const payload = JSON.parse(runDoctorCapture(root, { include: ['src'], layers, rules }, relFiles, true));
    const weight = payload.doctor.contractHealth.governanceWeight;
    expect(weight).toBeDefined();
    expect(weight.weight).toBe('heavy');
    expect(weight.notAScore).toBe(true);
    expect(payload.doctor.designFitness.designWeak).toBe(false);
    // Human output carries the fixed wording for a noteworthy band.
    const human = runDoctorCapture(root, { include: ['src'], layers, rules }, relFiles, false);
    expect(human).toContain('governance weight: heavy');
    expect(human).toContain('Do not delete');
  });

  it('a typical band prints no governance-weight line (doctor stays quiet)', () => {
    const root = mk();
    const layers = [
      { name: 'DomainModel', patterns: ['src/domain/**'] },
      { name: 'Tooling', patterns: ['src/tools/**'] },
      { name: 'Adapters', patterns: ['src/adapters/**'] },
    ];
    const rules = [
      { from: 'DomainModel', to: 'Tooling', allowed: false },
      { from: 'Adapters', to: 'DomainModel', allowed: true },
    ];
    const relFiles: string[] = [];
    for (const dir of ['domain', 'tools', 'adapters']) {
      for (let j = 0; j < 40; j += 1) {
        relFiles.push(`src/${dir}/f${j}.ts`);
        write(root, `src/${dir}/f${j}.ts`, 'export const x = 1;\n');
      }
    }
    const human = runDoctorCapture(root, { include: ['src'], layers, rules }, relFiles, false);
    expect(human).not.toContain('governance weight:');
    const payload = JSON.parse(runDoctorCapture(root, { include: ['src'], layers, rules }, relFiles, true));
    expect(payload.doctor.contractHealth.governanceWeight.weight).toBe('typical');
  });
});
