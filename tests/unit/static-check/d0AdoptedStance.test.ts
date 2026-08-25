/**
 * AL01 / D0 adopted — required GitHub --strict-merge status or explicit advisory-only ack.
 * Temp dirs only. Do not reuse Z09 / eval/adoption fixtures.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyAdopted,
  readAdoptionStance,
  githubEvidenceForCiMergeBoundary,
  ADOPTED_NOT,
  ADOPTED_ADVISORY_ACKED,
  ADOPTED_REQUIRED_MERGE,
  NOT_ADOPTED_NEXT_ACTION,
  MERGE_BOUNDARY_NOT_REQUIRED,
} from '../../../bin/lib/adoption-stance.mjs';
import { buildCiMergeBoundary } from '../../../bin/lib/ci-merge-boundary.mjs';
import {
  runDoctor,
  printDoctorCompactHuman,
  printDoctorDetailsHuman,
} from '../../../bin/lib/doctor-plan.mjs';
import { collectGovernedFiles } from '../../../bin/lib/scan-files.mjs';
import { isDoctorHealthyNothingToDo } from '../../../bin/lib/post-green-path.mjs';
import { collectDoctorNextActions } from '../../../bin/lib/doctor-next-actions.mjs';
import { buildProductHonesty, computeDoctorEnforcementHonesty } from '../../../bin/lib/enforcement-honesty.mjs';
import { buildCoverageHonesty, buildBaselineHonesty } from '../../../bin/lib/enforcement-honesty.mjs';
import { setupUsage } from '../../../bin/lib/first-run-help.mjs';
import { renderStartPreview } from '../../../bin/lib/start-preview.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARK = path.join(REPO, 'bin/ark.mjs');
const temps: string[] = [];

afterEach(() => {
  for (const t of temps.splice(0)) {
    try {
      fs.rmSync(t, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function mk(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-d0-'));
  temps.push(root);
  return root;
}

const FAIL_CLOSED_WORKFLOW = `name: ark
on: [push, pull_request]
jobs:
  ark:
    runs-on: ubuntu-latest
    steps:
      - run: npx arkgate-check --strict-merge
`;

function writeConsumerTree(root: string, extra: Record<string, string> = {}) {
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Ark Enforcement\n');
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    JSON.stringify({
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    })
  );
  fs.writeFileSync(path.join(root, 'src/domain/thing.ts'), 'export const n = 1;\n');
  fs.writeFileSync(path.join(root, '.github/workflows/ark-check.yml'), FAIL_CLOSED_WORKFLOW);
  for (const [rel, body] of Object.entries(extra)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
}

function captureDoctor(root: string, asJson: boolean, extra: Record<string, unknown> = {}) {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
  const files = collectGovernedFiles(root, config);
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  };
  try {
    runDoctor(root, config, files, config.rules, [], asJson, { completeness: 'complete', ...extra });
  } finally {
    console.log = orig;
  }
  return logs.join('\n');
}

describe('classifyAdopted', () => {
  it('is not-adopted without required status or explicit advisory-only', () => {
    expect(classifyAdopted({})).toBe(ADOPTED_NOT);
    expect(classifyAdopted({ stance: { stance: 'advisory' } })).toBe(ADOPTED_NOT);
    expect(classifyAdopted({ stance: {} })).toBe(ADOPTED_NOT);
    expect(classifyAdopted({ github: { workflowPresent: true } })).toBe(ADOPTED_NOT);
    expect(classifyAdopted({ ci: { state: 'present-but-not-required' } })).toBe(ADOPTED_NOT);
  });

  it('acks only the explicit advisory-only string', () => {
    expect(classifyAdopted({ stance: { stance: 'advisory-only' } })).toBe(ADOPTED_ADVISORY_ACKED);
    expect(classifyAdopted({ stance: 'advisory-only' })).toBe(ADOPTED_ADVISORY_ACKED);
  });

  it('is required-merge only from proven required flags', () => {
    expect(classifyAdopted({ github: { requiredStatusConfigured: true } })).toBe(ADOPTED_REQUIRED_MERGE);
    expect(classifyAdopted({ github: { arkCheckRequired: true } })).toBe(ADOPTED_REQUIRED_MERGE);
    expect(classifyAdopted({ ci: { state: 'required' } })).toBe(ADOPTED_REQUIRED_MERGE);
  });
});

describe('readAdoptionStance', () => {
  it('ignores missing or wrong stance files', () => {
    const root = mk();
    expect(readAdoptionStance(root)).toBeNull();
    fs.mkdirSync(path.join(root, '.ark'), { recursive: true });
    fs.writeFileSync(path.join(root, '.ark/adoption-stance.json'), '{}\n');
    expect(classifyAdopted({ stance: readAdoptionStance(root) })).toBe(ADOPTED_NOT);
    fs.writeFileSync(
      path.join(root, '.ark/adoption-stance.json'),
      JSON.stringify({ schemaVersion: '1.0', stance: 'advisory-only' })
    );
    expect(classifyAdopted({ stance: readAdoptionStance(root) })).toBe(ADOPTED_ADVISORY_ACKED);
  });
});

describe('ci-merge-boundary github mapping', () => {
  it('maps arkCheckRequired and fail-closed workflow to present-but-not-required without inventing required', () => {
    const payload = buildCiMergeBoundary({
      writePath: {
        capabilities: { 'merge-gate': true },
        inventory: { capabilities: { 'merge-gate': true } },
      },
      github: { requiredStatusConfigured: false },
    });
    expect(payload.ci.state).toBe('present-but-not-required');
    expect(payload.ci.workflowPresent).toBe(true);
    expect(payload.ci.requiredStatusConfigured).toBe(false);
  });

  it('maps github.arkCheckRequired true to ci.state required', () => {
    const payload = buildCiMergeBoundary({
      writePath: { capabilities: { 'merge-gate': true } },
      github: { arkCheckRequired: true },
    });
    expect(payload.ci.state).toBe('required');
  });

  it('does not take deployPath.github — uses enforcement.github / mapped ciMerge', () => {
    const mapped = githubEvidenceForCiMergeBoundary(
      {
        deployPath: { github: { requiredStatusConfigured: true } },
        enforcement: { ci: { hasArkCheckWorkflow: true }, github: null },
      },
      { enforcementState: { ciMerge: { required: false } }, capabilities: {} }
    );
    expect(mapped.requiredStatusConfigured).not.toBe(true);
    expect(mapped.workflowPresent).toBe(true);
  });
});

describe('consumer-workflow-not-required', () => {
  it('doctor does not sound like success; finished false; #1 is merge boundary', () => {
    const root = mk();
    writeConsumerTree(root);
    const jsonText = captureDoctor(root, true);
    const payload = JSON.parse(jsonText);
    expect(payload.ok).toBe(true);
    expect(payload.doctor.operatingMode).toBe('enforce');
    expect(payload.doctor.adoptionStance).toBe(ADOPTED_NOT);
    expect(payload.doctor.productHonesty.finished).toBe(false);
    expect(payload.doctor.productHonesty.reasonIds).toContain(MERGE_BOUNDARY_NOT_REQUIRED);
    expect(payload.doctor.primaryNextAction).toMatch(/required GitHub status|adoption-stance/i);
    expect(payload.doctor.ciMergeBoundary.ci.state).toBe('present-but-not-required');

    const human = captureDoctor(root, false);
    expect(human).not.toMatch(/✔ Healthy — nothing to do/);
    expect(human).not.toMatch(/gates can honestly protect/);
    expect(human).toMatch(/present-but-not-required/);
    expect(human).toMatch(/required GitHub status|adoption-stance/);
  });
});

describe('consumer-advisory-acked', () => {
  it('is advisory-only-acked, not Healthy-as-required-merge', () => {
    const root = mk();
    writeConsumerTree(root, {
      '.ark/adoption-stance.json': JSON.stringify({
        schemaVersion: '1.0',
        stance: 'advisory-only',
      }),
    });
    const jsonText = captureDoctor(root, true);
    const payload = JSON.parse(jsonText);
    expect(payload.doctor.adoptionStance).toBe(ADOPTED_ADVISORY_ACKED);
    expect(payload.doctor.productHonesty.reasonIds).not.toContain(MERGE_BOUNDARY_NOT_REQUIRED);
    expect(payload.doctor.productHonesty.headline).not.toMatch(/^Honesty clear/i);
    if (!payload.doctor.productHonesty.unfinished) {
      expect(payload.doctor.productHonesty.headline).toMatch(/advisory/i);
    }
    const human = captureDoctor(root, false);
    expect(human).not.toMatch(/✔ Healthy — nothing to do/);
    expect(human).toMatch(/advisory-only|Advisory-only|stance: "advisory-only"/i);
  });
});

describe('consumer-stance-file-wrong', () => {
  it('wrong stance string is not-adopted', () => {
    const root = mk();
    writeConsumerTree(root, {
      '.ark/adoption-stance.json': JSON.stringify({ stance: 'advisory' }),
    });
    const payload = JSON.parse(captureDoctor(root, true));
    expect(payload.doctor.adoptionStance).toBe(ADOPTED_NOT);
  });
});

describe('consumer-required-status', () => {
  it('required-merge allows Healthy only when other sensors are clear', () => {
    expect(
      isDoctorHealthyNothingToDo({ designWeak: false }, [], ADOPTED_REQUIRED_MERGE)
    ).toBe(true);
    const honesty = buildProductHonesty({
      coverageHonesty: buildCoverageHonesty({ percent: 100, totalFiles: 10 }),
      baselineHonesty: buildBaselineHonesty({ exists: true, frozenKeys: 0, activeViolations: 0 }),
      operatingMode: 'enforce',
      activeBlockingViolations: 0,
      adopted: ADOPTED_REQUIRED_MERGE,
    });
    expect(honesty.finished).toBe(true);
    expect(honesty.reasonIds).not.toContain(MERGE_BOUNDARY_NOT_REQUIRED);
  });
});

describe('github-free-cannot-require', () => {
  it('stays not-adopted until ack', () => {
    const payload = buildCiMergeBoundary({
      writePath: { capabilities: { 'merge-gate': true } },
      github: { plan: 'free', canRequire: false, requiredStatusConfigured: false },
    });
    expect(payload.ci.state).toBe('present-but-github-free-cannot-require');
    expect(classifyAdopted({ ci: payload.ci, github: { plan: 'free', canRequire: false } })).toBe(
      ADOPTED_NOT
    );
  });
});

describe('producer-mother-shaped', () => {
  it('producer gap-empty is not Adoption complete without required or ack', () => {
    const root = mk();
    writeConsumerTree(root);
    fs.mkdirSync(path.join(root, 'templates/skills'), { recursive: true });
    fs.writeFileSync(path.join(root, 'templates/skills/ark-adopt.md'), '# adopt\n');
    const human = captureDoctor(root, false);
    expect(human).not.toMatch(/✔ Healthy — nothing to do/);
    expect(human).not.toMatch(/look complete/);
    const payload = JSON.parse(captureDoctor(root, true));
    expect(payload.doctor.adoptionStance).toBe(ADOPTED_NOT);
    expect(payload.doctor.adoption.gaps.some((g: { id: string }) => g.id === 'adoption-stance-missing')).toBe(
      true
    );
  });
});

describe('start-wrap-up-no-required', () => {
  it('ark start --apply does not claim gates can honestly protect you', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'd0-start', version: '0.1.0' })
    );
    fs.writeFileSync(path.join(root, 'src/domain/a.ts'), 'export const a = 1;\n');
    const res = spawnSync(
      process.execPath,
      [ARK, 'start', '--apply', '--root', root, '--yes', '--no-install', '--force', '--tools', 'claude'],
      { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
    );
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).not.toMatch(/Done — status: ENFORCE \(gates can honestly protect you\)/);
    expect(fs.existsSync(path.join(root, '.ark/adoption-stance.json'))).toBe(false);
  });
});

describe('next actions', () => {
  it('not-adopted #1 is merge-boundary; adopted ENFORCE empty plan A stays Shape', () => {
    const notAdopted = collectDoctorNextActions({
      operatingMode: 'enforce',
      activeCount: 0,
      gatesMissing: [],
      analysisComplete: true,
      designSmells: [],
      postGreenPath: null,
      coverageHonesty: { greenIsNotEnforcement: false, worseThanNoGate: false },
      cov: { suggestions: [] },
      skillGaps: [],
      agentHomeGaps: [],
      staleRunners: [],
      adoption: { gaps: [] },
      designFitness: {},
      adopted: ADOPTED_NOT,
      root: '/tmp',
    });
    expect(notAdopted[0]).toBe(NOT_ADOPTED_NEXT_ACTION);
    const adopted = collectDoctorNextActions({
      operatingMode: 'enforce',
      activeCount: 0,
      gatesMissing: [],
      analysisComplete: true,
      designSmells: [],
      postGreenPath: null,
      coverageHonesty: { greenIsNotEnforcement: false, worseThanNoGate: false },
      cov: { suggestions: [] },
      skillGaps: [],
      agentHomeGaps: [],
      staleRunners: [],
      adoption: { gaps: [] },
      designFitness: {},
      adopted: ADOPTED_REQUIRED_MERGE,
      root: '/tmp',
    });
    expect(adopted[0]).toMatch(/\/ark-explore/i);
    expect(adopted.join('\n')).not.toMatch(/install-agent-gates/);
  });
});

describe('honesty defaults', () => {
  it('computeDoctorEnforcementHonesty is unfinished without adopted', () => {
    const bundle = computeDoctorEnforcementHonesty({
      governedPercent: 100,
      totalFiles: 10,
      emptyScope: false,
      baselineExists: true,
      frozenKeys: 0,
      activeViolations: 0,
      activeBlockingViolations: 0,
      suppressed: 0,
      totalViolations: 0,
      operatingMode: 'enforce',
    });
    expect(bundle.productHonesty.finished).toBe(false);
    expect(bundle.productHonesty.reasonIds).toContain(MERGE_BOUNDARY_NOT_REQUIRED);
  });
});

describe('AL03 empty-stewards residual', () => {
  const coverage = () => buildCoverageHonesty({ percent: 100, totalFiles: 10 });
  const baseline = () =>
    buildBaselineHonesty({ exists: true, frozenKeys: 0, activeViolations: 0 });

  it('Healthy is false once a steward next-action is present', () => {
    expect(isDoctorHealthyNothingToDo({ designWeak: false }, [], ADOPTED_REQUIRED_MERGE)).toBe(
      true
    );
    expect(
      isDoctorHealthyNothingToDo(
        { designWeak: false },
        ['/ark-adopt (ask, then update stewards[] — do not invent names)'],
        ADOPTED_REQUIRED_MERGE
      )
    ).toBe(false);
  });

  it('ENFORCE + empty-stewards is unfinished; listed stewards stay finished', () => {
    const empty = buildProductHonesty({
      coverageHonesty: coverage(),
      baselineHonesty: baseline(),
      operatingMode: 'enforce',
      activeBlockingViolations: 0,
      adopted: ADOPTED_REQUIRED_MERGE,
      emptyStewards: true,
    });
    expect(empty.unfinished).toBe(true);
    expect(empty.finished).toBe(false);
    expect(empty.reasonIds).toContain('empty-stewards');
    expect(empty.headline).toMatch(/Not finished/i);

    const listed = buildProductHonesty({
      coverageHonesty: coverage(),
      baselineHonesty: baseline(),
      operatingMode: 'enforce',
      activeBlockingViolations: 0,
      adopted: ADOPTED_REQUIRED_MERGE,
      emptyStewards: false,
      stewardNudge: { needsStewards: false, emptyStewardsPastGrace: false, stewardCount: 1 },
    });
    expect(listed.finished).toBe(true);
    expect(listed.reasonIds).not.toContain('empty-stewards');
  });

  it('computeDoctorEnforcementHonesty includes empty-stewards under ENFORCE', () => {
    const bundle = computeDoctorEnforcementHonesty({
      governedPercent: 100,
      totalFiles: 10,
      emptyScope: false,
      baselineExists: true,
      frozenKeys: 0,
      activeViolations: 0,
      activeBlockingViolations: 0,
      suppressed: 0,
      totalViolations: 0,
      operatingMode: 'enforce',
      adopted: ADOPTED_REQUIRED_MERGE,
      emptyStewards: true,
    });
    expect(bundle.productHonesty.unfinished).toBe(true);
    expect(bundle.productHonesty.finished).toBe(false);
    expect(bundle.productHonesty.reasonIds).toContain('empty-stewards');
    expect(bundle.productHonesty.headline).toMatch(/Not finished/i);
  });

  it('collectDoctorNextActions includes /ark-adopt when the nudge says so', () => {
    const actions = collectDoctorNextActions({
      operatingMode: 'enforce',
      activeCount: 0,
      gatesMissing: ['AGENTS.md'],
      analysisComplete: true,
      designSmells: [],
      postGreenPath: null,
      coverageHonesty: { greenIsNotEnforcement: false, worseThanNoGate: false },
      cov: { suggestions: [] },
      skillGaps: [],
      agentHomeGaps: [],
      staleRunners: [],
      adoption: { gaps: [] },
      designFitness: {},
      adopted: ADOPTED_REQUIRED_MERGE,
      root: '/tmp',
      stewardNudge: {
        needsStewards: true,
        emptyStewardsPastGrace: true,
        nextAction: '/ark-adopt (ask, then update stewards[] — do not invent names)',
      },
    });
    expect(actions.some((a: string) => a.includes('/ark-adopt'))).toBe(true);
  });

  it('human doctor never prints Healthy for empty stewards; JSON stays ENFORCE', () => {
    const root = mk();
    writeConsumerTree(root);
    const jsonText = captureDoctor(root, true);
    const payload = JSON.parse(jsonText);
    expect(payload.doctor.operatingMode).toBe('enforce');
    expect(payload.doctor.healthyFinishedForbidden === true || payload.doctor.stewardsUnfinished === true).toBe(
      true
    );
    const human = captureDoctor(root, false);
    expect(human).not.toMatch(/✔ Healthy — nothing to do/);
    expect(human).toMatch(/Stewards/);
  });
});

const FORBIDDEN_FIRST_RUN = [
  /session 0/i,
  /compact contract/i,
  /host router/i,
  /status light/i,
  /afterHash/i,
  /Compact setup budget/i,
  /shape-focus/i,
  /plan B/i,
  /pattern bets/i,
  /Shape door/i,
  /skill-shop/i,
  /Improvement compass/i,
  /Deep-module coach/i,
  /Product honesty/i,
  /Ambient state/i,
  /Graph blind/i,
  /design-weak/i,
  /notAScore/i,
  /\bY07\b/,
  /designSmells/,
  /residual-pilot/,
  /extraction card/i,
  /dual-plan/i,
];

const FIRST_RUN_NOUNS = [
  'architecture config',
  'leftover design work',
  'import rules',
  'next action',
  'operating mode',
  '/ark-explore',
  '/ark-autopilot',
  '/ark-adopt',
  'coverage',
  'stewards',
  'doctor',
  'coach',
  'preview',
  'host / ci',
  'host',
  'enforce',
];

function firstRunNouns(text: string): string[] {
  const lower = text.toLowerCase();
  const hits = FIRST_RUN_NOUNS.filter((noun) => lower.includes(noun.toLowerCase()));
  return hits.filter(
    (noun) => !hits.some((other) => other !== noun && other.toLowerCase().includes(noun.toLowerCase()))
  );
}

function first80(text: string): string {
  return text.split(/\r?\n/).slice(0, 80).join('\n');
}

describe('AL04 first-run noun cut', () => {
  it('start --help stays at or under 12 product nouns', () => {
    const help = setupUsage();
    for (const banned of FORBIDDEN_FIRST_RUN) {
      expect(help, String(banned)).not.toMatch(banned);
    }
    expect(firstRunNouns(help).length).toBeLessThanOrEqual(12);
    expect(help).toMatch(/illegal import/i);
    expect(help).toMatch(/doctor/);
    expect(help).not.toMatch(/\/ark-adopt/);
  });

  it('start preview hides hashes, budget, confidence, and playbook ids', () => {
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => {
      lines.push(a.map(String).join(' '));
    };
    try {
      renderStartPreview({
        analysis: { label: 'API server without UI in this repository', archetype: 'api-backend', confidence: 0.2 },
        projectedCoverage: { percent: 100, classifiedFiles: 10, totalFiles: 10 },
        setupBudget: { files: 2, gateFiles: 2, arkrulesFiles: 0, bytes: 100, maxFiles: 8, maxBytes: 32768, ok: true },
        changes: [{ action: 'create', path: 'ark.config.json', afterHash: 'sha256:abc' }],
        commands: ['npx ark-check --init', 'npx ark-check --install-agent-gates --compact --tools grok'],
        hostGuarantees: ['shared CI merge gate will be installed', 'apply writes the exact bytes identified by each afterHash'],
        unresolvedDecisions: [],
      });
    } finally {
      console.log = orig;
    }
    const preview = lines.join('\n');
    for (const banned of FORBIDDEN_FIRST_RUN) {
      expect(preview, String(banned)).not.toMatch(banned);
    }
    expect(preview).toContain('Your project looks like: API server without UI in this repository.');
    expect(preview).not.toMatch(/api-backend|confidence 0\.2/);
    expect(preview).not.toContain('--install-agent-gates');
    expect(preview).not.toContain('sha256:abc');
    expect(firstRunNouns(preview).length).toBeLessThanOrEqual(12);
  });

  it('doctor first 80 lines stay at or under 12 product nouns', () => {
    const root = mk();
    writeConsumerTree(root);
    const human = captureDoctor(root, false);
    const screen = human.split(/Details/)[0] ?? first80(human);
    const head = first80(screen);
    for (const banned of FORBIDDEN_FIRST_RUN) {
      expect(head, String(banned)).not.toMatch(banned);
    }
    expect(head).not.toMatch(/Improvement compass|Deep-module coach|Product honesty/i);
    expect(head).not.toMatch(/\bDetails\b/);
    expect(human).toMatch(/More: --doctor --all/);
    const json = JSON.parse(captureDoctor(root, true));
    expect(json.doctor.improvementCompass).toBeDefined();
    expect(json.doctor.deepModuleCoach).toBeDefined();
    expect(firstRunNouns(head).length).toBeLessThanOrEqual(12);
  });

  it('doctor --all prints Details after the compact first screen', () => {
    const root = mk();
    writeConsumerTree(root);
    const full = captureDoctor(root, false, { all: true });
    expect(full).toMatch(/Details/);
    expect(full).toMatch(/Write path \(agent\)/);
  });

  it('incomplete analysis honesty stays on the compact first screen', () => {
    const root = mk();
    writeConsumerTree(root);
    const human = captureDoctor(root, false, { completeness: 'unavailable' });
    expect(human).toMatch(/Analysis unavailable|not verified until analysis is complete/i);
    expect(human).toMatch(/More: --doctor --all/);
    expect(human).not.toMatch(/\bDetails\b/);
  });
});

const identityColor = {
  green: (s: string) => s,
  yellow: (s: string) => s,
  red: (s: string) => s,
  dim: (s: string) => s,
  bold: (s: string) => s,
};

function capturePrint(fn: (view: Record<string, unknown>) => void, view: Record<string, unknown>) {
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  };
  try {
    fn(view);
  } finally {
    console.log = orig;
  }
  return logs.join('\n');
}

function compactView(over: Record<string, unknown> = {}) {
  return {
    root: process.cwd(),
    analysisComplete: true,
    completeness: 'complete',
    doctorAdvisories: { parseHealth: { affectedFiles: 0 }, stewardNudge: null },
    operatingMode: 'enforce',
    designFitness: { designWeak: false, label: 'ok' },
    adopted: 'required-merge',
    stewardUnfinished: false,
    emptyScope: false,
    uniqueActions: ['keep CI'],
    ciMergeBoundary: { ci: { state: 'required' } },
    cov: { governed: { percent: 90, classifiedFiles: 9, totalFiles: 10 } },
    writePath: { gap: null, activeHost: 'grok' },
    writePathHonesty: {},
    gatesMissing: [],
    violations: [],
    color: identityColor,
    ...over,
  };
}

function detailsView(over: Record<string, unknown> = {}) {
  return compactView({
    options: {},
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
    cov: {
      governed: { percent: 90, classifiedFiles: 9, totalFiles: 10 },
      suggestions: [],
      emptyLayers: [],
      layersWithoutRules: [],
    },
    adoption: { gaps: [], originReport: {} },
    writePath: {
      gap: null,
      activeHost: 'grok',
      supportSummary: 'local',
      capabilities: {},
      mode: 'none',
      enforcementState: { localWrite: {}, advisoryMcp: {}, ciMerge: {} },
      support: { capabilities: {} },
    },
    ...over,
  });
}

describe('AL06 independently invocable human doctor screens', () => {
  it('printDoctorCompactHuman is callable without Details and keeps thin-coverage honesty', () => {
    const out = capturePrint(
      printDoctorCompactHuman,
      compactView({
        cov: { governed: { percent: 20, classifiedFiles: 1, totalFiles: 5 } },
        violations: [],
        analysisComplete: true,
      })
    );
    expect(out).toMatch(/More: --doctor --all/);
    expect(out).toMatch(/coverage is still thin|not yet honest enforcement/i);
    expect(out).not.toMatch(/\bDetails\b/);
    expect(out).not.toMatch(/Write path \(agent\)/);
  });

  it('printDoctorCompactHuman keeps incomplete-analysis honesty off the Details encyclopedia', () => {
    const out = capturePrint(
      printDoctorCompactHuman,
      compactView({
        analysisComplete: false,
        completeness: 'unavailable',
        violations: [],
      })
    );
    expect(out).toMatch(/Analysis unavailable|not verified until analysis is complete/i);
    expect(out).toMatch(/More: --doctor --all/);
    expect(out).not.toMatch(/\bDetails\b/);
  });

  it('printDoctorDetailsHuman is callable alone and prints Details', () => {
    const out = capturePrint(printDoctorDetailsHuman, detailsView());
    expect(out).toMatch(/\bDetails\b/);
    expect(out).toMatch(/Write path \(agent\)/);
    expect(out).not.toMatch(/More: --doctor --all/);
  });
});
