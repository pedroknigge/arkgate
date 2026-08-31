/**
 * LD03 — project layers[].description onto place / prepare-write JSON (ADR 0035 D5).
 * Present caption is copied; absence omits the field and invents no doctor residual.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectAnalysisConfigWarnings } from '../../../src/kernel/configWarnings';
import { loadArkConfigContract } from '../../../src/domain/configContract';
import { runDoctor } from '../../../bin/lib/doctor-plan.mjs';
import { composePrepareWrite } from '../../../bin/lib/prepare-write.mjs';
import { placementDescriptionFields } from '../../../bin/lib/layer-description.mjs';

const require = createRequire(import.meta.url);
const CAPTION = 'Purchase requests — from asked to received.';

describe('LD03 placementDescriptionFields (ADR 0035 D5)', () => {
  it('returns description when the layer caption is a non-empty string', () => {
    expect(placementDescriptionFields({ description: CAPTION })).toEqual({
      description: CAPTION,
    });
  });

  it('omits the field when description is absent, empty, or not a string', () => {
    expect(placementDescriptionFields({})).toEqual({});
    expect(placementDescriptionFields({ name: 'DomainModel' })).toEqual({});
    expect(placementDescriptionFields({ description: undefined })).toEqual({});
    expect(placementDescriptionFields({ description: '' })).toEqual({});
    expect(placementDescriptionFields({ description: 1 })).toEqual({});
    expect(placementDescriptionFields(null)).toEqual({});
    expect(placementDescriptionFields(undefined)).toEqual({});
  });
});

describe('LD03 composePrepareWrite description pass-through', () => {
  const ts = require('typescript');
  const root = os.tmpdir();

  it('includes description when placement already carries the caption', () => {
    const out = composePrepareWrite({
      source: 'export type Id = string;\n',
      placement: {
        filePath: 'src/domain/id.ts',
        layer: 'DomainModel',
        governed: true,
        mayImport: [],
        mustNotImport: ['PersistenceAdapters'],
        forbiddenGlobals: ['fetch'],
        description: CAPTION,
      },
      root,
      ts,
      validate: () => ({ valid: true, violations: [] }),
    });
    expect(out.ok).toBe(true);
    expect(out.description).toBe(CAPTION);
    expect(JSON.parse(JSON.stringify(out))).toHaveProperty('description', CAPTION);
  });

  it('omits description when the placement caption is absent', () => {
    const out = composePrepareWrite({
      source: 'export type Id = string;\n',
      placement: {
        filePath: 'src/domain/id.ts',
        layer: 'DomainModel',
        governed: true,
        mayImport: [],
        mustNotImport: ['PersistenceAdapters'],
        forbiddenGlobals: ['fetch'],
      },
      root,
      ts,
      validate: () => ({ valid: true, violations: [] }),
    });
    expect(out.ok).toBe(true);
    expect(out).not.toHaveProperty('description');
    expect(JSON.parse(JSON.stringify(out))).not.toHaveProperty('description');
  });
});

describe('LD03 absence is silent on doctor / config (ADR 0035 D3)', () => {
  let tmp: string | undefined;

  afterEach(() => {
    if (!tmp) return;
    fs.rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it('does not invent a config warning or fail the contract when description is missing', () => {
    const config = {
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    };
    const loaded = loadArkConfigContract(config);
    expect(loaded.config.layers[0]).not.toHaveProperty('description');

    const warnings = collectAnalysisConfigWarnings({
      config: loaded.config,
      rules: loaded.config.rules,
      files: ['src/domain/order.ts'],
    });
    expect(
      warnings.some(
        (warning) =>
          /description/i.test(warning.ruleId) || /description/i.test(warning.message)
      )
    ).toBe(false);
  });

  it('doctor JSON invents no residual from a missing layer caption and does not flip ok', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-ld03-doctor-'));
    fs.mkdirSync(path.join(tmp, 'src/domain'), { recursive: true });
    const file = path.join(tmp, 'src/domain/order.ts');
    fs.writeFileSync(file, 'export const order = 1;\n');
    const config = {
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    };
    fs.writeFileSync(path.join(tmp, 'ark.config.json'), JSON.stringify(config));

    let payload: { ok?: boolean; doctor?: Record<string, unknown> } | undefined;
    runDoctor(tmp, config, [file], [], [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        payload = JSON.parse(text);
      },
    });
    expect(payload).toBeTruthy();
    const blob = JSON.stringify(payload);
    expect(blob).not.toMatch(/missing (layer )?description/i);
    expect(blob).not.toMatch(/description is required/i);
    expect(blob).not.toMatch(/layers\[\]\.description/i);
    expect(payload?.ok).toBe(true);
  });
});
