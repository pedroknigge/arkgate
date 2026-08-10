/**
 * DF02 — status improvementCompass honesty modes + residual ⊆ doctor parity.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  STATUS_COMPASS_MODES,
  STATUS_COMPASS_REASON_CODES,
  buildStatusManifest,
  normalizeStatusImprovementCompass,
  projectStatusImprovementCompass,
  statusCompassResidualIsSubsetOfDoctor,
  unavailableStatusImprovementCompass,
} from '../../../src/domain/statusManifest';
import { buildImprovementCompass } from '../../../src/domain/improvementCompass';
// eslint-disable-next-line -- runtime .mjs under test
import { buildDoctorImprovementCompass } from '../../../bin/lib/improvement-compass-doctor.mjs';
// eslint-disable-next-line
import {
  statusCompassFromSnapshot,
  thinStatusCompassFromDoctor,
} from '../../../bin/lib/status-command.mjs';

const PARITY_FIXTURE_PATH = path.resolve(
  'tests/fixtures/status-compass-parity/soc-dip-facts.json'
);

/** Shared fixture facts for SoC/DIP residual parity (status ⊆ doctor). */
const SOC_DIP_FACTS = {
  designSmells: [
    { id: 'domain-logic-in-ui', evidence: ['src/ui/canBuy.ts'] },
    { id: 'io-under-application', evidence: ['src/app/fetch.ts'] },
  ],
  violations: [
    { ruleId: 'LAYER_IMPORT_VIOLATION', file: 'src/a.ts', fromLayer: 'DomainModel', toLayer: 'PresentationAdapters' },
    { ruleId: 'CAPABILITY_VIOLATION', file: 'src/domain/x.ts' },
  ],
  designWeak: true,
  pureOrCapabilityResidual: 1,
  stackKind: 'typescript' as const,
};

describe('DF02 status compass honesty modes', () => {
  it('exports closed mode vocabulary full|subset|unavailable', () => {
    expect([...STATUS_COMPASS_MODES]).toEqual(['full', 'subset', 'unavailable']);
  });

  it('always notAScore; never invents residual when unavailable', () => {
    const unavailable = unavailableStatusImprovementCompass();
    expect(unavailable.notAScore).toBe(true);
    expect(unavailable.mode).toBe('unavailable');
    expect(unavailable.topResidual).toEqual([]);
    expect(unavailable.reasonCode).toBe(STATUS_COMPASS_REASON_CODES.NO_SESSION_SNAPSHOT);
    expect(unavailable.reason).toMatch(/never invents green/i);
    expect(unavailable).not.toHaveProperty('valid');
    expect(unavailable).not.toHaveProperty('score');
  });

  it('full mode projects residual ids from doctor-equivalent facts', () => {
    const doctor = buildImprovementCompass(SOC_DIP_FACTS);
    const status = projectStatusImprovementCompass({
      mode: 'full',
      topResidual: doctor.topResidual,
      factsSource: 'doctor-facts',
    });
    expect(status.mode).toBe('full');
    expect(status.notAScore).toBe(true);
    expect(status.topResidual.length).toBeGreaterThan(0);
    expect(status.topResidual).toEqual(expect.arrayContaining(['soc', 'dip']));
    expect(statusCompassResidualIsSubsetOfDoctor(status.topResidual, doctor.topResidual)).toBe(
      true
    );
  });

  it('adapter-style parity: status residual ⊆ doctor residual for same facts (SoC/DIP)', () => {
    // Same doctor adapter facts path used by report/doctor → thin status residual list.
    const doctorCompass = buildDoctorImprovementCompass(SOC_DIP_FACTS);
    expect(doctorCompass.notAScore).toBe(true);
    expect(doctorCompass.topResidual).toEqual(expect.arrayContaining(['soc', 'dip']));

    const statusFull = thinStatusCompassFromDoctor(doctorCompass, { mode: 'full' });
    expect(statusFull.mode).toBe('full');
    expect(statusFull.notAScore).toBe(true);
    expect(statusCompassResidualIsSubsetOfDoctor(statusFull.topResidual, doctorCompass.topResidual)).toBe(
      true
    );
    // Equal for full mode with identical residual list from the same doctor projection.
    expect(statusFull.topResidual).toEqual(doctorCompass.topResidual);
    expect(statusFull.topResidual).toEqual(expect.arrayContaining(['soc', 'dip']));

    // Pure Domain path with matching facts also includes SoC/DIP residual.
    const pureCompass = buildImprovementCompass({
      designSmells: SOC_DIP_FACTS.designSmells,
      violations: SOC_DIP_FACTS.violations,
      designWeak: true,
      pureOrCapabilityResidual: 1,
      stackKind: 'typescript',
    });
    expect(pureCompass.topResidual).toEqual(expect.arrayContaining(['soc', 'dip']));
    const statusFromPure = projectStatusImprovementCompass({
      mode: 'full',
      topResidual: pureCompass.topResidual,
      factsSource: 'doctor-facts',
    });
    expect(
      statusCompassResidualIsSubsetOfDoctor(statusFromPure.topResidual, pureCompass.topResidual)
    ).toBe(true);
  });

  it('subset mode labels partial residual and never claims full', () => {
    const doctorFull = buildDoctorImprovementCompass(SOC_DIP_FACTS);
    // Explicit subset of doctor residual ids (honest incomplete projection).
    const partialIds = doctorFull.topResidual.slice(0, 2);
    const statusSubset = projectStatusImprovementCompass({
      mode: 'subset',
      topResidual: partialIds,
      factsSource: 'report-snapshot',
      reasonCode: STATUS_COMPASS_REASON_CODES.FACTS_PARTIAL,
    });
    expect(statusSubset.mode).toBe('subset');
    expect(statusSubset.mode).not.toBe('full');
    expect(statusSubset.reasonCode).toBe(STATUS_COMPASS_REASON_CODES.FACTS_PARTIAL);
    expect(statusSubset.reason).toBeTruthy();
    expect(statusCompassResidualIsSubsetOfDoctor(statusSubset.topResidual, doctorFull.topResidual)).toBe(
      true
    );
  });

  it('insufficient facts → unavailable; empty residual is not green claim', () => {
    const fromMissing = statusCompassFromSnapshot(null);
    expect(fromMissing.mode).toBe('unavailable');
    expect(fromMissing.topResidual).toEqual([]);
    expect(fromMissing.reasonCode).toBe('NO_SESSION_SNAPSHOT');

    const fromEmptySnapshot = statusCompassFromSnapshot({
      kind: 'ark-architecture-snapshot',
      ok: true,
      activeViolations: 0,
    });
    expect(fromEmptySnapshot.mode).toBe('unavailable');
    expect(fromEmptySnapshot.topResidual).toEqual([]);
  });

  it('legacy snapshot residual without mode coerces to subset (never silent full)', () => {
    const legacy = normalizeStatusImprovementCompass({
      schemaVersion: '1.0',
      notAScore: true,
      topResidual: ['soc'],
    });
    expect(legacy).toMatchObject({
      mode: 'subset',
      notAScore: true,
      topResidual: ['soc'],
    });
    expect(legacy?.reasonCode).toBeTruthy();
  });

  it('rejects score-like or notAScore-false shapes', () => {
    expect(
      normalizeStatusImprovementCompass({
        schemaVersion: '1.0',
        notAScore: false,
        mode: 'full',
        topResidual: [],
      } as never)
    ).toBeNull();
    expect(
      normalizeStatusImprovementCompass({
        schemaVersion: '1.0',
        notAScore: true,
        mode: 'full',
        topResidual: ['soc'],
        score: 88,
      } as never)
    ).toBeNull();
  });

  it('status manifest residual never changes nextAction / gate isolation', () => {
    const baseFacts = {
      arkgateVersion: '4.5.0',
      resolvedRoot: '/repo',
      resolvedConfigPath: '/repo/ark.config.json',
      lastCheckVerdict: 'pass' as const,
      activeViolations: 0,
    };
    const without = buildStatusManifest(baseFacts);
    const withFull = buildStatusManifest({
      ...baseFacts,
      improvementCompass: projectStatusImprovementCompass({
        mode: 'full',
        topResidual: ['soc', 'dip', 'coupling'],
        factsSource: 'doctor-facts',
      }),
    });
    const withUnavailable = buildStatusManifest({
      ...baseFacts,
      improvementCompass: unavailableStatusImprovementCompass(),
    });
    expect(withFull.nextAction.id).toBe(without.nextAction.id);
    expect(withUnavailable.nextAction.id).toBe(without.nextAction.id);
    expect(withFull).not.toHaveProperty('valid');
    expect(withFull.improvementCompass?.notAScore).toBe(true);
  });

  it('reads full thin slice from report snapshot', () => {
    const doctor = buildDoctorImprovementCompass(SOC_DIP_FACTS);
    const thin = thinStatusCompassFromDoctor(doctor, { mode: 'full' });
    const fromSnap = statusCompassFromSnapshot({
      kind: 'ark-architecture-snapshot',
      improvementCompass: thin,
    });
    expect(fromSnap.mode).toBe('full');
    expect(fromSnap.topResidual).toEqual(doctor.topResidual);
    expect(statusCompassResidualIsSubsetOfDoctor(fromSnap.topResidual, doctor.topResidual)).toBe(
      true
    );
  });

  it('parity fixture file: status residual ⊆ doctor residual when full (SoC/DIP)', () => {
    const fixture = JSON.parse(fs.readFileSync(PARITY_FIXTURE_PATH, 'utf8')) as {
      facts: {
        designSmells: { id: string; evidence?: string[] }[];
        violations: { ruleId: string; file?: string }[];
        designWeak: boolean;
        stackKind: 'typescript';
      };
      expectedStatusMode: string;
      expectedResidualContains: string[];
      honesty: { modes: string[]; neverInventGreen: boolean };
    };
    expect(fixture.honesty.modes).toEqual(expect.arrayContaining([...STATUS_COMPASS_MODES]));
    expect(fixture.honesty.neverInventGreen).toBe(true);

    const doctor = buildDoctorImprovementCompass(fixture.facts);
    const status = thinStatusCompassFromDoctor(doctor, {
      mode: fixture.expectedStatusMode as 'full',
    });
    expect(status.mode).toBe('full');
    expect(status.notAScore).toBe(true);
    for (const id of fixture.expectedResidualContains) {
      expect(status.topResidual).toContain(id);
      expect(doctor.topResidual).toContain(id);
    }
    expect(statusCompassResidualIsSubsetOfDoctor(status.topResidual, doctor.topResidual)).toBe(
      true
    );
  });
});
