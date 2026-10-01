import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyEdit,
  buildInvariantProbeArtifact,
  canaryEdits,
  foldVerdict,
  INVARIANT_PROBE_BASELINE_STATUSES,
  INVARIANT_PROBE_OPERATOR_SET,
  INVARIANT_PROBE_OPERATORS,
  INVARIANT_PROBE_REASONS,
  INVARIANT_PROBE_RUN_STATUSES,
  INVARIANT_PROBE_VERDICTS,
  invariantProbeIdentity,
  mutantsForSite,
  planMutants,
  probeExitCode,
  probeRefusalReason,
  probeRowLine,
  probeRowStaleness,
  probeStatusLabel,
  readInvariantProbeArtifact,
  summarizeProbeForCoverage,
  type InvariantProbeRow,
  type ProbeSite,
} from '../../../src/domain/invariantProbe';
import { ARK_INVARIANT_PROBE_SCHEMA } from '../../../src/domain/invariantProbeSchema';
import {
  canPromoteInvariant,
  testFilesNamingInvariant,
  type InvariantCoverageEvidence,
} from '../../../src/domain/invariantCoverage';

const REPO_ROOT = path.resolve(__dirname, '../../..');

const SOURCE = [
  'export function assertWindow(days) {',
  '  if (days > 30) throw new Error("closed");',
  '  return days === 0 ? true : false;',
  '}',
  '',
].join('\n');

function site(kind: ProbeSite['kind'], text: string, from = 0): ProbeSite {
  const start = SOURCE.indexOf(text, from);
  if (start < 0) throw new Error(`no ${text}`);
  const before = SOURCE.slice(0, start).split('\n');
  return {
    kind,
    start,
    end: start + text.length,
    line: before.length,
    column: before[before.length - 1]!.length + 1,
    text,
  };
}

const SITES: ProbeSite[] = [
  site('guard', 'days > 30'),
  site('throw', 'throw new Error("closed");'),
  site('comparison', '>'),
  site('numeric', '30'),
  site('comparison', '==='),
  site('boolean', 'true', SOURCE.indexOf('?')),
];

function row(overrides: Partial<InvariantProbeRow> = {}): InvariantProbeRow {
  return {
    invariantId: 'INV-WINDOW',
    invariantHash: 'sha256:inv',
    layer: 'Domain',
    sourceFile: 'arkrules/Domain.json',
    mode: 'advisory',
    symbol: 'assertWindow',
    symbolFile: 'src/window.mjs',
    symbolFileHash: 'sha256:sym',
    tests: [{ path: 'test/window.test.mjs', contentHash: 'sha256:test' }],
    baseline: { status: 'green', durationMs: 10 },
    wiring: { load: 'killed', reach: 'killed' },
    mutants: [
      {
        id: 'negate-guard@2:7',
        operator: 'negate-guard',
        line: 2,
        column: 7,
        original: 'days > 30',
        replacement: '!(days > 30)',
        status: 'killed',
        durationMs: 5,
      },
    ],
    verdict: 'killed',
    reason: 'all-killed',
    ...overrides,
  };
}

function coverage(overrides: Partial<InvariantCoverageEvidence> = {}): InvariantCoverageEvidence {
  return {
    invariantId: 'INV-WINDOW',
    layer: 'Domain',
    sourceFile: 'arkrules/Domain.json',
    mode: 'advisory',
    covered: true,
    evidence: ['test-title'],
    partial: false,
    description: 'window',
    coverageRootsDeclared: true,
    ...overrides,
  };
}

describe('invariant probe operators (ADR 0039 D5)', () => {
  it('maps each site kind to its closed operators', () => {
    expect(mutantsForSite(SITES[0]!).map((m) => [m.operator, m.replacement])).toEqual([
      ['negate-guard', '!(days > 30)'],
    ]);
    expect(mutantsForSite(SITES[1]!).map((m) => m.replacement)).toEqual([';']);
    expect(mutantsForSite(SITES[2]!).map((m) => [m.operator, m.replacement])).toEqual([
      ['flip-comparison', '<='],
      ['boundary-shift', '>='],
    ]);
    expect(mutantsForSite(SITES[3]!).map((m) => m.replacement)).toEqual(['31']);
    expect(mutantsForSite(SITES[4]!).map((m) => m.replacement)).toEqual(['!==']);
    expect(mutantsForSite(SITES[5]!).map((m) => m.replacement)).toEqual(['false']);
    expect(mutantsForSite({ ...SITES[3]!, text: '0x1f' })).toEqual([]);
    expect(mutantsForSite({ ...SITES[3]!, text: '1_000' })[0]?.replacement).toBe('1001');
  });

  it('plans at most three mutants in priority order, whatever the input order', () => {
    const planned = planMutants(SITES);
    expect(planned.map((m) => m.operator)).toEqual(['negate-guard', 'drop-throw', 'flip-comparison']);
    expect(planMutants([...SITES].reverse())).toEqual(planned);
    expect(planMutants(SITES, 5).map((m) => m.operator)).toEqual([
      'negate-guard',
      'drop-throw',
      'flip-comparison',
      'boundary-shift',
      'const-shift',
    ]);
    // const-shift takes the first literal by position (30), not the boolean.
    expect(planMutants(SITES, 5)[4]?.original).toBe('30');
    expect(planMutants([])).toEqual([]);
    expect(planned[0]?.id).toBe('negate-guard@2:7');
  });

  it('applyEdit splices text and round-trips', () => {
    for (const mutant of planMutants(SITES, 5)) {
      const mutated = applyEdit(SOURCE, mutant);
      expect(mutated).not.toBe(SOURCE);
      const back = applyEdit(mutated, {
        start: mutant.start,
        end: mutant.start + mutant.replacement.length,
        replacement: mutant.original,
      });
      expect(back).toBe(SOURCE);
    }
  });

  it('builds load and reach canaries for each body shape', () => {
    const insertAt = SOURCE.indexOf('{') + 1;
    const block = canaryEdits(SOURCE, { kind: 'block', insertAt });
    expect(applyEdit(SOURCE, block.load).startsWith("throw new Error('ARK_PROBE_LOAD');\n")).toBe(true);
    expect(applyEdit(SOURCE, block.reach)).toContain("{ throw new Error('ARK_PROBE_REACH');");
    const shebang = '#!/usr/bin/env node\nexport const x = 1;\n';
    expect(applyEdit(shebang, canaryEdits(shebang, { kind: 'block', insertAt: 0 }).load)).toBe(
      "#!/usr/bin/env node\nthrow new Error('ARK_PROBE_LOAD');\nexport const x = 1;\n"
    );
    const arrow = 'export const f = (x) => x + 1;\n';
    const exprStart = arrow.indexOf('x + 1');
    const expr = canaryEdits(arrow, { kind: 'expression', start: exprStart, end: exprStart + 5 });
    expect(applyEdit(arrow, expr.reach)).toBe(
      "export const f = (x) => { throw new Error('ARK_PROBE_REACH'); };\n"
    );
    const constant = 'export const WINDOW = 14;\n';
    const at = constant.indexOf('14');
    const init = canaryEdits(constant, { kind: 'initializer', start: at, end: at + 2 });
    expect(applyEdit(constant, init.reach)).toBe(
      "export const WINDOW = (() => { throw new Error('ARK_PROBE_REACH'); })();\n"
    );
  });
});

describe('foldVerdict truth table (ADR 0039 D4)', () => {
  const ok = { baseline: 'green', load: 'killed', reach: 'killed' } as const;
  it.each([
    [{ baseline: 'red' }, [], 'inconclusive', 'baseline-red'],
    [{ baseline: 'timeout' }, [], 'inconclusive', 'baseline-timeout'],
    [{ baseline: 'runtime-error' }, [], 'inconclusive', 'runner-error'],
    [{ baseline: 'green', load: 'survived' }, [], 'inconclusive', 'file-not-loaded'],
    [{ baseline: 'green', load: 'runtime-error' }, [], 'inconclusive', 'runner-error'],
    [{ baseline: 'green', load: 'killed', reach: 'survived' }, [], 'not-reached', 'reach-canary-survived'],
    [{ baseline: 'green', load: 'killed', reach: 'runtime-error' }, [], 'inconclusive', 'runner-error'],
    [ok, [], 'unprobeable', 'no-site'],
    [ok, [{ status: 'invalid' }], 'unprobeable', 'no-site'],
    [ok, [{ status: 'killed' }, { status: 'survived' }], 'survived', 'mutant-survived'],
    [ok, [{ status: 'killed' }, { status: 'timeout' }], 'killed', 'all-killed'],
    [ok, [{ status: 'killed' }, { status: 'runtime-error' }], 'inconclusive', 'mutant-runtime-error'],
    [ok, [{ status: 'survived' }, { status: 'runtime-error' }], 'survived', 'mutant-survived'],
    [ok, [{ status: 'invalid' }, { status: 'killed' }], 'killed', 'all-killed'],
  ] as const)('%j + %j → %s', (wiring, mutants, verdict, reason) => {
    expect(foldVerdict(wiring, mutants)).toEqual({ verdict, reason });
  });
});

describe('freshness (ADR 0039 D3)', () => {
  const current = {
    invariantHash: 'sha256:inv',
    symbolFileHash: 'sha256:sym',
    testHashes: { 'test/window.test.mjs': 'sha256:test' },
  };

  it('identity leaves mode out, so a promotion keeps the row fresh', () => {
    const advisory = invariantProbeIdentity({ id: 'INV-WINDOW', coverage: { symbol: 'assertWindow' } });
    const enforced = invariantProbeIdentity({
      id: 'INV-WINDOW',
      coverage: { symbol: 'assertWindow' },
      ...({ mode: 'enforced' } as object),
    });
    expect(enforced).toBe(advisory);
    expect(invariantProbeIdentity({ id: 'INV-WINDOW', coverage: { symbol: 'other' } })).not.toBe(advisory);
    expect(probeRowStaleness(row({ mode: 'enforced' }), current)).toEqual([]);
  });

  it('names every changed input', () => {
    expect(
      probeRowStaleness(row(), { ...current, testHashes: { 'test/window.test.mjs': 'sha256:edited' } })
    ).toEqual(['test/window.test.mjs changed']);
    expect(probeRowStaleness(row(), { ...current, symbolFileHash: 'x' })).toEqual(['src/window.mjs changed']);
    expect(probeRowStaleness(row(), { ...current, invariantHash: null })).toEqual([
      'the invariant is no longer declared',
    ]);
    expect(probeRowStaleness(row(), { ...current, invariantHash: 'other' })).toEqual(['the invariant changed']);
    expect(probeRowStaleness(row(), current, 'ip-ops@0')).toEqual(['the operator set changed']);
  });
});

describe('promotion reads a probe summary (ADR 0039 D2)', () => {
  const survived = row({
    verdict: 'survived',
    reason: 'mutant-survived',
    mutants: [{ ...row().mutants[0]!, operator: 'drop-throw', original: 'throw x;', replacement: ';', status: 'survived' }],
  });

  it('a fresh survived or not-reached summary refuses with blocker probe-survived', () => {
    const fresh = summarizeProbeForCoverage(survived, []);
    expect(fresh).toMatchObject({ verdict: 'survived', fresh: true, survivors: [{ operator: 'drop-throw', line: 2 }] });
    const gate = canPromoteInvariant(coverage({ probe: fresh }));
    expect(gate).toEqual({ ok: false, reason: probeRefusalReason('INV-WINDOW', fresh), blocker: 'probe-survived' });
    expect(gate.reason).toMatch(/do not pin it \(the throw is removed at line 2\)/);
    const unreached = summarizeProbeForCoverage(row({ verdict: 'not-reached', reason: 'reach-canary-survived', mutants: [] }), []);
    expect(canPromoteInvariant(coverage({ probe: unreached }))).toMatchObject({ ok: false, blocker: 'probe-survived' });
  });

  it('stale, killed, inconclusive, unprobeable and absent change nothing', () => {
    const today = canPromoteInvariant(coverage());
    expect(today).toEqual({ ok: true, reason: 'Invariant INV-WINDOW has coverage evidence.' });
    for (const probe of [
      summarizeProbeForCoverage(survived, ['src/window.mjs changed']),
      summarizeProbeForCoverage(row(), []),
      summarizeProbeForCoverage(row({ verdict: 'inconclusive', reason: 'baseline-red' }), []),
      summarizeProbeForCoverage(row({ verdict: 'unprobeable', reason: 'no-site' }), []),
    ]) {
      expect(canPromoteInvariant(coverage({ probe }))).toEqual(today);
    }
    // A refusal that comes first keeps its own reason and no probe blocker.
    const partial = canPromoteInvariant(coverage({ partial: true, probe: summarizeProbeForCoverage(survived, []) }));
    expect(partial.blocker).toBeUndefined();
    expect(partial.reason).toMatch(/partial/);
  });

  it('labels status lines', () => {
    expect(probeStatusLabel(undefined)).toBe('not run');
    expect(probeStatusLabel(summarizeProbeForCoverage(survived, ['x changed']))).toBe('stale');
    expect(probeStatusLabel(summarizeProbeForCoverage(survived, []))).toBe('survived');
  });
});

describe('artifact', () => {
  it('builds a sorted artifact with totals and reads it back', () => {
    const artifact = buildInvariantProbeArtifact({
      arkgateVersion: '9.9.9',
      runner: { id: 'node', version: '26.0.0' },
      probedOn: '2026-09-30',
      rows: [
        row({ invariantId: 'INV-B', verdict: 'survived', reason: 'mutant-survived' }),
        row({ invariantId: 'INV-A' }),
        row({ invariantId: 'INV-C', verdict: 'unprobeable', reason: 'no-symbol' }),
      ],
    });
    expect(artifact.invariants.map((r) => r.invariantId)).toEqual(['INV-A', 'INV-B', 'INV-C']);
    expect(artifact.totals).toEqual({ probed: 2, killed: 1, survived: 1, notReached: 0, inconclusive: 0, unprobeable: 1 });
    expect(artifact.operatorSet).toBe(INVARIANT_PROBE_OPERATOR_SET);
    expect(probeExitCode(artifact.invariants)).toBe(1);
    expect(probeExitCode([row()])).toBe(0);
    const read = readInvariantProbeArtifact(JSON.parse(JSON.stringify(artifact)));
    expect(read).toEqual({ ok: true, artifact, droppedRows: 0, truncatedRows: 0 });
  });

  it('refuses a malformed envelope and drops malformed rows', () => {
    expect(readInvariantProbeArtifact(null)).toMatchObject({ ok: false });
    expect(readInvariantProbeArtifact({ kind: 'other' })).toMatchObject({ ok: false });
    const artifact = buildInvariantProbeArtifact({ arkgateVersion: '1', runner: null, probedOn: '2026-09-30', rows: [row()] });
    const broken = { ...artifact, invariants: [...artifact.invariants, { invariantId: 'X', verdict: 'killed' }] };
    const read = readInvariantProbeArtifact(broken);
    expect(read).toMatchObject({ ok: true, droppedRows: 1 });
  });

  it('every reason has a line and the lines never print a score', () => {
    for (const reason of INVARIANT_PROBE_REASONS) {
      const line = probeRowLine(row({ reason, verdict: 'inconclusive' }));
      expect(line.startsWith('INV-WINDOW: ')).toBe(true);
      expect(line).not.toMatch(/%|score/i);
    }
    expect(probeRowLine(row({ verdict: 'survived', reason: 'mutant-survived', mutants: [{ ...row().mutants[0]!, status: 'survived' }] }))).toBe(
      'INV-WINDOW: the tests still pass when the guard is negated (src/window.mjs:2). The test names the rule but does not pin it. Next: add a case that fails when the rule is broken, then re-run with --write.'
    );
  });
});

describe('schema (ADR 0039)', () => {
  it('mirrors the closed Domain lists', () => {
    const rowSchema = ARK_INVARIANT_PROBE_SCHEMA.$defs.row.properties;
    expect(rowSchema.verdict.enum).toEqual([...INVARIANT_PROBE_VERDICTS]);
    expect(rowSchema.reason.enum).toEqual([...INVARIANT_PROBE_REASONS]);
    expect(rowSchema.mutants.items.properties.operator.enum).toEqual([...INVARIANT_PROBE_OPERATORS]);
    expect(rowSchema.mutants.items.properties.status.enum).toEqual([...INVARIANT_PROBE_RUN_STATUSES]);
    expect(rowSchema.baseline.oneOf[1].properties.status.enum).toEqual([...INVARIANT_PROBE_BASELINE_STATUSES]);
  });

  it('ships as a generated file and a package export', () => {
    const shipped = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'schemas/ark.invariant-probe.schema.json'), 'utf8'));
    expect(shipped).toEqual(JSON.parse(JSON.stringify(ARK_INVARIANT_PROBE_SCHEMA)));
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as { exports: Record<string, unknown> };
    expect(pkg.exports['./schema/invariant-probe']).toBe('./schemas/ark.invariant-probe.schema.json');
    expect(pkg.exports['./schema/ark.invariant-probe.schema.json']).toBe('./schemas/ark.invariant-probe.schema.json');
  });
});

describe('testFilesNamingInvariant', () => {
  it('lists test files whose describe/it title names the id, sorted', () => {
    const files = {
      fileContents: {
        'test/b.test.mjs': "describe('INV-WINDOW closes', () => {});",
        'test/a.test.mjs': "it('keeps INV-WINDOW', () => {});",
        'test/c.test.mjs': "// INV-WINDOW in a comment\nit('other', () => {});",
        'src/x.mjs': "it('INV-WINDOW', () => {});",
      },
      testFiles: ['test/b.test.mjs', 'test/a.test.mjs', 'test/c.test.mjs'],
    };
    expect(testFilesNamingInvariant({ id: 'INV-WINDOW' }, files)).toEqual(['test/a.test.mjs', 'test/b.test.mjs']);
    expect(testFilesNamingInvariant({ id: 'INV-NONE' }, files)).toEqual([]);
  });
});
