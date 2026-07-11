import { describe, expect, it } from 'vitest';
import {
  PolicyEngine,
  createArchitectureProfile,
  createElevenLayerArkConfig,
  defineArchitectureProfilePolicy,
  elevenLayerProfile,
} from '../../../src/index';

describe('Architecture profiles', () => {
  it('resolves the 11-layer profile from semantic names', () => {
    expect(elevenLayerProfile.resolveLayer('Domain.Order.Placed')).toBe('DomainModel');
    expect(elevenLayerProfile.resolveLayer('Adapter.Persistence.Sql')).toBe('PersistenceAdapters');
    expect(elevenLayerProfile.resolveLayer('Reporting.OrderSummary')).toBe('ReportingReadModels');
  });

  it('feeds profile rules into layer policy enforcement', () => {
    const engine = new PolicyEngine([
      defineArchitectureProfilePolicy(elevenLayerProfile),
    ]);

    const result = engine.evaluate({
      relationships: [
        {
          from: 'Domain.Order.Aggregate',
          to: 'Adapter.Persistence.OrderRepo',
          kind: 'dependsOn',
        },
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.hardViolations[0].message).toContain('DomainModel');
  });

  it('uses a strict complete cross-layer deny matrix with explicit allowed flows', () => {
    const layerCount = elevenLayerProfile.layers.length;
    const allowedCrossLayerFlows = 5;
    expect(elevenLayerProfile.rules).toHaveLength(
      layerCount * (layerCount - 1) - allowedCrossLayerFlows
    );

    expect(
      elevenLayerProfile.rules.some(
        (rule) =>
          rule.from === 'ApplicationOrchestration' &&
          rule.to === 'DomainModel'
      )
    ).toBe(false);
    expect(
      elevenLayerProfile.rules.some(
        (rule) =>
          rule.from === 'ApplicationOrchestration' &&
          rule.to === 'PersistenceAdapters' &&
          !rule.allowed
      )
    ).toBe(true);
  });

  it('resolves layers through a custom match function, which wins over prefixes', () => {
    const profile = createArchitectureProfile({
      name: 'custom',
      layers: [
        {
          name: 'ReadModels',
          prefixes: [],
          match: (name) => name.endsWith('.View'),
        },
        { name: 'DomainModel', prefixes: ['Domain'] },
      ],
    });

    expect(profile.resolveLayer('Orders.Summary.View')).toBe('ReadModels');
    // match wins even when a prefix also applies
    expect(profile.resolveLayer('Domain.Order.View')).toBe('ReadModels');
    expect(profile.resolveLayer('Domain.Order.Placed')).toBe('DomainModel');
    expect(profile.resolveLayer('Unmapped.Thing')).toBeUndefined();
  });

  it('generates an ark-check config from the 11-layer runtime profile', () => {
    const config = createElevenLayerArkConfig();

    expect(config.$schema).toBe('https://unpkg.com/arkgate@2/schemas/ark.config.schema.json');
    expect(config.schemaVersion).toBe('1.0');
    expect(config.include).toEqual(['src']);
    expect(config.layers).toHaveLength(11);
    expect(config.rules).toEqual(elevenLayerProfile.rules);
    expect(config.layers[0]).toMatchObject({
      name: 'DomainModel',
      patterns: ['src/domain/**'],
      intentPrefixes: ['Domain.'],
      optional: true,
    });
    expect(
      config.layers.find((layer) => layer.name === 'ApplicationOrchestration')?.patterns
    ).toContain('src/app/**');
    expect(
      config.layers.find((layer) => layer.name === 'SecurityAuditObservability')?.patterns
    ).toContain('src/observability/**');
  });
});
