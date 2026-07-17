/**
 * X05 — stale acknowledgments are surfaced (field feedback, 2026-07-16): the edge the X03 carve-out quieted left its ack orphaned in
 * silence — 29 entries in the file, 28 applied, and nothing said "1 matches
 * no detected edge; delete it". A stale ack suppresses nothing; it should be
 * fixed or deleted, and the doctor/report must say so. Advisory only.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CONTRACT_SMELL_ACKS_PATH,
  computeContractHealth,
  formatContractHealthLines,
} from '../../../bin/lib/contract-smells.mjs';
// eslint-disable-next-line -- runtime .mjs module under test (report parity)
import { renderAdvisorySections } from '../../../bin/lib/html-report-advisories.mjs';

const TODAY = '2026-07-17';
const temps: string[] = [];

function mk(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-stale-acks-'));
  temps.push(root);
  return root;
}

afterEach(() => {
  for (const root of temps.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const config = {
  include: ['src'],
  layers: [
    { name: 'ApplicationOrchestration', patterns: ['src/application/**'] },
    { name: 'WorkflowSagaEngine', patterns: ['src/workflows/**'] },
  ],
  rules: [
    { from: 'WorkflowSagaEngine', to: 'ApplicationOrchestration', allowed: true },
    { from: 'ApplicationOrchestration', to: 'WorkflowSagaEngine', allowed: true },
  ],
};
const LIVE_EDGE = 'ApplicationOrchestration<->WorkflowSagaEngine';

function writeAcks(root: string, acks: unknown[]) {
  const abs = path.join(root, CONTRACT_SMELL_ACKS_PATH);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify({ acks }));
}

describe('X05 stale acknowledgments', () => {
  it('an ack orphaned by a quieted edge is counted and listed as stale', () => {
    const root = mk();
    writeAcks(root, [
      { id: 'contract-bidirectional-allow', edge: LIVE_EDGE, reason: 'live' },
      { id: 'contract-lateral-adapter-allow', edge: 'GoneAdapters->GoneInfra', reason: 'orphaned' },
    ]);
    const health = computeContractHealth(root, config, null, null, TODAY);
    expect(health.acknowledged).toBe(1);
    expect(health.ackLifecycle.staleCount).toBe(1);
    expect(health.ackLifecycle.stale).toEqual([
      { id: 'contract-lateral-adapter-allow', edge: 'GoneAdapters->GoneInfra' },
    ]);
    // The live ack still suppresses its smell.
    expect(health.smells).toEqual([]);
  });

  it('typo edges and unknown ids read as stale — never as silently applied', () => {
    const root = mk();
    writeAcks(root, [
      { id: 'contract-bidirectional-allow', edge: 'ApplicationOrchestration<->Typo' },
      { id: 'contract-bidirectional-allow', edge: 'A<->B<->C' },
      { id: 'not-a-smell-id', edge: LIVE_EDGE },
    ]);
    const health = computeContractHealth(root, config, null, null, TODAY);
    expect(health.acknowledged).toBe(0);
    expect(health.ackLifecycle.staleCount).toBe(3);
    // The real smell is untouched by any of them.
    expect(health.smells.map((s: { id: string }) => s.id)).toContain(
      'contract-bidirectional-allow'
    );
  });

  it('stale acks surface in doctor lines even when every smell is suppressed', () => {
    const root = mk();
    writeAcks(root, [
      { id: 'contract-bidirectional-allow', edge: LIVE_EDGE, reason: 'live' },
      { id: 'contract-lateral-adapter-allow', edge: 'GoneAdapters->GoneInfra' },
    ]);
    const health = computeContractHealth(root, config, null, null, TODAY);
    expect(health.smells).toEqual([]);
    const rows = formatContractHealthLines(health.smells, health);
    const stale = rows.find((r) => r.text.includes('match no detected edge'));
    expect(stale).toBeDefined();
    expect(stale!.text).toContain('GoneAdapters->GoneInfra');
    expect(stale!.text).toMatch(/fix the edge string or delete/);
  });

  it('the human line truncates a long stale list honestly', () => {
    const root = mk();
    const many = Array.from({ length: 7 }, (_, i) => ({
      id: 'contract-lateral-adapter-allow',
      edge: `Gone${i}Adapters->Gone${i}Infra`,
    }));
    writeAcks(root, [{ id: 'contract-bidirectional-allow', edge: LIVE_EDGE }, ...many]);
    const health = computeContractHealth(root, config, null, null, TODAY);
    const rows = formatContractHealthLines(health.smells, health);
    const stale = rows.find((r) => r.text.includes('match no detected edge'));
    expect(stale!.text).toContain('…(+3 more)');
  });

  it('an invalid sidecar reports zero stale — nothing is inspected in a broken file', () => {
    const root = mk();
    const abs = path.join(root, CONTRACT_SMELL_ACKS_PATH);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '{ not json');
    const health = computeContractHealth(root, config, null, null, TODAY);
    expect(health.ackFile.invalid).toBe(true);
    expect(health.ackLifecycle.staleCount).toBe(0);
  });

  it('the HTML report renders the stale note with its own honest overflow (X01 parity)', () => {
    const esc = (v: unknown) => String(v);
    const stale = Array.from({ length: 6 }, (_, i) => ({
      id: 'contract-lateral-adapter-allow',
      edge: `Gone${i}Adapters->Gone${i}Infra`,
    }));
    const html = renderAdvisorySections(
      {
        contractHealth: {
          smells: [],
          acknowledged: 1,
          ackFile: { path: CONTRACT_SMELL_ACKS_PATH },
          ackLifecycle: {
            undated: 1,
            malformed: 0,
            expiredCount: 0,
            expired: [],
            staleCount: 6,
            stale,
          },
          governanceWeight: { weight: 'unknown' },
        },
      },
      esc
    );
    expect(html).toContain('match no detected edge');
    expect(html).toContain('Gone0Adapters->Gone0Infra');
    // Plain count: doctor JSON caps its own list, so the note must not
    // promise the remainder lives there (cross-model review finding).
    expect(html).toContain('…(+2 more)');
    expect(html).not.toContain('more in doctor JSON');
  });

  it('stale output is stable under sidecar reordering', () => {
    const rootA = mk();
    const rootB = mk();
    const acks = [
      { id: 'contract-lateral-adapter-allow', edge: 'ZAdapters->ZInfra' },
      { id: 'contract-bidirectional-allow', edge: 'A<->Gone' },
      { id: 'contract-lateral-adapter-allow', edge: 'BAdapters->BInfra' },
    ];
    writeAcks(rootA, acks);
    writeAcks(rootB, [...acks].reverse());
    const a = computeContractHealth(rootA, config, null, null, TODAY);
    const b = computeContractHealth(rootB, config, null, null, TODAY);
    expect(a.ackLifecycle.stale).toEqual(b.ackLifecycle.stale);
    expect(a.ackLifecycle.stale.map((s: { edge: string }) => s.edge)).toEqual([
      'A<->Gone',
      'BAdapters->BInfra',
      'ZAdapters->ZInfra',
    ]);
  });
});
