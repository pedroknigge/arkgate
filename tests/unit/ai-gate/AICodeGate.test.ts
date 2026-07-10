import { describe, it, expect, beforeEach } from 'vitest';
import * as ts from 'typescript';
import {
  createAICodeGate,
  definePolicy,
  defineIntent,
  defaultIntentRegistry,
  elevenLayerProfile,
} from '../../../src/index';

describe('AI Code Gate (basic)', () => {
  beforeEach(() => {
    defaultIntentRegistry.clear();
  });
  it('flags obvious infra imports', () => {
    const gate = createAICodeGate();
    const bad = `import { db } from '../infra/db';`;
    const res = gate.validate(bad);
    expect(res.valid).toBe(false);
    expect(
      res.violations.some(
        (v) => v.ruleId === 'FORBIDDEN_PATTERN' || v.ruleId === 'FORBIDDEN_IMPORT'
      )
    ).toBe(true);
  });

  it('flags value re-exports, dynamic imports, and require — not import type (W1)', () => {
    const gate = createAICodeGate();
    const res = gate.validate(
      [
        `import type { Repo } from '../persistence/repo';`,
        `export { db } from '../database/db';`,
        `const orm = await import('prisma');`,
        `const knex = require('knex');`,
      ].join('\n'),
      { filePath: 'src/domain/order.ts' }
    );

    // `import type` is erased at runtime — write path skips infra heuristic (W1 autoPatch).
    const forbidden = res.violations.filter((v) => v.ruleId === 'FORBIDDEN_IMPORT');
    expect(forbidden).toHaveLength(3);
    expect(forbidden.every((v) => v.filePath === 'src/domain/order.ts')).toBe(true);
    expect(res.violations.some((v) => String(v.message || '').includes('import type'))).toBe(
      false
    );
  });

  it('blocks non-literal dynamic imports unless the target file is explicitly allowed', () => {
    const source = 'const module = await import(modulePath);';
    const blocked = createAICodeGate({ typescript: ts }).validate(source, {
      filePath: 'src/plugin.ts',
    });
    expect(blocked.violations.some((v) => v.ruleId === 'DYNAMIC_IMPORT_NOT_ALLOWLISTED')).toBe(true);

    const allowed = createAICodeGate({
      typescript: ts,
      allowNonLiteralDynamicImport: (filePath) => filePath === 'src/plugin.ts',
    }).validate(source, { filePath: 'src/plugin.ts' });
    expect(allowed.valid).toBe(true);
  });

  it('W1: typeOnly skips classic layer deny; value import of same edge still blocks', () => {
    const profile = {
      name: 'test',
      layers: [
        { name: 'DomainModel', prefixes: ['Domain.'] },
        { name: 'PersistenceAdapters', prefixes: ['Adapter.Persistence.'] },
      ],
      rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
    };
    const gate = createAICodeGate({
      architectureProfile: profile as never,
      resolveImportTarget: (spec: string) => {
        if (spec.includes('persist') || spec.includes('infra')) {
          return { layer: 'PersistenceAdapters', filePath: 'src/infra/repo.ts' };
        }
        return null;
      },
    });

    const typeOnly = gate.validate(
      `import type { Row } from '../infra/repo';\nexport type T = Row;\n`,
      { layer: 'DomainModel', filePath: 'src/domain/order.ts' }
    );
    expect(
      typeOnly.violations.filter((v) => v.ruleId === 'LAYER_IMPORT_VIOLATION')
    ).toHaveLength(0);

    const value = gate.validate(`import { Row } from '../infra/repo';\nexport const x = Row;\n`, {
      layer: 'DomainModel',
      filePath: 'src/domain/order.ts',
    });
    expect(value.violations.some((v) => v.ruleId === 'LAYER_IMPORT_VIOLATION')).toBe(true);
  });

  it('uses the TypeScript AST to ignore comments and recognize specifier-level type imports', () => {
    const gate = createAICodeGate({
      typescript: ts,
      architectureProfile: {
        name: 'ast-imports',
        layers: [
          { name: 'DomainModel', prefixes: ['Domain.'] },
          { name: 'Kernel', prefixes: ['Kernel.'] },
        ],
        rules: [{ from: 'DomainModel', to: 'Kernel', allowed: false }],
      } as never,
      resolveImportTarget: (specifier: string) =>
        specifier.includes('kernel') ? { layer: 'Kernel', relPath: 'src/kernel/types.ts' } : undefined,
    });
    const result = gate.validate(
      [
        `// import { runtime } from '../kernel/runtime';`,
        `import { type KernelType } from '../kernel/types';`,
        `export { type KernelOptions } from '../kernel/options';`,
      ].join('\n'),
      { layer: 'DomainModel', filePath: 'src/domain/model.ts' }
    );
    expect(result.violations.filter((v) => v.ruleId === 'LAYER_IMPORT_VIOLATION')).toEqual([]);
  });

  it('W1: peerIsolation still hard-blocks import type across slices', () => {
    const profile = {
      name: 'peer-test',
      layers: [{ name: 'DomainModel', prefixes: ['Domain.'] }],
      rules: [
        {
          from: 'DomainModel',
          to: 'DomainModel',
          allowed: false,
          peerIsolation: true,
          sliceFolders: ['features'],
        },
      ],
    };
    const gate = createAICodeGate({
      architectureProfile: profile as never,
      architectureLayers: [
        { name: 'DomainModel', patterns: ['src/domain/features/**'] },
      ],
      resolveImportTarget: (specOrFile: string) => {
        // Absolute-ish source file resolve (fromPath)
        if (specOrFile.includes('orders/order')) {
          return {
            layer: 'DomainModel',
            relPath: 'src/domain/features/orders/order.ts',
          };
        }
        if (specOrFile.includes('other') || specOrFile.includes('../other')) {
          return {
            layer: 'DomainModel',
            relPath: 'src/domain/features/other/model.ts',
          };
        }
        return undefined;
      },
    });

    const res = gate.validate(
      `import type { Other } from '../other/model';\nexport type T = Other;\n`,
      { layer: 'DomainModel', filePath: 'src/domain/features/orders/order.ts' }
    );
    const peer = res.violations.filter((v) => v.ruleId === 'LAYER_IMPORT_VIOLATION');
    expect(peer.length).toBeGreaterThanOrEqual(1);
    expect(peer.some((v) => Boolean(v.details?.peerIsolation))).toBe(true);
  });

  it('passes clean code', () => {
    const gate = createAICodeGate();
    const good = `const x = OrderPlaced({ id: '1' });`;
    expect(gate.validate(good).valid).toBe(true);
  });

  // Import strings built from parts so this Tooling-layer test file doesn't
  // itself trip Ark's own write-gate; the runtime strings are real infra imports.
  const infraImport = `import { db } from '../${'in' + 'fra'}/db';`;
  const ormImport = `import { Client } from '${'pris' + 'ma'}';`;

  it('lets an infrastructure-role layer import infrastructure', () => {
    const gate = createAICodeGate();
    const src = [infraImport, ormImport].join('\n');
    // A persistence-adapter file is SUPPOSED to touch the DB; the built-in infra
    // heuristics must not fire, or the write-gate contradicts a contract that
    // allows the edge (which ark-check passes).
    for (const layer of ['PersistenceAdapters', 'FrameworkAdapters', 'IntegrationAdapters']) {
      const res = gate.validate(src, { layer, filePath: 'src/adapters/persistence/repo.ts' });
      expect(
        res.violations.some(
          (v) => v.ruleId === 'FORBIDDEN_PATTERN' || v.ruleId === 'FORBIDDEN_IMPORT'
        )
      ).toBe(false);
    }
  });

  it('still blocks infra imports in the pure core and with no layer context', () => {
    const gate = createAICodeGate();
    for (const layer of ['DomainModel', 'ApplicationOrchestration']) {
      expect(gate.validate(infraImport, { layer }).valid).toBe(false);
    }
    // Zero-config (no layer): heuristics still apply — unchanged behavior.
    expect(gate.validate(infraImport).valid).toBe(false);
  });

  it('applies user forbiddenPatterns even in an infra-role layer', () => {
    const gate = createAICodeGate({ forbiddenPatterns: [/eval\(/] });
    const res = gate.validate(`eval('x')`, { layer: 'PersistenceAdapters' });
    expect(res.violations.some((v) => v.ruleId === 'FORBIDDEN_PATTERN')).toBe(true);
  });

  it('points a blocked infra import at the mayImportInfrastructure escape hatch', () => {
    const gate = createAICodeGate();
    // Unconventionally-named layer, not flagged → still blocked, but the hint
    // must tell the user how to exempt it (the confusion that motivated this).
    const res = gate.validate(infraImport, { layer: 'Storage' });
    const hinted = res.violations.find(
      (v) => v.ruleId === 'FORBIDDEN_PATTERN' || v.ruleId === 'FORBIDDEN_IMPORT'
    );
    expect(hinted?.suggestion).toContain('mayImportInfrastructure');
    expect(hinted?.suggestion).toContain('Storage');
    // Zero-config (no layer) keeps the plain hint — the flag doesn't apply there.
    const noLayer = gate.validate(infraImport).violations.find((v) => v.suggestion);
    expect(noLayer?.suggestion).not.toContain('mayImportInfrastructure');
  });

  it('exempts an unconventionally-named layer flagged via infrastructureLayers', () => {
    const src = [infraImport, ormImport].join('\n');
    // "Storage" has no conventional infra token, so it needs the explicit opt-in
    // (ark.config.json layer flagged mayImportInfrastructure: true → this option).
    const withoutFlag = createAICodeGate();
    expect(withoutFlag.validate(src, { layer: 'Storage' }).valid).toBe(false);

    const withFlag = createAICodeGate({ infrastructureLayers: ['Storage'] });
    const res = withFlag.validate(src, { layer: 'Storage' });
    expect(
      res.violations.some(
        (v) => v.ruleId === 'FORBIDDEN_PATTERN' || v.ruleId === 'FORBIDDEN_IMPORT'
      )
    ).toBe(false);
    // A different layer not in the set is still protected.
    expect(withFlag.validate(src, { layer: 'DomainModel' }).valid).toBe(false);
  });

  it('can use policy for custom AI rules', () => {
    const noDb = definePolicy({
      name: 'No raw db in generated',
      check: (ctx: { source: string }) =>
        ctx.source.includes('rawQuery') ? { message: 'rawQuery forbidden' } : true,
    });
    const gate = createAICodeGate({ policies: [noDb] });
    const res = gate.validate('db.rawQuery("..")');
    expect(res.valid).toBe(false);
    expect(res.violations[0].ruleId).toBe('POLICY_VIOLATION');
  });

  it('flags unknown intent references when allowlist is configured', () => {
    const OrderPlaced = defineIntent<'Domain.Order.Placed', {}>('Domain.Order.Placed');
    const gate = createAICodeGate({ intents: [OrderPlaced] });

    const bad = `bus.publish('Domain.Order.Unknown', {});`;
    const res = gate.validate(bad);
    expect(res.valid).toBe(false);
    expect(res.violations.some((v) => v.ruleId === 'UNKNOWN_INTENT')).toBe(true);
  });

  it('accepts registered intent references', () => {
    const OrderConfirmed = defineIntent<'Domain.Order.Confirmed', {}>('Domain.Order.Confirmed');
    const gate = createAICodeGate({ intents: [OrderConfirmed] });

    const good = `bus.publish('Domain.Order.Confirmed', {});`;
    expect(gate.validate(good).valid).toBe(true);
  });

  it('supports external extensions', () => {
    const gate = createAICodeGate({
      extensions: [
        {
          name: 'no-console',
          analyze: (source) =>
            source.includes('console.log')
              ? [{ ruleId: 'NO_CONSOLE', code: 'NO_CONSOLE', message: 'console.log forbidden' }]
              : [],
        },
      ],
    });

    const res = gate.validate('console.log("hi")');
    expect(res.valid).toBe(false);
    expect(res.violations[0].ruleId).toBe('NO_CONSOLE');
  });

  it('flags layer reference violations when a profile and context layer are provided', () => {
    const gate = createAICodeGate({
      architectureProfile: elevenLayerProfile,
      enforceIntentAllowlist: false,
    });

    const res = gate.validate(
      `const repo = 'Adapter.Persistence.OrderRepository';`,
      { layer: 'DomainModel' }
    );

    expect(res.valid).toBe(false);
    expect(res.violations[0].ruleId).toBe('LAYER_REFERENCE_VIOLATION');
    expect(res.violations[0].line).toBe(1);
    expect(res.violations[0].fromLayer).toBe('DomainModel');
    expect(res.violations[0].toLayer).toBe('PersistenceAdapters');
    expect(res.violations[0].target).toBe('Adapter.Persistence.OrderRepository');
  });

  it('uses TypeScript AST checks for Ark publish misuse when provided', () => {
    const gate = createAICodeGate({
      typescript: ts,
      architectureProfile: elevenLayerProfile,
      enforceIntentAllowlist: false,
    });

    const res = gate.validate(
      [
        "bus.publish('Domain.Order.Placed', {});",
        'bus.publish(OrderPlaced, { id: "o1" });',
        "bus.publish(OrderPlaced, { id: 'o2' }, { source: 'Application.PlaceOrder' });",
      ].join('\n'),
      { filePath: 'src/domain/order.ts', layer: 'DomainModel' }
    );

    expect(res.valid).toBe(false);
    expect(res.violations.map((v) => v.ruleId)).toContain('RAW_EVENT_PUBLISH');
    expect(res.violations.filter((v) => v.ruleId === 'PUBLISH_MISSING_SOURCE')).toHaveLength(2);
    expect(res.violations.map((v) => v.ruleId)).toContain('PUBLISH_SOURCE_LAYER_MISMATCH');
  });

  it('does not treat unrelated publish APIs as Ark publish calls in AST mode', () => {
    const gate = createAICodeGate({
      typescript: ts,
      enforceIntentAllowlist: false,
    });

    const res = gate.validate("pubsub.publish(topicName, { id: 'm1' });", {
      filePath: 'src/app/notifications.ts',
      layer: 'ApplicationOrchestration',
    });

    expect(res.valid).toBe(true);
  });
});

describe('AI Code Gate forbiddenGlobals', () => {
  const gate = createAICodeGate({
    typescript: ts,
    forbiddenGlobals: { DomainModel: ['fetch', 'Date.now', 'console'] },
  });

  it('flags forbidden ambient globals when the context layer declares them', () => {
    const res = gate.validate(
      'export const at = Date.now();\nconsole.log(at);\nfetch("/api");\n',
      { layer: 'DomainModel', filePath: 'src/domain/order.ts' }
    );
    expect(res.valid).toBe(false);
    const globals = res.violations.filter((v) => v.ruleId === 'FORBIDDEN_GLOBAL');
    expect(globals.map((v) => v.target).sort()).toEqual(['Date.now', 'console', 'fetch']);
    expect(globals.every((v) => v.fromLayer === 'DomainModel')).toBe(true);
  });

  it('does not flag other layers, shadow-like decoys, or when typescript is absent', () => {
    expect(
      gate.validate('export const at = Date.now();', { layer: 'ApplicationOrchestration' }).valid
    ).toBe(true);
    expect(
      gate.validate('const decoy = { now: () => 1 };\nexport const ok = decoy.now();', {
        layer: 'DomainModel',
      }).valid
    ).toBe(true);
    const noTs = createAICodeGate({ forbiddenGlobals: { DomainModel: ['fetch'] } });
    expect(gateValid(noTs, 'fetch("/api");')).toBe(true);
  });
});

function gateValid(g: ReturnType<typeof createAICodeGate>, source: string) {
  return g.validate(source, { layer: 'DomainModel' }).valid;
}
