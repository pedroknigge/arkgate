/**
 * Recommend surfaces vertical-slice-product and ddd-bounded-contexts for matching trees.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sharedUrl = pathToFileURL(path.resolve('bin/ark-shared.mjs')).href;

describe('recommend new archetypes', async () => {
  const shared = await import(sharedUrl);
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-rec-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function write(rel: string, body = 'export {};\n') {
    const abs = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }

  it('prefers vertical-slice-product for features+shared without entities', () => {
    write('package.json', JSON.stringify({ name: 'vs-demo', type: 'module' }));
    write('src/features/auth/login.ts');
    write('src/features/pay/charge.ts');
    write('src/shared/ui.ts');
    write('src/lib/db.ts');
    const rec = shared.buildArchitectureRecommendation(tmp);
    expect(rec.archetype).toBe('vertical-slice-product');
    expect(rec.preset).toBe('vertical-slice');
    expect(rec.galleryStarter).toBe('examples/vertical-slice-starter/');
    expect(rec.policyPack).toBe('enthusiast-vertical-slice');
  });

  it('prefers ddd-bounded-contexts when src/contexts exists', () => {
    write('package.json', JSON.stringify({ name: 'ddd-demo', type: 'module' }));
    write('src/contexts/billing/domain/invoice.ts');
    write('src/contexts/billing/application/open.ts');
    write('src/contexts/identity/domain/user.ts');
    write('src/shared/kernel/money.ts');
    const rec = shared.buildArchitectureRecommendation(tmp);
    expect(rec.archetype).toBe('ddd-bounded-contexts');
    expect(rec.preset).toBe('ddd-bounded-contexts');
    expect(rec.galleryStarter).toBe('examples/ddd-context-starter/');
    expect(rec.policyPack).toBe('enthusiast-ddd-bounded-contexts');
  });
});
