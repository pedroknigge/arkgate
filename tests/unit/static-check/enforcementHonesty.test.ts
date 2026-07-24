/**
 * Product honesty helpers: weak coverage, dirty baseline, soft write hosts,
 * design-weak coaching flags, ambient idle status, graph-blind template edges.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import {
  buildBaselineHonesty,
  buildCoverageHonesty,
  buildWritePathHonesty,
  computeDoctorEnforcementHonesty,
} from '../../../bin/lib/enforcement-honesty.mjs';
import {
  classifyUnresolvedDependencyArg,
  detectGraphBlindSpots,
  unresolvedDependencyArg,
} from '../../../bin/lib/graph-blind.mjs';
import {
  ambientSensorStatus,
  summarizeAmbientState,
} from '../../../bin/lib/ambient-state.mjs';
import {
  buildPostGreenNextAction,
  DESIGN_WEAK_HONESTY_FLAGS,
  POST_GREEN_PLACEMENT_COACHING,
} from '../../../bin/lib/post-green-path.mjs';
import { summarizePilotLoop } from '../../../bin/lib/pilot-loop.mjs';
import { buildRemediationPlan } from '../../../bin/lib/doctor-plan.mjs';
import { HOST_SUPPORT_HOSTS, HOST_SUPPORT_MATRIX } from '../../../bin/lib/host-support-matrix.mjs';

const temps: string[] = [];

function mk(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-honesty-'));
  temps.push(root);
  return root;
}

afterEach(() => {
  for (const root of temps.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('buildCoverageHonesty', () => {
  it('marks empty scope and weak coverage as worse than no gate', () => {
    expect(buildCoverageHonesty({ emptyScope: true, totalFiles: 0 })).toMatchObject({
      status: 'empty-scope',
      worseThanNoGate: true,
      greenIsNotEnforcement: true,
      totalFiles: 0,
    });
    // emptyScope wins even if caller passes a non-zero total.
    expect(buildCoverageHonesty({ emptyScope: true, totalFiles: 12, percent: 50 })).toMatchObject({
      status: 'empty-scope',
      totalFiles: 0,
      governedPercent: 0,
    });
    expect(buildCoverageHonesty({ percent: 40, totalFiles: 100 })).toMatchObject({
      status: 'weak',
      worseThanNoGate: true,
      governedPercent: 40,
    });
    expect(buildCoverageHonesty({ percent: 40, totalFiles: 100 }).message).toMatch(
      /worse than no gate/i
    );
  });

  it('boundaries: 49 weak, 50 partial, 79 partial, 80 strong (still not whole-tree)', () => {
    expect(buildCoverageHonesty({ percent: 49, totalFiles: 100 }).status).toBe('weak');
    expect(buildCoverageHonesty({ percent: 50, totalFiles: 100 })).toMatchObject({
      status: 'partial',
      greenIsNotEnforcement: true,
    });
    expect(buildCoverageHonesty({ percent: 79, totalFiles: 100 }).status).toBe('partial');
    expect(buildCoverageHonesty({ percent: 80, totalFiles: 100 })).toMatchObject({
      status: 'strong',
      greenIsNotEnforcement: true,
      wholeTreeGoverned: false,
    });
    expect(buildCoverageHonesty({ percent: 100, totalFiles: 100 })).toMatchObject({
      status: 'strong',
      greenIsNotEnforcement: false,
      wholeTreeGoverned: true,
    });
  });

  it('partial coverage is not enforcement; strong below 100 still greenIsNotEnforcement', () => {
    expect(buildCoverageHonesty({ percent: 65, totalFiles: 200 })).toMatchObject({
      status: 'partial',
      greenIsNotEnforcement: true,
      worseThanNoGate: false,
    });
    expect(buildCoverageHonesty({ percent: 90, totalFiles: 200 })).toMatchObject({
      status: 'strong',
      greenIsNotEnforcement: true,
      wholeTreeGoverned: false,
    });
  });
});

describe('buildBaselineHonesty', () => {
  it.each([
    {
      name: 'frozen >= 10 green-via-freeze',
      input: { exists: true, frozenKeys: 12, activeViolations: 0, suppressed: 12, totalViolations: 12 },
      dirty: true,
    },
    {
      name: 'frozen >= 5 with suppressions',
      input: { exists: true, frozenKeys: 5, activeViolations: 0, suppressed: 5, totalViolations: 5 },
      dirty: true,
    },
    {
      name: 'suppressShare >= 0.5 with small frozen',
      input: { exists: true, frozenKeys: 3, activeViolations: 0, suppressed: 3, totalViolations: 4 },
      dirty: true,
    },
    {
      name: 'frozen 9 no suppress not dirty',
      input: { exists: true, frozenKeys: 9, activeViolations: 0, suppressed: 0, totalViolations: 0 },
      dirty: false,
    },
    {
      name: 'frozen >= 10 but active > 0 not dirty',
      input: { exists: true, frozenKeys: 12, activeViolations: 2, suppressed: 10, totalViolations: 12 },
      dirty: false,
    },
    {
      name: 'small freeze with active violations',
      input: { exists: true, frozenKeys: 2, activeViolations: 1, suppressed: 2, totalViolations: 3 },
      dirty: false,
    },
  ])('$name', ({ input, dirty }) => {
    const result = buildBaselineHonesty(input);
    expect(result.dirtyBaselineRisk).toBe(dirty);
    if (dirty) expect(result.status).toBe('dirty-freeze');
  });

  it('absent vs missing-with-debt', () => {
    expect(buildBaselineHonesty({ exists: false, totalViolations: 0 }).status).toBe('absent');
    expect(buildBaselineHonesty({ exists: false, totalViolations: 4 }).status).toBe(
      'missing-with-debt'
    );
  });
});

describe('buildWritePathHonesty', () => {
  it('soft hosts never claim hard write; hard hosts stay unverified without proof', () => {
    const cursor = buildWritePathHonesty('cursor', false);
    expect(cursor.softWriteHost).toBe(true);
    expect(cursor.hardWriteActive).toBe(false);
    expect(cursor.message).toMatch(/advisory/i);
    expect(cursor.hardMergeBoundary).toMatch(/strict-merge/);

    const codex = buildWritePathHonesty('codex', true);
    expect(codex.softWriteHost).toBe(true);
    // Soft hosts never become hard even if a flag is set.
    expect(codex.hardWriteActive).toBe(false);

    const claude = buildWritePathHonesty('claude', false);
    expect(claude.hardWriteSupported).toBe(true);
    expect(claude.hardWriteUnverified).toBe(true);
    expect(claude.message).toMatch(/unverified|Required CI/i);
  });

  it('soft/hard classification matches HOST_SUPPORT_MATRIX hard-write flags', () => {
    for (const host of HOST_SUPPORT_HOSTS) {
      const hard = HOST_SUPPORT_MATRIX[host].capabilities['hard-write'] === true;
      const honesty = buildWritePathHonesty(host, false);
      expect(honesty.softWriteHost).toBe(!hard);
      expect(honesty.hardWriteSupported).toBe(hard);
    }
  });

  it('computeDoctorEnforcementHonesty bundles all three surfaces', () => {
    const bundle = computeDoctorEnforcementHonesty({
      governedPercent: 35,
      totalFiles: 80,
      emptyScope: false,
      baselineExists: true,
      frozenKeys: 15,
      activeViolations: 0,
      suppressed: 15,
      totalViolations: 15,
      activeHost: 'opencode',
      hardWriteActive: false,
    });
    expect(bundle.coverageHonesty.worseThanNoGate).toBe(true);
    expect(bundle.baselineHonesty.dirtyBaselineRisk).toBe(true);
    expect(bundle.writePathHonesty.softWriteHost).toBe(true);
  });
});

describe('post-validity coaching flags', () => {
  it('design-weak post-green path forbids multi-pilot auto-apply and coaches placement', () => {
    const action = buildPostGreenNextAction({ designWeak: true })!;
    expect(action.placementCoaching).toBe(POST_GREEN_PLACEMENT_COACHING);
    expect(action.multiPilotBatchForbidden).toBe(true);
    expect(action.autoApplyForbidden).toBe(true);
    expect(action.autoApplyPlanBForbidden).toBe(true);
    expect(action.healthyFinishedForbidden).toBe(true);
    expect(DESIGN_WEAK_HONESTY_FLAGS.autoApplyForbidden).toBe(true);
    expect(DESIGN_WEAK_HONESTY_FLAGS.autoApplyPlanBForbidden).toBe(true);
  });

  it('pilot loop queues remaining bets and emits both auto-apply aliases', () => {
    const loop = summarizePilotLoop({
      designWeak: true,
      patternBets: [
        {
          id: 'b1',
          smellId: 'god-module',
          neverMechanicalSafe: true,
          evidence: ['src/a.ts'],
          move: 'extract',
        },
        {
          id: 'b2',
          smellId: 'soft-contract',
          neverMechanicalSafe: true,
          evidence: ['src/b.ts'],
          move: 'tighten',
        },
      ],
    });
    expect(loop.active).toBe(true);
    expect(loop.oneAtATime).toBe(true);
    expect(loop.multiPilotBatchForbidden).toBe(true);
    expect(loop.autoApplyForbidden).toBe(true);
    expect(loop.autoApplyPlanBForbidden).toBe(true);
    expect(loop.queuedBets).toBe(1);
    expect(loop.queueNote).toMatch(/queued/i);
    expect(loop.instruction).toMatch(/Never silent auto-apply/i);
  });

  it('plan JSON goal carries design-weak honesty flags when coverage is honest', () => {
    const plan = buildRemediationPlan('/tmp', [], 80, 100, {
      designSmells: [
        {
          id: 'mixed-pattern-cluster',
          message: 'mixed',
          outcome: 'mixed layouts',
          evidence: ['src/features/x.ts', 'src/services/y.ts'],
        },
      ],
      config: {
        include: ['src'],
        layers: [{ name: 'App', patterns: ['src/**'] }],
        rules: [],
      },
      files: [],
    });
    expect(plan.coverageHonesty).toMatchObject({
      status: 'strong',
      greenIsNotEnforcement: true,
    });
    expect(plan.goal.designWeak).toBe(true);
    expect(plan.goal.healthyFinishedForbidden).toBe(true);
    expect(plan.goal.multiPilotBatchForbidden).toBe(true);
    expect(plan.goal.autoApplyForbidden).toBe(true);
    expect(plan.goal.autoApplyPlanBForbidden).toBe(true);
  });
});

describe('ambient sensor honesty (Y07 advisory only)', () => {
  it('idle / active statuses and parked-Y07 labels never claim blocker grade', () => {
    expect(ambientSensorStatus({ active: false })).toBe('idle');
    expect(ambientSensorStatus({ active: true, findingCount: 0 })).toBe('active-clean');
    expect(ambientSensorStatus({ active: true, findingCount: 2 })).toBe('active-findings');

    const idle = summarizeAmbientState(
      { active: false, findings: [], acknowledgedCount: 0, truncated: 0, skippedFiles: 0 },
      { exists: false, acks: [] }
    );
    expect(idle.status).toBe('idle');
    expect(idle.blockerGrade).toBe(false);
    expect(idle.strictDiagnostics).toBe('parked-Y07');
    expect(idle.note).toMatch(/Idle|parked \(Y07\)/i);

    const findings = summarizeAmbientState(
      {
        active: true,
        findings: [{ file: 'a.ts', line: 1, name: 'x', kind: 'module-let' }],
        acknowledgedCount: 0,
        truncated: 0,
        skippedFiles: 0,
      },
      { exists: false, acks: [] }
    );
    expect(findings.status).toBe('active-findings');
    expect(findings.blockerGrade).toBe(false);
  });
});

describe('graph-blind template-interpolation (Y09 advisory)', () => {

  it('defers full scan on large trees (doctor resident budget)', () => {
    const many = Array.from({ length: 2501 }, (_, i) => `/tmp/f${i}.ts`);
    const result = detectGraphBlindSpots(ts, '/tmp', many);
    expect(result.deferred).toBe(true);
    expect(result.count).toBe(0);
    expect(result.blockerGrade).toBe(false);
    expect(result.note).toMatch(/deferred/i);
  });
  it('classifies template expressions vs other non-literals', () => {
    const sf = ts.createSourceFile(
      't.ts',
      'import(`./x/${name}`);\nimport(name);\nimport("./ok");\n',
      ts.ScriptTarget.Latest,
      true
    );
    const collected: ts.Expression[] = [];
    const walk = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments[0]) collected.push(node.arguments[0]);
      }
      ts.forEachChild(node, walk);
    };
    walk(sf);
    expect(collected).toHaveLength(3);
    expect(classifyUnresolvedDependencyArg(ts, collected[0])).toBe('template-interpolation');
    expect(classifyUnresolvedDependencyArg(ts, collected[1])).toBe('non-literal');
    expect(classifyUnresolvedDependencyArg(ts, collected[2])).toBeNull();
  });

  it('unresolvedDependencyArg reads import-equals require expression', () => {
    const sf = ts.createSourceFile(
      'eq.ts',
      'import x = require(dyn);\n',
      ts.ScriptTarget.Latest,
      true
    );
    const decl = sf.statements[0] as ts.ImportEqualsDeclaration;
    const arg = unresolvedDependencyArg(ts, decl);
    expect(arg && ts.isIdentifier(arg)).toBe(true);
    expect(classifyUnresolvedDependencyArg(ts, arg)).toBe('non-literal');
  });

  it('detectGraphBlindSpots lists template-interpolation edges as advisory only', () => {
    const root = mk();
    const file = path.join(root, 'src', 'load.ts');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      'export async function load(name: string) {\n  return import(`./adapters/${name}`);\n}\n'
    );
    const result = detectGraphBlindSpots(ts, root, [file]);
    expect(result.available).toBe(true);
    expect(result.advisory).toBe(true);
    expect(result.blockerGrade).toBe(false);
    expect(result.templateInterpolationCount).toBeGreaterThanOrEqual(1);
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(result.edges[0]).toMatchObject({ reason: 'template-interpolation', kind: 'import' });
    expect(result.note).toMatch(/advisory only|incomplete/i);
  });

  it('detects import-equals non-literal require as graph-blind', () => {
    const root = mk();
    const file = path.join(root, 'src', 'eq.ts');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'import mod = require(dyn);\nexport const m = mod;\n');
    const result = detectGraphBlindSpots(ts, root, [file]);
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(result.edges.some((e) => e.reason === 'non-literal' && e.kind === 'require')).toBe(true);
  });

  it('unavailable when TypeScript host is missing', () => {
    const result = detectGraphBlindSpots(null, '/tmp', []);
    expect(result.available).toBe(false);
    expect(result.blockerGrade).toBe(false);
  });
});
