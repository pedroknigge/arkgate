/**
 * W01 — deterministic contract smells (meta-lint of ark.config.json itself).
 *
 * ArkGate validates code against the contract; these sensors validate the
 * contract against known contract anti-patterns. Advisory only: they never
 * change a verdict, never feed designWeak/patternBets, never block a gate.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTRACT_SMELL_IDS,
  CONTRACT_SMELL_OUTCOMES,
  CONTRACT_SMELL_ACKS_PATH,
  loadContractSmellAcks,
  detectContractSmells,
  computeContractHealth,
  formatContractHealthLines,
  summarizeContractHealth,
} from '../../../bin/lib/contract-smells.mjs';
import { runDoctor, computeCoverage } from '../../../bin/lib/doctor-plan.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const temps: string[] = [];

function mk(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-contract-smells-'));
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

function coverageFor(root: string, config: { layers?: unknown[]; rules?: unknown[] }, relFiles: string[]) {
  const files = relFiles.map((rel) => path.join(root, rel));
  return computeCoverage(root, config, files, (config.rules as object[]) ?? []);
}

const richConfig = {
  include: ['src'],
  layers: [
    { name: 'DomainModel', patterns: ['src/domain/**'] },
    { name: 'ApplicationOrchestration', patterns: ['src/application/**'] },
    { name: 'WorkflowSagaEngine', patterns: ['src/workflows/**'] },
    { name: 'PersistenceAdapters', patterns: ['src/repositories/**'] },
    { name: 'IntegrationAdapters', patterns: ['src/integrations/**'] },
    { name: 'SecurityAuditObservability', patterns: ['src/observability/**'] },
  ],
  rules: [
    { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
    { from: 'WorkflowSagaEngine', to: 'ApplicationOrchestration', allowed: true },
    { from: 'ApplicationOrchestration', to: 'WorkflowSagaEngine', allowed: true },
    { from: 'SecurityAuditObservability', to: 'ApplicationOrchestration', allowed: true },
    { from: 'PersistenceAdapters', to: 'IntegrationAdapters', allowed: true },
  ],
};

const richFiles = [
  'src/domain/rules.ts',
  'src/application/useCase.ts',
  'src/workflows/sync.ts',
  'src/repositories/repo.ts',
  'src/integrations/crm.ts',
  'src/observability/audit.ts',
];

function seedRich(root: string) {
  for (const rel of richFiles) write(root, rel, 'export const x = 1;\n');
  return coverageFor(root, richConfig, richFiles);
}

describe('W01 contract smells — vocabulary', () => {
  it('exports stable ids, each with a plain-language outcome', () => {
    expect(CONTRACT_SMELL_IDS).toEqual([
      'contract-bidirectional-allow',
      'contract-peripheral-depends-core',
      'contract-lateral-adapter-allow',
      'contract-dead-rule',
    ]);
    for (const id of CONTRACT_SMELL_IDS) {
      expect(CONTRACT_SMELL_OUTCOMES[id], id).toBeTruthy();
      expect(CONTRACT_SMELL_OUTCOMES[id].length, id).toBeGreaterThan(40);
    }
  });
});

describe('W01 contract smells — detection', () => {
  it('flags explicitly bidirectional allowed edges between two layers', () => {
    const root = mk();
    const coverage = seedRich(root);
    const smells = detectContractSmells(richConfig, coverage, loadContractSmellAcks(root));
    const bidi = smells.find((s) => s.id === 'contract-bidirectional-allow');
    expect(bidi).toBeDefined();
    expect(bidi.severity).toBe('warn');
    expect(bidi.evidence).toContain('edge:ApplicationOrchestration<->WorkflowSagaEngine');
    expect(bidi.outcome).toBeTruthy();
    expect(bidi.fix).toContain('/ark-contract');
  });

  it('does not flag a single-direction explicit allow', () => {
    const root = mk();
    const config = {
      ...richConfig,
      rules: [{ from: 'WorkflowSagaEngine', to: 'ApplicationOrchestration', allowed: true }],
    };
    for (const rel of richFiles) write(root, rel, 'export const x = 1;\n');
    const coverage = coverageFor(root, config, richFiles);
    const smells = detectContractSmells(config, coverage, loadContractSmellAcks(root));
    expect(smells.find((s) => s.id === 'contract-bidirectional-allow')).toBeUndefined();
  });

  it('flags peripheral (audit/observability) layers explicitly allowed into orchestration/persistence', () => {
    const root = mk();
    const coverage = seedRich(root);
    const smells = detectContractSmells(richConfig, coverage, loadContractSmellAcks(root));
    const peripheral = smells.find((s) => s.id === 'contract-peripheral-depends-core');
    expect(peripheral).toBeDefined();
    expect(peripheral.evidence).toContain(
      'edge:SecurityAuditObservability->ApplicationOrchestration'
    );
  });

  it('flags lateral adapter-to-adapter explicit allows', () => {
    const root = mk();
    const coverage = seedRich(root);
    const smells = detectContractSmells(richConfig, coverage, loadContractSmellAcks(root));
    const lateral = smells.find((s) => s.id === 'contract-lateral-adapter-allow');
    expect(lateral).toBeDefined();
    expect(lateral.evidence).toContain('edge:PersistenceAdapters->IntegrationAdapters');
  });

  it('does not flag denied edges for peripheral/lateral shapes', () => {
    const root = mk();
    const config = {
      ...richConfig,
      rules: [
        { from: 'SecurityAuditObservability', to: 'ApplicationOrchestration', allowed: false },
        { from: 'PersistenceAdapters', to: 'IntegrationAdapters', allowed: false },
      ],
    };
    for (const rel of richFiles) write(root, rel, 'export const x = 1;\n');
    const coverage = coverageFor(root, config, richFiles);
    const smells = detectContractSmells(config, coverage, loadContractSmellAcks(root));
    expect(smells.find((s) => s.id === 'contract-peripheral-depends-core')).toBeUndefined();
    expect(smells.find((s) => s.id === 'contract-lateral-adapter-allow')).toBeUndefined();
  });

  it('flags rules that reference unknown or empty layers as dead rules', () => {
    const root = mk();
    const config = {
      include: ['src'],
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'] },
        { name: 'EmptyLayer', patterns: ['src/nothing-here/**'] },
      ],
      rules: [
        { from: 'DomainModel', to: 'GhostLayer', allowed: false },
        { from: 'EmptyLayer', to: 'DomainModel', allowed: false },
      ],
    };
    write(root, 'src/domain/rules.ts', 'export const x = 1;\n');
    const coverage = coverageFor(root, config, ['src/domain/rules.ts']);
    const smells = detectContractSmells(config, coverage, loadContractSmellAcks(root));
    const dead = smells.find((s) => s.id === 'contract-dead-rule');
    expect(dead).toBeDefined();
    expect(dead.evidence.some((e: string) => e.includes('GhostLayer'))).toBe(true);
    expect(dead.evidence.some((e: string) => e.includes('EmptyLayer'))).toBe(true);
  });

  it('reports nothing on a clean minimal contract', () => {
    const root = mk();
    const config = {
      include: ['src'],
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'] },
        { name: 'Tooling', patterns: ['src/tools/**'] },
      ],
      rules: [
        { from: 'DomainModel', to: 'Tooling', allowed: false },
        { from: 'Tooling', to: 'DomainModel', allowed: true },
      ],
    };
    write(root, 'src/domain/rules.ts', 'export const x = 1;\n');
    write(root, 'src/tools/cli.ts', 'export const y = 2;\n');
    const coverage = coverageFor(root, config, ['src/domain/rules.ts', 'src/tools/cli.ts']);
    const smells = detectContractSmells(config, coverage, loadContractSmellAcks(root));
    expect(smells).toEqual([]);
  });

  it('self-hosting: this repository contract has zero contract smells', () => {
    const config = JSON.parse(fs.readFileSync(path.join(REPO, 'ark.config.json'), 'utf8'));
    const smells = detectContractSmells(config, null, { exists: false, acks: [] });
    expect(smells).toEqual([]);
  });
});

describe('W01 contract smells — acknowledgments (sidecar, no config key)', () => {
  it('drops an acknowledged bidirectional edge and counts only applied acks, order-insensitive', () => {
    const root = mk();
    const coverage = seedRich(root);
    write(
      root,
      CONTRACT_SMELL_ACKS_PATH,
      JSON.stringify({
        version: 1,
        acks: [
          {
            id: 'contract-bidirectional-allow',
            edge: 'WorkflowSagaEngine<->ApplicationOrchestration',
            reason: 'saga callbacks are a deliberate loop; cycles guarded by review',
          },
        ],
      })
    );
    const health = computeContractHealth(root, richConfig, coverage);
    expect(health.smells.find((s: { id: string }) => s.id === 'contract-bidirectional-allow')).toBeUndefined();
    expect(health.acknowledged).toBe(1);
    // Other smells are still present — an ack is per (id, edge), not global.
    expect(health.smells.find((s: { id: string }) => s.id === 'contract-lateral-adapter-allow')).toBeDefined();
  });

  it('a malformed ack file is reported invalid, never silent success', () => {
    const root = mk();
    const coverage = seedRich(root);
    write(root, CONTRACT_SMELL_ACKS_PATH, '{ not json');
    const ackState = loadContractSmellAcks(root);
    expect(ackState.invalid).toBe(true);
    const smells = detectContractSmells(richConfig, coverage, ackState);
    // Nothing is suppressed by a broken file.
    expect(smells.find((s) => s.id === 'contract-bidirectional-allow')).toBeDefined();
    const health = summarizeContractHealth(smells, ackState, 0);
    expect(health.ackFile.invalid).toBe(true);
    expect(health.acknowledged).toBe(0);
  });

  it('valid JSON with the wrong shape is invalid; acks are ignored, not applied', () => {
    const root = mk();
    const coverage = seedRich(root);
    for (const body of ['[]', '{"acks": {}}', '{"acks": [null]}', '{"acks": ["x"]}', '{"acks": [{"id": 1, "edge": 2}]}', '{"acks": [{"id": "contract-dead-rule", "edge": ""}]}']) {
      write(root, CONTRACT_SMELL_ACKS_PATH, body);
      expect(loadContractSmellAcks(root).invalid, body).toBe(true);
    }
    const smells = detectContractSmells(richConfig, coverage, loadContractSmellAcks(root));
    expect(smells.find((s) => s.id === 'contract-bidirectional-allow')).toBeDefined();
  });

  it('a sloppy or case-mismatched ack edge never suppresses a real smell', () => {
    const root = mk();
    const coverage = seedRich(root);
    for (const edge of [
      'WorkflowSagaEngine<->ApplicationOrchestration<->garbage',
      'workflowsagaengine<->applicationorchestration',
      '<->ApplicationOrchestration',
    ]) {
      write(
        root,
        CONTRACT_SMELL_ACKS_PATH,
        JSON.stringify({ acks: [{ id: 'contract-bidirectional-allow', edge }] })
      );
      const health = computeContractHealth(root, richConfig, coverage);
      expect(
        health.smells.find((s: { id: string }) => s.id === 'contract-bidirectional-allow'),
        edge
      ).toBeDefined();
      expect(health.acknowledged, edge).toBe(0);
    }
  });

  it('a stale ack that matches nothing suppresses nothing and counts zero', () => {
    const root = mk();
    const coverage = seedRich(root);
    write(
      root,
      CONTRACT_SMELL_ACKS_PATH,
      JSON.stringify({ acks: [{ id: 'contract-bidirectional-allow', edge: 'Nope<->Also' }] })
    );
    const health = computeContractHealth(root, richConfig, coverage);
    expect(health.smells.find((s: { id: string }) => s.id === 'contract-bidirectional-allow')).toBeDefined();
    expect(health.acknowledged).toBe(0);
  });

  it('an oversized or non-regular ack file is invalid, bounded, and suppresses nothing', () => {
    const root = mk();
    const coverage = seedRich(root);
    write(root, CONTRACT_SMELL_ACKS_PATH, `{"acks": [], "pad": "${'x'.repeat(70 * 1024)}"}`);
    const big = loadContractSmellAcks(root);
    expect(big.invalid).toBe(true);
    fs.rmSync(path.join(root, CONTRACT_SMELL_ACKS_PATH));
    fs.mkdirSync(path.join(root, CONTRACT_SMELL_ACKS_PATH), { recursive: true });
    const dir = loadContractSmellAcks(root);
    expect(dir.invalid).toBe(true);
    const smells = detectContractSmells(richConfig, coverage, dir);
    expect(smells.length).toBeGreaterThan(0);
  });
});

describe('W01 contract smells — hostile and malformed inputs', () => {
  it('tolerates malformed configs and coverage without throwing', () => {
    for (const cfg of [
      null,
      {},
      { layers: [], rules: [] },
      { layers: [{}], rules: [{ allowed: true }, null, 'x'] },
      { layers: [{ name: 'A', patterns: [] }], rules: [{ from: '', to: 'A', allowed: false }, { from: 1, to: 2, allowed: true }] },
    ]) {
      expect(() =>
        detectContractSmells(cfg as never, { layers: [null, { files: 1 }] } as never, { exists: false, acks: [] })
      ).not.toThrow();
    }
    expect(detectContractSmells({} as never, null, { exists: false, acks: [] })).toEqual([]);
  });

  it('allowed-undefined, and duplicate rules do not inflate smells; self allows are dead rules', () => {
    const root = mk();
    for (const rel of richFiles) write(root, rel, 'export const x = 1;\n');
    const config = {
      ...richConfig,
      rules: [
        { from: 'WorkflowSagaEngine', to: 'ApplicationOrchestration', allowed: true },
        { from: 'ApplicationOrchestration', to: 'WorkflowSagaEngine' },
        { from: 'PersistenceAdapters', to: 'PersistenceAdapters', allowed: true },
        { from: 'PersistenceAdapters', to: 'IntegrationAdapters', allowed: true },
        { from: 'PersistenceAdapters', to: 'IntegrationAdapters', allowed: true },
      ],
    };
    const coverage = coverageFor(root, config, richFiles);
    const smells = detectContractSmells(config, coverage, loadContractSmellAcks(root));
    expect(smells.find((s) => s.id === 'contract-bidirectional-allow')).toBeUndefined();
    const lateral = smells.find((s) => s.id === 'contract-lateral-adapter-allow');
    expect(lateral!.evidence).toEqual(['edge:PersistenceAdapters->IntegrationAdapters']);
    const dead = smells.find((s) => s.id === 'contract-dead-rule');
    expect(dead!.evidence).toContain('rule:PersistenceAdapters->PersistenceAdapters (self edge has no effect)');
  });

  it('layer names embedding arrows cannot fake a bidirectional pair', () => {
    const config = {
      layers: [
        { name: 'A', patterns: ['src/a/**'] },
        { name: 'A->X', patterns: ['src/ax/**'] },
        { name: 'B', patterns: ['src/b/**'] },
        { name: 'B->A', patterns: ['src/ba/**'] },
        { name: 'X', patterns: ['src/x/**'] },
      ],
      rules: [
        { from: 'A->X', to: 'B', allowed: true },
        { from: 'B->A', to: 'X', allowed: true },
      ],
    };
    const smells = detectContractSmells(config, null, { exists: false, acks: [] });
    expect(smells.find((s) => s.id === 'contract-bidirectional-allow')).toBeUndefined();
  });

  it('is deterministic under rule reordering', () => {
    const config = {
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: Array.from({ length: 14 }, (_, i) => ({
        from: 'DomainModel',
        to: `Ghost${String(i).padStart(2, '0')}`,
        allowed: false,
      })),
    };
    const reversed = { ...config, rules: [...config.rules].reverse() };
    const a = detectContractSmells(config, null, { exists: false, acks: [] });
    const b = detectContractSmells(reversed, null, { exists: false, acks: [] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const dead = a.find((s) => s.id === 'contract-dead-rule');
    expect(dead!.evidence.at(-1)).toMatch(/\(\+\d+ more\)/);
  });

  it('without coverage, empty layers are not flagged; optional empty layers never are', () => {
    const root = mk();
    const config = {
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'] },
        { name: 'EmptyLayer', patterns: ['src/nothing/**'] },
        { name: 'OptionalLayer', patterns: ['src/maybe/**'], optional: true },
      ],
      rules: [
        { from: 'EmptyLayer', to: 'DomainModel', allowed: false },
        { from: 'OptionalLayer', to: 'DomainModel', allowed: false },
        { from: 'DomainModel', to: 'Ghost', allowed: false },
      ],
    };
    const noCoverage = detectContractSmells(config, null, { exists: false, acks: [] });
    const deadNoCov = noCoverage.find((s) => s.id === 'contract-dead-rule');
    expect(deadNoCov!.evidence.some((e: string) => e.includes('Ghost'))).toBe(true);
    expect(deadNoCov!.evidence.some((e: string) => e.includes('empty layer'))).toBe(false);

    write(root, 'src/domain/rules.ts', 'export const x = 1;\n');
    const coverage = coverageFor(root, config, ['src/domain/rules.ts']);
    const withCoverage = detectContractSmells(config, coverage, { exists: false, acks: [] });
    const dead = withCoverage.find((s) => s.id === 'contract-dead-rule');
    expect(dead!.evidence.some((e: string) => e.includes('empty layer: EmptyLayer'))).toBe(true);
    expect(dead!.evidence.some((e: string) => e.includes('OptionalLayer'))).toBe(false);
  });
});

describe('W01 contract smells — human output helpers', () => {
  it('formatContractHealthLines renders the invalid-ack warning and truncates honestly', () => {
    const smells = Array.from({ length: 7 }, (_, i) => ({
      id: 'contract-dead-rule',
      severity: 'warn' as const,
      message: `m${i}`,
      outcome: 'o',
      evidence: ['a', 'b', 'c', 'd', 'e'],
      fix: 'f',
      acknowledgedEdges: 0,
    }));
    const health = summarizeContractHealth(
      smells,
      { path: CONTRACT_SMELL_ACKS_PATH, exists: true, invalid: true, error: 'x', acks: [] },
      0
    );
    const rows = formatContractHealthLines(smells, health);
    expect(rows[0].mark).toBe('warn');
    expect(rows[0].text).toContain('invalid');
    expect(rows.filter((r) => r.text.startsWith('[contract-')).length).toBe(5);
    const ev = rows.find((r) => r.text.startsWith('evidence:'));
    expect(ev!.text).toContain('…(+1 more)');
    expect(rows.some((r) => r.text.includes('+2 more contract smell(s)'))).toBe(true);
    // Empty input renders nothing.
    expect(
      formatContractHealthLines([], summarizeContractHealth([], { exists: false, acks: [] }, 0))
    ).toEqual([]);
  });
});

describe('W01 contract smells — doctor surface stays advisory', () => {
  function doctorJson(root: string, config: object, relFiles: string[]) {
    const files = relFiles.map((rel) => path.join(root, rel));
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    try {
      runDoctor(root, config, files, (config as { rules: object[] }).rules, [], true, {});
    } finally {
      console.log = orig;
    }
    return JSON.parse(logs.join('\n'));
  }

  it('human doctor prints the advisory contract-health section', () => {
    const root = mk();
    for (const rel of richFiles) write(root, rel, 'export const x = 1;\n');
    const files = richFiles.map((rel) => path.join(root, rel));
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    try {
      runDoctor(root, richConfig, files, richConfig.rules, [], false, {});
    } finally {
      console.log = orig;
    }
    const joined = logs.join('\n');
    expect(joined).toContain('Contract health (advisory)');
    expect(joined).toContain('contract-bidirectional-allow');
    expect(joined).toContain('advisory only — the gate verdict and design fitness are unchanged');
  });

  it('doctor JSON exposes contractHealth without touching designFitness or the goal', () => {
    const root = mk();
    for (const rel of richFiles) write(root, rel, 'export const x = 1;\n');
    const payload = doctorJson(root, richConfig, richFiles);
    const health = payload.doctor.contractHealth;
    expect(health).toBeDefined();
    expect(health.smellCount).toBeGreaterThan(0);
    expect(health.smells.map((s: { id: string }) => s.id)).toContain(
      'contract-bidirectional-allow'
    );
    // Advisory only: contract smells alone must NOT create design-weak residual.
    expect(payload.doctor.designFitness.designWeak).toBe(false);
    expect(payload.doctor.designSmells).toEqual([]);
    expect(payload.doctor.postGreenPath).toBeNull();
  });
});
