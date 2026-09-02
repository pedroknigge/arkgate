import { describe, expect, it } from 'vitest';
import { DOMAIN_INVARIANT_WORDS } from '../../../src/domain/arkRuleSensors';
import {
  buildRulesInventory,
  inventoryToExtractionCard,
} from '../../../src/domain/rulesInventory';
import {
  buildRulesInventory as buildCliRulesInventory,
  inventoryToExtractionCard as cliInventoryToExtractionCard,
} from '../../../bin/lib/rules-inventory.mjs';

describe('AR13–AR15 rules inventory + extraction cards', () => {
  it('finds validation-in-controller and magic constants on spaghetti fixtures', () => {
    const inventory = buildRulesInventory({
      fileContents: {
        'src/controllers/order.controller.ts': `
          @Controller('orders')
          export class OrderController {
            create(dto: any) {
              if (dto.amount < 0) throw new BadRequest('bad');
              const MIN_ORDER_TOTAL = 100;
            }
          }
        `,
        'src/domain/customer.ts': `
          export class Customer {
            public id: string;
            public name: string;
            public email: string;
          }
        `,
      },
    });
    expect(inventory.notAScore).toBe(true);
    expect(inventory.inventoried).toBeGreaterThan(0);
    expect(inventory.candidates.some((c) => c.kind === 'validation-in-controller')).toBe(true);
    expect(inventory.candidates.some((c) => c.kind === 'anemic-entity')).toBe(true);
  });

  it('stays silent on healthy domain modules', () => {
    const inventory = buildRulesInventory({
      fileContents: {
        'src/domain/order.ts': `
          export class Order {
            private total = 0;
            private constructor() {}
            static create() { return new Order(); }
            add(n: number) { this.total += n; this.ensureInvariants(); }
            ensureInvariants() { if (this.total < 0) throw new Error(); }
          }
        `,
      },
    });
    expect(inventory.candidates.filter((c) => c.kind === 'validation-in-controller')).toHaveLength(
      0
    );
  });

  it('builds a judgment-only extraction card (AR14)', () => {
    const inventory = buildRulesInventory({
      fileContents: {
        'src/http/handler.ts': `export function post(req) { if (req.total < 0) throw new Error('x'); }`,
      },
    });
    const card = inventoryToExtractionCard(inventory.candidates[0]!);
    expect(card.neverMechanicalSafe).toBe(true);
    expect(card.class).toBe('judgment');
    expect(card.doNot.length).toBeGreaterThan(0);
  });

  it('uses governed layer evidence instead of controller-like Domain filenames', () => {
    const fileContents = {
      'src/domain/order-handler.ts': `
        @Controller('orders')
        export class OrderHandler {
          create(dto: any) {
            if (dto.amount < 0) throw new BadRequest('bad');
          }
        }
      `,
      'src/http/order-handler.ts': `
        @Controller('orders')
        export class OrderHandler {
          create(dto: any) {
            if (dto.amount < 0) throw new BadRequest('bad');
          }
        }
      `,
    };
    const inventory = buildRulesInventory({
      fileContents,
      fileLayers: {
        'src/domain/order-handler.ts': 'DomainModel',
        'src/http/order-handler.ts': 'FrameworkAdapters',
      },
    });
    const validations = inventory.candidates.filter(
      (candidate) => candidate.kind === 'validation-in-controller'
    );

    expect(validations.length).toBeGreaterThan(0);
    expect(validations.every((candidate) => candidate.file === 'src/http/order-handler.ts')).toBe(
      true
    );
    expect(validations.every((candidate) => candidate.governedLayer === 'FrameworkAdapters')).toBe(
      true
    );
  });

  it('recognizes custom Domain and application layers from their real intent prefixes', () => {
    const inventory = buildRulesInventory({
      fileContents: {
        'src/core/order.ts': `
          export const MAX_CART_SIZE = 50;
          export class Order {
            public id: string;
            public status: string;
          }
        `,
        'src/entry/order-handler.ts': `
          export function handle(input: { amount: number }) {
            if (input.amount < 0) throw new Error('invalid amount');
            return input.amount;
          }
        `,
      },
      fileLayers: {
        'src/core/order.ts': 'core',
        'src/entry/order-handler.ts': 'entry',
      },
      layerContexts: [
        { name: 'core', intentPrefixes: ['Domain.'] },
        { name: 'entry', intentPrefixes: ['Application.'] },
      ],
    });

    expect(inventory.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'anemic-entity',
          file: 'src/core/order.ts',
          governedLayer: 'core',
          suggestedArkRule: expect.objectContaining({ layer: 'core' }),
        }),
        expect.objectContaining({
          kind: 'magic-business-constant',
          file: 'src/core/order.ts',
          governedLayer: 'core',
          suggestedArkRule: expect.objectContaining({ layer: 'core' }),
        }),
        expect.objectContaining({
          kind: 'validation-in-controller',
          file: 'src/entry/order-handler.ts',
          governedLayer: 'entry',
          suggestedArkRule: expect.objectContaining({ layer: 'core' }),
        }),
      ])
    );
  });

  it('quiets development identities and PostgreSQL OIDs but keeps business literals', () => {
    const inventory = buildRulesInventory({
      fileContents: {
        'src/domain/pricing.ts': `
          export const DEV_USER_ID = 'developer-user-0001';
          export const POSTGRES_NUMERIC_OID = 1700;
          export const TIMESTAMPTZOID = 1184;
          export const MAX_CART_SIZE = 50;
        `,
      },
      fileLayers: {
        'src/domain/pricing.ts': 'DomainModel',
      },
    });
    const magic = inventory.candidates.filter(
      (candidate) => candidate.kind === 'magic-business-constant'
    );

    expect(magic.map((candidate) => candidate.message)).toEqual([
      expect.stringContaining('MAX_CART_SIZE'),
    ]);
  });

  it('uses governed layers to ignore technical constants outside Domain/controller surfaces', () => {
    const inventory = buildRulesInventory({
      fileContents: {
        'bin/ark-check-runtime.mjs': `
          const BROWNFIELD_FILE_THRESHOLD = 120;
          const DEFAULT_PROTOCOL = '2024-11-05';
        `,
        'src/domain/pricing.ts': `
          export const MAX_CART_SIZE = 50;
          export const ARK_SCHEMA_URL = 'https://example.test/schema.json';
        `,
      },
      fileLayers: {
        'bin/ark-check-runtime.mjs': 'Tooling',
        'src/domain/pricing.ts': 'DomainModel',
      },
    });
    const magic = inventory.candidates.filter(
      (candidate) => candidate.kind === 'magic-business-constant'
    );

    expect(magic.map((candidate) => candidate.message)).toEqual([
      expect.stringContaining('MAX_CART_SIZE'),
    ]);
  });

  it('ignores generated mirrors and Error metadata assignments as extraction pilots', () => {
    const inventory = buildRulesInventory({
      fileContents: {
        'bin/lib/generated-domain.mjs': `
          /** GENERATED FILE — do not edit by hand. */
          export const MAX_CART_SIZE = 50;
        `,
        'src/domain/config-contract.ts': `
          export class ConfigValidationError extends Error {
            readonly source: string;
            constructor(source: string) {
              super(source);
              this.name = 'ConfigValidationError';
              this.source = source;
            }
          }
        `,
      },
      fileLayers: {
        'bin/lib/generated-domain.mjs': 'DomainModel',
        'src/domain/config-contract.ts': 'DomainModel',
      },
    });

    expect(inventory.candidates).toEqual([]);
  });

  it('never inventories fixtures, seeds, migrations, or explicit exclusions as pilots', () => {
    const inventory = buildRulesInventory({
      fileContents: {
        'src/exclusions/legacy.controller.ts': `
          export function create(dto: any) {
            if (dto.amount < 0) throw new Error('excluded');
          }
        `,
        'src/fixtures/order.controller.ts': `
          export function create(dto: any) {
            if (dto.amount < 0) throw new Error('fixture');
          }
        `,
        'src/db/seed.ts': `
          export const DEFAULT_ORDER_LIMIT = 25;
        `,
        'src/http/order.controller.ts': `
          export function create(dto: any) {
            if (dto.amount < 0) throw new Error('production');
          }
        `,
      },
      fileLayers: {
        'src/exclusions/legacy.controller.ts': 'FrameworkAdapters',
        'src/fixtures/order.controller.ts': 'FrameworkAdapters',
        'src/db/seed.ts': 'PersistenceAdapters',
        'src/http/order.controller.ts': 'FrameworkAdapters',
      },
    });

    expect(inventory.candidates.length).toBeGreaterThan(0);
    expect(
      inventory.candidates.every(
        (candidate) =>
          candidate.file === 'src/http/order.controller.ts' &&
          candidate.kind === 'validation-in-controller'
      )
    ).toBe(true);
  });

  it('shares the Domain invariant-word list and does not flag === or pendingEvents = [] (DSHAPE-001)', () => {
    expect(DOMAIN_INVARIANT_WORDS).toEqual(
      expect.arrayContaining(['ensureInvariants', 'raise', 'record'])
    );
    const inventory = buildRulesInventory({
      fileContents: {
        'src/domain/order.ts': `
          export class Order {
            private status = 'Open';
            private pendingEvents: unknown[] = [];
            ensureInvariants() { if (this.status === 'Closed') throw new Error('closed'); }
            pullEvents() { const out = this.pendingEvents; this.pendingEvents = []; return out; }
            close() { this.status = 'Closed'; this.raise({ type: 'Closed' }); }
          }
        `,
      },
      fileLayers: { 'src/domain/order.ts': 'DomainModel' },
    });
    expect(inventory.candidates.filter((c) => c.kind === 'mutation-without-guard')).toEqual([]);
  });

  it('names expected invariant words on mutation-without-guard (DSHAPE-001)', () => {
    const inventory = buildRulesInventory({
      fileContents: {
        'src/domain/offer.entity.ts': `
          export class Offer {
            private total = 0;
            bump() { this.total = this.total + 1; }
          }
        `,
      },
      fileLayers: { 'src/domain/offer.entity.ts': 'DomainModel' },
    });
    const mut = inventory.candidates.find((c) => c.kind === 'mutation-without-guard');
    expect(mut?.message).toContain('ensureInvariants');
    expect(mut?.message).toContain('raise');
    expect(mut?.message).toContain('record');
  });

  it('keeps the generated CLI inventory artifact behaviorally aligned', () => {
    const input = {
      fileContents: {
        'src/core/order.ts': `
          export const MAX_CART_SIZE = 50;
          export class Order {
            public id: string;
            public status: string;
          }
        `,
        'src/entry/order-handler.ts': `
          export function handle(input: { amount: number }) {
            if (input.amount < 0) throw new Error('invalid amount');
            return input.amount;
          }
        `,
      },
      fileLayers: {
        'src/core/order.ts': 'core',
        'src/entry/order-handler.ts': 'entry',
      },
      layerContexts: [
        { name: 'core', intentPrefixes: ['Domain.'] },
        { name: 'entry', intentPrefixes: ['Application.'] },
      ],
    };
    const canonical = buildRulesInventory(input);
    const cli = buildCliRulesInventory(input);

    expect(cli).toEqual(canonical);
    expect(cliInventoryToExtractionCard(cli.candidates[0]!)).toEqual(
      inventoryToExtractionCard(canonical.candidates[0]!)
    );
  });
});
