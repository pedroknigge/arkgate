import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEffectiveArkRulesFromDisk } from '../../../bin/lib/effective-contract-load.mjs';

function contract(layer: string) {
  return `${JSON.stringify({
    schemaVersion: '1.0',
    layer,
    structure: [],
    invariants: [],
  })}\n`;
}

function config(reference: string) {
  return {
    include: ['src'],
    layers: [{ name: 'core', patterns: ['src/core/**'], intentPrefixes: ['Domain.'] }],
    rules: [],
    arkRules: { core: reference },
  };
}

describe('ArkRules disk loader containment', () => {
  it.each([
    '../outside/Domain.json',
    'arkrules/../../outside/Domain.json',
    '/tmp/outside/Domain.json',
    String.raw`C:\outside\Domain.json`,
    'C:/outside/Domain.json',
    String.raw`\\server\share\Domain.json`,
    String.raw`\rooted\Domain.json`,
  ])('rejects non-project path %s before observing it', (reference) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkrules-containment-'));
    const observed: string[] = [];
    try {
      const loaded = loadEffectiveArkRulesFromDisk(root, config(reference), {
        observeInput: (input) => observed.push(input),
      });

      expect(loaded.errors).toEqual([
        expect.objectContaining({
          path: '$.arkRules["core"]',
          message: expect.stringMatching(/project-relative|outside the project root/i),
        }),
      ]);
      expect(observed).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts normalized internal POSIX and Windows separators', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkrules-internal-'));
    const target = path.join(root, 'arkrules', 'nested', 'core.json');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contract('core'));
    try {
      for (const reference of [
        './arkrules/nested/core.json',
        String.raw`arkrules\nested\core.json`,
      ]) {
        const observed: string[] = [];
        const loaded = loadEffectiveArkRulesFromDisk(root, config(reference), {
          observeInput: (input) => observed.push(input),
        });

        expect(loaded.errors).toEqual([]);
        expect(loaded.arkRules.byLayer.core.sourceFile).toBe('arkrules/nested/core.json');
        expect(observed).toEqual([fs.realpathSync(target)]);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a directory symlink or junction that resolves outside the canonical root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkrules-link-root-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'arkrules-link-outside-'));
    const link = path.join(root, 'arkrules', 'linked');
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.writeFileSync(path.join(outside, 'core.json'), contract('core'));
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    const observed: string[] = [];
    try {
      const loaded = loadEffectiveArkRulesFromDisk(
        root,
        config('arkrules/linked/core.json'),
        {
          observeInput: (input) => observed.push(input),
        }
      );

      expect(loaded.errors).toEqual([
        expect.objectContaining({
          path: '$.arkRules["core"]',
          message: expect.stringMatching(/outside the project root/i),
        }),
      ]);
      expect(observed).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
