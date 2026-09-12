/**
 * Narrow opt-in status/transition catalog. Silent unless Domain-role code
 * already names a closed status/state vocabulary AND a domain doc is in play
 * without a table. Never a gate fail.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectStatusTransitionCatalog,
  collectStatusTransitionCatalogResidual,
  extractQuotedLiterals,
  extractStatusCatalogFromSource,
} from '../../../bin/lib/status-transition-catalog.mjs';
import { collectStatesTransitionsResidual } from '../../../bin/lib/states-transitions-presence.mjs';
import { runDoctor } from '../../../bin/lib/doctor-plan.mjs';

const temps: string[] = [];

function mk(prefix = 'ark-sc-'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(root);
  return root;
}

afterEach(() => {
  for (const root of temps.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function writeGoverned(root: string, domainBody: string) {
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/domain/order.ts'), domainBody);
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    JSON.stringify({
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    })
  );
}

function writeDoc(root: string, rel: string, body: string) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body);
}

const ORDER_STATUS = `export type OrderStatus = 'draft' | 'paid' | 'cancelled';

export function canPay(from: OrderStatus): boolean {
  return from === 'draft'; // draft → paid
}
`;

const TABLE = `| entity | states | allowed transitions |
| --- | --- | --- |
| Order | draft, paid, cancelled | draft → paid |
`;

describe('status catalog extractors', () => {
  it('reads quoted literals and closed *Status types', () => {
    expect(extractQuotedLiterals(`'draft' | 'paid'`)).toEqual(['draft', 'paid']);
    const rows = extractStatusCatalogFromSource('src/domain/order.ts', ORDER_STATUS);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.entity).toBe('Order');
    expect(rows[0]?.states).toEqual(['draft', 'paid', 'cancelled']);
    expect(rows[0]?.transitions).toContain('draft → paid');
  });

  it('reads enums and inline status unions, and ignores prototype / single literals', () => {
    const enumSrc = `export enum PaymentState { Open = 'open', Closed = 'closed' }\n`;
    expect(extractStatusCatalogFromSource('src/domain/payment.ts', enumSrc)[0]?.entity).toBe(
      'Payment'
    );
    const inline = `export type Order = { status: 'draft' | 'paid' };\n`;
    expect(extractStatusCatalogFromSource('src/domain/order.ts', inline)[0]?.states).toEqual([
      'draft',
      'paid',
    ]);
    expect(
      extractStatusCatalogFromSource('src/domain/proto.ts', 'const prototype = 1;\n')
    ).toEqual([]);
    expect(
      extractStatusCatalogFromSource('src/domain/one.ts', `export type OrderStatus = 'draft';\n`)
    ).toEqual([]);
  });
});

describe('status catalog collector', () => {
  it('is silent when Domain has no status vocabulary', () => {
    const root = mk();
    writeGoverned(root, 'export const value = 1;\n');
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    const files = [path.join(root, 'src/domain/order.ts')];
    expect(collectStatusTransitionCatalog({ root, config, files })).toEqual([]);
    expect(collectStatusTransitionCatalogResidual({ root, config, files })).toBeNull();
  });

  it('catalogs Domain status shapes but stays silent without a domain doc', () => {
    const root = mk();
    writeGoverned(root, ORDER_STATUS);
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    const files = [path.join(root, 'src/domain/order.ts')];
    const catalog = collectStatusTransitionCatalog({ root, config, files });
    expect(catalog[0]?.entity).toBe('Order');
    expect(collectStatusTransitionCatalogResidual({ root, config, files })).toBeNull();
  });

  it('names a thin map when a domain doc is in play and Domain already has statuses', () => {
    const root = mk();
    writeGoverned(root, ORDER_STATUS);
    writeDoc(root, 'docs/domain.md', '# Domain\n\nOrders are the core bet.\n');
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    const files = [path.join(root, 'src/domain/order.ts')];
    const residual = collectStatusTransitionCatalogResidual({ root, config, files });
    expect(residual?.kind).toBe('thin');
    expect(residual?.home).toBe('docs/domain.md');
    expect(residual?.entities[0]?.entity).toBe('Order');
    expect(residual?.ask).toContain('Order (draft, paid, cancelled)');
    expect(residual?.nextAction).toContain('docs/domain.md');
    expect(residual?.nextAction).toMatch(/flag soup/i);
    expect(residual?.ask).not.toMatch(/Haken|ξ|xiHash/i);
  });

  it('stays quiet once the table exists, even when Domain has statuses', () => {
    const root = mk();
    writeGoverned(root, ORDER_STATUS);
    writeDoc(root, 'docs/domain.md', `# Domain\n\n${TABLE}`);
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    const files = [path.join(root, 'src/domain/order.ts')];
    expect(collectStatesTransitionsResidual({ root })).toBeNull();
    expect(collectStatusTransitionCatalogResidual({ root, config, files })).toBeNull();
  });
});

describe('doctor residual', () => {
  it('omits statusTransitionCatalog unless Domain opted in and the map is thin', () => {
    const root = mk('ark-sc-doc-');
    writeGoverned(root, ORDER_STATUS);
    const file = path.join(root, 'src/domain/order.ts');
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));

    let silent: { doctor?: { statusTransitionCatalog?: { kind?: string } } } | undefined;
    runDoctor(root, config, [file], [], [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        silent = JSON.parse(text);
      },
    });
    expect(silent?.doctor?.statusTransitionCatalog).toBeUndefined();

    writeDoc(root, 'docs/domain.md', '# Domain\n\nOrders are the core bet.\n');
    let thin: {
      doctor?: { statusTransitionCatalog?: { kind?: string; nextAction?: string } };
    } | undefined;
    runDoctor(root, config, [file], [], [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        thin = JSON.parse(text);
      },
    });
    expect(thin?.doctor?.statusTransitionCatalog?.kind).toBe('thin');
    expect(thin?.doctor?.statusTransitionCatalog?.nextAction).toContain('Order');

    writeDoc(root, 'docs/domain.md', `# Domain\n\n${TABLE}`);
    let present: { doctor?: { statusTransitionCatalog?: { kind?: string } } } | undefined;
    runDoctor(root, config, [file], [], [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        present = JSON.parse(text);
      },
    });
    expect(present?.doctor?.statusTransitionCatalog).toBeUndefined();
  });
});

describe('live doctor CLI', () => {
  it('prints catalog names when Domain opted in and the map is thin, and stays quiet otherwise', () => {
    const thin = mk('ark-sc-cli-thin-');
    writeGoverned(thin, ORDER_STATUS);
    writeDoc(thin, 'docs/domain.md', '# Domain\n\nOrders are the core bet.\n');
    const thinOut = execFileSync(
      process.execPath,
      [path.resolve('bin/ark-check.mjs'), '--root', thin, '--doctor'],
      { encoding: 'utf8' }
    );
    expect(thinOut).toContain('Order (draft, paid, cancelled)');
    expect(thinOut).toContain('docs/domain.md');
    expect(thinOut).toMatch(/flag soup/i);
    expect(thinOut).not.toContain('A domain doc is in play, but there is no states → transitions map yet.');

    const quiet = mk('ark-sc-cli-quiet-');
    writeGoverned(quiet, ORDER_STATUS);
    const quietOut = execFileSync(
      process.execPath,
      [path.resolve('bin/ark-check.mjs'), '--root', quiet, '--doctor'],
      { encoding: 'utf8' }
    );
    expect(quietOut).not.toContain('states → transitions map is still thin');
    expect(quietOut).not.toContain('Order (draft, paid, cancelled)');

    const mapped = mk('ark-sc-cli-map-');
    writeGoverned(mapped, ORDER_STATUS);
    writeDoc(mapped, 'docs/domain.md', `# Domain\n\n${TABLE}`);
    const mappedOut = execFileSync(
      process.execPath,
      [path.resolve('bin/ark-check.mjs'), '--root', mapped, '--doctor'],
      { encoding: 'utf8' }
    );
    expect(mappedOut).not.toContain('states → transitions map is still thin');
  });

  it('keeps a plain check green when the catalog is thin', () => {
    const root = mk('ark-sc-check-');
    writeGoverned(root, ORDER_STATUS);
    writeDoc(root, 'docs/domain.md', '# Domain\n\nOrders are the core bet.\n');
    const human = execFileSync(
      process.execPath,
      [path.resolve('bin/ark-check.mjs'), '--root', root],
      { encoding: 'utf8' }
    );
    expect(human).toMatch(/✔ Ark check passed/);
    expect(human).not.toContain('states → transitions map is still thin');
  });
});
