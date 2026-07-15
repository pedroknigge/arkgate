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
  'src/integrations/tokko.ts',
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
  it('drops an acknowledged bidirectional edge and counts it, order-insensitive', () => {
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
    const ackState = loadContractSmellAcks(root);
    expect(ackState.exists).toBe(true);
    const smells = detectContractSmells(richConfig, coverage, ackState);
    expect(smells.find((s) => s.id === 'contract-bidirectional-allow')).toBeUndefined();
    const health = summarizeContractHealth(smells, ackState);
    expect(health.acknowledged).toBe(1);
    // Other smells are still present — an ack is per (id, edge), not global.
    expect(smells.find((s) => s.id === 'contract-lateral-adapter-allow')).toBeDefined();
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
    const health = summarizeContractHealth(smells, ackState);
    expect(health.ackFile.invalid).toBe(true);
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
