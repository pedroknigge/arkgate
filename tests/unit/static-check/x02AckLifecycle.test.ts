/**
 * X02 — contract-smell acknowledgments have a lifecycle (field feedback,
 * the field adopter 2026-07-16: ~15 of 29 acks were transitional migration debt with
 * no review date — fossilizable by construction).
 *
 * The rule: an optional `reviewBy` (YYYY-MM-DD) marks when a deliberate
 * exception must be re-reviewed. Past that date the ack stops applying and
 * the smell returns, annotated. Undated acks keep applying (backward
 * compatible) but are counted and surfaced. Advisory only throughout.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CONTRACT_SMELL_ACKS_PATH,
  loadContractSmellAcks,
  analyzeContractSmells,
  detectContractSmells,
  computeContractHealth,
  formatContractHealthLines,
  summarizeContractHealth,
} from '../../../bin/lib/contract-smells.mjs';
// eslint-disable-next-line -- runtime .mjs module under test (report parity)
import { renderAdvisorySections } from '../../../bin/lib/html-report-advisories.mjs';

const TODAY = '2026-07-16';
const temps: string[] = [];

function mk(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-ack-lifecycle-'));
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
const EDGE = 'ApplicationOrchestration<->WorkflowSagaEngine';

function writeAcks(root: string, acks: unknown[]) {
  const abs = path.join(root, CONTRACT_SMELL_ACKS_PATH);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify({ version: 1, acks }));
}

function healthFor(root: string, today = TODAY) {
  return computeContractHealth(root, config, null, null, today);
}

function ack(reviewBy?: unknown) {
  return {
    id: 'contract-bidirectional-allow',
    edge: EDGE,
    reason: 'saga callbacks during migration',
    ...(reviewBy === undefined ? {} : { reviewBy }),
  };
}

describe('X02 ack lifecycle — reviewBy semantics', () => {
  it('an undated ack still applies (backward compatible) and is counted as undated', () => {
    const root = mk();
    writeAcks(root, [ack()]);
    const health = healthFor(root);
    expect(health.smells).toEqual([]);
    expect(health.acknowledged).toBe(1);
    expect(health.ackLifecycle).toEqual({
      undated: 1,
      malformed: 0,
      expiredCount: 0,
      expired: [],
      staleCount: 0,
      stale: [],
    });
  });

  it('a future or same-day reviewBy applies; the day itself is still current', () => {
    const root = mk();
    for (const date of ['2026-12-31', TODAY]) {
      writeAcks(root, [ack(date)]);
      const health = healthFor(root);
      expect(health.smells, date).toEqual([]);
      expect(health.acknowledged, date).toBe(1);
      expect(health.ackLifecycle.undated, date).toBe(0);
      expect(health.ackLifecycle.expiredCount, date).toBe(0);
    }
  });

  it('an expired ack stops applying: the smell returns annotated and the expiry is reported', () => {
    const root = mk();
    writeAcks(root, [ack('2026-01-01')]);
    const health = healthFor(root);
    const smell = health.smells.find((s: { id: string }) => s.id === 'contract-bidirectional-allow');
    expect(smell).toBeDefined();
    expect(smell.evidence.some((e: string) => e.includes('(ack expired 2026-01-01)'))).toBe(true);
    expect(health.acknowledged).toBe(0);
    expect(health.ackLifecycle.expiredCount).toBe(1);
    expect(health.ackLifecycle.expired).toEqual([
      { id: 'contract-bidirectional-allow', edge: EDGE, reviewBy: '2026-01-01' },
    ]);
  });

  it('a malformed reviewBy never applies — fail-loud like a sloppy edge', () => {
    const root = mk();
    for (const bad of ['soon', '2026-3-01', '2026-02-30', '2026-13-01', '01-01-2026']) {
      writeAcks(root, [ack(bad)]);
      const health = healthFor(root);
      const smell = health.smells.find(
        (s: { id: string }) => s.id === 'contract-bidirectional-allow'
      );
      expect(smell, bad).toBeDefined();
      expect(
        smell.evidence.some((e: string) => e.includes('(ack review-by malformed)')),
        bad
      ).toBe(true);
      expect(health.ackLifecycle.malformed, bad).toBe(1);
      expect(health.acknowledged, bad).toBe(0);
    }
  });

  it('a non-string reviewBy invalidates the whole file — wrong shape, not a date typo', () => {
    const root = mk();
    writeAcks(root, [ack(20260716)]);
    const state = loadContractSmellAcks(root);
    expect(state.invalid).toBe(true);
    expect(state.acks).toEqual([]);
  });

  it('a re-ack with a fresh date wins over a dead entry for the same edge', () => {
    const root = mk();
    writeAcks(root, [ack('2026-01-01'), ack('2026-12-31')]);
    const health = healthFor(root);
    expect(health.smells).toEqual([]);
    expect(health.acknowledged).toBe(1);
    expect(health.ackLifecycle.expiredCount).toBe(0);
  });

  it('a leftover undated duplicate cannot resurrect an expired dated ack', () => {
    // Cross-model review finding: once any dated ack exists for the edge, the
    // dated entries govern — else a sloppy migration defeats the lifecycle.
    const root = mk();
    writeAcks(root, [ack(), ack('2026-01-01')]);
    const health = healthFor(root);
    const smell = health.smells.find(
      (s: { id: string }) => s.id === 'contract-bidirectional-allow'
    );
    expect(smell).toBeDefined();
    expect(smell.evidence.some((e: string) => e.includes('(ack expired 2026-01-01)'))).toBe(true);
    expect(health.acknowledged).toBe(0);
    expect(health.ackLifecycle.undated).toBe(0);
    expect(health.ackLifecycle.expiredCount).toBe(1);
  });

  it('detectContractSmells expires dated acks against the real clock by default', () => {
    const root = mk();
    writeAcks(root, [ack('1999-01-01')]);
    const smells = detectContractSmells(config, null, loadContractSmellAcks(root));
    expect(smells.find((s) => s.id === 'contract-bidirectional-allow')).toBeDefined();
    // Explicit null disables expiry for callers that need the pure behavior.
    const inert = detectContractSmells(config, null, loadContractSmellAcks(root), null, null);
    expect(inert).toEqual([]);
  });

  it('without an injected today (real clock), a long-past reviewBy is expired', () => {
    const root = mk();
    writeAcks(root, [ack('1999-01-01')]);
    const health = computeContractHealth(root, config, null, null);
    expect(health.ackLifecycle.expiredCount).toBe(1);
    expect(health.acknowledged).toBe(0);
  });

  it('analyze without a today keeps dated acks applying (non-doctor callers unchanged)', () => {
    const root = mk();
    writeAcks(root, [ack('1999-01-01')]);
    const { smells, matchedAcks } = analyzeContractSmells(
      config,
      null,
      loadContractSmellAcks(root),
      null
    );
    expect(smells).toEqual([]);
    expect(matchedAcks).toBe(1);
  });
});

describe('X02 ack lifecycle — surfaces (doctor lines + report parity)', () => {
  it('doctor lines warn on expired and malformed, and note undated acks', () => {
    const root = mk();
    writeAcks(root, [ack('2026-01-01')]);
    const rows = formatContractHealthLines(healthFor(root).smells, healthFor(root));
    expect(rows.some((r) => r.mark === 'warn' && r.text.includes('past review-by'))).toBe(true);

    writeAcks(root, [ack('soon')]);
    const malformed = healthFor(root);
    const malformedRows = formatContractHealthLines(malformed.smells, malformed);
    expect(
      malformedRows.some((r) => r.mark === 'warn' && r.text.includes('malformed review-by'))
    ).toBe(true);
  });

  it('undated acks surface even when every smell is suppressed — the fossilization case', () => {
    const root = mk();
    writeAcks(root, [ack()]);
    const health = healthFor(root);
    expect(health.smells).toEqual([]);
    const rows = formatContractHealthLines(health.smells, health);
    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.some((r) => r.mark === 'dim' && r.text.includes('no review-by date'))
    ).toBe(true);
  });

  it('summarize defaults keep old callers whole and cap the expired list honestly', () => {
    const bare = summarizeContractHealth([], { exists: false, acks: [] }, 0);
    expect(bare.ackLifecycle).toEqual({
      undated: 0,
      malformed: 0,
      expiredCount: 0,
      expired: [],
      staleCount: 0,
      stale: [],
    });
    const many = Array.from({ length: 15 }, (_, i) => ({
      id: 'contract-bidirectional-allow',
      edge: `A${i}<->B${i}`,
      reviewBy: '2026-01-01',
    }));
    const capped = summarizeContractHealth([], { exists: false, acks: [] }, 0, {
      undated: 0,
      malformed: 0,
      expired: many,
      stale: many.map(({ id, edge }) => ({ id, edge })),
    });
    expect(capped.ackLifecycle.expiredCount).toBe(15);
    expect(capped.ackLifecycle.expired.length).toBe(12);
    expect(capped.ackLifecycle.staleCount).toBe(15);
    expect(capped.ackLifecycle.stale.length).toBe(12);
  });

  it('the HTML report renders lifecycle truth inside the contractHealth section (X01 parity)', () => {
    const esc = (v: unknown) => String(v);
    const html = renderAdvisorySections(
      {
        contractHealth: {
          smells: [],
          acknowledged: 2,
          ackFile: { path: CONTRACT_SMELL_ACKS_PATH },
          ackLifecycle: {
            undated: 2,
            malformed: 1,
            expiredCount: 1,
            expired: [{ id: 'contract-bidirectional-allow', edge: EDGE, reviewBy: '2026-01-01' }],
          },
          governanceWeight: { weight: 'unknown' },
        },
      },
      esc
    );
    expect(html).toContain('past review-by');
    expect(html).toContain('review-by 2026-01-01');
    expect(html).toContain('malformed review-by');
    expect(html).toContain('cannot fossilize');
  });
});
