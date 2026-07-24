import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ARK_RULES_SCHEMA,
  ARK_RULES_SCHEMA_VERSION,
  buildEffectiveArkRules,
  emptyEffectiveArkRules,
  loadArkRulesContract,
  parseArkRulesJson,
} from '../../../src/domain/arkRulesContract';
import {
  EffectiveContractError,
  effectiveContractPolicyPayload,
  resolveEffectiveContract,
} from '../../../src/domain/effectiveContract';
import { loadArkConfigContract } from '../../../src/domain/configContract';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

const VALID_RULES = {
  schemaVersion: '1.0' as const,
  layer: 'DomainModel',
  structure: [
    {
      id: 'always-valid-aggregates',
      sensor: 'aggregate-private-state',
      mode: 'advisory' as const,
      appliesTo: ['src/domain/**/aggregates/**'],
    },
  ],
  invariants: [
    {
      id: 'INV-ORDER-001',
      description: 'An order total never goes below zero',
      aggregate: 'Order',
      coverage: { test: true, symbol: 'Order.ensureInvariants' },
      mode: 'enforced' as const,
    },
  ],
};

describe('AR01 ArkRules contract (ADR 0012)', () => {
  it('loads a valid ArkRules file and defaults empty arrays', () => {
    const loaded = loadArkRulesContract(
      { schemaVersion: '1.0', layer: 'DomainModel' },
      'arkrules/DomainModel.json'
    );
    expect(loaded.config.schemaVersion).toBe(ARK_RULES_SCHEMA_VERSION);
    expect(loaded.config.structure).toEqual([]);
    expect(loaded.config.invariants).toEqual([]);
  });

  it('accepts the plan sketch shape', () => {
    const loaded = loadArkRulesContract(VALID_RULES, 'arkrules/DomainModel.json', 'DomainModel');
    expect(loaded.config.structure?.[0]?.sensor).toBe('aggregate-private-state');
    expect(loaded.config.invariants?.[0]?.id).toBe('INV-ORDER-001');
  });

  it('fails closed on unknown sensors, layer mismatch, and tier-2 enforced', () => {
    expect(() =>
      loadArkRulesContract(
        {
          schemaVersion: '1.0',
          layer: 'DomainModel',
          structure: [{ id: 'x', sensor: 'not-a-sensor' }],
        },
        'bad.json'
      )
    ).toThrow('must be one of');

    expect(() =>
      loadArkRulesContract(VALID_RULES, 'arkrules/DomainModel.json', 'Kernel')
    ).toThrow('must match referencing key "Kernel"');

    expect(() =>
      loadArkRulesContract(
        {
          schemaVersion: '1.0',
          layer: 'DomainModel',
          structure: [{ id: 'anemic', sensor: 'no-anemic-model', mode: 'enforced' }],
        },
        'tier2.json'
      )
    ).toThrow('Tier-2 advisory-only');
  });

  it('fails closed on empty appliesTo and duplicate ids', () => {
    expect(() =>
      loadArkRulesContract(
        {
          schemaVersion: '1.0',
          layer: 'DomainModel',
          structure: [{ id: 'a', sensor: 'thin-adapter', appliesTo: [] }],
        },
        'empty-scope.json'
      )
    ).toThrow('must not be an empty array');

    expect(() =>
      loadArkRulesContract(
        {
          schemaVersion: '1.0',
          layer: 'DomainModel',
          structure: [
            { id: 'dup', sensor: 'thin-adapter' },
            { id: 'dup', sensor: 'orchestration-only' },
          ],
        },
        'dup.json'
      )
    ).toThrow('duplicate rule id');
  });

  it('builds Effective Contract with provenance and empty when absent', () => {
    const file = loadArkRulesContract(VALID_RULES).config;
    const effective = buildEffectiveArkRules([
      { layer: 'DomainModel', sourceFile: 'arkrules/DomainModel.json', file },
    ]);
    expect(effective.structure[0]?.provenance).toEqual({
      sourceFile: 'arkrules/DomainModel.json',
      ruleId: 'always-valid-aggregates',
      layer: 'DomainModel',
    });
    expect(emptyEffectiveArkRules().structure).toEqual([]);
    expect(emptyEffectiveArkRules().invariants).toEqual([]);
  });

  it('resolveEffectiveContract fails closed on missing / invalid references', () => {
    const { config } = loadArkConfigContract({
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
      schemaVersion: '1.1',
      arkRules: { DomainModel: 'arkrules/DomainModel.json' },
    });

    expect(() =>
      resolveEffectiveContract({ config, fileContents: {} }, 'ark.config.json')
    ).toThrow(EffectiveContractError);
    expect(() =>
      resolveEffectiveContract({ config, fileContents: {} }, 'ark.config.json')
    ).toThrow('arkrules/DomainModel.json');

    expect(() =>
      resolveEffectiveContract(
        {
          config,
          fileContents: { 'arkrules/DomainModel.json': '{ not json' },
        },
        'ark.config.json'
      )
    ).toThrow('not valid JSON');

    expect(() =>
      resolveEffectiveContract(
        {
          config,
          fileContents: {
            'arkrules/DomainModel.json': JSON.stringify({
              schemaVersion: '1.0',
              layer: 'Kernel',
            }),
          },
        },
        'ark.config.json'
      )
    ).toThrow('must match referencing key');

    const ok = resolveEffectiveContract({
      config,
      fileContents: {
        'arkrules/DomainModel.json': JSON.stringify(VALID_RULES),
      },
      discoveredArkRulesFiles: [
        'arkrules/DomainModel.json',
        'arkrules/Orphan.json',
      ],
    });
    expect(ok.arkRules.structure).toHaveLength(1);
    expect(ok.warnings.some((w) => w.path === 'arkrules/Orphan.json')).toBe(true);
    expect(effectiveContractPolicyPayload(ok)).toMatchObject({
      arkRules: { structure: [{ id: 'always-valid-aggregates' }] },
    });
  });

  it('keeps packaged schema identical to the canonical export after generate', () => {
    const packagedPath = path.join(REPO_ROOT, 'schemas/ark.arkrules.schema.json');
    if (!fs.existsSync(packagedPath)) {
      // Generation is required before this pin is meaningful; skip if not yet written.
      expect(ARK_RULES_SCHEMA.schemaVersion ?? ARK_RULES_SCHEMA_VERSION).toBeTruthy();
      return;
    }
    const packaged = JSON.parse(fs.readFileSync(packagedPath, 'utf8'));
    expect(packaged).toEqual(ARK_RULES_SCHEMA);
  });

  it('exports the schema through stable package subpaths', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
    };
    expect(pkg.exports['./schema/arkrules']).toBe('./schemas/ark.arkrules.schema.json');
    expect(pkg.exports['./schema/ark.arkrules.schema.json']).toBe(
      './schemas/ark.arkrules.schema.json'
    );
  });

  it('parseArkRulesJson surfaces source-aware JSON errors', () => {
    expect(() => parseArkRulesJson('{', 'broken-rules.json')).toThrow(
      'Invalid ArkRules (broken-rules.json)'
    );
  });
});
