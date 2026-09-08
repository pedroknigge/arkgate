/**
 * Optional layers[].owners + requireLayerOwners — schema, hash strip,
 * projection, silent absence, required-mode teeth.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ARK_CONFIG_SCHEMA,
  layerOwnersList,
  layersMissingRequiredOwners,
  loadArkConfigContract,
} from '../../../src/domain/configContract.ts';
import { ArkConfigValidationError } from '../../../src/domain/configContract.ts';
import {
  effectiveContractPolicyPayload,
  omitLayerDescriptions,
  resolveEffectiveContract,
} from '../../../src/domain/effectiveContract.ts';
import { collectAnalysisConfigWarnings } from '../../../src/kernel/configWarnings.ts';
import { analyzePolicyDelta, loadContract } from '../../../src/kernel/analysisCore.ts';
import { loadContract as loadContractFromBundle } from '../../../bin/lib/analysis-engine.mjs';
import { computeCoverage, runCoverage, runDoctor } from '../../../bin/lib/doctor-plan.mjs';
import { composePrepareWrite } from '../../../bin/lib/prepare-write.mjs';
import {
  collectLayerOwnerResidual,
  layerGuidanceLine,
  layerOwners,
  placementDescriptionFields,
} from '../../../bin/lib/layer-description.mjs';
import {
  requiredOwnerWriteDeny,
  unownedLayerWriteDeny,
} from '../../../bin/lib/mcp-hook-payload.mjs';
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

function withOwners(owners?: string[], extra: Record<string, unknown> = {}) {
  const layer = { ...BASE.layers[0], ...extra } as Record<string, unknown>;
  if (owners !== undefined) layer.owners = owners;
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

function silentOwnerResidual(blob: string) {
  expect(blob).not.toMatch(/has no owner/i);
  expect(blob).not.toMatch(/owners is required/i);
  expect(blob).not.toMatch(/CONFIG_LAYER_MISSING_OWNER/);
}

describe('LO01 owners schema', () => {
  it('keeps Domain schema and docs on the same optional owners shape', () => {
    expect(ARK_CONFIG_SCHEMA.$defs.layer.properties.owners).toEqual({
      type: 'array',
      items: { type: 'string', minLength: 1 },
      uniqueItems: true,
      minItems: 1,
    });
    expect(ARK_CONFIG_SCHEMA.properties.requireLayerOwners).toEqual({ type: 'boolean' });
    const docs = fs.readFileSync(path.join(REPO, 'docs/configuration.md'), 'utf8');
    expect(docs).toContain('layers[].owners');
    expect(docs).toContain('requireLayerOwners');
    expect(docs).toContain('"owners": ["pedroknigge"]');
    expect(docs).toMatch(/does \*\*not\*\* change `policyHash`/);
    expect(docs).toMatch(/Absence is silent unless/);
    expect(docs).toMatch(/No `?\/ark-owners`/);
    const surface = fs.readFileSync(path.join(REPO, 'docs/package-surface.md'), 'utf8');
    expect(surface).toContain('layers[].owners');
    expect(surface).toMatch(/no `schemaVersion` bump/);
    expect(surface).toMatch(/Absence of owners is silent unless the require flag is on/i);
  });

  it('accepts a handle or email and rejects a display name or empty list', () => {
    expect(loadArkConfigContract(withOwners(['pedroknigge'])).config.layers[0]?.owners).toEqual([
      'pedroknigge',
    ]);
    expect(
      loadArkConfigContract(withOwners(['pedroknigge@users.noreply.github.com'])).config.layers[0]
        ?.owners
    ).toEqual(['pedroknigge@users.noreply.github.com']);
    expect(() => loadArkConfigContract(withOwners(['Pedro Knigge']))).toThrow(ArkConfigValidationError);
    expect(() => loadArkConfigContract(withOwners([]))).toThrow(ArkConfigValidationError);
    expect(() => loadArkConfigContract(withOwners(['']))).toThrow(ArkConfigValidationError);
  });

  it('accepts a config with no owners and no require flag', () => {
    const loaded = loadArkConfigContract(BASE);
    expect(loaded.config.layers[0]).not.toHaveProperty('owners');
    expect(loaded.config).not.toHaveProperty('requireLayerOwners');
    expect(layersMissingRequiredOwners(loaded.config)).toEqual([]);
  });
});

describe('LO01 policyHash strip', () => {
  it('omits owners and keeps other layer fields and the require flag', () => {
    const input = loadArkConfigContract({
      ...withOwners(['pedroknigge']),
      requireLayerOwners: true,
    }).config;
    const before = structuredClone(input);
    const stripped = omitLayerDescriptions(input);
    expect(stripped.layers[0]).not.toHaveProperty('owners');
    expect(stripped.layers[0]).not.toHaveProperty('description');
    expect(stripped.layers[0]?.name).toBe('DomainModel');
    expect(stripped.layers[0]?.forbiddenGlobals).toEqual(['fetch']);
    expect(stripped.requireLayerOwners).toBe(true);
    expect(input).toEqual(before);
    expect(input.layers[0]?.owners).toEqual(['pedroknigge']);
  });

  it('keeps policyHash stable when configs differ only in owners', () => {
    const absent = loadContract(BASE);
    const present = loadContract(withOwners(['pedroknigge']));
    const other = loadContract(withOwners(['other-dev']));
    expect(absent.policyHash).toBe(present.policyHash);
    expect(present.policyHash).toBe(other.policyHash);
    expect(loadContractFromBundle(withOwners(['pedroknigge'])).policyHash).toBe(
      loadContractFromBundle(BASE).policyHash
    );
  });

  it('changes policyHash when requireLayerOwners flips', () => {
    const off = loadContract(BASE);
    const on = loadContract({ ...BASE, requireLayerOwners: true });
    expect(off.policyHash).not.toBe(on.policyHash);
  });

  it('does not require a weakening acknowledgement for an owner-only edit', () => {
    const result = analyzePolicyDelta({
      baseConfig: BASE,
      candidateConfig: withOwners(['pedroknigge'], { description: CAPTION }),
    });
    expect(result.classification).toBe('neutral');
    expect(result.requiresAcknowledgement).toBe(false);
    expect(result.valid).toBe(true);
    expect(result.basePolicyHash).toBe(result.candidatePolicyHash);
  });

  it('omits owners from the ArkRules-active payload the same way as stewards', () => {
    const { config } = loadArkConfigContract({
      ...withOwners(['pedroknigge'], { description: CAPTION }),
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
    expect(payload.config.layers[0]).not.toHaveProperty('owners');
    expect(payload.config.layers[0]).not.toHaveProperty('description');
    expect(payload.config.layers[0]?.forbiddenGlobals).toEqual(['fetch']);
  });
});

describe('LO01 required mode', () => {
  it('is silent when requireLayerOwners is off and owners are missing', () => {
    const config = loadArkConfigContract(BASE).config;
    expect(layersMissingRequiredOwners(config)).toEqual([]);
    expect(collectLayerOwnerResidual(config)).toBeNull();
    const warnings = collectAnalysisConfigWarnings({
      config,
      rules: config.rules,
      files: ['src/domain/order.ts'],
    });
    expect(warnings.some((row) => row.ruleId === 'CONFIG_LAYER_MISSING_OWNER')).toBe(false);
    expect(requiredOwnerWriteDeny(config, 'DomainModel', 'src/domain/order.ts')).toBeNull();
  });

  it('names missing live houses when requireLayerOwners is on', () => {
    const config = loadArkConfigContract({ ...BASE, requireLayerOwners: true }).config;
    expect(layersMissingRequiredOwners(config)).toEqual(['DomainModel']);
    const residual = collectLayerOwnerResidual(config);
    expect(residual?.missingLayers).toEqual(['DomainModel']);
    expect(residual?.ask).toMatch(/DomainModel has no owner/);
    expect(residual?.nextAction).toMatch(/\/ark-adopt/);
    const warnings = collectAnalysisConfigWarnings({
      config,
      rules: config.rules,
      files: ['src/domain/order.ts'],
    });
    expect(warnings.some((row) => row.ruleId === 'CONFIG_LAYER_MISSING_OWNER')).toBe(true);
    const deny = requiredOwnerWriteDeny(config, 'DomainModel', 'src/domain/order.ts');
    expect(deny?.ruleId).toBe('CONFIG_LAYER_MISSING_OWNER');
    expect(unownedLayerWriteDeny('src/domain/order.ts', 'DomainModel').nextAction).toMatch(
      /\/ark-adopt/
    );
  });

  it('skips reserved houses and accepts a present owner list', () => {
    const reserved = loadArkConfigContract({
      schemaVersion: '1.1',
      include: ['src'],
      requireLayerOwners: true,
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'], owners: ['pedroknigge'] },
        { name: 'Future', patterns: ['src/future/**'], reserved: true },
      ],
      rules: [],
    }).config;
    expect(layersMissingRequiredOwners(reserved)).toEqual([]);
    expect(collectLayerOwnerResidual(reserved)).toBeNull();
    expect(layerOwnersList(reserved.layers[0])).toEqual(['pedroknigge']);
    expect(requiredOwnerWriteDeny(reserved, 'DomainModel', 'src/domain/order.ts')).toBeNull();
    expect(requiredOwnerWriteDeny(reserved, 'Future', 'src/future/x.ts')).toBeNull();
  });
});

describe('LO01 placement + doctor projection', () => {
  let tmp: string | undefined;

  afterEach(() => {
    if (!tmp) return;
    fs.rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it('projects a valid owner list and omits invalid or missing ones', () => {
    expect(layerOwners({ owners: ['pedroknigge'] })).toEqual(['pedroknigge']);
    expect(
      placementDescriptionFields({
        owners: ['pedroknigge'],
        description: CAPTION,
        trustBoundary: 'public',
      })
    ).toEqual({
      description: CAPTION,
      trustBoundary: 'public',
      owners: ['pedroknigge'],
    });
    expect(layerGuidanceLine({ owners: ['pedroknigge'] })).toBe('owner: @pedroknigge');
    expect(placementDescriptionFields({})).toEqual({});
    expect(placementDescriptionFields({ owners: [] })).toEqual({});
    expect(layerOwners({ owners: 1 })).toBeUndefined();
  });

  it('passes owners through prepare-write when placement already has them', () => {
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
        owners: ['pedroknigge'],
        description: CAPTION,
      },
      root: os.tmpdir(),
      ts,
      validate: () => ({ valid: true, violations: [] }),
    });
    expect(out.ok).toBe(true);
    expect(out.owners).toEqual(['pedroknigge']);
    expect(out.description).toBe(CAPTION);
  });

  it('includes owners on coverage/doctor JSON and human, and invents no residual when absent', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-lo01-'));
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
          owners: ['pedroknigge'],
        },
        { name: 'DomainModel', patterns: ['src/domain/**'] },
      ],
      rules: [{ from: 'Presentation', to: 'DomainModel', allowed: true }],
    };
    fs.writeFileSync(path.join(tmp, 'ark.config.json'), JSON.stringify(config));

    const cov = computeCoverage(tmp, config, [page, domain], config.rules);
    const owned = cov.layers.find((row: { name: string }) => row.name === 'Presentation');
    const silentRow = cov.layers.find((row: { name: string }) => row.name === 'DomainModel');
    expect(owned.owners).toEqual(['pedroknigge']);
    expect(owned.description).toBe(CAPTION);
    expect(silentRow).not.toHaveProperty('owners');

    const humanCov = captureLog(() => runCoverage(tmp, config, [page, domain], config.rules, false));
    expect(humanCov).toContain('owner: @pedroknigge');
    expect(humanCov).toContain(CAPTION);
    silentOwnerResidual(humanCov);

    let payload:
      | {
          ok?: boolean;
          doctor?: {
            layers?: Array<{ name: string; owners?: string[] }>;
            layerOwners?: { missingLayers?: string[] };
          };
        }
      | undefined;
    runDoctor(tmp, config, [page, domain], config.rules, [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        payload = JSON.parse(text);
      },
    });
    expect(payload?.ok).toBe(true);
    const doctorOwned = payload?.doctor?.layers?.find((row) => row.name === 'Presentation');
    const doctorSilent = payload?.doctor?.layers?.find((row) => row.name === 'DomainModel');
    expect(doctorOwned?.owners).toEqual(['pedroknigge']);
    expect(doctorSilent).not.toHaveProperty('owners');
    expect(payload?.doctor?.layerOwners).toBeUndefined();
    silentOwnerResidual(JSON.stringify(payload));

    const html = renderBeginnerHtmlReport({
      root: tmp,
      config,
      ok: true,
      violations: [],
    });
    expect(html).toContain('owner: @pedroknigge');
  });

  it('doctor residual and next step appear only when requireLayerOwners is on', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-lo01-req-'));
    fs.mkdirSync(path.join(tmp, 'src/domain'), { recursive: true });
    const file = path.join(tmp, 'src/domain/order.ts');
    fs.writeFileSync(file, 'export const order = 1;\n');
    const config = {
      include: ['src'],
      requireLayerOwners: true,
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    };
    fs.writeFileSync(path.join(tmp, 'ark.config.json'), JSON.stringify(config));
    let payload:
      | {
          ok?: boolean;
          doctor?: { layerOwners?: { missingLayers?: string[]; nextAction?: string } };
        }
      | undefined;
    runDoctor(tmp, config, [file], [], [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        payload = JSON.parse(text);
      },
    });
    expect(payload?.doctor?.layerOwners?.missingLayers).toEqual(['DomainModel']);
    expect(payload?.doctor?.layerOwners?.nextAction).toMatch(/\/ark-adopt/);
  });
});
