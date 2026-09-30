/**
 * ADR 0038 — copies across a wall: the Tooling pass (token stream, eligibility,
 * crossings through the gate's classifier, destinations) and its three views.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_IDENT, TOKEN_LITERAL } from '../../../bin/lib/clone-detection.mjs';
import {
  computeCrossWallDuplication,
  crossWallDuplicationHtml,
  printCrossWallDuplicationSection,
  tokenStream,
} from '../../../bin/lib/duplication-io.mjs';

const CLI = path.resolve('bin/ark-check.mjs');
const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const WALL = {
  include: ['src'],
  layers: [
    { name: 'Domain', patterns: ['src/domain/**'] },
    { name: 'Features', patterns: ['src/features/**', 'src/shared/**'] },
  ],
  rules: [
    { from: 'Domain', to: 'Features', allowed: false },
    {
      from: 'Features',
      to: 'Features',
      allowed: false,
      peerIsolation: true,
      sliceFolders: ['features'],
      sharedRoots: ['shared'],
    },
  ],
};

/** 13 lines, well over 50 tokens, the same names on both sides. */
function totalFn(name: string): string {
  return `export function ${name}(lines: readonly { quantity: number; unitPrice: number; taxRate: number }[], discount: number): number {
  let subtotal = 0;
  let tax = 0;
  for (const line of lines) {
    const amount = line.quantity * line.unitPrice;
    subtotal += amount;
    tax += amount * line.taxRate;
  }
  const discounted = Math.max(0, subtotal - discount);
  const total = discounted + tax;
  return Math.round(total * 100) / 100;
}
`;
}

function card(name: string): string {
  return `export function ${name}(props: { title: string; count: number; onOpen: () => void }) {
  const label = props.count > 1 ? \`\${props.count} items\` : 'one item';
  return (
    <section className="card">
      <h2>{props.title}</h2>
      <p>Don't lose track: {label} are waiting.</p>
      <button type="button" onClick={props.onOpen}>
        Open {props.title}
      </button>
    </section>
  );
}
`;
}

function tree(files: Record<string, string>, config: object = WALL): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-copies-'));
  roots.push(root);
  const all = { 'ark.config.json': JSON.stringify(config), ...files };
  for (const [rel, body] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}

function run(root: string, config: object = WALL, extra: Record<string, unknown> = {}) {
  const files = Object.keys(listFiles(root)).filter((rel) => rel.startsWith('src/'));
  return computeCrossWallDuplication({ root, config, ts, files, details: true, ...extra });
}

function listFiles(root: string, dir = ''): Record<string, true> {
  const out: Record<string, true> = {};
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(out, listFiles(root, rel));
    else out[rel] = true;
  }
  return out;
}

function capture(fn: (io: { line: (mark: string, text: string) => void; warn: string; color: Record<string, (text: string) => string> }) => void) {
  const out: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((text?: unknown) => {
    out.push(String(text ?? ''));
  });
  const identity = (text: string) => text;
  fn({ line: (mark, text) => out.push(`${mark} ${text}`), warn: '!', color: { bold: identity, dim: identity } });
  return out.join('\n');
}

describe('token stream', () => {
  it('parses JSX text with an apostrophe as one literal, not a string opener', () => {
    const stream = tokenStream(ts, 'src/card.tsx', card('Card'), true);
    const literals = [...stream.kinds].filter((kind) => kind === TOKEN_LITERAL).length;
    expect(literals).toBeGreaterThanOrEqual(4);
    expect(stream.names).toContain('props');
    expect(stream.kinds.length).toBe(stream.nodes.length);
  });

  it('skips imports and export-from, and keeps unary operators apart', () => {
    const base = tokenStream(ts, 'a.ts', 'export const x = !a;\n').kinds;
    const withImports = tokenStream(
      ts,
      'a.ts',
      "import { a } from './a';\nimport type { T } from './t';\nexport { b } from './b';\nexport const x = !a;\n"
    ).kinds;
    expect([...withImports]).toEqual([...base]);
    const minus = tokenStream(ts, 'a.ts', 'export const x = -a;\n').kinds;
    expect([...minus]).not.toEqual([...base]);
    expect([...base]).toContain(TOKEN_IDENT);
  });
});

describe('copies across a wall', () => {
  it('lists a cross-slice copy with the shared root as destination', () => {
    const root = tree({
      'src/features/billing/total.ts': totalFn('invoiceTotal'),
      'src/features/invoices/total.ts': `// copied\n${totalFn('invoiceTotal')}`,
      'src/shared/ids.ts': 'export const id = 1;\n',
    });
    const result = run(root);
    expect(result.status).toBe('complete');
    expect(result.families).toHaveLength(1);
    expect(result.families[0]).toMatchObject({
      ruleId: 'CROSS_WALL_DUPLICATE',
      crossing: 'cross-slice',
      destination: { kind: 'shared-root', path: 'src/shared/' },
    });
    expect(result.families[0]?.members.map((member: { path: string; startLine: number }) => [member.path, member.startLine])).toEqual([
      ['src/features/billing/total.ts', 1],
      ['src/features/invoices/total.ts', 2],
    ]);
    expect(result.families[0]?.line).toContain('The wall stops the import, not the copy. Next: move it to src/shared/ with /ark-place.');
  });

  it('finds a JSX component copied across the wall', () => {
    const root = tree({
      'src/features/billing/card.tsx': card('BillingCard'),
      'src/features/invoices/card.tsx': card('InvoiceCard'),
    });
    const result = run(root);
    expect(result.families.map((family: { crossing: string }) => family.crossing)).toEqual(['cross-slice']);
  });

  it('never fingerprints a file with a generated header, and counts it', () => {
    const root = tree({
      'src/features/billing/total.ts': totalFn('invoiceTotal'),
      'src/features/payments/total.ts': `/**\n * GENERATED FILE — do not edit by hand.\n */\n${totalFn('invoiceTotal')}`,
      'src/features/orders/total.gen.ts': totalFn('invoiceTotal'),
    });
    const result = run(root);
    expect(result.families).toEqual([]);
    expect(result.totals.filesSkipped.generated).toBe(2);
    expect(result.status).toBe('complete');
  });

  it('counts a same-slice copy and never lists it', () => {
    const root = tree({
      'src/features/billing/total.ts': totalFn('invoiceTotal'),
      'src/features/billing/total-legacy.ts': totalFn('invoiceTotal'),
    });
    const result = run(root);
    expect(result.families).toEqual([]);
    expect(result.totals.pairsSameSliceUnexamined).toBe(1);
    expect(result.totals.pairsCrossBoundary).toBe(0);
  });

  it('counts a fail-closed crossing and never reports it', () => {
    const config = {
      include: ['src'],
      layers: [{ name: 'App', patterns: ['src/**'] }],
      rules: [{ from: 'App', to: 'App', allowed: false, peerIsolation: true, sliceFolders: ['features'] }],
    };
    const root = tree(
      {
        'src/features/billing/total.ts': totalFn('invoiceTotal'),
        'src/misc/total.ts': totalFn('invoiceTotal'),
      },
      config
    );
    const result = run(root, config);
    expect(result.families).toEqual([]);
    expect(result.totals.pairsUnclassifiable).toBe(1);
  });

  it('lists a cross-layer copy with the lower layer as destination', () => {
    const root = tree({
      'src/domain/total.ts': totalFn('invoiceTotal'),
      'src/features/billing/total.ts': totalFn('invoiceTotal'),
    });
    const [family] = run(root).families;
    expect(family).toMatchObject({
      ruleId: 'CROSS_LAYER_DUPLICATE',
      crossing: 'cross-layer',
      destination: { kind: 'lower-layer', layer: 'Domain' },
    });
  });

  it('keeps apart copies whose names diverge', () => {
    const renamed = totalFn('invoiceTotal')
      .replace(/subtotal/g, 'gross')
      .replace(/\btax\b/g, 'duty')
      .replace(/amount/g, 'value')
      .replace(/discounted/g, 'net')
      .replace(/\btotal\b/g, 'grand')
      .replace(/\blines?\b/g, 'row')
      .replace(/discount/g, 'rebate');
    const root = tree({
      'src/features/billing/total.ts': totalFn('invoiceTotal'),
      'src/features/invoices/total.ts': renamed,
    });
    const result = run(root);
    expect(result.totals.pairsCrossBoundary).toBe(1);
    expect(result.families).toEqual([]);
  });

  it('is not-run outside details and under a changed-files scope; unavailable without a parser', () => {
    const root = tree({ 'src/features/billing/total.ts': totalFn('a') });
    expect(computeCrossWallDuplication({ root, config: WALL, ts, files: [], details: false })).toMatchObject({
      status: 'not-run',
      next: 'arkgate-check --doctor --all',
    });
    expect(run(root, WALL, { changed: true })).toMatchObject({ status: 'not-run', reason: expect.stringMatching(/changed files/) });
    expect(run(root, WALL, { ts: {} })).toMatchObject({ status: 'unavailable' });
  });
});

describe('views', () => {
  it('prints Details and HTML with the same lines, and stays silent when nothing crosses', () => {
    const root = tree({
      'src/features/billing/total.ts': totalFn('invoiceTotal'),
      'src/features/invoices/total.ts': totalFn('invoiceTotal'),
    });
    const section = run(root);
    const human = capture((io) => printCrossWallDuplicationSection(section, io));
    expect(human).toContain('Copies across a wall (not a score)');
    expect(human).toContain(section.families[0].line);
    expect(human).toContain('src/features/billing/total.ts lines 1–12');
    const html = crossWallDuplicationHtml(section);
    expect(html).toContain('data-advisory="crossWallDuplication"');
    expect(html).toContain('cross-slice');
    const empty = run(tree({ 'src/shared/x.ts': 'export const x = 1;\n' }));
    expect(capture((io) => printCrossWallDuplicationSection(empty, io))).toBe('');
    const notRun = computeCrossWallDuplication({ root, config: WALL, ts, files: [], details: false });
    expect(capture((io) => printCrossWallDuplicationSection(notRun, io))).toBe('');
    expect(crossWallDuplicationHtml(notRun)).toContain('arkgate-check --doctor --all');
  });
});

describe('status wiring', () => {
  function cli(root: string, args: string[]) {
    const result = spawnSync('node', [CLI, '--root', root, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return JSON.parse(result.stdout);
  }

  it('runs only in --doctor --all, and the check verdict and factsHash stay byte-identical', () => {
    const root = tree({
      'src/features/billing/total.ts': totalFn('invoiceTotal'),
      'src/features/invoices/total.ts': totalFn('invoiceTotal'),
      'src/domain/leak.ts': "import { invoiceTotal } from '../features/billing/total';\nexport const leak = invoiceTotal;\n",
    });
    const before = cli(root, ['--json', '--no-cache']);
    const compact = cli(root, ['--doctor', '--json', '--no-cache']);
    const details = cli(root, ['--doctor', '--all', '--json', '--no-cache']);
    const after = cli(root, ['--json', '--no-cache']);
    expect(compact.doctor.crossWallDuplication).toMatchObject({ status: 'not-run', next: 'arkgate-check --doctor --all' });
    expect(details.doctor.crossWallDuplication.status).toBe('complete');
    expect(details.doctor.crossWallDuplication.families).toHaveLength(1);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    expect(before.valid).toBe(false);
    expect(before.violations).toHaveLength(1);
    expect(JSON.stringify(before)).not.toMatch(/crossWallDuplication|fingerprint/);
    expect(details.doctor.violations).toEqual(compact.doctor.violations);
    expect(details.doctor.completeness).toEqual(compact.doctor.completeness);
  });
});
