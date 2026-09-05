/**
 * Doctor / HTML / check: ArkOrder section (notAScore) + [ArkOrder] deny label.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeSemanticGateArtifacts } from '../../helpers/semanticGateArtifacts';
import { summarizeArkOrderSection } from '../../../bin/lib/ark-order-doctor.mjs';
import { formatArkOrderHtml } from '../../../bin/lib/ark-order-report.mjs';
import { violationPlaneLabel } from '../../../bin/lib/violations.mjs';

const CHECK = path.resolve('bin/ark-check.mjs');
const CORPUS = path.resolve('tests/fixtures/arkorder-skip-corpus');
const roots: string[] = [];

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(CORPUS, relativePath), 'utf8')) as Record<
    string,
    unknown
  >;
}

function copyTree(tree: string, extra: Record<string, unknown>): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `ark-ao-doctor-`)));
  roots.push(root);
  fs.cpSync(path.join(CORPUS, tree), root, { recursive: true });
  fs.writeFileSync(path.join(root, 'ark.config.json'), `${JSON.stringify(extra, null, 2)}\n`);
  writeSemanticGateArtifacts(root);
  return root;
}

function configFor(mode: 'absent' | 'advisory' | 'enforced'): Record<string, unknown> {
  const layers = readJson('contracts/layers.json');
  if (mode === 'absent') return layers;
  return {
    ...layers,
    ...readJson(
      mode === 'enforced'
        ? 'contracts/arkorder-enforced.json'
        : 'contracts/arkorder-advisory.json'
    ),
  };
}

function runCheck(root: string, extra: string[] = []) {
  const run = spawnSync(
    process.execPath,
    [CHECK, '--root', root, '--config', 'ark.config.json', '--no-cache', ...extra],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
  );
  return {
    status: run.status ?? 1,
    stdout: run.stdout,
    stderr: run.stderr,
    raw: `${run.stdout}\n${run.stderr}`,
  };
}

function runJson(root: string, extra: string[] = []) {
  const run = runCheck(root, ['--json', ...extra]);
  return {
    ...run,
    data: JSON.parse(run.stdout || '{}') as Record<string, unknown>,
  };
}

describe('ArkOrder doctor / deny label', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('absence stays silent on doctor arkOrder and does not arm extra merge teeth', () => {
    const root = copyTree('trees/xi-field-write', configFor('absent'));
    const doctor = runJson(root, ['--doctor']);
    const payload = doctor.data as {
      doctor?: {
        arkOrder?: {
          notAScore?: boolean;
          active?: boolean;
          extraMergeTeeth?: boolean;
          residual?: { count?: number };
        };
        rulesUnderContract?: {
          mergePlanes?: { arkOrder?: { present?: boolean }; extraMergeTeeth?: boolean };
        };
      };
    };
    expect(payload.doctor?.arkOrder?.notAScore).toBe(true);
    expect(payload.doctor?.arkOrder?.active).toBe(false);
    expect(payload.doctor?.arkOrder?.extraMergeTeeth).toBe(false);
    expect(payload.doctor?.arkOrder?.residual?.count).toBe(0);
    expect(payload.doctor?.rulesUnderContract?.mergePlanes?.arkOrder?.present).toBe(false);
  });

  it('enforced Prisma PATCH of plan fails labeled [ArkOrder]', () => {
    const root = copyTree('trees/xi-field-write', configFor('enforced'));
    const check = runCheck(root);
    expect(check.status).not.toBe(0);
    expect(check.raw).toMatch(/\[ArkOrder\]\s+ARKORDER_XI_FIELD_WRITE/);
    expect(check.raw).toMatch(/plan/);

    const doctor = runJson(root, ['--doctor']);
    const arkOrder = (doctor.data as { doctor?: { arkOrder?: Record<string, unknown> } }).doctor
      ?.arkOrder;
    expect(arkOrder?.notAScore).toBe(true);
    expect(arkOrder?.active).toBe(true);
    expect(arkOrder?.mode).toBe('enforced');
    expect(arkOrder?.extraMergeTeeth).toBe(true);
    expect((arkOrder?.residual as { ruleIds?: string[] }).ruleIds).toContain(
      'ARKORDER_XI_FIELD_WRITE'
    );
    expect(arkOrder?.xiKeys).toEqual(['plan', 'cycle', 'tenancy']);
  });

  it('human doctor leads with the one-breath when the extra is on', () => {
    const root = copyTree('trees/xi-field-write', configFor('enforced'));
    const doctor = runCheck(root, ['--doctor']);
    expect(doctor.raw).toMatch(/ArkOrder freezes the pattern through a valve/);
    expect(doctor.raw).toMatch(/Prisma PATCH of a named slow key/);
    expect(doctor.raw).toMatch(/xiKeys[=:] ?plan, cycle, tenancy/);
  });

  it('HTML report emits data-advisory="arkOrder" and no score UI', () => {
    const inactive = formatArkOrderHtml(summarizeArkOrderSection({}), (v: string) => v);
    expect(inactive).toContain('data-advisory="arkOrder"');
    expect(inactive).toMatch(/silent/i);

    const section = summarizeArkOrderSection({
      arkOrder: {
        mode: 'enforced',
        planeRoots: ['src/main.ts'],
        managedLayers: ['ApplicationOrchestration'],
        xiKeys: ['plan', 'cycle', 'tenancy'],
      },
      findings: [{ ruleId: 'ARKORDER_XI_FIELD_WRITE' }],
      classification: { governedPercent: 100, populatedLayerCount: 2 },
    });
    const html = formatArkOrderHtml(section, (v: string) => String(v));
    expect(html).toContain('data-advisory="arkOrder"');
    expect(html).toContain('[ArkOrder]');
    expect(html).toContain('ARKORDER_XI_FIELD_WRITE');
    expect(html).toMatch(/not a score/i);
    expect(html).not.toMatch(/Excellent|score bar|\d+\s*\/\s*10/i);
  });

  it('violationPlaneLabel prefixes only extra planes', () => {
    expect(violationPlaneLabel('ARKORDER_XI_FIELD_WRITE')).toBe('[ArkOrder] ');
    expect(violationPlaneLabel('ARKRUN_MISSING_ROOT')).toBe('[ArkRun] ');
    expect(violationPlaneLabel('LAYER_IMPORT_VIOLATION')).toBe('');
  });
});
