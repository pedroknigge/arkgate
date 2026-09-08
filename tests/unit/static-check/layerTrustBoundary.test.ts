/**
 * Optional layers[].trustBoundary — schema, hash strip, projection, silent absence.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { LAYER_TRUST_BOUNDARIES, loadArkConfigContract } from '../../../src/domain/configContract.ts';
import { ARK_CONFIG_SCHEMA } from '../../../src/domain/configContract.ts';
import {
  effectiveContractPolicyPayload,
  omitLayerDescriptions,
  resolveEffectiveContract,
} from '../../../src/domain/effectiveContract.ts';
import { analyzePolicyDelta, loadContract } from '../../../src/kernel/analysisCore.ts';
import { loadContract as loadContractFromBundle } from '../../../bin/lib/analysis-engine.mjs';
import { computeCoverage, runCoverage, runDoctor } from '../../../bin/lib/doctor-plan.mjs';
import { composePrepareWrite } from '../../../bin/lib/prepare-write.mjs';
import {
  LAYER_TRUST_BOUNDARIES as TOOLING_TRUST_BOUNDARIES,
  layerGuidanceLine,
  layerTrustBoundary,
  placementDescriptionFields,
} from '../../../bin/lib/layer-description.mjs';
import { renderBeginnerHtmlReport } from '../../../bin/lib/html-report.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CAPTION = 'Storefront checkout — what shoppers see.';

const BASE = {
  schemaVersion: '1.1' as const,
  include: ['src'],
  layers: [{ name: 'DomainModel', patterns: ['src/domain/**'], forbiddenGlobals: ['fetch'] }],
  rules: [{ from: 'DomainModel', to: 'Kernel', allowed: false }],
};

function withTrust(trustBoundary?: string, description?: string) {
  const layer = { ...BASE.layers[0] } as Record<string, unknown>;
  if (trustBoundary !== undefined) layer.trustBoundary = trustBoundary;
  if (description !== undefined) layer.description = description;
  return { ...BASE, layers: [layer] };
}

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

function silentTrustResidual(blob: string) {
  expect(blob).not.toMatch(/missing (layer )?trust/i);
  expect(blob).not.toMatch(/trustBoundary is required/i);
  expect(blob).not.toMatch(/trust tag is required/i);
}

describe('TB01 closed trustBoundary vocabulary', () => {
  it('keeps Domain schema, tooling helper, and docs on the same four tags', () => {
    expect([...LAYER_TRUST_BOUNDARIES]).toEqual(['public', 'auth', 'admin', 'internal']);
    expect([...TOOLING_TRUST_BOUNDARIES]).toEqual([...LAYER_TRUST_BOUNDARIES]);
    expect(ARK_CONFIG_SCHEMA.$defs.layer.properties.trustBoundary).toEqual({
      type: 'string',
      enum: [...LAYER_TRUST_BOUNDARIES],
    });
    const docs = fs.readFileSync(path.join(REPO, 'docs/configuration.md'), 'utf8');
    expect(docs).toContain('layers[].trustBoundary');
    expect(docs).toContain('"trustBoundary": "public"');
    expect(docs).toMatch(/does \*\*not\*\* change `policyHash`/);
    expect(docs).toMatch(/Absence is silent/);
    expect(docs).toMatch(/No `?\/ark-trust`/);
    expect(docs).toMatch(/not.*host\/CI TLS/i);
    const surface = fs.readFileSync(path.join(REPO, 'docs/package-surface.md'), 'utf8');
    expect(surface).toContain('layers[].trustBoundary');
    expect(surface).toMatch(/no `schemaVersion` bump/);
    expect(surface).toMatch(/never a residual, never a score/i);
  });
});

describe('TB01 policyHash strip', () => {
  it('omits trustBoundary and keeps other layer fields', () => {
    const input = loadArkConfigContract(withTrust('internal')).config;
    const before = structuredClone(input);
    const stripped = omitLayerDescriptions(input);
    expect(stripped.layers[0]).not.toHaveProperty('trustBoundary');
    expect(stripped.layers[0]).not.toHaveProperty('description');
    expect(stripped.layers[0]?.name).toBe('DomainModel');
    expect(stripped.layers[0]?.forbiddenGlobals).toEqual(['fetch']);
    expect(input).toEqual(before);
    expect(input.layers[0]?.trustBoundary).toBe('internal');
  });

  it('keeps policyHash stable when configs differ only in trustBoundary', () => {
    const absent = loadContract(BASE);
    const present = loadContract(withTrust('public'));
    const other = loadContract(withTrust('admin'));
    expect(absent.policyHash).toBe(present.policyHash);
    expect(present.policyHash).toBe(other.policyHash);
    expect(loadContractFromBundle(withTrust('auth')).policyHash).toBe(
      loadContractFromBundle(BASE).policyHash
    );
  });

  it('does not require a weakening acknowledgement for a tag-only edit', () => {
    const result = analyzePolicyDelta({
      baseConfig: BASE,
      candidateConfig: withTrust('public', CAPTION),
    });
    expect(result.classification).toBe('neutral');
    expect(result.requiresAcknowledgement).toBe(false);
    expect(result.valid).toBe(true);
    expect(result.basePolicyHash).toBe(result.candidatePolicyHash);
  });

  it('omits trustBoundary from the ArkRules-active payload the same way as stewards', () => {
    const { config } = loadArkConfigContract({
      ...withTrust('admin', CAPTION),
      arkRules: { DomainModel: 'arkrules/DomainModel.json' },
    });
    const contract = resolveEffectiveContract({
      config,
      fileContents: {
        'arkrules/DomainModel.json': JSON.stringify({
          schemaVersion: '1.0',
          layer: 'DomainModel',
        }),
      },
    });
    const payload = effectiveContractPolicyPayload(contract) as {
      config: { layers: Array<Record<string, unknown>>; stewards?: unknown };
    };
    expect(payload.config.stewards).toBeUndefined();
    expect(payload.config.layers[0]).not.toHaveProperty('trustBoundary');
    expect(payload.config.layers[0]).not.toHaveProperty('description');
    expect(payload.config.layers[0]?.forbiddenGlobals).toEqual(['fetch']);
  });
});

describe('TB01 placement + doctor projection', () => {
  let tmp: string | undefined;

  afterEach(() => {
    if (!tmp) return;
    fs.rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it('projects a valid tag and omits invalid or missing ones', () => {
    expect(layerTrustBoundary({ trustBoundary: 'public' })).toBe('public');
    expect(placementDescriptionFields({ trustBoundary: 'auth', description: CAPTION })).toEqual({
      description: CAPTION,
      trustBoundary: 'auth',
    });
    expect(layerGuidanceLine({ description: CAPTION, trustBoundary: 'public' })).toBe(
      `${CAPTION} · trust: public`
    );
    expect(layerGuidanceLine({ trustBoundary: 'admin' })).toBe('trust: admin');
    expect(placementDescriptionFields({})).toEqual({});
    expect(placementDescriptionFields({ trustBoundary: 'trusted' })).toEqual({});
    expect(placementDescriptionFields({ trustBoundary: '' })).toEqual({});
    expect(layerTrustBoundary({ trustBoundary: 1 })).toBeUndefined();
  });

  it('passes the tag through prepare-write when placement already has it', () => {
    const ts = require('typescript');
    const out = composePrepareWrite({
      source: 'export type Id = string;\n',
      placement: {
        filePath: 'src/app/page.ts',
        layer: 'Presentation',
        governed: true,
        mayImport: [],
        mustNotImport: [],
        forbiddenGlobals: [],
        trustBoundary: 'public',
        description: CAPTION,
      },
      root: os.tmpdir(),
      ts,
      validate: () => ({ valid: true, violations: [] }),
    });
    expect(out.ok).toBe(true);
    expect(out.trustBoundary).toBe('public');
    expect(out.description).toBe(CAPTION);
  });

  it('includes the tag on coverage/doctor JSON and human, and invents no residual when absent', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-tb01-'));
    fs.mkdirSync(path.join(tmp, 'src/app'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'src/domain'), { recursive: true });
    const page = path.join(tmp, 'src/app/page.ts');
    const domain = path.join(tmp, 'src/domain/order.ts');
    fs.writeFileSync(page, 'export const page = 1;\n');
    fs.writeFileSync(domain, 'export const order = 1;\n');
    const config = {
      include: ['src'],
      layers: [
        {
          name: 'Presentation',
          patterns: ['src/app/**'],
          description: CAPTION,
          trustBoundary: 'public',
        },
        { name: 'DomainModel', patterns: ['src/domain/**'] },
      ],
      rules: [{ from: 'Presentation', to: 'DomainModel', allowed: true }],
    };
    fs.writeFileSync(path.join(tmp, 'ark.config.json'), JSON.stringify(config));

    const cov = computeCoverage(tmp, config, [page, domain], config.rules);
    const publicRow = cov.layers.find((row: { name: string }) => row.name === 'Presentation');
    const silentRow = cov.layers.find((row: { name: string }) => row.name === 'DomainModel');
    expect(publicRow.trustBoundary).toBe('public');
    expect(publicRow.description).toBe(CAPTION);
    expect(silentRow).not.toHaveProperty('trustBoundary');
    expect(silentRow).not.toHaveProperty('description');

    const humanCov = captureLog(() => runCoverage(tmp, config, [page, domain], config.rules, false));
    expect(humanCov).toContain('trust: public');
    expect(humanCov).toContain(CAPTION);
    silentTrustResidual(humanCov);

    let payload: {
      ok?: boolean;
      doctor?: { layers?: Array<{ name: string; trustBoundary?: string }> };
    } | undefined;
    runDoctor(tmp, config, [page, domain], config.rules, [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        payload = JSON.parse(text);
      },
    });
    expect(payload?.ok).toBe(true);
    const doctorPublic = payload?.doctor?.layers?.find((row) => row.name === 'Presentation');
    const doctorSilent = payload?.doctor?.layers?.find((row) => row.name === 'DomainModel');
    expect(doctorPublic?.trustBoundary).toBe('public');
    expect(doctorSilent).not.toHaveProperty('trustBoundary');
    silentTrustResidual(JSON.stringify(payload));

    const html = renderBeginnerHtmlReport({
      root: tmp,
      config,
      ok: true,
      violations: [],
    });
    expect(html).toContain('trust: public');
  });

  it('does not invent residual or flip ok when every layer is untagged', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-tb01-silent-'));
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
    expect(payload?.doctor?.layers?.[0]).not.toHaveProperty('trustBoundary');
    silentTrustResidual(JSON.stringify(payload));
  });
});
