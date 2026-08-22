/**
 * 4.6.5 product backlog — P0/P1/P2 surfaces (generic Next.js / multi-host use cases).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyLayerImportKind, layerImportNextAction } from '../../../src/domain/remediation.ts';
import { collectAnalysisConfigWarnings } from '../../../src/kernel/configWarnings.ts';
import { graphScanLimit } from '../../../bin/lib/graph-blind.mjs';
import { flattenTsParseDiagnostics } from '../../../bin/lib/snippet-analysis.mjs';
import { buildCiMergeBoundary } from '../../../bin/lib/ci-merge-boundary.mjs';
import { collectDoctorNextActions } from '../../../bin/lib/doctor-next-actions.mjs';

const CHECK = path.resolve('bin/ark-check.mjs');
const ARK = path.resolve('bin/ark.mjs');
const temps: string[] = [];

function mk() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-465-'));
  temps.push(root);
  return root;
}

afterEach(() => {
  for (const t of temps) {
    try {
      fs.rmSync(t, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  temps.length = 0;
});

function runCheck(root: string, extra: string[]) {
  return spawnSync(process.execPath, [CHECK, '--root', root, ...extra], {
    encoding: 'utf8',
    cwd: root,
  });
}

describe('P0 adopt starter does not dump src/lib into Application', () => {
  it('proposes SharedKernel + CompositionRoot + domain globs and writes golden-pattern', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, 'src/lib/utils'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/orders/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/lib/utils/fmt.ts'), 'export const n = 1;\n');
    fs.writeFileSync(path.join(root, 'src/orders/domain/order.ts'), 'export type Order = { id: string };\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'ApplicationOrchestration', patterns: ['src/app/api/**'], optional: true },
          { name: 'PresentationAdapters', patterns: ['src/components/**'], optional: true },
          { name: 'DomainModel', patterns: ['src/domain/**'], optional: true },
        ],
        rules: [],
      })
    );
    const adopt = runCheck(root, ['--adopt-contract', '--write', '--json']);
    expect(adopt.status, adopt.stderr).toBe(0);
    const j = JSON.parse(adopt.stdout);
    expect(j.after.proposedLayers).toEqual(
      expect.arrayContaining(['SharedKernel', 'CompositionRoot', 'DomainModel'])
    );
    expect(j.after.applicationPatterns).not.toContain('src/lib/**');
    expect(j.after.domainPatterns).toEqual(expect.arrayContaining(['src/**/domain/**']));
    const written = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    const app = written.layers.find((l: { name: string }) => l.name === 'ApplicationOrchestration');
    expect(app?.patterns ?? []).not.toContain('src/lib/**');
    expect(written.layers.some((l: { name: string }) => l.name === 'SharedKernel')).toBe(true);
    expect(written.layers.some((l: { name: string }) => l.name === 'CompositionRoot')).toBe(true);
    expect(fs.existsSync(path.join(root, '.ark/golden-pattern.json'))).toBe(true);
  });
});

describe('P0 LAYER_IMPORT_VIOLATION nextAction branches by import kind', () => {
  it('constants/types → SharedKernel, kernel emit → no persist emit, port only for use-case', () => {
    expect(classifyLayerImportKind('src/lib/constants.ts')).toBe('pure-shared');
    expect(
      layerImportNextAction({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        target: 'src/lib/constants.ts',
        fromLayer: 'PersistenceAdapters',
        toLayer: 'ApplicationOrchestration',
      })
    ).toMatch(/SharedKernel|constants\/types/i);

    expect(
      classifyLayerImportKind('src/kernel/events.ts', {
        fromLayer: 'PersistenceAdapters',
        toLayer: 'DomainModel',
      })
    ).toBe('kernel-emit');
    expect(
      layerImportNextAction({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        target: 'src/kernel/events.ts',
        fromLayer: 'PersistenceAdapters',
        toLayer: 'DomainModel',
      })
    ).toMatch(/must not emit/i);

    expect(
      classifyLayerImportKind('src/infra/db.ts', {
        fromLayer: 'DomainModel',
        toLayer: 'PersistenceAdapters',
      })
    ).toBe('use-case');
    expect(
      layerImportNextAction({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        target: 'src/infra/db.ts',
        fromLayer: 'DomainModel',
        toLayer: 'PersistenceAdapters',
      })
    ).toMatch(/Define a port in DomainModel/);
  });
});

describe('P0 reserved empty layer globs are not broken globs', () => {
  it('skips CONFIG_LAYER_PATTERN_NO_MATCHES when reserved/allowEmpty', () => {
    const reserved = collectAnalysisConfigWarnings({
      config: {
        layers: [
          {
            name: 'SharedKernel',
            patterns: ['src/shared/kernel/**'],
            reserved: true,
            allowEmpty: true,
          },
        ],
      },
      rules: [],
      files: ['src/domain/a.ts'],
    });
    expect(reserved.some((w) => w.ruleId === 'CONFIG_LAYER_PATTERN_NO_MATCHES')).toBe(false);

    const typo = collectAnalysisConfigWarnings({
      config: {
        layers: [{ name: 'DomainModel', patterns: ['src/doman/**'] }],
      },
      rules: [],
      files: ['src/domain/a.ts'],
    });
    expect(typo.some((w) => w.ruleId === 'CONFIG_LAYER_PATTERN_NO_MATCHES')).toBe(true);
  });
});

describe('P1 ANALYSIS_PARSE_INCOMPLETE includes the real TS diagnostic', () => {
  it('flattenTsParseDiagnostics keeps line + message', () => {
    const ts = {
      flattenDiagnosticMessageText: (text: unknown) => String(text),
    };
    const sourceFile = {
      getLineAndCharacterOfPosition: () => ({ line: 2, character: 4 }),
    };
    const out = flattenTsParseDiagnostics(
      ts,
      [{ start: 10, messageText: "';' expected.", code: 1005 }],
      sourceFile
    );
    expect(out[0]).toMatchObject({ line: 3, column: 5, message: "';' expected.", code: 1005 });
  });
});

describe('P1 LEXICAL hook deny does not send agents to ark_prepare_change MCP', () => {
  it('snippet-analysis nextAction is CLI / hook-is-verdict', () => {
    const src = fs.readFileSync(
      path.resolve('bin/lib/snippet-analysis.mjs'),
      'utf8'
    );
    expect(src).toMatch(/LEXICAL_EVIDENCE_INCOMPLETE/);
    expect(src).toMatch(/Do not call ark_prepare_change from a hook deny/);
    expect(src).toMatch(/npx arkgate-check/);
  });
});

describe('P1 writePath / CI honesty file', () => {
  it('emits configured-not-fired, per-host writePath, GitHub Free cannot require', () => {
    const payload = buildCiMergeBoundary({
      writePath: {
        inventory: {
          hosts: {
            claude: { configured: true, capabilities: { 'hard-write': true } },
            cursor: { configured: true, capabilities: { 'advisory-write': true } },
          },
          capabilities: { 'merge-gate': true },
        },
        capabilities: { 'merge-gate': true },
        enforcementState: { localWrite: { runtimeObserved: false } },
      },
      github: { plan: 'free', canRequire: false, requiredStatusConfigured: false },
    });
    expect(payload.schemaVersion).toBe('1.0');
    expect(payload.hook.state).toBe('configured-not-fired');
    expect(payload.writePath.claude.writePath).toBe('hard');
    expect(payload.writePath.cursor.writePath).toBe('soft');
    expect(payload.ci.state).toBe('present-but-github-free-cannot-require');
    expect(payload.githubPlan.reason).toBe('github-free-cannot-require');
    expect(payload.hookGreenIsNotTreeGreen).toBe(true);
    expect(payload.scriptedEditsBypassPreToolUse).toBe(true);
    expect(payload.note).toMatch(/Do not reverse-engineer node_modules/);
  });

  it('fail-closed workflow without required status is present-but-not-required', () => {
    const payload = buildCiMergeBoundary({
      writePath: { capabilities: { 'merge-gate': true } },
      github: { requiredStatusConfigured: false },
    });
    expect(payload.ci.state).toBe('present-but-not-required');
  });
});

describe('P1 host projection writes CLAUDE.md', () => {
  it('agents-md --write merges the same schema into CLAUDE.md', () => {
    const root = mk();
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'], optional: true }],
        rules: [],
      })
    );
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/a.ts'), 'export const a = 1;\n');
    const run = spawnSync(process.execPath, [ARK, 'agents-md', '--root', root, '--write'], {
      encoding: 'utf8',
    });
    expect(run.status, run.stderr).toBe(0);
    expect(fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'CLAUDE.md'))).toBe(true);
    const claude = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
    expect(claude).toMatch(/arkgate:agent-projection:begin/);
    expect(claude).toMatch(/arkgateVersion/);
    expect(claude).toMatch(/CLAUDE\.md/);
  });
});

describe('P2 stable doctor --json envelope', () => {
  it('uses schemaVersion + envelope doctor + payload under doctor', () => {
    const root = mk();
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Ark Enforcement\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'], optional: true }],
        rules: [],
      })
    );
    const r = runCheck(root, ['--doctor', '--json']);
    const j = JSON.parse(r.stdout);
    expect(j.schemaVersion).toBe('1.0');
    expect(j.envelope).toBe('doctor');
    expect(j.doctor).toBeTruthy();
    expect(j.doctor.completeness).toBeTruthy();
    expect(Object.keys(j).filter((k) => k !== 'schemaVersion' && k !== 'envelope' && k !== 'ok' && k !== 'doctor')).toEqual([]);
  });
});

describe('P2 graph scan threshold is proportional', () => {
  it('scans a 3300-file Next.js tree and caps at 8000', () => {
    expect(graphScanLimit(100)).toBe(2500);
    expect(graphScanLimit(3300)).toBe(3300);
    expect(graphScanLimit(10000)).toBe(8000);
  });
});

describe('P2 doctor #1: ENFORCE + empty plan A → Shape, not reinstall', () => {
  it('does not say install-agent-gates when gates are already installed', () => {
    const actions = collectDoctorNextActions({
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
      adopted: 'required-merge',
      root: '/tmp',
    });
    expect(actions[0]).toMatch(/\/ark-explore/i);
    expect(actions.join('\n')).not.toMatch(/install-agent-gates/);
  });
});
