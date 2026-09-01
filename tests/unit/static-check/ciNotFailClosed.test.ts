/**
 * CI-001 / CI-002 / REQ-006 — skippable ark-check CI is not missing-gates.
 * Draft-skip workflows still fail --strict-merge, as ci-not-fail-closed.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ciNotFailClosed,
  hasArkWorkflow,
  missingGates,
  REQUIRED_GATE_WORKFLOW,
} from '../../../bin/lib/gate-files.mjs';
import {
  printDoctorCompactHuman,
  printDoctorDetailsHuman,
} from '../../../bin/lib/doctor-human.mjs';
import { collectDoctorNextActions } from '../../../bin/lib/doctor-next-actions.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARK_CHECK = path.join(REPO, 'bin/ark-check.mjs');
const roots: string[] = [];

const DRAFT_SKIP_WORKFLOW = `
name: ark
on: pull_request
jobs:
  ark:
    if: github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    steps:
      - run: npx ark-check --strict-merge
`;

const identityColor = {
  green: (s: string) => s,
  yellow: (s: string) => s,
  red: (s: string) => s,
  dim: (s: string) => s,
  bold: (s: string) => s,
};

function temporaryRoot(label = 'ark-ci-diag-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), label));
  roots.push(root);
  return root;
}

function writeFile(root: string, relativePath: string, content: string) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function writeJson(root: string, relativePath: string, value: unknown) {
  return writeFile(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writePresentGates(root: string, workflow = DRAFT_SKIP_WORKFLOW) {
  writeFile(
    root,
    'AGENTS.md',
    '# Ark Enforcement\n\nark.config.json is authoritative.\nRun ark-check --strict-merge.\n'
  );
  writeJson(root, '.mcp.json', {
    mcpServers: {
      ark: {
        command: 'npx',
        args: ['arkgate-mcp', '--root', '.', '--config', 'ark.config.json'],
      },
    },
  });
  writeFile(root, '.github/workflows/ark-check.yml', `${workflow.trim()}\n`);
}

function compactView(overrides: Record<string, unknown> = {}) {
  return {
    root: '/tmp',
    analysisComplete: true,
    completeness: 'complete',
    doctorAdvisories: { parseHealth: { affectedFiles: 0 }, stewardNudge: null },
    operatingMode: 'enforce',
    designFitness: { designWeak: false, label: 'ok' },
    adopted: 'required-merge',
    stewardUnfinished: false,
    emptyScope: false,
    uniqueActions: ['keep CI'],
    ciMergeBoundary: { ci: { state: 'present-but-not-required', workflowPresent: true } },
    cov: { governed: { percent: 100, classifiedFiles: 1, totalFiles: 1 }, layers: [] },
    writePath: { gap: null, activeHost: 'grok' },
    writePathHonesty: {},
    gatesMissing: [],
    violations: [{ ruleId: 'x' }],
    color: identityColor,
    ...overrides,
  };
}

function captureLog(fn: () => void): string {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  try {
    fn();
  } finally {
    console.log = orig;
  }
  return lines.join('\n');
}

function runArkCheck(root: string, extraArgs: string[]) {
  return spawnSync(process.execPath, [ARK_CHECK, '--root', root, ...extraArgs], {
    encoding: 'utf8',
    cwd: REPO,
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('REQ-006 skippable draft workflow is not a missing file', () => {
  it('does not classify draft-skip + ark-check --strict-merge as a missing workflow', () => {
    const root = temporaryRoot();
    writePresentGates(root);
    expect(hasArkWorkflow(root)).toBe(false);
    expect(missingGates(root)).not.toContain(REQUIRED_GATE_WORKFLOW);
    expect(missingGates(root)).not.toContain('.github/workflows/*.yml running ark-check');
    const ci = ciNotFailClosed(root);
    expect(ci).not.toBeNull();
    expect(ci?.error).toBe('ci-not-fail-closed');
    expect(ci?.workflowFile).toBe('.github/workflows/ark-check.yml');
  });

  it('still lists the glob only when no ark-check workflow file exists', () => {
    const root = temporaryRoot();
    writePresentGates(root, 'name: other\non: push\njobs:\n  lint:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n');
    expect(hasArkWorkflow(root)).toBe(false);
    expect(missingGates(root)).toContain(REQUIRED_GATE_WORKFLOW);
    expect(ciNotFailClosed(root)).toBeNull();
  });
});

describe('CI-001 --strict-merge names ci-not-fail-closed', () => {
  it.each(['--strict-merge', '--require-gates'])(
    '%s fails with ci-not-fail-closed and names the workflow file',
    (flag) => {
      const root = temporaryRoot();
      writePresentGates(root);
      writeJson(root, 'ark.config.json', {
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        rules: [],
      });
      const jsonRun = runArkCheck(root, [flag, '--json']);
      expect(jsonRun.status).toBe(1);
      const payload = JSON.parse(jsonRun.stdout) as {
        ok: boolean;
        error: string;
        missing?: string[];
        workflowFile?: string;
        nextAction?: string;
        message?: string;
      };
      expect(payload.ok).toBe(false);
      expect(payload.error).toBe('ci-not-fail-closed');
      expect(payload.error).not.toBe('missing-gates');
      expect(payload.missing).toBeUndefined();
      expect(payload.workflowFile).toBe('.github/workflows/ark-check.yml');
      expect(payload.nextAction).toMatch(/skippable if:/i);
      expect(payload.nextAction).toMatch(/\.ark\/adoption-stance\.json/);
      expect(payload.nextAction).toMatch(/advisory-only/);
      expect(payload.nextAction).toContain('.github/workflows/ark-check.yml');
      expect(`${payload.message ?? ''} ${jsonRun.stderr}`).not.toMatch(/gates are not installed/i);
      expect(`${payload.message ?? ''} ${jsonRun.stderr}`).not.toMatch(/ark init/i);

      const human = runArkCheck(root, [flag]);
      expect(human.status).toBe(1);
      const text = `${human.stdout}\n${human.stderr}`;
      expect(text).toMatch(/ci-not-fail-closed/);
      expect(text).toContain('.github/workflows/ark-check.yml');
      expect(text).not.toMatch(/Ark gates are not installed/);
      expect(text).not.toMatch(/ark init/i);
      expect(text).toMatch(/skippable if:|not fail-closed/i);
      expect(text).toMatch(/adoption-stance\.json/);
    }
  );
});

describe('CI-002 doctor does not list the workflow glob as missing', () => {
  it('doctor JSON and human omit the glob when the YAML exists but is conditional', () => {
    const root = temporaryRoot();
    writePresentGates(root);
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    writeFile(root, 'src/domain/thing.ts', 'export const n = 1;\n');
    writeJson(root, 'ark.config.json', {
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    });
    const jsonRun = runArkCheck(root, ['--doctor', '--json', '--no-cache']);
    expect(jsonRun.status).toBe(0);
    const payload = JSON.parse(jsonRun.stdout) as {
      doctor: { gatesMissing: string[] };
    };
    expect(payload.doctor.gatesMissing).not.toContain(REQUIRED_GATE_WORKFLOW);
    expect(payload.doctor.gatesMissing).not.toContain(
      '.github/workflows/*.yml running ark-check'
    );

    const human = runArkCheck(root, ['--doctor', '--no-cache']);
    expect(human.stdout).not.toMatch(
      /Missing gates:.*\.github\/workflows\/\*\.yml running ark-check/
    );
  });

  it('compact and details printers hide the glob when the workflow file is known', () => {
    const view = compactView({
      gatesMissing: [REQUIRED_GATE_WORKFLOW],
      ciNotFailClosed: {
        error: 'ci-not-fail-closed',
        workflowFile: '.github/workflows/ark-check.yml',
      },
    });
    const compact = captureLog(() => printDoctorCompactHuman(view));
    expect(compact).not.toMatch(/Missing gates:.*\.github\/workflows\/\*\.yml running ark-check/);
    expect(compact).toContain('.github/workflows/ark-check.yml');
    const details = captureLog(() =>
      printDoctorDetailsHuman({
        ...view,
        options: {},
        cov: {
          governed: { percent: 100, classifiedFiles: 1, totalFiles: 1 },
          suggestions: [],
          emptyLayers: [],
          layersWithoutRules: [],
          layers: [],
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
        coverageHonesty: { greenIsNotEnforcement: false },
        packageVersionTruth: null,
        designSmells: [],
        pilotLoop: null,
        goldenPattern: { present: false },
        pureLayerOptIn: null,
        summary: { typeOnlyCount: 0, valueCount: 0, edges: [], concentrated: false },
        suppressed: 0,
        activeCount: 0,
        skillGaps: [],
        agentHomeGaps: [],
        baseline: { exists: false, keys: new Set() },
        baselineHonesty: {},
        staleBaseline: 0,
        staleRunners: [],
        adoption: { gaps: [], originReport: {} },
      })
    );
    expect(details).not.toMatch(/Missing gates:.*\.github\/workflows\/\*\.yml running ark-check/);
  });

  it('next actions name remove-if or advisory-only instead of install-gates', () => {
    const actions = collectDoctorNextActions({
      operatingMode: 'enforce',
      activeCount: 0,
      gatesMissing: [REQUIRED_GATE_WORKFLOW],
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
      ciNotFailClosed: {
        error: 'ci-not-fail-closed',
        workflowFile: '.github/workflows/ark-check.yml',
        nextAction:
          'Remove the skippable if: in .github/workflows/ark-check.yml, or write .ark/adoption-stance.json with stance: advisory-only',
      },
    });
    expect(actions.join('\n')).not.toMatch(/install-agent-gates/);
    expect(actions.join('\n')).toMatch(/skippable if:/i);
    expect(actions.join('\n')).toMatch(/ark-check\.yml/);
    expect(actions.join('\n')).toMatch(/advisory-only/);
  });
});
