/**
 * LD04 — project layers[].description onto doctor / coverage / HTML (ADR 0035 D5).
 * Same caption as place JSON when present; absence omits or uses HTML fallback.
 * Never a residual, score, or valid flip.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  computeCoverage,
  runCoverage,
  runDoctor,
} from '../../../bin/lib/doctor-plan.mjs';
import {
  printDoctorCompactHuman,
  printDoctorDetailsHuman,
} from '../../../bin/lib/doctor-human.mjs';
import {
  renderBeginnerHtmlReport,
  renderHtmlReport,
} from '../../../bin/lib/html-report.mjs';
import {
  layerDescriptionCaption,
  placementDescriptionFields,
} from '../../../bin/lib/prepare-write.mjs';

const CAPTION = 'Purchase requests — from asked to received.';
const identityColor = {
  green: (s: string) => s,
  yellow: (s: string) => s,
  red: (s: string) => s,
  dim: (s: string) => s,
  bold: (s: string) => s,
};

function captureLog(fn: () => void): string {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => {
    lines.push(a.map(String).join(' '));
  };
  try {
    fn();
  } finally {
    console.log = orig;
  }
  return lines.join('\n');
}

function silentResidual(blob: string) {
  expect(blob).not.toMatch(/missing (layer )?description/i);
  expect(blob).not.toMatch(/description is required/i);
  expect(blob).not.toMatch(/layers\[\]\.description/i);
}

describe('LD04 layerDescriptionCaption (ADR 0035 D5)', () => {
  it('matches placementDescriptionFields for present and absent captions', () => {
    expect(layerDescriptionCaption({ description: CAPTION })).toBe(CAPTION);
    expect(placementDescriptionFields({ description: CAPTION })).toEqual({
      description: CAPTION,
    });
    expect(layerDescriptionCaption({})).toBeUndefined();
    expect(layerDescriptionCaption({ description: '' })).toBeUndefined();
    expect(layerDescriptionCaption({ description: 1 })).toBeUndefined();
    expect(placementDescriptionFields({})).toEqual({});
  });
});

describe('LD04 coverage JSON + human (ADR 0035 D5)', () => {
  let tmp: string | undefined;

  afterEach(() => {
    if (!tmp) return;
    fs.rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it('includes the place-JSON caption on the layer row and omits it when absent', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-ld04-cov-'));
    fs.mkdirSync(path.join(tmp, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'src/kernel'), { recursive: true });
    const domain = path.join(tmp, 'src/domain/order.ts');
    const kernel = path.join(tmp, 'src/kernel/gate.ts');
    fs.writeFileSync(domain, 'export const order = 1;\n');
    fs.writeFileSync(kernel, 'export const gate = 1;\n');
    const config = {
      include: ['src'],
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'], description: CAPTION },
        { name: 'Kernel', patterns: ['src/kernel/**'] },
      ],
      rules: [{ from: 'DomainModel', to: 'Kernel', allowed: false }],
    };

    const cov = computeCoverage(tmp, config, [domain, kernel], config.rules);
    const domainRow = cov.layers.find((row: { name: string }) => row.name === 'DomainModel');
    const kernelRow = cov.layers.find((row: { name: string }) => row.name === 'Kernel');
    expect(domainRow.description).toBe(CAPTION);
    expect(domainRow.description).toBe(placementDescriptionFields(config.layers[0]).description);
    expect(kernelRow).not.toHaveProperty('description');
    expect(JSON.parse(JSON.stringify(kernelRow))).not.toHaveProperty('description');
    expect(cov).not.toHaveProperty('score');
    expect(domainRow).not.toHaveProperty('score');

    const jsonText = captureLog(() => runCoverage(tmp, config, [domain, kernel], config.rules, true));
    const payload = JSON.parse(jsonText);
    expect(payload.ok).toBe(true);
    const jsonDomain = payload.coverage.layers.find((row: { name: string }) => row.name === 'DomainModel');
    const jsonKernel = payload.coverage.layers.find((row: { name: string }) => row.name === 'Kernel');
    expect(jsonDomain.description).toBe(CAPTION);
    expect(jsonKernel).not.toHaveProperty('description');
    silentResidual(jsonText);
    expect(jsonText).not.toMatch(/"score"/);

    const human = captureLog(() =>
      runCoverage(tmp, config, [domain, kernel], config.rules, false)
    );
    expect(human).toContain(CAPTION);
    expect(human).toContain('DomainModel');
    silentResidual(human);
    expect(human).not.toMatch(/See ark\.config\.json/);
  });

  it('does not invent a caption line when every layer is silent', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-ld04-cov-silent-'));
    fs.mkdirSync(path.join(tmp, 'src/domain'), { recursive: true });
    const file = path.join(tmp, 'src/domain/order.ts');
    fs.writeFileSync(file, 'export const order = 1;\n');
    const config = {
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    };
    const cov = computeCoverage(tmp, config, [file], []);
    expect(cov.layers[0]).not.toHaveProperty('description');
    const human = captureLog(() => runCoverage(tmp, config, [file], [], false));
    silentResidual(human);
    expect(human).not.toContain('—');
  });
});

describe('LD04 doctor JSON + human (ADR 0035 D5)', () => {
  let tmp: string | undefined;

  afterEach(() => {
    if (!tmp) return;
    fs.rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it('projects the same caption onto doctor JSON and does not flip ok', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-ld04-doc-'));
    fs.mkdirSync(path.join(tmp, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'src/kernel'), { recursive: true });
    const domain = path.join(tmp, 'src/domain/order.ts');
    const kernel = path.join(tmp, 'src/kernel/gate.ts');
    fs.writeFileSync(domain, 'export const order = 1;\n');
    fs.writeFileSync(kernel, 'export const gate = 1;\n');
    const config = {
      include: ['src'],
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'], description: CAPTION },
        { name: 'Kernel', patterns: ['src/kernel/**'] },
      ],
      rules: [{ from: 'DomainModel', to: 'Kernel', allowed: false }],
    };
    fs.writeFileSync(path.join(tmp, 'ark.config.json'), JSON.stringify(config));

    let payload: {
      ok?: boolean;
      doctor?: { layers?: Array<{ name: string; description?: string }>; score?: unknown };
    } | undefined;
    runDoctor(tmp, config, [domain, kernel], config.rules, [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        payload = JSON.parse(text);
      },
    });
    expect(payload?.ok).toBe(true);
    const domainRow = payload?.doctor?.layers?.find((row) => row.name === 'DomainModel');
    const kernelRow = payload?.doctor?.layers?.find((row) => row.name === 'Kernel');
    expect(domainRow?.description).toBe(CAPTION);
    expect(domainRow?.description).toBe(placementDescriptionFields(config.layers[0]).description);
    expect(kernelRow).not.toHaveProperty('description');
    expect(payload).not.toHaveProperty('score');
    expect(payload?.doctor).not.toHaveProperty('score');
    silentResidual(JSON.stringify(payload));
  });

  it('invents no residual and does not flip ok when the caption is absent', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-ld04-doc-silent-'));
    fs.mkdirSync(path.join(tmp, 'src/domain'), { recursive: true });
    const file = path.join(tmp, 'src/domain/order.ts');
    fs.writeFileSync(file, 'export const order = 1;\n');
    const config = {
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    };
    fs.writeFileSync(path.join(tmp, 'ark.config.json'), JSON.stringify(config));
    let payload: { ok?: boolean; doctor?: { layers?: Array<{ name: string }> } } | undefined;
    runDoctor(tmp, config, [file], [], [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        payload = JSON.parse(text);
      },
    });
    expect(payload?.ok).toBe(true);
    expect(payload?.doctor?.layers?.[0]).not.toHaveProperty('description');
    silentResidual(JSON.stringify(payload));
  });

  it('prints the caption on compact and Details human screens when present', () => {
    const logs = captureLog(() => {
      printDoctorCompactHuman({
        root: process.cwd(),
        analysisComplete: true,
        completeness: 'complete',
        doctorAdvisories: { parseHealth: { affectedFiles: 0 }, stewardNudge: null },
        operatingMode: 'enforce',
        designFitness: { designWeak: false, label: 'ok' },
        adopted: 'required-merge',
        stewardUnfinished: false,
        emptyScope: false,
        uniqueActions: ['keep CI'],
        ciMergeBoundary: { ci: { state: 'required' } },
        cov: {
          governed: { percent: 100, classifiedFiles: 1, totalFiles: 1 },
          layers: [
            { name: 'DomainModel', files: 1, description: CAPTION },
            { name: 'Kernel', files: 0 },
          ],
        },
        writePath: { gap: null, activeHost: 'grok' },
        writePathHonesty: {},
        gatesMissing: [],
        violations: [{ ruleId: 'x' }],
        color: identityColor,
      });
    });
    expect(logs).toContain(`DomainModel — ${CAPTION}`);
    expect(logs).not.toContain('Kernel —');
    silentResidual(logs);
    expect(logs).not.toMatch(/See ark\.config\.json/);

    const details = captureLog(() => {
      printDoctorDetailsHuman({
        root: process.cwd(),
        analysisComplete: true,
        completeness: 'complete',
        doctorAdvisories: { parseHealth: { affectedFiles: 0 }, stewardNudge: null },
        operatingMode: 'enforce',
        designFitness: { designWeak: false, label: 'ok' },
        adopted: 'required-merge',
        stewardUnfinished: false,
        emptyScope: false,
        uniqueActions: [],
        options: {},
        cov: {
          governed: { percent: 100, classifiedFiles: 1, totalFiles: 1 },
          suggestions: [],
          emptyLayers: [],
          layersWithoutRules: [],
          layers: [
            { name: 'DomainModel', files: 1, description: CAPTION },
            { name: 'Kernel', files: 0 },
          ],
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
        writePathHonesty: {},
        gatesMissing: [],
        violations: [],
        coverageHonesty: {},
        packageVersionTruth: null,
        designSmells: [],
        pilotLoop: null,
        goldenPattern: {},
        pureLayerOptIn: null,
        summary: { typeOnlyCount: 0, valueCount: 0, edges: [], concentrated: false },
        suppressed: 0,
        activeCount: 0,
        skillGaps: [],
        agentHomeGaps: [],
        baseline: { exists: false },
        baselineHonesty: {},
        staleBaseline: 0,
        staleRunners: [],
        adoption: { gaps: [], originReport: {} },
        color: identityColor,
      });
    });
    expect(details).toContain('Layers');
    expect(details).toContain(`DomainModel — ${CAPTION}`);
    expect(details).not.toContain('Kernel —');
    silentResidual(details);
  });

  it('omits caption lines on compact and Details when every layer is silent', () => {
    const compact = captureLog(() => {
      printDoctorCompactHuman({
        root: process.cwd(),
        analysisComplete: true,
        completeness: 'complete',
        doctorAdvisories: { parseHealth: { affectedFiles: 0 }, stewardNudge: null },
        operatingMode: 'enforce',
        designFitness: { designWeak: false, label: 'ok' },
        adopted: 'required-merge',
        stewardUnfinished: false,
        emptyScope: false,
        uniqueActions: ['keep CI'],
        ciMergeBoundary: { ci: { state: 'required' } },
        cov: {
          governed: { percent: 100, classifiedFiles: 1, totalFiles: 1 },
          layers: [{ name: 'DomainModel', files: 1 }],
        },
        writePath: { gap: null, activeHost: 'grok' },
        writePathHonesty: {},
        gatesMissing: [],
        violations: [{ ruleId: 'x' }],
        color: identityColor,
      });
    });
    expect(compact).not.toContain('DomainModel —');
    silentResidual(compact);

    const details = captureLog(() => {
      printDoctorDetailsHuman({
        root: process.cwd(),
        analysisComplete: true,
        completeness: 'complete',
        doctorAdvisories: { parseHealth: { affectedFiles: 0 }, stewardNudge: null },
        operatingMode: 'enforce',
        designFitness: { designWeak: false, label: 'ok' },
        adopted: 'required-merge',
        stewardUnfinished: false,
        emptyScope: false,
        uniqueActions: [],
        options: {},
        cov: {
          governed: { percent: 100, classifiedFiles: 1, totalFiles: 1 },
          suggestions: [],
          emptyLayers: [],
          layersWithoutRules: [],
          layers: [{ name: 'DomainModel', files: 1 }],
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
        writePathHonesty: {},
        gatesMissing: [],
        violations: [],
        coverageHonesty: {},
        packageVersionTruth: null,
        designSmells: [],
        pilotLoop: null,
        goldenPattern: {},
        pureLayerOptIn: null,
        summary: { typeOnlyCount: 0, valueCount: 0, edges: [], concentrated: false },
        suppressed: 0,
        activeCount: 0,
        skillGaps: [],
        agentHomeGaps: [],
        baseline: { exists: false },
        baselineHonesty: {},
        staleBaseline: 0,
        staleRunners: [],
        adoption: { gaps: [], originReport: {} },
        color: identityColor,
      });
    });
    expect(details).not.toContain('DomainModel —');
    silentResidual(details);
  });
});

describe('LD04 HTML report Purpose column parity (ADR 0035 D5)', () => {
  let tmp: string | undefined;

  afterEach(() => {
    if (!tmp) return;
    fs.rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it('shows the same caption in the existing Purpose column and keeps HTML fallbacks when absent', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-ld04-html-'));
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'ld04-demo' }));
    const config = {
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'], description: CAPTION },
        { name: 'Kernel', patterns: ['src/kernel/**'] },
      ],
      rules: [{ from: 'DomainModel', to: 'Kernel', allowed: false }],
    };
    const coverage = {
      governed: { percent: 100, classifiedFiles: 1, totalFiles: 1 },
      layers: [
        { name: 'DomainModel', files: 1, patterns: ['src/domain/**'], description: CAPTION },
        { name: 'Kernel', files: 0, patterns: ['src/kernel/**'] },
      ],
      unclassified: { count: 0, files: [] },
      emptyLayers: ['Kernel'],
      layersWithoutRules: [],
      suggestions: [],
      include: ['src'],
    };

    const html = renderHtmlReport({
      root: tmp,
      config,
      coverage,
      violations: [],
      ok: true,
      version: '4.8.6',
      configPath: 'ark.config.json',
      generatedAt: '2026-08-31',
    });
    expect(html).toContain(CAPTION);
    expect(html.match(/<th>Purpose<\/th>/g)).toHaveLength(1);
    expect(html).not.toMatch(/<th>Description<\/th>/);
    expect(html).toMatch(/<span class="dim">—<\/span>/);
    expect(html).toContain(placementDescriptionFields(config.layers[0]).description);
    silentResidual(html);

    const beginner = renderBeginnerHtmlReport({
      root: tmp,
      config,
      violations: [],
      ok: true,
      version: '4.8.6',
      configPath: 'ark.config.json',
      generatedAt: '2026-08-31',
    });
    expect(beginner).toContain(CAPTION);
    expect(beginner).toContain('See ark.config.json');
    expect(beginner.match(/<th>Purpose<\/th>/g)).toHaveLength(1);
    expect(beginner).not.toMatch(/<th>Description<\/th>/);
    silentResidual(beginner);
  });
});
