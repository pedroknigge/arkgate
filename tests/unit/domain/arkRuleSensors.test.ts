import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import {
  buildEffectiveArkRules,
  loadArkRulesContract,
} from '../../../src/domain/arkRulesContract';
import { isDomainRoleLayer } from '../../../src/domain/sourcePolicy';
import { validateSnippetAnalysis } from '../../../bin/lib/snippet-analysis.mjs';
import {
  DOMAIN_INVARIANT_WORDS,
  buildArkRuleFileHints,
  collectEmptyAppliesToFindings,
  collectEmptyInvariantCatalogFindings,
  isDomainRoleLayerName,
  deriveArkRuleFileHints,
  evaluateArkRuleSensors,
  extractClassShapesFromSource,
} from '../../../src/domain/arkRuleSensors';
import { extractArkOrderXiFieldWritesFromSource } from '../../../src/domain/arkOrderFacts';
import {
  buildArkRuleFileHints as buildCliArkRuleFileHints,
  collectEmptyAppliesToFindings as collectCliEmptyAppliesToFindings,
  collectEmptyInvariantCatalogFindings as collectCliEmptyInvariantCatalogFindings,
  evaluateArkRuleSensors as evaluateCliArkRuleSensors,
  extractClassShapesFromSource as extractCliClassShapesFromSource,
} from '../../../bin/lib/arkrules-sensors.mjs';

function effective(structure: unknown[]) {
  const file = loadArkRulesContract({
    schemaVersion: '1.0',
    layer: 'DomainModel',
    structure,
  }).config;
  return buildEffectiveArkRules([
    { layer: 'DomainModel', sourceFile: 'arkrules/DomainModel.json', file },
  ]);
}

describe('AR05–AR07 ArkRules sensors', () => {
  it('extracts public mutable state and factory shape (AR05)', () => {
    const shapes = extractClassShapesFromSource(
      'src/domain/order.ts',
      `
export class Order {
  public total: number = 0;
  constructor(total: number) { this.total = total; }
  setTotal(n: number) { this.total = n; }
}
export class Money {
  private constructor(readonly amount: number) {}
  static create(amount: number): Money { return new Money(amount); }
}
`
    );
    const order = shapes.find((s) => s.className === 'Order');
    const money = shapes.find((s) => s.className === 'Money');
    expect(order?.hasPublicMutableFields).toBe(true);
    expect(order?.hasPublicConstructor).toBe(true);
    expect(order?.hasStaticFactory).toBe(false);
    expect(money?.hasPublicConstructor).toBe(false);
    expect(money?.hasStaticFactory).toBe(true);
  });

  it('blocks aggregate-private-state and always-valid-factory in enforced mode (AR06)', () => {
    const shapes = extractClassShapesFromSource(
      'src/domain/order.ts',
      `export class Order { public total = 0; constructor() {} setTotal(n: number) { this.total = n; } }`
    );
    const arkRules = effective([
      { id: 'private-state', sensor: 'aggregate-private-state', mode: 'enforced' },
      { id: 'factory', sensor: 'always-valid-factory', mode: 'enforced' },
    ]);
    const findings = evaluateArkRuleSensors({
      arkRules,
      classShapes: shapes,
      files: ['src/domain/order.ts'],
    });
    expect(findings.some((f) => f.arkruleId === 'private-state' && f.failsStrict)).toBe(true);
    expect(findings.some((f) => f.arkruleId === 'factory' && f.failsStrict)).toBe(true);
    expect(findings.every((f) => f.arkruleSource === 'arkrules/DomainModel.json')).toBe(true);
  });

  it('stays advisory in advisory mode and silent without rules', () => {
    const shapes = extractClassShapesFromSource(
      'src/domain/order.ts',
      `export class Order { public total = 0; constructor() {} }`
    );
    const advisory = evaluateArkRuleSensors({
      arkRules: effective([
        { id: 'private-state', sensor: 'aggregate-private-state', mode: 'advisory' },
      ]),
      classShapes: shapes,
      files: ['src/domain/order.ts'],
    });
    expect(advisory).toHaveLength(1);
    expect(advisory[0]?.failsStrict).toBe(false);

    const silent = evaluateArkRuleSensors({
      arkRules: buildEffectiveArkRules([]),
      classShapes: shapes,
      files: ['src/domain/order.ts'],
    });
    expect(silent).toEqual([]);
  });

  it('flags domain-event-on-mutation when mutators lack publish/guard (AR06)', () => {
    const shapes = extractClassShapesFromSource(
      'src/domain/order.ts',
      `
export class Order {
  private total = 0;
  private constructor() {}
  static create() { return new Order(); }
  increase() { this.total = this.total + 1; }
  decrease() { this.total = this.total - 1; this.ensureInvariants(); }
}
`
    );
    const findings = evaluateArkRuleSensors({
      arkRules: effective([
        { id: 'events', sensor: 'domain-event-on-mutation', mode: 'enforced' },
      ]),
      classShapes: shapes,
      files: ['src/domain/order.ts'],
    });
    expect(findings.some((f) => f.message.includes('increase'))).toBe(true);
    expect(findings.some((f) => f.message.includes('decrease'))).toBe(false);
  });

  it('AR06 evaluates public entrypoints through private mutating helpers (no private-helper false positive)', () => {
    const source = `
export class CityRegistration {
  private version = 0;
  private name = '';
  private events: unknown[] = [];
  private bump() { this.version = this.version + 1; }
  private record(event: unknown) { this.events.push(event); }
  private bumpAndRecord() { this.version = this.version + 1; this.record({ type: 'Bumped' }); }
  register(next: string) {
    this.name = next;
    this.bump();
    this.record({ type: 'Registered' });
  }
  rename(next: string) {
    this.name = next;
    this.bumpAndRecord();
  }
  close() {
    this.bump();
  }
}
`;
    const arkRules = effective([
      { id: 'events', sensor: 'domain-event-on-mutation', mode: 'enforced' },
    ]);
    const findingsFor = (classShapes: ReturnType<typeof extractClassShapesFromSource>) =>
      evaluateArkRuleSensors({
        arkRules,
        classShapes,
        files: ['src/domain/city-registration.ts'],
      }).map((finding) => finding.message);

    const astMessages = findingsFor(
      extractClassShapesFromSource('src/domain/city-registration.ts', source, { ts })
    );
    const lexerMessages = findingsFor(
      extractClassShapesFromSource('src/domain/city-registration.ts', source)
    );
    const cliAstMessages = evaluateCliArkRuleSensors({
      arkRules,
      classShapes: extractCliClassShapesFromSource('src/domain/city-registration.ts', source, {
        ts,
      }),
      files: ['src/domain/city-registration.ts'],
    }).map((finding) => finding.message);
    const cliLexerMessages = evaluateCliArkRuleSensors({
      arkRules,
      classShapes: extractCliClassShapesFromSource('src/domain/city-registration.ts', source),
      files: ['src/domain/city-registration.ts'],
    }).map((finding) => finding.message);

    expect(cliAstMessages).toEqual(astMessages);
    expect(cliLexerMessages).toEqual(lexerMessages);

    for (const messages of [astMessages, lexerMessages]) {
      expect(messages.some((message) => message.includes('CityRegistration.bump'))).toBe(false);
      expect(messages.some((message) => message.includes('CityRegistration.register'))).toBe(false);
      expect(messages.some((message) => message.includes('CityRegistration.rename'))).toBe(false);
      expect(messages.some((message) => message.includes('CityRegistration.close'))).toBe(true);
    }
  });

  it('AR06 AST accepts guard receiver chains and plain events.push (4.9.0 regression)', () => {
    const source = `
export class Rock {
  private title = "";
  private events: unknown[] = [];
  static create() { return new Rock(); }
  renameA(t: string) { ensureInvariants.rockIsOpen(1, 2); this.title = t; }
  renameB(t: string) { ensureInvariants(t); this.title = t; }
  renameC(t: string) { this.title = t; this.events.push({ t }); }
  renameD(t: string) { this.title = t; }
}
`;
    const arkRules = effective([
      { id: 'events', sensor: 'domain-event-on-mutation', mode: 'enforced' },
    ]);
    const messagesFor = (classShapes: ReturnType<typeof extractClassShapesFromSource>) =>
      evaluateArkRuleSensors({
        arkRules,
        classShapes,
        files: ['src/domain/rock.ts'],
      }).map((finding) => finding.message);

    const astMessages = messagesFor(
      extractClassShapesFromSource('src/domain/rock.ts', source, { ts })
    );
    const lexerMessages = messagesFor(
      extractClassShapesFromSource('src/domain/rock.ts', source)
    );

    for (const messages of [astMessages, lexerMessages]) {
      expect(messages.some((message) => message.includes('Rock.renameA'))).toBe(false);
      expect(messages.some((message) => message.includes('Rock.renameB'))).toBe(false);
      expect(messages.some((message) => message.includes('Rock.renameC'))).toBe(false);
      expect(messages.some((message) => message.includes('Rock.renameD'))).toBe(true);
    }
  });

  it('AR06 helper propagation covers plain this.events.push and still flags an unguarded public caller', () => {
    const source = `
export class Rock {
  private title = "";
  private events: unknown[] = [];
  private append(event: unknown) { this.events.push(event); }
  private bump() { this.title = this.title + 1; }
  recordThroughHelper(t: string) { this.title = t; this.append({ t }); }
  mutateThroughUnguardedHelper() { this.bump(); }
}
`;
    const shapes = extractClassShapesFromSource('src/domain/rock.ts', source, { ts });
    const findings = evaluateArkRuleSensors({
      arkRules: effective([
        { id: 'events', sensor: 'domain-event-on-mutation', mode: 'enforced' },
      ]),
      classShapes: shapes,
      files: ['src/domain/rock.ts'],
    });
    const messages = findings.map((finding) => finding.message);
    expect(messages.some((message) => message.includes('Rock.recordThroughHelper'))).toBe(false);
    expect(messages.some((message) => message.includes('Rock.append'))).toBe(false);
    expect(
      messages.some((message) => message.includes('Rock.mutateThroughUnguardedHelper'))
    ).toBe(true);
  });

  it('evaluates orchestration-only, thin-adapter, and no-anemic-model (AR07)', () => {
    const anemicShapes = extractClassShapesFromSource(
      'src/domain/customer.ts',
      `export class Customer { public id: string; public name: string; }`
    );
    const findings = evaluateArkRuleSensors({
      arkRules: effective([
        { id: 'orch', sensor: 'orchestration-only', mode: 'advisory', appliesTo: ['src/application/**'] },
        { id: 'thin', sensor: 'thin-adapter', mode: 'advisory', appliesTo: ['src/adapters/**'] },
        { id: 'anemic', sensor: 'no-anemic-model', mode: 'advisory' },
      ]),
      classShapes: anemicShapes,
      files: ['src/application/place-order.ts', 'src/adapters/http.ts', 'src/domain/customer.ts'],
      fileHints: {
        'src/application/place-order.ts': { orchestrationHeavy: true },
        'src/adapters/http.ts': { adapterThick: true },
      },
    });
    expect(findings.some((f) => f.arkruleId === 'orch')).toBe(true);
    expect(findings.some((f) => f.arkruleId === 'thin')).toBe(true);
    expect(findings.some((f) => f.arkruleId === 'anemic' && f.failsStrict === false)).toBe(true);
  });

  it('derives conservative fileHints from source (AR07 wiring)', () => {
    const heavy = `
export function canPlaceOrder(order: Order) { return order.total > 0; }
export function calculateDiscount(order: Order) { return order.total * 0.1; }
export function shouldNotify(order: Order) { return order.status === 'paid'; }
`;
    const thick = `
import { PrismaClient } from '@prisma/client';
export function canShip(order: Order) { return order.status === 'paid'; }
export function toDomain(row: Row) { return { id: row.id }; }
export async function save(order: Order) {
  if (order.total < 0) throw new Error('bad');
  if (order.status === 'cancelled') return;
  const prisma = new PrismaClient();
  await prisma.order.create({ data: order });
}
`;
    const clean = `export async function placeOrder(deps, cmd) { return deps.orders.save(cmd); }`;

    expect(deriveArkRuleFileHints('src/application/heavy.ts', heavy)?.orchestrationHeavy).toBe(
      true
    );
    expect(deriveArkRuleFileHints('src/adapters/thick.ts', thick)?.adapterThick).toBe(true);
    expect(deriveArkRuleFileHints('src/application/clean.ts', clean)).toBeNull();

    const hints = buildArkRuleFileHints({
      'src/application/heavy.ts': heavy,
      'src/adapters/thick.ts': thick,
      'src/application/clean.ts': clean,
    });
    expect(hints['src/application/heavy.ts']?.orchestrationHeavy).toBe(true);
    expect(hints['src/adapters/thick.ts']?.adapterThick).toBe(true);
    expect(hints['src/application/clean.ts']).toBeUndefined();

    // End-to-end: derived hints fire sensors without manual fileHints.
    const findings = evaluateArkRuleSensors({
      arkRules: effective([
        {
          id: 'orch',
          sensor: 'orchestration-only',
          mode: 'advisory',
          appliesTo: ['src/application/**'],
        },
        {
          id: 'thin',
          sensor: 'thin-adapter',
          mode: 'advisory',
          appliesTo: ['src/adapters/**'],
        },
      ]),
      classShapes: [],
      files: Object.keys(hints).concat(['src/application/clean.ts']),
      fileHints: hints,
    });
    expect(findings.some((f) => f.arkruleId === 'orch' && f.file.includes('heavy'))).toBe(true);
    expect(findings.some((f) => f.arkruleId === 'thin' && f.file.includes('thick'))).toBe(true);
    expect(findings.some((f) => f.file.includes('clean'))).toBe(false);
  });

  it('flags persistence driver writes in the declaring layer (ADR 0032)', () => {
    const skip = `
import { PrismaClient } from '@prisma/client';
export async function saveOrder(cmd) {
  const prisma = new PrismaClient();
  await prisma.order.create({ data: cmd });
}
`;
    const readOnly = `
import { PrismaClient } from '@prisma/client';
export async function listOrders() {
  const prisma = new PrismaClient();
  return prisma.order.findMany();
}
`;
    expect(deriveArkRuleFileHints('src/application/save-order.ts', skip)?.persistenceWrite).toBe(
      true
    );
    expect(deriveArkRuleFileHints('src/application/list-orders.ts', readOnly)?.persistenceWrite).toBeUndefined();

    const findings = evaluateArkRuleSensors({
      arkRules: effective([
        {
          id: 'writes',
          sensor: 'writes-via-aggregate',
          mode: 'advisory',
          appliesTo: ['src/application/**'],
        },
      ]),
      classShapes: [],
      files: ['src/application/save-order.ts', 'src/application/list-orders.ts'],
      fileHints: buildArkRuleFileHints({
        'src/application/save-order.ts': skip,
        'src/application/list-orders.ts': readOnly,
      }),
    });
    expect(findings.some((f) => f.arkruleId === 'writes' && f.file.includes('save-order'))).toBe(
      true
    );
    expect(findings.some((f) => f.file.includes('list-orders'))).toBe(false);
    expect(findings.every((f) => f.failsStrict === false)).toBe(true);
  });

  it('treats import { db } from "@/lib/db" + db.update() as a persistence write (WRITEAGG-001)', () => {
    const aliasWrite = `
import { db } from '@/lib/db';
export async function saveOrder(cmd) {
  await db.update(orders).set(cmd);
}
`;
    expect(
      deriveArkRuleFileHints('src/application/save-order.ts', aliasWrite)?.persistenceWrite
    ).toBe(true);

    const findings = evaluateArkRuleSensors({
      arkRules: effective([
        {
          id: 'writes',
          sensor: 'writes-via-aggregate',
          mode: 'advisory',
          appliesTo: ['src/application/**'],
        },
      ]),
      classShapes: [],
      files: ['src/application/save-order.ts'],
      fileHints: buildArkRuleFileHints({ 'src/application/save-order.ts': aliasWrite }),
    });
    expect(findings.some((f) => f.arkruleId === 'writes' && f.file.includes('save-order'))).toBe(
      true
    );

    const txInsert = `
import { eq } from 'drizzle-orm';
export async function saveOrder(tx, cmd) {
  await tx.insert(orders).values(cmd);
}
`;
    expect(
      deriveArkRuleFileHints('src/application/save-order.ts', txInsert)?.persistenceWrite
    ).toBe(true);
  });

  it('treats an inline or renamed Prisma client as a persistence write (shared hint with ArkOrder)', () => {
    const inline = `
import { PrismaClient } from '@prisma/client';
export async function saveOrder(cmd) {
  await new PrismaClient().order.update({ where: { id: cmd.id }, data: cmd });
}
`;
    const renamed = `
import { PrismaClient } from '@prisma/client';
const orm = new PrismaClient();
export async function saveOrder(cmd) {
  await orm.order.create({ data: cmd });
}
`;
    expect(deriveArkRuleFileHints('src/application/save-order.ts', inline)?.persistenceWrite).toBe(
      true
    );
    expect(
      deriveArkRuleFileHints('src/application/save-order.ts', renamed)?.persistenceWrite
    ).toBe(true);
  });

  it('does not treat repo.update() with a drizzle eq import as a persistence write (WRITEAGG-001)', () => {
    const repoUpdate = `
import { eq } from 'drizzle-orm';
export async function saveOrder(repo, cmd) {
  await repo.update(eq(orders.id, cmd.id), { status: cmd.status });
}
`;
    expect(
      deriveArkRuleFileHints('src/application/save-order.ts', repoUpdate)?.persistenceWrite
    ).toBeUndefined();

    const findings = evaluateArkRuleSensors({
      arkRules: effective([
        {
          id: 'writes',
          sensor: 'writes-via-aggregate',
          mode: 'advisory',
          appliesTo: ['src/application/**'],
        },
      ]),
      classShapes: [],
      files: ['src/application/save-order.ts'],
      fileHints: buildArkRuleFileHints({ 'src/application/save-order.ts': repoUpdate }),
    });
    expect(findings.some((f) => f.file.includes('save-order'))).toBe(false);
  });

  it('classifies PersistenceAdapters resolved imports as a driver (WRITEAGG-001)', () => {
    const viaAdapter = `
import { connection } from '@/server/infra';
export async function saveOrder(cmd) {
  await db.update(orders).set(cmd);
}
`;
    expect(
      deriveArkRuleFileHints('src/application/save-order.ts', viaAdapter)?.persistenceWrite
    ).toBeUndefined();
    expect(
      deriveArkRuleFileHints('src/application/save-order.ts', viaAdapter, [
        {
          specifier: '@/server/infra',
          resolvedFile: 'src/adapters/persistence/db.ts',
          layer: 'PersistenceAdapters',
        },
      ])?.persistenceWrite
    ).toBe(true);
  });

  it('flags realistic tagged SQL writes and ignores locks, upserts, and comments (#343)', () => {
    const flagged = (body: string) =>
      deriveArkRuleFileHints('src/lib/features/a/probe.ts', body)?.persistenceWrite === true;

    expect(
      flagged(`import type postgres from 'postgres';
export async function closeOrder(tx: postgres.TransactionSql) {
  await tx\`UPDATE orders SET status = 'closed'\`;
}`)
    ).toBe(true);
    expect(
      flagged(`import type { ATx } from '@/lib/repositories/a-db-executor';
export async function closeOrder(tx: ATx) {
  await tx\`UPDATE orders SET status = 'closed'\`;
}`)
    ).toBe(true);
    expect(
      flagged(`import type postgres from 'postgres';
export async function closeOrder(tx: postgres.TransactionSql) {
  await tx\`UPDATE ONLY orders SET status = 'closed'\`;
}`)
    ).toBe(true);
    expect(
      flagged(`import type postgres from 'postgres';
export async function closeOrder(tx: postgres.TransactionSql) {
  await tx\`UPDATE "public"."orders" SET status = 'closed'\`;
}`)
    ).toBe(true);
    expect(
      flagged(`import type postgres from 'postgres';
export async function closeOrder(tx: postgres.TransactionSql) {
  await tx\`MERGE INTO orders r USING (SELECT 1 AS id) s ON r.id = s.id WHEN MATCHED THEN UPDATE SET status = 'closed'\`;
  await tx\`TRUNCATE orders\`;
}`)
    ).toBe(true);
    expect(
      flagged(`import { sql } from 'drizzle-orm';
export async function renameOrder(ordersTable: unknown) {
  await sql\`UPDATE \${ordersTable} SET title = 'x'\`;
}`)
    ).toBe(true);
    expect(
      flagged(`import type postgres from 'postgres';
export async function repriceLine(tx: postgres.TransactionSql) {
  await tx\`UPDATE public.line_items li SET price = 1\`;
}`)
    ).toBe(true);

    expect(
      flagged(`import type postgres from 'postgres';
export async function lockOrder(tx: postgres.TransactionSql) {
  await tx\`SELECT id FROM orders r FOR UPDATE OF r\`;
}`)
    ).toBe(false);
    expect(
      flagged(`import type { ATx } from '@/lib/repositories/a-db-executor';
export async function upsertEvent(tx: ATx) {
  await tx\`INSERT INTO events (a) VALUES (1) ON CONFLICT (a) DO UPDATE SET a = 1\`;
}`)
    ).toBe(false);
    expect(
      flagged(`import type postgres from 'postgres';
// UPDATE orders SET x
export function note() { return 1; }`)
    ).toBe(false);
    expect(
      flagged(`import type postgres from 'postgres';
/**
 * INSERT INTO orders (id) VALUES (1)
 */
export function note() { return 1; }`)
    ).toBe(false);
    expect(
      flagged(`import type postgres from 'postgres';
export async function readOrder(tx: postgres.TransactionSql) {
  await tx\`SELECT 1 -- UPDATE orders SET x\`;
}`)
    ).toBe(false);
  });

  it('keeps ArkOrder IO write regex in lockstep with writes-via-aggregate (WRITEAGG-001)', () => {
    const aliasWrite = `
import { db } from '@/lib/db';
export async function saveOrder(cmd) {
  await db.update(orders).set({ status: cmd.status });
}
`;
    const repoUpdate = `
import { eq } from 'drizzle-orm';
export async function saveOrder(repo, cmd) {
  await repo.update(eq(orders.id, cmd.id), { status: cmd.status });
}
`;
    expect(
      extractArkOrderXiFieldWritesFromSource('src/application/save-order.ts', aliasWrite, [
        'status',
      ]).some((f) => f.key === 'status')
    ).toBe(true);
    expect(
      extractArkOrderXiFieldWritesFromSource('src/application/save-order.ts', repoUpdate, [
        'status',
      ])
    ).toEqual([]);
  });

  it('matches postgres and drizzle-orm subpath driver imports (EOSF2-001)', () => {
    const postgresWrite = `
import postgres from 'postgres';
export async function saveOrder(cmd) {
  await db.insert(orders).values(cmd);
}
`;
    const drizzleSubpathWrite = `
import { drizzle } from 'drizzle-orm/postgres-js';
export async function saveOrder(cmd) {
  await db.insert(orders).values(cmd);
}
`;
    const drizzleRootWrite = `
import { eq } from 'drizzle-orm';
export async function saveOrder(cmd) {
  await db.insert(orders).values(cmd);
}
`;
    const postgresRepo = `
import postgres from 'postgres';
export async function saveOrder(repo, cmd) {
  await repo.update(cmd);
}
`;
    expect(
      deriveArkRuleFileHints('src/application/save-order.ts', postgresWrite)?.persistenceWrite
    ).toBe(true);
    expect(
      deriveArkRuleFileHints('src/application/save-order.ts', drizzleSubpathWrite)?.persistenceWrite
    ).toBe(true);
    expect(
      deriveArkRuleFileHints('src/application/save-order.ts', drizzleRootWrite)?.persistenceWrite
    ).toBe(true);
    expect(
      deriveArkRuleFileHints('src/application/save-order.ts', postgresRepo)?.persistenceWrite
    ).toBeUndefined();

    const findings = evaluateArkRuleSensors({
      arkRules: effective([
        {
          id: 'writes',
          sensor: 'writes-via-aggregate',
          mode: 'enforced',
          appliesTo: ['src/application/**'],
        },
      ]),
      classShapes: [],
      files: ['src/application/postgres.ts', 'src/application/drizzle-subpath.ts'],
      fileHints: buildArkRuleFileHints({
        'src/application/postgres.ts': postgresWrite,
        'src/application/drizzle-subpath.ts': drizzleSubpathWrite,
      }),
    });
    expect(findings.some((f) => f.arkruleId === 'writes' && f.file.includes('postgres'))).toBe(
      true
    );
    expect(
      findings.some((f) => f.arkruleId === 'writes' && f.file.includes('drizzle-subpath'))
    ).toBe(true);
    expect(findings.every((f) => f.failsStrict === true)).toBe(true);
  });

  it('keeps ArkOrder IO regex in lockstep for postgres and drizzle-orm subpaths (EOSF2-001)', () => {
    const postgresWrite = `
import postgres from 'postgres';
export async function saveOrder(cmd) {
  await db.insert(orders).values({ status: cmd.status });
}
`;
    const drizzleSubpathWrite = `
import { drizzle } from 'drizzle-orm/postgres-js';
export async function saveOrder(cmd) {
  await db.insert(orders).values({ status: cmd.status });
}
`;
    expect(
      extractArkOrderXiFieldWritesFromSource('src/application/save-order.ts', postgresWrite, [
        'status',
      ]).some((f) => f.key === 'status')
    ).toBe(true);
    expect(
      extractArkOrderXiFieldWritesFromSource('src/application/save-order.ts', drizzleSubpathWrite, [
        'status',
      ]).some((f) => f.key === 'status')
    ).toBe(true);
  });

  it('fires writes-via-aggregate for drizzle-orm + db.insert when file content is present (EOSF1-001)', () => {
    const probe = `
import { eq } from "drizzle-orm";
export async function saveProgress(cmd) {
  await db.insert(activityProgress).values(cmd);
}
`;
    expect(probe.length).toBeGreaterThan(0);
    expect(deriveArkRuleFileHints('src/lib/features/save.ts', probe)?.persistenceWrite).toBe(true);

    const fileContents = { 'src/lib/features/save.ts': probe };
    const hints = buildArkRuleFileHints(fileContents);
    expect(fileContents['src/lib/features/save.ts']).toMatch(/drizzle-orm/);
    expect(fileContents['src/lib/features/save.ts']!.length).toBeGreaterThan(0);
    expect(hints['src/lib/features/save.ts']?.persistenceWrite).toBe(true);

    const findings = evaluateArkRuleSensors({
      arkRules: effective([
        {
          id: 'writes',
          sensor: 'writes-via-aggregate',
          mode: 'enforced',
          appliesTo: ['src/lib/**'],
        },
      ]),
      classShapes: [],
      files: ['src/lib/features/save.ts'],
      fileHints: hints,
    });
    expect(findings.some((f) => f.arkruleId === 'writes' && f.failsStrict)).toBe(true);
  });

  it('does not treat empty fileHints content as a persistence write (EOSF1-001)', () => {
    expect(deriveArkRuleFileHints('src/lib/features/save.ts', '')).toBeNull();
    expect(buildArkRuleFileHints({ 'src/lib/features/save.ts': '' })['src/lib/features/save.ts']).toBe(
      undefined
    );
  });

  it('still derives persistenceWrite when inside-budget content is shorter than the orchestration floor (EOSF1-001)', () => {
    const shortProbe = "from 'postgres'\ndb.insert(t).values(x)";
    expect(shortProbe.length).toBeLessThan(40);
    expect(deriveArkRuleFileHints('src/lib/save.ts', shortProbe)?.persistenceWrite).toBe(true);
    const hints = buildArkRuleFileHints({ 'src/lib/save.ts': shortProbe });
    expect(hints['src/lib/save.ts']?.persistenceWrite).toBe(true);
  });

  it('warns on zero-match appliesTo (ADR 0012 empty scope)', () => {
    const arkRules = effective([
      {
        id: 'missing-scope',
        sensor: 'aggregate-private-state',
        mode: 'advisory',
        appliesTo: ['src/domain/**/aggregates/**'],
      },
      {
        id: 'enforced-miss',
        sensor: 'always-valid-factory',
        mode: 'enforced',
        appliesTo: ['src/nowhere/**'],
      },
    ]);
    const empty = collectEmptyAppliesToFindings(arkRules, [
      'src/domain/order.ts',
      'src/application/place.ts',
    ]);
    expect(empty).toHaveLength(2);
    expect(empty.every((f) => f.ruleId === 'ARKRULE_SCOPE_EMPTY')).toBe(true);
    expect(empty.find((f) => f.arkruleId === 'missing-scope')?.failsStrict).toBe(false);
    expect(empty.find((f) => f.arkruleId === 'enforced-miss')?.failsStrict).toBe(true);

    const hit = collectEmptyAppliesToFindings(
      effective([
        {
          id: 'ok',
          sensor: 'aggregate-private-state',
          mode: 'enforced',
          appliesTo: ['src/domain/**'],
        },
      ]),
      ['src/domain/order.ts']
    );
    expect(hit).toEqual([]);
  });

  it('skips unclassified files when layerForFile is provided (NEW-ARKRULES-UNCLASSIFIED)', () => {
    const shapes = extractClassShapesFromSource(
      'loose/x.ts',
      `export class Loose { public total = 0; constructor() {} }`
    );
    const domain = extractClassShapesFromSource(
      'src/domain/order.ts',
      `export class Order { public total = 0; constructor() {} setTotal(n: number) { this.total = n; } }`
    );
    const findings = evaluateArkRuleSensors({
      arkRules: effective([
        { id: 'private-state', sensor: 'aggregate-private-state', mode: 'enforced' },
      ]),
      classShapes: [...shapes, ...domain],
      files: ['loose/x.ts', 'src/domain/order.ts'],
      layerForFile: (file) => (file.startsWith('src/domain/') ? 'DomainModel' : null),
    });
    expect(findings.every((f) => f.file !== 'loose/x.ts')).toBe(true);
    expect(findings.some((f) => f.file === 'src/domain/order.ts')).toBe(true);
  });

  it('ignores control-flow method names if/match/when as mutations (P1L)', () => {
    const shapes = extractClassShapesFromSource(
      'src/domain/property.ts',
      `
export class Property {
  private v = 0;
  private constructor() {}
  static create() { return new Property(); }
  if(p: boolean) { this.v = p ? 1 : 0; return this; }
  resize(n: number) { this.v = n; }
}
`
    );
    expect(shapes[0]?.mutatingMethods.map((m) => m.name)).toEqual(['resize']);
    const findings = evaluateArkRuleSensors({
      arkRules: effective([
        { id: 'events', sensor: 'domain-event-on-mutation', mode: 'enforced' },
      ]),
      classShapes: shapes,
      files: ['src/domain/property.ts'],
    });
    expect(findings.some((f) => f.message.includes('Property.if'))).toBe(false);
    expect(findings.some((f) => f.message.includes('resize'))).toBe(true);
  });

  it('appliesTo globs match layerMatch zero-segment double-star slash', () => {
    // src/domain/**/*.ts must match src/domain/order.ts (no intermediate dir).
    const shapes = extractClassShapesFromSource(
      'src/domain/order.ts',
      `export class Order { public total = 0; constructor() {} }`
    );
    const nested = extractClassShapesFromSource(
      'src/domain/aggregates/order.ts',
      `export class NestedOrder { public total = 0; constructor() {} }`
    );
    const findings = evaluateArkRuleSensors({
      arkRules: effective([
        {
          id: 'domain-ts',
          sensor: 'aggregate-private-state',
          mode: 'enforced',
          appliesTo: ['src/domain/**/*.ts'],
        },
      ]),
      classShapes: [...shapes, ...nested],
      files: ['src/domain/order.ts', 'src/domain/aggregates/order.ts', 'src/application/x.ts'],
    });
    expect(findings.some((f) => f.file === 'src/domain/order.ts')).toBe(true);
    expect(findings.some((f) => f.file === 'src/domain/aggregates/order.ts')).toBe(true);

    // Zero-match must not false-fire when double-star slash matches zero segments.
    const empty = collectEmptyAppliesToFindings(
      effective([
        {
          id: 'domain-ts',
          sensor: 'aggregate-private-state',
          mode: 'advisory',
          appliesTo: ['src/domain/**/*.ts'],
        },
      ]),
      ['src/domain/order.ts']
    );
    expect(empty).toEqual([]);
  });

  it('sees a later mutator whose signature has nested parentheses (SHAPE-001 residual)', () => {
    const shapes = extractClassShapesFromSource(
      'src/domain/order.ts',
      `
export class Order {
  private status = 'Open';
  private constructor() {}
  static create() { return new Order(); }
  declare() { this.ensureInvariants(); }
  close(
    reason: string,
    notify: (id: string) => void
  ) { this.status = 'Closed'; }
}
`
    );
    expect(shapes[0]?.mutatingMethods.map((m) => m.name)).toEqual(['close']);
    const findings = evaluateArkRuleSensors({
      arkRules: effective([
        { id: 'events', sensor: 'domain-event-on-mutation', mode: 'enforced' },
      ]),
      classShapes: shapes,
      files: ['src/domain/order.ts'],
    });
    expect(findings.some((f) => f.message.includes('close'))).toBe(true);
    expect(findings.some((f) => f.message.includes('declare'))).toBe(false);
  });

  it('does not treat object literals or multiline params as public fields (DSHAPE-001)', () => {
    const shapes = extractClassShapesFromSource(
      'src/domain/order.ts',
      `
export class Order {
  private status = 'Open';
  private constructor() {}
  static create() { return new Order(); }
  close(
    reason: string,
    at: Date
  ) {
    return { status: 'Closed', reason };
  }
}
`
    );
    expect(shapes[0]?.hasPublicMutableFields).toBe(false);
    const findings = evaluateArkRuleSensors({
      arkRules: effective([
        { id: 'private-state', sensor: 'aggregate-private-state', mode: 'enforced' },
      ]),
      classShapes: shapes,
      files: ['src/domain/order.ts'],
    });
    expect(findings).toEqual([]);
  });

  it('does not treat this.x === y as assignment; pendingEvents = [] is not a mutator (DSHAPE-001)', () => {
    const shapes = extractClassShapesFromSource(
      'src/domain/order.ts',
      `
export class Order {
  private status = 'Open';
  private pendingEvents: unknown[] = [];
  private constructor() {}
  static create() { return new Order(); }
  ensureInvariants() { if (this.status === 'Closed') throw new Error('closed'); }
  pullEvents() { const out = this.pendingEvents; this.pendingEvents = []; return out; }
}
`
    );
    expect(shapes[0]?.mutatingMethods).toEqual([]);
  });

  it('counts events-array .push( as publish and names expected words (DSHAPE-001)', () => {
    expect(DOMAIN_INVARIANT_WORDS).toEqual([
      'ensureInvariants',
      'assertInvariants',
      'validate',
      'publish',
      'emit',
      'raise',
      'record',
    ]);
    const shapes = extractClassShapesFromSource(
      'src/domain/order.ts',
      `
export class Order {
  private status = 'Open';
  private pendingEvents: unknown[] = [];
  private constructor() {}
  static create() { return new Order(); }
  close() { this.status = 'Closed'; this.pendingEvents.push({ type: 'Closed' }); }
}
`
    );
    expect(shapes[0]?.mutatingMethods).toEqual([
      { name: 'close', referencesGuardOrPublish: true },
    ]);
    const unguarded = extractClassShapesFromSource(
      'src/domain/order.ts',
      `
export class Order {
  private status = 'Open';
  private constructor() {}
  static create() { return new Order(); }
  close() { this.status = 'Closed'; }
}
`
    );
    const findings = evaluateArkRuleSensors({
      arkRules: effective([
        { id: 'events', sensor: 'domain-event-on-mutation', mode: 'enforced' },
      ]),
      classShapes: unguarded,
      files: ['src/domain/order.ts'],
    });
    const message = findings.find((f) => f.message.includes('close'))?.message ?? '';
    expect(message).toContain('ensureInvariants');
    expect(message).toContain('raise');
    expect(message).toContain('record');
    expect(message).toMatch(/\.push\(/);
  });

  it('names remaining shape truncation in the sensor message (SHAPE-001)', () => {
    const shapes = extractClassShapesFromSource(
      'src/domain/order.ts',
      `
export class Order {
  private status = 'Open';
  close() { this.status = 'Closed';
`
    );
    expect(shapes).toHaveLength(1);
    const findings = evaluateArkRuleSensors({
      arkRules: effective([
        { id: 'events', sensor: 'domain-event-on-mutation', mode: 'enforced' },
      ]),
      classShapes: shapes,
      files: ['src/domain/order.ts'],
    });
    expect(findings.some((f) => /shape analysed until character \d+/.test(f.message))).toBe(
      true
    );
  });

  it('keeps the generated CLI sensor artifact behaviorally aligned', () => {
    const source = `
import { PrismaClient } from '@prisma/client';
export class Order {
  public total = 0;
  constructor() {}
  increase() { this.total = this.total + 1; }
}
export function canPlaceOrder(order: Order) { return order.total > 0; }
export function calculateDiscount(order: Order) { return order.total * 0.1; }
export async function POST(order: Order) {
  if (order.total < 0) throw new Error('bad');
  return new PrismaClient().order.create({ data: order });
}
`;
    const canonicalShapes = extractClassShapesFromSource('src/domain/order.ts', source);
    const cliShapes = extractCliClassShapesFromSource('src/domain/order.ts', source);
    const canonicalHints = buildArkRuleFileHints({
      'src/application/place-order.ts': source,
      'src/adapters/http.ts': source,
    });
    const cliHints = buildCliArkRuleFileHints({
      'src/application/place-order.ts': source,
      'src/adapters/http.ts': source,
    });
    const arkRules = effective([
      {
        id: 'private-state',
        sensor: 'aggregate-private-state',
        mode: 'enforced',
        appliesTo: ['src/domain/**'],
      },
      {
        id: 'factory',
        sensor: 'always-valid-factory',
        mode: 'enforced',
        appliesTo: ['src/domain/**'],
      },
      {
        id: 'events',
        sensor: 'domain-event-on-mutation',
        mode: 'enforced',
        appliesTo: ['src/domain/**'],
      },
      {
        id: 'orch',
        sensor: 'orchestration-only',
        mode: 'advisory',
        appliesTo: ['src/application/**'],
      },
      {
        id: 'thin',
        sensor: 'thin-adapter',
        mode: 'advisory',
        appliesTo: ['src/adapters/**'],
      },
      { id: 'anemic', sensor: 'no-anemic-model', mode: 'advisory' },
    ]);
    const input = {
      arkRules,
      classShapes: canonicalShapes,
      files: [
        'src/domain/order.ts',
        'src/application/place-order.ts',
        'src/adapters/http.ts',
      ],
      fileHints: canonicalHints,
    };

    expect(cliShapes).toEqual(canonicalShapes);
    expect(cliHints).toEqual(canonicalHints);
    expect(evaluateCliArkRuleSensors({ ...input, classShapes: cliShapes, fileHints: cliHints })).toEqual(
      evaluateArkRuleSensors(input)
    );
    expect(collectCliEmptyAppliesToFindings(arkRules, input.files)).toEqual(
      collectEmptyAppliesToFindings(arkRules, input.files)
    );
  });
});

describe('INVARIANT_CATALOG_EMPTY residual', () => {
  const layers = [
    { name: 'DomainModel', intentPrefixes: ['Domain.'] },
    { name: 'ApplicationOrchestration', intentPrefixes: ['Application.'] },
  ];
  const domainFile = { path: 'src/domain/order.ts', layer: 'DomainModel' };
  const appFile = { path: 'src/application/place.ts', layer: 'ApplicationOrchestration' };

  function catalogInput(
    extras: Partial<Parameters<typeof collectEmptyInvariantCatalogFindings>[0]> = {}
  ) {
    return {
      arkRulesActive: true,
      arkRules: effective([]),
      layers,
      files: [domainFile],
      ...extras,
    };
  }

  it('fires when arkRules is on, Domain has code, and invariants[] is empty', () => {
    const findings = collectEmptyInvariantCatalogFindings(catalogInput());
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('INVARIANT_CATALOG_EMPTY');
    expect(findings[0]?.file).toBe('arkrules/DomainModel.json');
    expect(findings[0]?.failsStrict).toBe(false);
    expect(findings[0]?.message).toMatch(/1–2 short phrases/);
    expect(
      collectCliEmptyInvariantCatalogFindings(catalogInput())
    ).toEqual(findings);
  });

  it('does not fire when arkRules is off', () => {
    expect(
      collectEmptyInvariantCatalogFindings(catalogInput({ arkRulesActive: false }))
    ).toEqual([]);
  });

  it('does not fire when Domain has no files', () => {
    expect(
      collectEmptyInvariantCatalogFindings(catalogInput({ files: [appFile] }))
    ).toEqual([]);
  });

  it('does not fire when a domain invariant is present', () => {
    const file = loadArkRulesContract({
      schemaVersion: '1.0',
      layer: 'DomainModel',
      invariants: [
        {
          id: 'INV-ALWAYS-VALID',
          description: 'A domain object is never stored in an invalid state',
          coverage: { test: false },
        },
      ],
    }).config;
    const arkRules = buildEffectiveArkRules([
      { layer: 'DomainModel', sourceFile: 'arkrules/DomainModel.json', file },
    ]);
    expect(
      collectEmptyInvariantCatalogFindings(catalogInput({ arkRules }))
    ).toEqual([]);
  });

  it('treats trailing-dot Domain prefixes as Domain without a regex and matches canonical isDomainRoleLayer', () => {
    expect(isDomainRoleLayerName('ApplicationOrchestration', ['Domain...'])).toBe(true);
    expect(isDomainRoleLayerName('ApplicationOrchestration', ['Domain.'])).toBe(true);
    expect(isDomainRoleLayerName('ApplicationOrchestration', ['.'.repeat(200)])).toBe(false);
    expect(isDomainRoleLayerName('ApplicationOrchestration', ['Application.'])).toBe(false);
    expect(isDomainRoleLayerName('ReportingReadModels')).toBe(false);
    expect(isDomainRoleLayerName('SharedKernel')).toBe(false);
    expect(isDomainRoleLayerName('Entities')).toBe(true);
    expect(isDomainRoleLayerName('Aggregates')).toBe(true);
    expect(isDomainRoleLayerName('Entities')).toBe(isDomainRoleLayer('Entities'));
    expect(isDomainRoleLayerName('ReportingReadModels')).toBe(
      isDomainRoleLayer('ReportingReadModels')
    );
  });

  it('Phase 2.1 AST: domain-event-on-mutation rejects const record = 1 and dead closures while accepting real calls and throws', () => {
    const source = `
export class Order {
  private total = 0;
  private pendingEvents: unknown[] = [];
  private otherItems: unknown[] = [];
  private constructor() {}
  static create() { return new Order(); }

  // False-pass traps that plain-text regex previously missed:
  fakeRecordVar(n: number) {
    const record = 1;
    this.total = n + record;
  }
  fakePropertyRef(n: number) {
    const fn = this.record;
    void fn;
    this.total = n;
  }
  fakeStringAndComment(n: number) {
    // this.ensureInvariants();
    const s = 'this.record()';
    void s;
    this.total = n;
  }
  fakeUnthrownError(n: number) {
    const err = new Error('not thrown');
    void err;
    this.total = n;
  }
  fakeDeadClosure(n: number) {
    const unused = () => {
      this.record({ type: 'Never' });
      throw new Error('never');
    };
    void unused;
    this.total = n;
  }
  fakeOtherPush(n: number) {
    this.otherItems.push(n);
    this.total = n;
  }

  // Legitimate guards & publishes:
  realRecord(n: number) {
    this.total = n;
    this.record({ type: 'Changed' });
  }
  realEnsure(n: number) {
    this.total = n;
    this.ensureInvariants();
  }
  realPush(n: number) {
    this.total = n;
    this.pendingEvents.push({ type: 'Changed' });
  }
  realThrowGuard(n: number) {
    if (n < 0) throw new Error('negative');
    this.total = n;
  }
  realDirectThrow(n: number) {
    this.total = n;
    throw new Error('rejected');
  }
  private record(_e: unknown) {}
  private ensureInvariants() {}
}
`;
    const shapes = extractClassShapesFromSource('src/domain/order.ts', source, { ts });
    expect(shapes).toHaveLength(1);
    const byName = new Map(
      shapes[0]!.mutatingMethods.map((m) => [m.name, m.referencesGuardOrPublish])
    );

    expect(byName.get('fakeRecordVar')).toBe(false);
    expect(byName.get('fakePropertyRef')).toBe(false);
    expect(byName.get('fakeStringAndComment')).toBe(false);
    expect(byName.get('fakeUnthrownError')).toBe(false);
    expect(byName.get('fakeDeadClosure')).toBe(false);
    expect(byName.get('fakeOtherPush')).toBe(false);

    expect(byName.get('realRecord')).toBe(true);
    expect(byName.get('realEnsure')).toBe(true);
    expect(byName.get('realPush')).toBe(true);
    expect(byName.get('realThrowGuard')).toBe(true);
    expect(byName.get('realDirectThrow')).toBe(true);

    const findings = evaluateArkRuleSensors({
      arkRules: effective([
        { id: 'events', sensor: 'domain-event-on-mutation', mode: 'enforced' },
      ]),
      classShapes: shapes,
      files: ['src/domain/order.ts'],
    });
    const flagged = findings.map((f) => f.message);
    expect(flagged.some((m) => m.includes('fakeRecordVar'))).toBe(true);
    expect(flagged.some((m) => m.includes('fakeDeadClosure'))).toBe(true);
    expect(flagged.some((m) => m.includes('realRecord'))).toBe(false);
    expect(flagged.some((m) => m.includes('realThrowGuard'))).toBe(false);

    // Truncated/unclosed class still falls back to lexical scanner to report truncatedUntil.
    const truncated = extractClassShapesFromSource(
      'src/domain/broken.ts',
      `export class Broken {\n  private x = 0;\n  mutate() { this.x = 1;\n`,
      { ts }
    );
    expect(truncated[0]?.truncatedUntil).toBeTypeOf('number');
  });

  it('Phase 2.1: validateSnippetAnalysis forwards ts AST to ArkRules and ArkOrder snippet checks', () => {
    const stubGate = { validate: () => ({ valid: true, lexicalValid: true, violations: [] }) };
    const arkRules = effective([
      { id: 'events', sensor: 'domain-event-on-mutation', mode: 'enforced' },
    ]);
    const rulesSnippet = validateSnippetAnalysis({
      gate: stubGate,
      ts,
      source: `export class Order {
  private total = 0;
  private constructor() {}
  static create() { return new Order(); }
  bump(n: number) { const record = 1; this.total = n + record; }
}`,
      context: {
        relFile: 'src/domain/order.ts',
        filePath: 'src/domain/order.ts',
        layer: 'DomainModel',
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        arkRules,
      },
    });
    expect(rulesSnippet.violations.some((v: { code?: string }) => v.code === 'domain-event-on-mutation')).toBe(true);

    const orderSnippet = validateSnippetAnalysis({
      gate: stubGate,
      ts,
      source: `import { createOrderPlane } from 'arkgate/order';
const plane = createOrderPlane({ projector: () => ({ allowedKinds: ['A'], invalidated: [] }) });
const XI = { plan: 'free', ttl: 30 };
plane.release(XI);
`,
      context: {
        relFile: 'src/main.ts',
        filePath: 'src/main.ts',
        layer: 'ApplicationOrchestration',
        layers: [{ name: 'ApplicationOrchestration', patterns: ['src/**'] }],
        arkOrder: {
          mode: 'enforced',
          planeRoots: ['src/main.ts'],
          managedLayers: ['ApplicationOrchestration'],
          maxXiKeys: 7,
          xiKeys: ['plan'],
        },
      },
    });
    expect(orderSnippet.violations.some((v: { ruleId?: string }) => v.ruleId === 'ARKORDER_XI_TTL')).toBe(true);
  });

  it('failsStrict only when a domain structure rule is already enforced', () => {
    const advisory = collectEmptyInvariantCatalogFindings(
      catalogInput({ arkRules: effective([{ id: 'fac', sensor: 'always-valid-factory' }]) })
    );
    expect(advisory[0]?.failsStrict).toBe(false);
    const enforced = collectEmptyInvariantCatalogFindings(
      catalogInput({
        arkRules: effective([
          { id: 'fac', sensor: 'always-valid-factory', mode: 'enforced' },
        ]),
      })
    );
    expect(enforced[0]?.failsStrict).toBe(true);
    expect(enforced[0]?.severity).toBe('error');
  });
});
