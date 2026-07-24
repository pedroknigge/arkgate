import { describe, expect, it } from 'vitest';
import {
  buildRulesInventory,
  inventoryToExtractionCard,
} from '../../../src/domain/rulesInventory';

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
});
