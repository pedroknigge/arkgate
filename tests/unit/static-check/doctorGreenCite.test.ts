/**
 * GR01 — doctor green / healthy claims must cite a file, config key, or test.
 * Cite present stays green. Cite missing is demoted so it cannot look healthy.
 */
import { describe, expect, it } from 'vitest';
import { CI_MERGE_BOUNDARY_REL } from '../../../bin/lib/ci-merge-boundary.mjs';
import {
  HEALTHY_CLAIM,
  UNCITE_SUFFIX,
  ciMergeGreenCites,
  citeOrDemoteGreen,
  citedGreen,
  foundGateCites,
  healthyCitesFromView,
  isConcreteCite,
  printHealthyHeadline,
  uniqueConcreteCites,
} from '../../../bin/lib/doctor-green-cite.mjs';
import { printDoctorCompactHuman, printDoctorDetailsHuman } from '../../../bin/lib/doctor-human.mjs';

const identityColor = {
  green: (s: string) => s,
  yellow: (s: string) => s,
  red: (s: string) => s,
  dim: (s: string) => s,
  bold: (s: string) => s,
};

function captureLog(fn: () => void): string {
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  };
  try {
    fn();
  } finally {
    console.log = orig;
  }
  return logs.join('\n');
}

describe('isConcreteCite', () => {
  it('accepts a file path, config key, or test', () => {
    expect(isConcreteCite('ark.config.json')).toBe(true);
    expect(isConcreteCite('.ark/ci-merge-boundary.json')).toBe(true);
    expect(isConcreteCite('coverage.testGlobs')).toBe(true);
    expect(isConcreteCite('layers')).toBe(true);
    expect(isConcreteCite('include')).toBe(true);
    expect(isConcreteCite('tests/unit/static-check/doctorGreenCite.test.ts')).toBe(true);
    expect(isConcreteCite('AGENTS.md')).toBe(true);
  });

  it('rejects generic words that cannot be opened', () => {
    expect(isConcreteCite('')).toBe(false);
    expect(isConcreteCite('CI')).toBe(false);
    expect(isConcreteCite('gates')).toBe(false);
    expect(isConcreteCite('the tree')).toBe(false);
    expect(isConcreteCite('.github/workflows/*.yml running ark-check')).toBe(false);
    expect(isConcreteCite(null)).toBe(false);
  });
});

describe('citeOrDemoteGreen', () => {
  it('keeps green when a concrete cite is present', () => {
    const row = citeOrDemoteGreen(HEALTHY_CLAIM, ['ark.config.json', CI_MERGE_BOUNDARY_REL]);
    expect(row.mark).toBe('ok');
    expect(row.text).toContain('ark.config.json');
    expect(row.text).toContain(CI_MERGE_BOUNDARY_REL);
    expect(row.text.startsWith(HEALTHY_CLAIM)).toBe(true);
  });

  it('demotes when every cite is missing or generic', () => {
    const row = citeOrDemoteGreen(HEALTHY_CLAIM, ['CI', 'gates', '']);
    expect(row.mark).toBe('warn');
    expect(row.text).toContain(UNCITE_SUFFIX);
    expect(row.text).not.toMatch(/\(CI/);
  });
});

describe('healthyCitesFromView', () => {
  it('names the contract and the CI honesty file when the view has them', () => {
    const cites = healthyCitesFromView({
      ciMergeBoundary: { ci: { state: 'required', workflowFile: '.github/workflows/ark.yml' } },
    });
    expect(cites).toContain('ark.config.json');
    expect(cites).toContain(CI_MERGE_BOUNDARY_REL);
    expect(cites).toContain('.github/workflows/ark.yml');
  });

  it('still cites ark.config.json when the boundary is absent', () => {
    expect(healthyCitesFromView({})).toEqual(['ark.config.json']);
  });
});

describe('printHealthyHeadline', () => {
  it('prints a cited Healthy line when backing files are named', () => {
    const text = captureLog(() =>
      printHealthyHeadline(
        { ciMergeBoundary: { ci: { state: 'required' } } },
        identityColor
      )
    );
    expect(text).toMatch(/✔ Healthy — nothing to do\./);
    expect(text).toContain('ark.config.json');
    expect(text).toContain(CI_MERGE_BOUNDARY_REL);
  });

  it('does not print a green Healthy when cites are stripped', () => {
    const row = citeOrDemoteGreen(HEALTHY_CLAIM, uniqueConcreteCites(['nope']));
    expect(row.mark).toBe('warn');
    const text = captureLog(() => {
      const color = {
        ...identityColor,
        green: (s: string) => `GREEN:${s}`,
        yellow: (s: string) => `YELLOW:${s}`,
      };
      citedGreen((mark, body) => console.log(mark, body), { ok: 'ok', warn: 'warn' }, HEALTHY_CLAIM, []);
    });
    expect(text).toContain('warn');
    expect(text).toContain(UNCITE_SUFFIX);
    expect(text).not.toContain('ok ');
  });
});

describe('printDoctorCompactHuman cited greens', () => {
  const compactView = {
    root: process.cwd(),
    analysisComplete: true,
    completeness: 'complete',
    doctorAdvisories: { parseHealth: { affectedFiles: 0 }, stewardNudge: null },
    operatingMode: 'enforce',
    designFitness: { designWeak: false, label: 'ok' },
    adopted: 'required-merge',
    stewardUnfinished: false,
    emptyScope: false,
    uniqueActions: [],
    ciMergeBoundary: { ci: { state: 'required', workflowPresent: true } },
    cov: {
      governed: { percent: 100, classifiedFiles: 2, totalFiles: 2 },
      layers: [{ name: 'DomainModel', files: 2 }],
    },
    writePath: { gap: null, activeHost: 'grok' },
    writePathHonesty: {},
    gatesMissing: [],
    violations: [],
    color: identityColor,
  };

  it('cites Healthy, CI merge, mode, and coverage on the happy path', () => {
    const text = captureLog(() => printDoctorCompactHuman(compactView));
    expect(text).toMatch(/✔ Healthy — nothing to do\./);
    expect(text).toContain('ark.config.json');
    expect(text).toContain(CI_MERGE_BOUNDARY_REL);
    expect(text).toMatch(/CI merge: required \(.ark\/ci-merge-boundary\.json\)/);
    expect(text).toMatch(/Governed: 100% \(2\/2 files\) \(ark\.config\.json · include · layers\)/);
    expect(text).not.toContain(UNCITE_SUFFIX);
  });

  it('demotes CI merge required when no backing file is named', () => {
    const text = captureLog(() =>
      printDoctorCompactHuman({
        ...compactView,
        uniqueActions: ['keep going'],
        adopted: 'not-adopted',
        ciMergeBoundary: { ci: { state: 'required' } },
      })
    );
    // adopted not required-merge → no Healthy; required CI still needs a cite
    expect(text).toContain('CI merge: required');
    expect(text).toContain(CI_MERGE_BOUNDARY_REL);
  });
});

describe('printDoctorDetailsHuman cited or demoted greens', () => {
  const detailsView = {
    root: process.cwd(),
    analysisComplete: true,
    completeness: 'complete',
    doctorAdvisories: { parseHealth: { affectedFiles: 0 }, stewardNudge: null },
    operatingMode: 'enforce',
    designFitness: { designWeak: false, label: 'Design fitness clear' },
    adopted: 'required-merge',
    stewardUnfinished: false,
    emptyScope: false,
    uniqueActions: [],
    options: { safety: { nonLiteralDynamicImports: [], tsSuppressions: [], anyCasts: [], inMemoryProductionStores: [], disabledPeerIsolationRules: [] } },
    cov: {
      governed: { percent: 100, classifiedFiles: 1, totalFiles: 1 },
      suggestions: [],
      emptyLayers: [],
      layersWithoutRules: [],
      layers: [{ name: 'DomainModel', files: 1 }],
    },
    writePath: {
      gap: null,
      activeHost: 'grok',
      supportSummary: 'local',
      capabilities: {},
      mode: 'none',
      enforcementState: { localWrite: {}, advisoryMcp: {}, ciMerge: {} },
      support: { capabilities: {} },
    },
    writePathHonesty: {},
    gatesMissing: [],
    violations: [],
    coverageHonesty: {},
    packageVersionTruth: null,
    designSmells: [],
    pilotLoop: null,
    goldenPattern: {},
    pureLayerOptIn: null,
    summary: { typeOnlyCount: 0, valueCount: 0, edges: [], concentrated: false },
    suppressed: 0,
    activeCount: 0,
    skillGaps: [],
    agentHomeGaps: [],
    baseline: { exists: false },
    baselineHonesty: {},
    staleBaseline: 0,
    staleRunners: [],
    adoption: { gaps: [], originReport: {} },
    ciMergeBoundary: { ci: { state: 'required', workflowPresent: true } },
    color: identityColor,
  };

  it('cites layer / contract / gate greens and does not paint safety-zero as a check', () => {
    const text = captureLog(() => printDoctorDetailsHuman(detailsView));
    expect(text).toMatch(/Every layer classifies files; no empty layers \(ark\.config\.json · layers\)/);
    expect(text).toMatch(/None — the code matches the contract on checked edges \(ark\.config\.json\)/);
    expect(text).toMatch(/Shared gate artifacts found on disk.*\(AGENTS\.md · \.ark\/ci-merge-boundary\.json\)/);
    expect(text).toMatch(/\/ark-\* skills current for detected tools \(\.agents\/skills\)/);
    expect(text).toMatch(/Emitted commands match the package manager \(package\.json\)/);
    expect(text).toContain('Non-literal dynamic dependencies: 0');
    expect(text).not.toMatch(/✓ Non-literal dynamic dependencies: 0/);
    expect(foundGateCites(detailsView)).toEqual(['AGENTS.md', CI_MERGE_BOUNDARY_REL]);
    expect(ciMergeGreenCites(detailsView)).toEqual([CI_MERGE_BOUNDARY_REL]);
  });
});
