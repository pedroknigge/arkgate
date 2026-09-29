/**
 * ArkRules class-shape honesty through the real CLI (arkrules cluster):
 * - a class the scanner cannot walk reaches the verdict as a truncation finding
 *   (the mark must survive fact canonicalisation, not only the Domain call);
 * - a brace inside a regex literal neither hides later public fields nor
 *   truncates the class.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture(source: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-arkrules-shape-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'src', 'domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'arkrules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'domain', 'a.ts'), source);
  fs.writeFileSync(
    path.join(root, 'arkrules', 'Domain.json'),
    JSON.stringify({
      schemaVersion: '1.0',
      layer: 'Domain',
      structure: [{ id: 'ps', sensor: 'aggregate-private-state', mode: 'enforced' }],
      invariants: [{ id: 'INV-1', description: 'totals stay private', coverage: { test: false } }],
    })
  );
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    JSON.stringify({
      schemaVersion: '1.1',
      include: ['src'],
      layers: [{ name: 'Domain', patterns: ['src/domain/**'] }],
      rules: [],
      dynamicImportAllowlist: [],
      arkRules: { Domain: 'arkrules/Domain.json' },
    })
  );
  return root;
}

function check(root: string) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(REPO_ROOT, 'bin', 'ark-check.mjs'),
      '--root',
      root,
      '--config',
      path.join(root, 'ark.config.json'),
      '--json',
    ],
    { encoding: 'utf8' }
  );
  const json = JSON.parse(result.stdout) as {
    ok: boolean;
    violations: Array<{ message: string; file?: string }>;
  };
  return { status: result.status, json, messages: json.violations.map((v) => v.message) };
}

describe('ArkRules class-shape scan through ark-check (arkrules cluster)', () => {
  it('an unclosed class body fails the enforced sensor with a truncation finding', () => {
    const out = check(
      fixture('export class U { private re = "x"; public m() { if (a) { return 1; }\n')
    );
    expect(out.json.ok).toBe(false);
    expect(out.status).not.toBe(0);
    expect(out.messages.join('\n')).toMatch(/Exported class U shape analysed until character \d+/);
  });

  it('a brace inside a regex literal does not hide a later public mutable field', () => {
    for (const source of [
      'export class Tpl { private readonly re = /\\}$/; public total = 0; }\n',
      'export class A { private re = /[{]/; public total = 0; }\n',
    ]) {
      const out = check(fixture(source));
      expect(out.json.ok).toBe(false);
      expect(out.messages.join('\n')).toMatch(/exposes public mutable state/);
      expect(out.messages.join('\n')).not.toMatch(/analysed until character/);
    }
  });

  it('a clean class with a regex and a division stays green', () => {
    const out = check(
      fixture(
        'export class Ok { private readonly re = /\\}$/; private t = 1; half() { return this.t / 2 / 3; } }\n'
      )
    );
    expect(out.json.ok).toBe(true);
    expect(out.messages).toEqual([]);
  });
});
